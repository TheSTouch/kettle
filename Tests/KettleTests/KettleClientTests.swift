import CryptoKit
@testable import Kettle
import XCTest

/// Plays the browser: answers the sign-in with a callback URL built from the start URL.
final class FakeAuthenticator: WebAuthenticator {
    var answer: (URL) throws -> URL
    var opened: URL?
    init(answer: @escaping (URL) throws -> URL) { self.answer = answer }
    func authenticate(url: URL, callbackScheme: String, ephemeral: Bool) async throws -> URL {
        opened = url
        return try answer(url)
    }
}

final class KettleClientTests: XCTestCase {
    let config = KettleConfiguration(serverURL: URL(string: "https://api.example.com/kettle")!,
                                     redirectURI: URL(string: "mygame://kettle")!)
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    func client(store: AccountStore = MemoryAccountStore(), authenticator: FakeAuthenticator? = nil) -> KettleClient {
        KettleClient(configuration: config, store: store, urlSession: StubServer.session(),
                     authenticator: authenticator ?? FakeAuthenticator { _ in throw KettleError.signInCancelled },
                     now: { self.now })
    }

    func signedIn() -> MemoryAccountStore {
        MemoryAccountStore(SteamAccount(steamID: "76561198000000001", token: "tok",
                                        expiresAt: now.addingTimeInterval(3600)))
    }

