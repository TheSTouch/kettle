import KettleExperimental
import XCTest

#if KETTLE_CONCURRENT_PLAY   // the ConcurrentPlay trait: swift test --traits ConcurrentPlay
final class ConcurrentPlayTests: XCTestCase {
    let deny = Int32(RecompSteamConcurrentPlayDeny.rawValue)
    let allow = Int32(RecompSteamConcurrentPlayAllow.rawValue)

    override func tearDown() {
        RecompSteam_SetConcurrentPlay(deny)
        RecompSteam_Queue().sync {}
    }

    func testDenyIsTheDefaultAndTheSettingSticks() {
        XCTAssertEqual(RecompSteam_ConcurrentPlay(), deny)
        RecompSteam_SetConcurrentPlay(allow)
        RecompSteam_Queue().sync {}
        XCTAssertEqual(RecompSteam_ConcurrentPlay(), allow)
        RecompSteam_SetConcurrentPlay(7)   // not a policy: Deny
        RecompSteam_Queue().sync {}
        XCTAssertEqual(RecompSteam_ConcurrentPlay(), deny)
    }

    func testDenyClaimsTheGameWhateverSteamSays() {
        for settled in [false, true] {
            for blocked in [false, true] {
                XCTAssertTrue(RecompSteam_ClaimsGame(deny, settled, blocked))
            }
        }
    }

    func testAllowClaimsTheGameOnlyOnceSteamSaidNobodyPlaysElsewhere() {
        XCTAssertFalse(RecompSteam_ClaimsGame(allow, false, false))   // still waiting for Steam's word
        XCTAssertFalse(RecompSteam_ClaimsGame(allow, false, true))
        XCTAssertFalse(RecompSteam_ClaimsGame(allow, true, true))     // playing on another device
        XCTAssertTrue(RecompSteam_ClaimsGame(allow, true, false))
    }

    func testDenyRetriesSlowlyAfterBeingLoggedOffForPlayingElsewhere() {
        XCTAssertEqual(RecompSteam_LogOffRetryDelay(deny, Int32(RecompSteamResultLoggedInElsewhere)), 120)
        XCTAssertEqual(RecompSteam_LogOffRetryDelay(deny, Int32(RecompSteamResultServiceUnavailable)), 0)
    }

    func testAllowLogsStraightBackOnAfterBeingLoggedOffForPlayingElsewhere() {
        XCTAssertEqual(RecompSteam_LogOffRetryDelay(allow, Int32(RecompSteamResultLoggedInElsewhere)), 0)
        XCTAssertEqual(RecompSteam_LogOffRetryDelay(allow, Int32(RecompSteamResultServiceUnavailable)), 0)
    }
}
#endif
