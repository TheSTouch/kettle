import Foundation

/// Where the studio's Kettle server lives and how the sign-in comes back to the app.
public struct KettleConfiguration: Sendable {
    /// The server's base URL, e.g. `https://api.example.com/kettle` (docs/protocol.md).
    public var serverURL: URL
    /// Where the server sends the sign-in's answer, e.g. `mygame://kettle`. Its scheme must be
    /// one only this app opens, and the server must list the whole URI in its `redirectURIs`.
    public var redirectURI: URL
    /// A private browser session: the player types their Steam password every time instead of
    /// staying signed in to Steam in the sign-in sheet. Off by default.
    public var ephemeralSignIn: Bool

    public init(serverURL: URL, redirectURI: URL, ephemeralSignIn: Bool = false) {
        self.serverURL = serverURL
        self.redirectURI = redirectURI
        self.ephemeralSignIn = ephemeralSignIn
    }
}

/// The Steam account signed in on this device, and the server's session token for it.
public struct SteamAccount: Codable, Equatable, Sendable {
    /// The SteamID64, as a string (it does not fit every number type the server side uses).
    public var steamID: String
    public var token: String
    public var expiresAt: Date

    public init(steamID: String, token: String, expiresAt: Date) {
        self.steamID = steamID
        self.token = token
        self.expiresAt = expiresAt
    }
}

/// Steam's answer on whether the signed-in account may play the game here.
public struct Ownership: Equatable, Sendable {
    public enum Reason: String, Sendable {
        /// The account holds a licence of its own.
        case owned
        /// Steam Family Sharing lends it the game; `owns` is the server's policy.
        case familyShared = "family_shared"
        case notOwned = "not_owned"
    }

    public var steamID: String
    public var owns: Bool
    public var reason: Reason
    public var checkedAt: Date
}

public enum KettleError: Error, Equatable {
    /// The player closed the sign-in sheet, or cancelled on Steam's page.
    case signInCancelled
    /// The sign-in did not complete; the string is the server's error code.
    case signInFailed(String)
    /// No account is signed in on this device.
    case notSignedIn
    /// The server no longer accepts the session (expired, or its secret was rotated). The
    /// account has been signed out: sign in again.
    case sessionExpired
    /// The server could not reach Steam.
    case steamUnavailable
    /// Any other error answer from the server.
    case server(status: Int, error: String, message: String?)
    /// The server answered something that is not the protocol.
    case invalidResponse
}
