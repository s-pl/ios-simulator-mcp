import SwiftUI
import UserNotifications

// A deliberately small app used by the integration tests. It exists so the
// tests can exercise the server against an app we control instead of relying
// on the layout of Apple's apps, which changes between iOS versions.

@main
struct FixtureApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var name = ""
    @State private var taps = 0
    @State private var notifications = "unknown"
    @State private var openedURL = "none"

    var body: some View {
        NavigationStack {
            List {
                Section("Form") {
                    TextField("Name", text: $name)
                        .accessibilityIdentifier("name.field")
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Text("Echo: \(name)")
                        .accessibilityIdentifier("echo.label")
                    Button("Clear") { name = "" }
                        .accessibilityIdentifier("clear.button")
                }

                Section("Actions") {
                    Button("Increment") { taps += 1 }
                        .accessibilityIdentifier("increment.button")
                    Text("Taps: \(taps)")
                        .accessibilityIdentifier("taps.label")
                    Button("Enable notifications") {
                        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                            DispatchQueue.main.async {
                                notifications = granted ? "granted" : "denied"
                            }
                        }
                    }
                    .accessibilityIdentifier("notifications.button")
                    Text("Notifications: \(notifications)")
                        .accessibilityIdentifier("notifications.label")
                    Text("URL: \(openedURL)")
                        .accessibilityIdentifier("url.label")
                }

                Section("Rows") {
                    ForEach(1...60, id: \.self) { index in
                        Text("Row \(index)")
                            .accessibilityIdentifier("row.\(index)")
                    }
                }
            }
            .navigationTitle("MCP Fixture")
        }
        .onOpenURL { url in
            openedURL = url.absoluteString
        }
    }
}
