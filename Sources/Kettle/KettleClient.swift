import CryptoKit
import Foundation

/// The app's side of docs/protocol.md: signs the player in through Steam, asks the studio's
/// server whether they own the game, and unlocks achievements.
///
/// ```swift
/// let kettle = KettleClient(configuration: .init(
///     serverURL: URL(string: "https://api.example.com/kettle")!,
///     redirectURI: URL(string: "mygame://kettle")!))
/// try await kettle.signIn()
/// if try await kettle.ownership().owns { unlockTheGame() }
/// ```
public final class KettleClient {
    public let configuration: KettleConfiguration
    private let store: AccountStore
    private let urlSession: URLSession
    private let authenticator: WebAuthenticator
    private let now: () -> Date

    public init(configuration: KettleConfiguration,
                store: AccountStore? = nil,
                urlSession: URLSession = .shared,
                authenticator: WebAuthenticator = SystemWebAuthenticator(),
                now: @escaping () -> Date = Date.init) {
        self.configuration = configuration
        self.store = store ?? KeychainAccountStore(serverURL: configuration.serverURL)
        self.urlSession = urlSession
        self.authenticator = authenticator
        self.now = now
    }

    /// The account signed in on this device, nil when none or when its session has expired.
    public var account: SteamAccount? {
        guard let account = store.load(), account.expiresAt > now() else { return nil }
        return account
    }

    // MARK: Sign-in

    /// Shows Steam's sign-in page and keeps the account it signs in.
    @MainActor
    @discardableResult
    public func signIn() async throws -> SteamAccount {
        let verifier = Self.makeVerifier()
        let callback = try await authenticator.authenticate(
            url: startURL(challenge: Self.challenge(for: verifier)),
            callbackScheme: configuration.redirectURI.scheme ?? "",
            ephemeral: configuration.ephemeralSignIn)
        return try await completeSignIn(callback: callback, verifier: verifier)
    }

    func startURL(challenge: String) -> URL {
        var components = URLComponents(url: endpoint("steam/start"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "redirect_uri", value: configuration.redirectURI.absoluteString),
                                 URLQueryItem(name: "code_challenge", value: challenge),
                                 URLQueryItem(name: "code_challenge_method", value: "S256")]
        return components.url!
    }

    func completeSignIn(callback: URL, verifier: String) async throws -> SteamAccount {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let error = items.first(where: { $0.name == "error" })?.value {
            throw error == "access_denied" ? KettleError.signInCancelled : KettleError.signInFailed(error)
        }
        guard let code = items.first(where: { $0.name == "code" })?.value else { throw KettleError.invalidResponse }

        struct Answer: Decodable { let token: String; let steam_id: String; let expires_at: Double }
        let body = try JSONSerialization.data(withJSONObject: ["code": code, "code_verifier": verifier])
        let answer: Answer = try await request("POST", "steam/token", body: body, signedIn: false)
        let account = SteamAccount(steamID: answer.steam_id, token: answer.token,
                                   expiresAt: Date(timeIntervalSince1970: answer.expires_at))
        store.save(account)
        return account
    }

    /// Forgets the account on this device. The server keeps nothing to forget; see
    /// `deleteAccount()` for a studio server that does.
    public func signOut() {
        store.clear()
    }

    /// Asks the server to forget this player's link to Steam (App Store guideline 5.1.1(v)),
    /// then signs out.
    public func deleteAccount() async throws {
        do {
            let _: Empty = try await request("DELETE", "steam/account")
        } catch KettleError.sessionExpired {
            // Nothing the server could tie to this player any more.
        }
        store.clear()
    }

    // MARK: Signed-in calls

    /// Asks Steam, through the server, whether the signed-in account may play the game.
    public func ownership() async throws -> Ownership {
        struct Answer: Decodable { let steam_id: String; let owns: Bool; let reason: String; let checked_at: Double }
        let answer: Answer = try await request("GET", "steam/ownership")
        guard let reason = Ownership.Reason(rawValue: answer.reason) else { throw KettleError.invalidResponse }
        return Ownership(steamID: answer.steam_id, owns: answer.owns, reason: reason,
                         checkedAt: Date(timeIntervalSince1970: answer.checked_at))
    }

    /// Unlocks achievements by their API names, as set in Steamworks (1 to 50 at once).
    public func unlockAchievements(_ names: [String]) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["names": names])
        let _: Empty = try await request("POST", "steam/achievements", body: body)
    }

    // MARK: HTTP

    private struct Empty: Decodable {}
    private struct Failure: Decodable { let error: String; let message: String? }

    private func endpoint(_ path: String) -> URL {
        configuration.serverURL.appendingPathComponent(path)
    }

    private func request<T: Decodable>(_ method: String, _ path: String, body: Data? = nil,
                                       signedIn: Bool = true) async throws -> T {
        var request = URLRequest(url: endpoint(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if signedIn {
            guard let account else { throw KettleError.notSignedIn }
            request.setValue("Bearer \(account.token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else { throw KettleError.invalidResponse }
        switch status {
        case 200..<300:
            if status == 204 || data.isEmpty, let empty = Empty() as? T { return empty }
            guard let value = try? JSONDecoder().decode(T.self, from: data) else { throw KettleError.invalidResponse }
            return value
        default:
            let failure = try? JSONDecoder().decode(Failure.self, from: data)
            switch (status, failure?.error) {
            case (401, _) where signedIn:
                store.clear()
                throw KettleError.sessionExpired
            case (400, "invalid_grant"):
                throw KettleError.signInFailed("invalid_grant")
            case (502, _):
                throw KettleError.steamUnavailable
            default:
                throw KettleError.server(status: status, error: failure?.error ?? "unknown", message: failure?.message)
            }
        }
    }

    // MARK: PKCE (RFC 7636)

    static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        precondition(SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess)
        return base64URL(Data(bytes))
    }

    static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
