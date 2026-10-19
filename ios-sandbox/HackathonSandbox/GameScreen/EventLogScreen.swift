import SwiftUI
import UIKit

/// Event Log текущей сессии Game Screen.
struct EventLogScreen: View {

	@ObservedObject var session: GameSession
	@Environment(\.dismiss) private var dismiss

	var body: some View {
		NavigationView {
			Group {
				if session.log.isEmpty {
					Text("Событий пока нет")
						.foregroundColor(.secondary)
				} else {
					List(session.log.reversed()) { entry in
						EntryRow(entry: entry)
					}
					.listStyle(.plain)
				}
			}
			.navigationTitle("Лог событий")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Готово") { dismiss() }
				}
				ToolbarItemGroup(placement: .primaryAction) {
					Button {
						UIPasteboard.general.string = session.exportedLog
					} label: {
						Image(systemName: "doc.on.doc")
					}
					.accessibilityLabel("Скопировать лог")
					.disabled(session.log.isEmpty)

					Button(role: .destructive) {
						session.clearLog()
					} label: {
						Image(systemName: "trash")
					}
					.accessibilityLabel("Очистить лог")
					.disabled(session.log.isEmpty)
				}
			}
		}
		.navigationViewStyle(.stack)
	}
}

private struct EntryRow: View {
	let entry: EventLogEntry

	var body: some View {
		VStack(alignment: .leading, spacing: 4) {
			HStack(alignment: .firstTextBaseline) {
				Text(entry.title)
					.font(.subheadline.weight(.semibold))
					.foregroundColor(entry.isProblem ? .orange : .primary)
				Spacer()
				Text(EventLogEntry.timeFormatter.string(from: entry.date))
					.font(.caption.monospacedDigit())
					.foregroundColor(.secondary)
			}
			if let details = entry.details {
				Text(details)
					.font(.caption)
			}
			if let origin = entry.origin {
				Text("Origin: \(origin)")
					.font(.caption)
					.foregroundColor(.secondary)
			}
			if let rawBody = entry.rawBody {
				Text(rawBody)
					.font(.caption.monospaced())
					.foregroundColor(.secondary)
					.textSelection(.enabled)
			}
			ForEach(entry.actions, id: \.self) { action in
				Text("→ \(action)")
					.font(.caption)
					.foregroundColor(.green)
			}
			ForEach(entry.warnings, id: \.self) { warning in
				Text("⚠️ \(warning)")
					.font(.caption)
					.foregroundColor(.orange)
			}
		}
		.padding(.vertical, 2)
	}
}
