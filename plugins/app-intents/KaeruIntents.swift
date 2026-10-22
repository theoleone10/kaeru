import AppIntents
import Foundation
import UserNotifications

// Shortcuts / Siri actions for Kaeru's timer. They run without opening the app: each one
// queues a small JSON command in Documents/timer-inbox, and the app applies it with the
// original time the next time it's active (src/time/shortcutInbox.ts). The app mirrors its
// activities and running timer to Documents/timer-state.json for these actions to read.
// Copied into the iOS app target by plugins/app-intents/withAppIntents.js.

@available(iOS 16.0, *)
enum TimerInbox {
  struct State: Decodable {
    var activities: [String]
    var running: String?
  }

  struct Command: Codable {
    var action: String
    var activity: String?
    var note: String?
    var at: Double
  }

  static var documents: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }
  static var inbox: URL { documents.appendingPathComponent("timer-inbox", isDirectory: true) }

  static func state() -> State {
    let url = documents.appendingPathComponent("timer-state.json")
    if let data = try? Data(contentsOf: url), let state = try? JSONDecoder().decode(State.self, from: data) {
      return state
    }
    return State(activities: ["Immersion", "Study"], running: nil)
  }

  static func pending() -> [Command] {
    let files = (try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil)) ?? []
    return files
      .filter { $0.pathExtension == "json" }
      .compactMap { url in (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(Command.self, from: $0) } }
      .sorted { $0.at < $1.at }
  }

  /// The running activity once queued commands are applied (same rules as src/time/repo.ts).
  static func running() -> String? {
    var current = state().running
    for command in pending() {
      switch command.action {
      case "start": current = command.activity
      case "stop": current = nil
      case "toggle": current = same(current, command.activity) ? nil : command.activity
      default: break
      }
    }
    return current
  }

  static func same(_ a: String?, _ b: String?) -> Bool {
    guard let a, let b else { return false }
    return a.trimmingCharacters(in: .whitespaces).lowercased() == b.trimmingCharacters(in: .whitespaces).lowercased()
  }

  static func enqueue(_ action: String, activity: String? = nil, note: String? = nil) throws {
    try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
    let at = (Date().timeIntervalSince1970 * 1000).rounded()
    let note = note?.trimmingCharacters(in: .whitespacesAndNewlines)
    let command = Command(action: action, activity: activity, note: note?.isEmpty == false ? note : nil, at: at)
    // Zero-padded time first, so the files sort in the order they were made.
    let name = String(format: "%015.0f-%@.json", at, UUID().uuidString)
    try JSONEncoder().encode(command).write(to: inbox.appendingPathComponent(name), options: .atomic)
  }

  /// The stop only reaches the database once the app is open, but the reminders the app planned
  /// for the running timer ("Still on Immersion?", time goal reached) would fire before then and
  /// make it look like the timer never stopped. Those are the ones that open /timer
  /// (src/notifications/planner.ts); the app plans them again next time it goes to the background.
  static func cancelTimerNotifications() async {
    let center = UNUserNotificationCenter.current()
    let ids = await center.pendingNotificationRequests()
      .filter { $0.content.userInfo["url"] as? String == "/timer" }
      .map(\.identifier)
    center.removePendingNotificationRequests(withIdentifiers: ids)
  }
}

@available(iOS 16.0, *)
struct ActivityEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Activity"
  static let defaultQuery = ActivityQuery()

  /// The activity's name (the app matches names case-insensitively).
  var id: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(id)") }
}

@available(iOS 16.0, *)
struct ActivityQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [ActivityEntity] {
    identifiers.map { ActivityEntity(id: $0) }
  }

  func suggestedEntities() async throws -> [ActivityEntity] {
    TimerInbox.state().activities.map { ActivityEntity(id: $0) }
  }

  /// Typing a name that doesn't exist yet offers it as a new activity (the app creates it).
  func entities(matching string: String) async throws -> [ActivityEntity] {
    let name = string.trimmingCharacters(in: .whitespaces)
    let hits = TimerInbox.state().activities.filter { $0.localizedCaseInsensitiveContains(name) }
    if hits.contains(where: { TimerInbox.same($0, name) }) || name.isEmpty { return hits.map { ActivityEntity(id: $0) } }
    return hits.map { ActivityEntity(id: $0) } + [ActivityEntity(id: name)]
  }
}

@available(iOS 16.0, *)
struct StartTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "Start Timer"
  static let description = IntentDescription("Starts timing an activity in Kaeru. A timer that's already running is stopped first.")
  static let openAppWhenRun = false

  @Parameter(title: "Activity", requestValueDialog: "Which activity?")
  var activity: ActivityEntity

  @Parameter(title: "Note")
  var note: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Start timing \(\.$activity)") {
      \.$note
    }
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try TimerInbox.enqueue("start", activity: activity.id, note: note)
    KaeruShortcuts.updateAppShortcutParameters()
    return .result(dialog: "Started \(activity.id).")
  }
}

@available(iOS 16.0, *)
struct StopTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "Stop Timer"
  static let description = IntentDescription("Stops Kaeru's running timer.")
  static let openAppWhenRun = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    // Always queued: what's running here comes from the app's last mirror, which can be behind
    // (and stopping when nothing runs does nothing).
    let running = TimerInbox.running()
    try TimerInbox.enqueue("stop")
    await TimerInbox.cancelTimerNotifications()
    if let running {
      return .result(dialog: "Stopped \(running).")
    }
    return .result(dialog: "Stopped the timer.")
  }
}

@available(iOS 16.0, *)
struct ToggleTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "Start or Stop Timer"
  static let description = IntentDescription("Stops the timer if this activity is running; otherwise starts it. Handy on one button.")
  static let openAppWhenRun = false

  @Parameter(title: "Activity", requestValueDialog: "Which activity?")
  var activity: ActivityEntity

  @Parameter(title: "Note")
  var note: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Start or stop \(\.$activity)") {
      \.$note
    }
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let stopping = TimerInbox.same(TimerInbox.running(), activity.id)
    try TimerInbox.enqueue("toggle", activity: activity.id, note: note)
    if stopping { await TimerInbox.cancelTimerNotifications() }
    KaeruShortcuts.updateAppShortcutParameters()
    let dialog: IntentDialog = stopping ? "Stopped \(activity.id)." : "Started \(activity.id)."
    return .result(dialog: dialog)
  }
}

/// Ready-made Siri phrases and Shortcuts app tiles; no setup needed.
@available(iOS 16.0, *)
struct KaeruShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartTimerIntent(),
      phrases: ["Start \(\.$activity) in \(.applicationName)", "Start a timer in \(.applicationName)", "Start timing in \(.applicationName)"],
      shortTitle: "Start Timer",
      systemImageName: "play.circle"
    )
    AppShortcut(
      intent: StopTimerIntent(),
      phrases: ["Stop the timer in \(.applicationName)", "Stop timing in \(.applicationName)", "Stop \(.applicationName)"],
      shortTitle: "Stop Timer",
      systemImageName: "stop.circle"
    )
    AppShortcut(
      intent: ToggleTimerIntent(),
      phrases: ["Toggle \(\.$activity) in \(.applicationName)", "Toggle the timer in \(.applicationName)"],
      shortTitle: "Start or Stop",
      systemImageName: "playpause.circle"
    )
  }
}
