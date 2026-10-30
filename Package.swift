// swift-tools-version: 5.9
import PackageDescription

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
    targets: [
        .target(name: "Kettle"),
        .target(
            name: "KettleExperimental",
            exclude: ["README.md"],
            linkerSettings: [.linkedLibrary("z"), .linkedFramework("Security")]
        ),
        .testTarget(name: "KettleTests", dependencies: ["Kettle"]),
        .testTarget(name: "KettleExperimentalTests", dependencies: ["KettleExperimental"]),
    ]
)
