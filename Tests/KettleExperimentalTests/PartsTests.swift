import Foundation
import KettleExperimental
import XCTest

// Each experimental part is in the binary exactly when its trait is on (KettleFeatures.h).
final class PartsTests: XCTestCase {
    private func built(_ symbol: String) -> Bool {
        dlsym(UnsafeMutableRawPointer(bitPattern: -2), symbol) != nil   // RTLD_DEFAULT
    }

    func testTheSessionAndTokenHelpersAreAlwaysBuilt() {
        XCTAssertTrue(built("RecompSteam_Start"))
        XCTAssertTrue(built("RecompSteamAuth_TokenSteamID"))
    }

    func testSignInFollowsItsTrait() {
        #if KETTLE_SIGN_IN
        XCTAssertTrue(built("RecompSteamAuth_BeginQR"))
        #else
        XCTAssertFalse(built("RecompSteamAuth_BeginQR"))
        #endif
    }

    func testCloudFollowsItsTrait() {
        #if KETTLE_CLOUD
        XCTAssertTrue(built("RSCloudList"))
        #else
        XCTAssertFalse(built("RSCloudList"))
        #endif
    }

    func testTicketsFollowTheirTrait() {
        #if KETTLE_TICKETS
        XCTAssertTrue(built("RecompSteam_AuthSessionTicket"))
        #else
        XCTAssertFalse(built("RecompSteam_AuthSessionTicket"))
        #endif
    }

    func testConcurrentPlayFollowsItsTrait() {
        #if KETTLE_CONCURRENT_PLAY
        XCTAssertTrue(built("RecompSteam_SetConcurrentPlay"))
        #else
        XCTAssertFalse(built("RecompSteam_SetConcurrentPlay"))
        #endif
    }
}
