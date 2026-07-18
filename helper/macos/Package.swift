// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "nagger-notify",
  platforms: [.macOS(.v11)],
  targets: [
    .executableTarget(name: "nagger-notify", path: "Sources/nagger-notify")
  ]
)
