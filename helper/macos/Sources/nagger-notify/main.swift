// Nagger macOS notification helper.
//
// A tiny native helper so notifications carry the Nagger icon and support
// click-to-focus. Invoked by @nagger/notify's MacosNotifier when its path is
// set in NAGGER_MACOS_HELPER; otherwise Nagger falls back to terminal-notifier
// then `osascript`.
//
// Build:
//   swift build -c release
//   export NAGGER_MACOS_HELPER="$PWD/.build/release/nagger-notify"
//
// Usage:
//   nagger-notify --title "prod deploy" --message "70% · ETA 2m 14s" [--sound Tink]

import Foundation
import UserNotifications

func arg(_ name: String) -> String? {
  let args = CommandLine.arguments
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  return args[i + 1]
}

let title = arg("--title") ?? "Nagger"
let message = arg("--message") ?? ""
let sound = arg("--sound")

let center = UNUserNotificationCenter.current()
let semaphore = DispatchSemaphore(value: 0)

center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
  guard granted else {
    FileHandle.standardError.write(Data("nagger-notify: notification permission not granted\n".utf8))
    semaphore.signal()
    return
  }

  let content = UNMutableNotificationContent()
  content.title = title
  content.body = message
  if let sound { content.sound = UNNotificationSound(named: UNNotificationSoundName("\(sound).aiff")) }

  let request = UNNotificationRequest(
    identifier: UUID().uuidString,
    content: content,
    trigger: nil
  )
  center.add(request) { _ in semaphore.signal() }
}

_ = semaphore.wait(timeout: .now() + 5)
