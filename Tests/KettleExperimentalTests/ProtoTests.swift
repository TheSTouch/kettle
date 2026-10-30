import KettleExperimental
import XCTest

final class ProtoTests: XCTestCase {
    func testWritesAndReadsFields() {
        var w = rs_pb_writer()
        rs_pb_varint(&w, 1, 440)
        rs_pb_string(&w, 2, "Kettle")
        rs_pb_fixed64(&w, 3, 76561198000000000)
        defer { rs_pb_free(&w) }

        XCTAssertEqual(rs_pb_get_varint(w.data, w.length, 1, 0), 440)
        var name = [CChar](repeating: 0, count: 16)
        XCTAssertEqual(rs_pb_get_string(w.data, w.length, 2, &name, name.count), 6)
        XCTAssertEqual(String(cString: name), "Kettle")
        var field = rs_pb_field()
        XCTAssertTrue(rs_pb_get(w.data, w.length, 3, &field))
        XCTAssertEqual(field.varint, 76561198000000000)
    }

    func testCutShortInputIsAnError() {
        let bytes: [UInt8] = [0x0a, 0x05, 0x41]   // field 1, 5 bytes announced, 1 there
        var reader = rs_pb_read(bytes, bytes.count)
        var field = rs_pb_field()
        XCTAssertFalse(rs_pb_next(&reader, &field))
        XCTAssertTrue(reader.error)
    }

    func testReadsSteamClientTokens() {
        func jwt(_ claims: String) -> String {
            let payload = Data(claims.utf8).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
            return "eyJhbGciOiJFZERTQSJ9.\(payload).c2ln"
        }
        let client = jwt(#"{"sub":"76561198000000001","aud":["client","web"]}"#)
        let mobile = jwt(#"{"sub":"76561198000000001","aud":["mobile"]}"#)
        XCTAssertTrue(RecompSteamAuth_IsClientToken(client))
        XCTAssertFalse(RecompSteamAuth_IsClientToken(mobile))
        XCTAssertEqual(RecompSteamAuth_TokenSteamID(client), 76561198000000001)
        XCTAssertEqual(RecompSteamAuth_TokenSteamID("garbage"), 0)
    }
}
