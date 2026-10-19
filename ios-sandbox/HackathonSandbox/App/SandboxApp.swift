import SwiftUI

@main
struct SandboxApp: App {
	var body: some Scene {
		WindowGroup {
			LauncherScreen()
		}
	}
}

enum SettingsKey {
	static let showsDebugControls = "showsDebugControls"
	static let launchHistory = "launchHistory"
}
