// swift-tools-version: 6.1
import PackageDescription

// The experimental module's parts, one trait each (Sources/KettleExperimental/KettleFeatures.h):
// a game that leaves a part out does not carry its code. SignIn, Cloud and Tickets are on unless
// the game turns them off; ConcurrentPlay is off unless it turns it on.
let experimentalParts: [(trait: String, define: String)] = [
    ("SignIn", "KETTLE_SIGN_IN"),
    ("Cloud", "KETTLE_CLOUD"),
    ("Tickets", "KETTLE_TICKETS"),
    ("ConcurrentPlay", "KETTLE_CONCURRENT_PLAY"),
]

let package = Package(
    name: "Kettle",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        // Sign in through Steam, the ownership check, achievements: Steam's documented web
        // APIs through the studio's own server (server/, docs/protocol.md).
        .library(name: "Kettle", targets: ["Kettle"]),
        // A Steam client reimplemented on Steam's own connection protocol: cloud saves,
        // tickets, everything the official route lacks. Not endorsed by Valve; see
        // Sources/KettleExperimental/README.md before shipping it.
        .library(name: "KettleExperimental", targets: ["KettleExperimental"]),
    ],
    traits: [
        .trait(name: "SignIn", description: "KettleExperimental: sign in as a Steam client (QR, password, Steam Guard)."),
        .trait(name: "Cloud", description: "KettleExperimental: Steam Cloud list, download and upload."),
        .trait(name: "Tickets", description: "KettleExperimental: app ownership and auth session tickets."),
        .trait(
            name: "ConcurrentPlay",
            description: "KettleExperimental: RecompSteam_SetConcurrentPlay, Steam beside another device. Read docs/valve.md first."
        ),
        .default(enabledTraits: ["SignIn", "Cloud", "Tickets"]),
    ],
    targets: [
        .target(name: "Kettle"),
        .target(
            name: "KettleExperimental",
            exclude: ["README.md"],
            cSettings: [.define("KETTLE_EXPERIMENTAL_CONFIGURED")]
                + experimentalParts.map { .define($0.define, .when(traits: [$0.trait])) },
            linkerSettings: [.linkedLibrary("z"), .linkedFramework("Security")]
        ),
        .testTarget(name: "KettleTests", dependencies: ["Kettle"]),
        .testTarget(
            name: "KettleExperimentalTests",
            dependencies: ["KettleExperimental"],
            swiftSettings: experimentalParts.map { .define($0.define, .when(traits: [$0.trait])) }
        ),
    ],
    swiftLanguageModes: [.v5]
)
