import Foundation
import StoreKit

/// Unlocks the game for a player who bought it in the app **or** owns it on Steam.
///
/// The App Store lets an app honour a purchase made elsewhere only when the same thing can
/// be bought in the app (guideline 3.1.3(b)), so the gate always offers the in-app purchase;
/// Steam is a second way in, never the only one. See docs/app-store.md.
public final class UnlockGate {
    public enum Source: String, Sendable { case purchase, steam }
    public enum Status: Equatable, Sendable {
        case unlocked(Source)
        case locked
    }

    private let kettle: KettleClient
    private let purchased: () async -> Bool
    private let defaults: UserDefaults
    private let grace: TimeInterval
    private let now: () -> Date

    /// productID: the non-consumable in-app purchase that unlocks the game.
    /// offlineGrace: how long a Steam owner keeps playing when Steam cannot be asked (no
    /// network, Steam down), counted from the last check that said yes. 30 days by default.
    public convenience init(productID: String, kettle: KettleClient, offlineGrace: TimeInterval = 30 * 86_400) {
        self.init(kettle: kettle, offlineGrace: offlineGrace, purchased: { await Self.hasEntitlement(productID) })
    }

    /// For tests and for studios with their own purchase check.
    public init(kettle: KettleClient, offlineGrace: TimeInterval = 30 * 86_400,
                defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init,
                purchased: @escaping () async -> Bool) {
        self.kettle = kettle
        self.grace = offlineGrace
        self.defaults = defaults
        self.now = now
        self.purchased = purchased
    }

    /// The in-app purchase first (no network needed), then Steam when an account is signed in.
    public func status() async -> Status {
        if await purchased() { return .unlocked(.purchase) }
        guard let account = kettle.account else { return .locked }
        let key = "Kettle.steamVerified.\(account.steamID)"
        do {
            let ownership = try await kettle.ownership()
            if ownership.owns {
                defaults.set(now().timeIntervalSince1970, forKey: key)
                return .unlocked(.steam)
            }
            defaults.removeObject(forKey: key)
            return .locked
        } catch KettleError.sessionExpired {
            defaults.removeObject(forKey: key)
            return .locked
        } catch {
            // Steam or the network failed, not the player: a recent yes still counts.
            let verified = defaults.double(forKey: key)
            return verified > 0 && now().timeIntervalSince1970 - verified < grace ? .unlocked(.steam) : .locked
        }
    }

    /// Whether the non-consumable is held: verified, not revoked.
    public static func hasEntitlement(_ productID: String) async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == productID,
               transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    /// Buys the unlock with StoreKit. True when the purchase went through.
    public static func purchase(_ productID: String) async throws -> Bool {
        guard let product = try await Product.products(for: [productID]).first else { return false }
        switch try await product.purchase() {
        case .success(.verified(let transaction)):
            await transaction.finish()
            return true
        default:
            return false
        }
    }
}