    func query(_ url: URL, _ name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == name }?.value
    }

    // MARK: Sign-in

    @MainActor
    func testSignInSendsAChallengeAndTradesTheCodeWithItsVerifier() async throws {
        let auth = FakeAuthenticator { _ in URL(string: "mygame://kettle?code=the-code")! }
        var verifier: String?
        StubServer.handler = { request, body in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/kettle/steam/token")
            let json = try! JSONSerialization.jsonObject(with: body!) as! [String: String]
            XCTAssertEqual(json["code"], "the-code")
            verifier = json["code_verifier"]
            return .init(status: 200, json: ["token": "tok", "steam_id": "76561198000000001", "expires_at": 1_800_086_400])
        }
        let store = MemoryAccountStore()
        let kettle = client(store: store, authenticator: auth)

        let account = try await kettle.signIn()

        XCTAssertEqual(account, SteamAccount(steamID: "76561198000000001", token: "tok",
                                             expiresAt: Date(timeIntervalSince1970: 1_800_086_400)))
        XCTAssertEqual(store.load(), account)
        let start = try XCTUnwrap(auth.opened)
        XCTAssertEqual(start.host, "api.example.com")
        XCTAssertEqual(start.path, "/kettle/steam/start")
        XCTAssertEqual(query(start, "redirect_uri"), "mygame://kettle")
        XCTAssertEqual(query(start, "code_challenge_method"), "S256")
        let challenge = try XCTUnwrap(query(start, "code_challenge"))
        XCTAssertEqual(challenge.count, 43)
        XCTAssertEqual(KettleClient.challenge(for: try XCTUnwrap(verifier)), challenge)
    }

    @MainActor
    func testCancelOnSteamsPageIsACancel() async {
        let kettle = client(authenticator: FakeAuthenticator { _ in URL(string: "mygame://kettle?error=access_denied")! })
        await XCTAssertThrows(KettleError.signInCancelled) { try await kettle.signIn() }
    }

    @MainActor
    func testRejectedCodeFailsTheSignIn() async {
        StubServer.handler = { _, _ in .init(status: 400, json: ["error": "invalid_grant"]) }
        let kettle = client(authenticator: FakeAuthenticator { _ in URL(string: "mygame://kettle?code=x")! })
        await XCTAssertThrows(KettleError.signInFailed("invalid_grant")) { try await kettle.signIn() }
        XCTAssertNil(kettle.account)
    }

    func testChallengeIsRFC7636() {
        // RFC 7636, appendix B.
        XCTAssertEqual(KettleClient.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
                       "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        XCTAssertEqual(KettleClient.makeVerifier().count, 43)
    }

    // MARK: Signed-in calls

    func testOwnershipSendsTheTokenAndReadsTheAnswer() async throws {
        StubServer.handler = { request, _ in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
            XCTAssertEqual(request.url?.path, "/kettle/steam/ownership")
            return .init(status: 200, json: ["steam_id": "76561198000000001", "owns": false,
                                             "reason": "family_shared", "checked_at": 1_800_000_000])
        }
        let ownership = try await client(store: signedIn()).ownership()
        XCTAssertEqual(ownership, Ownership(steamID: "76561198000000001", owns: false, reason: .familyShared,
                                           checkedAt: now))
    }

    func testExpiredSessionSignsOut() async {
        StubServer.handler = { _, _ in .init(status: 401, json: ["error": "invalid_token"]) }
        let store = signedIn()
        await XCTAssertThrows(KettleError.sessionExpired) { _ = try await self.client(store: store).ownership() }
        XCTAssertNil(store.load())
    }

    func testAccountPastItsExpiryIsNotSignedIn() async {
        let store = MemoryAccountStore(SteamAccount(steamID: "1", token: "tok", expiresAt: now))
        let kettle = client(store: store)
        XCTAssertNil(kettle.account)
        await XCTAssertThrows(KettleError.notSignedIn) { _ = try await kettle.ownership() }
        XCTAssertTrue(StubServer.requests.isEmpty)
    }

    func testSteamDownIsSteamUnavailable() async {
        StubServer.handler = { _, _ in .init(status: 502, json: ["error": "steam_unavailable"]) }
        await XCTAssertThrows(KettleError.steamUnavailable) { _ = try await self.client(store: self.signedIn()).ownership() }
    }

    func testAchievementsPostTheirNames() async throws {
        StubServer.handler = { request, body in
            XCTAssertEqual(request.url?.path, "/kettle/steam/achievements")
            let json = try! JSONSerialization.jsonObject(with: body!) as! [String: [String]]
            XCTAssertEqual(json["names"], ["ACH_ONE", "ACH_TWO"])
            return .init(status: 204, json: nil)
        }
        try await client(store: signedIn()).unlockAchievements(["ACH_ONE", "ACH_TWO"])
        XCTAssertEqual(StubServer.requests.count, 1)
    }

    func testDeleteAccountTellsTheServerThenSignsOut() async throws {
        StubServer.handler = { request, _ in
            XCTAssertEqual(request.httpMethod, "DELETE")
            XCTAssertEqual(request.url?.path, "/kettle/steam/account")
            return .init(status: 204, json: nil)
        }
        let store = signedIn()
        try await client(store: store).deleteAccount()
        XCTAssertNil(store.load())
    }

    // MARK: Unlock gate

    func gate(_ kettle: KettleClient, purchased: Bool = false, defaults: UserDefaults) -> UnlockGate {
        UnlockGate(kettle: kettle, offlineGrace: 7 * 86_400, defaults: defaults, now: { self.now },
                   purchased: { purchased })
    }

    func freshDefaults() -> UserDefaults {
        let name = "KettleTests.\(UUID().uuidString)"
        return UserDefaults(suiteName: name)!
    }

    func testPurchaseUnlocksWithoutAskingSteam() async {
        let status = await gate(client(store: signedIn()), purchased: true, defaults: freshDefaults()).status()
        XCTAssertEqual(status, .unlocked(.purchase))
        XCTAssertTrue(StubServer.requests.isEmpty)
    }

    func testNoPurchaseNoAccountIsLocked() async {
        let status = await gate(client(), defaults: freshDefaults()).status()
        XCTAssertEqual(status, .locked)
    }

    func testSteamOwnerIsUnlockedAndKeepsPlayingOfflineWithinTheGrace() async {
        let defaults = freshDefaults()
        let kettle = client(store: signedIn())
        StubServer.handler = { _, _ in .init(status: 200, json: ["steam_id": "76561198000000001", "owns": true,
                                                                 "reason": "owned", "checked_at": 1_800_000_000]) }
        var status = await gate(kettle, defaults: defaults).status()
        XCTAssertEqual(status, .unlocked(.steam))

        StubServer.handler = { _, _ in .init(status: 502, json: ["error": "steam_unavailable"]) }
        status = await gate(kettle, defaults: defaults).status()
        XCTAssertEqual(status, .unlocked(.steam))

        let later = UnlockGate(kettle: kettle, offlineGrace: 7 * 86_400, defaults: defaults,
                               now: { self.now.addingTimeInterval(8 * 86_400) }, purchased: { false })
        status = await later.status()
        XCTAssertEqual(status, .locked)
    }

    func testNotOwningForgetsAnEarlierYes() async {
        let defaults = freshDefaults()
        let kettle = client(store: signedIn())
        StubServer.handler = { _, _ in .init(status: 200, json: ["steam_id": "76561198000000001", "owns": true,
                                                                 "reason": "owned", "checked_at": 1_800_000_000]) }
        _ = await gate(kettle, defaults: defaults).status()
        StubServer.handler = { _, _ in .init(status: 200, json: ["steam_id": "76561198000000001", "owns": false,
                                                                 "reason": "not_owned", "checked_at": 1_800_000_000]) }
        var status = await gate(kettle, defaults: defaults).status()
        XCTAssertEqual(status, .locked)
        StubServer.handler = { _, _ in .init(status: 502, json: ["error": "steam_unavailable"]) }
        status = await gate(kettle, defaults: defaults).status()
        XCTAssertEqual(status, .locked)
    }
}

func XCTAssertThrows(_ expected: KettleError, file: StaticString = #filePath, line: UInt = #line,
                     _ body: () async throws -> Void) async {
    do {
        try await body()
        XCTFail("expected \(expected)", file: file, line: line)
    } catch {
        XCTAssertEqual(error as? KettleError, expected, file: file, line: line)
    }
}
