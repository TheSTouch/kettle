import AuthenticationServices
import Foundation
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Opens the sign-in page and returns the URL it ends on. The default one is an
/// `ASWebAuthenticationSession`; tests pass their own.
public protocol WebAuthenticator {
    @MainActor func authenticate(url: URL, callbackScheme: String, ephemeral: Bool) async throws -> URL
}

public final class SystemWebAuthenticator: NSObject, WebAuthenticator, ASWebAuthenticationPresentationContextProviding {
    private let anchor: (() -> ASPresentationAnchor)?
    private var session: ASWebAuthenticationSession?

    /// anchor: the window to show the sheet over; the app's key window when nil.
    public init(anchor: (() -> ASPresentationAnchor)? = nil) {
        self.anchor = anchor
    }

    @MainActor
    public func authenticate(url: URL, callbackScheme: String, ephemeral: Bool) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callback, error in
                self?.session = nil
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: KettleError.signInCancelled)
                } else {
                    continuation.resume(throwing: error ?? KettleError.signInFailed("server_error"))
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = ephemeral
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(throwing: KettleError.signInFailed("server_error"))
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let anchor { return anchor() }
        #if os(iOS)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        #else
        return NSApplication.shared.keyWindow ?? ASPresentationAnchor()
        #endif
    }
}
