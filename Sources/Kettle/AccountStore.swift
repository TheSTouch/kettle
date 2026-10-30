import Foundation
import Security

/// Keeps the signed-in account between launches.
public protocol AccountStore: AnyObject {
    func load() -> SteamAccount?
    func save(_ account: SteamAccount)
    func clear()
}

/// The Keychain, one item per server: service "Kettle", account the server's base URL.
/// Readable after the device's first unlock, so a game launched in the background can check.
public final class KeychainAccountStore: AccountStore {
    private let service: String
    private let key: String

    public init(serverURL: URL, service: String = "Kettle") {
        self.service = service
        self.key = serverURL.absoluteString
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    public func load() -> SteamAccount? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(SteamAccount.self, from: data)
    }

    public func save(_ account: SteamAccount) {
        guard let data = try? JSONEncoder().encode(account) else { return }
        let update: [String: Any] = [kSecValueData as String: data,
                                     kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        if SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            SecItemAdd(query.merging(update) { $1 } as CFDictionary, nil)
        }
    }

    public func clear() {
        SecItemDelete(query as CFDictionary)
    }
}

/// In memory only: for tests and previews.
public final class MemoryAccountStore: AccountStore {
    private var account: SteamAccount?
    public init(_ account: SteamAccount? = nil) { self.account = account }
    public func load() -> SteamAccount? { account }
    public func save(_ account: SteamAccount) { self.account = account }
    public func clear() { account = nil }
}
