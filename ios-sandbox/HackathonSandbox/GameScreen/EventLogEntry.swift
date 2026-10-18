import Foundation

/// Одна запись Event Log.
struct EventLogEntry: Identifiable {

	enum Kind {
		case pageLoaded(URL)
		case loadFailed(String)
		case event(PageEventType)
		case unknownEvent(String)
		case invalidMessage(String)
		case blockedNavigation(String)
	}

	let id = UUID()
	let date = Date()
	let kind: Kind
	var origin: String?
	var rawBody: String?
	var actions: [String] = []
	var warnings: [String] = []

	var title: String {
		switch kind {
		case .pageLoaded:
			return "Страница загружена"
		case .loadFailed:
			return "Ошибка загрузки"
		case .event(let type):
			return type.rawValue
		case .unknownEvent(let type):
			return "Неизвестное событие: \(type)"
		case .invalidMessage:
			return "Некорректное сообщение"
		case .blockedNavigation:
			return "Заблокирован переход"
		}
	}

	var details: String? {
		switch kind {
		case .pageLoaded(let url):
			return url.absoluteString
		case .loadFailed(let reason), .invalidMessage(let reason), .blockedNavigation(let reason):
			return reason
		case .event, .unknownEvent:
			return nil
		}
	}

	var isProblem: Bool {
		switch kind {
		case .pageLoaded, .event:
			return !warnings.isEmpty
		case .loadFailed, .unknownEvent, .invalidMessage, .blockedNavigation:
			return true
		}
	}

	var exportText: String {
		var lines = ["[\(Self.timeFormatter.string(from: date))] \(title)"]
		if let details {
			lines.append("  \(details)")
		}
		if let origin {
			lines.append("  Origin: \(origin)")
		}
		if let rawBody {
			lines.append("  Тело: \(rawBody)")
		}
		lines += actions.map { "  → \($0)" }
		lines += warnings.map { "  ⚠️ \($0)" }
		return lines.joined(separator: "\n")
	}

	static let timeFormatter: DateFormatter = {
		let formatter = DateFormatter()
		formatter.dateFormat = "HH:mm:ss.SSS"
		return formatter
	}()

	/// Читаемое представление тела сообщения для лога.
	static func describe(body: Any) -> String {
		if JSONSerialization.isValidJSONObject(body),
		   let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes]),
		   let string = String(data: data, encoding: .utf8) {
			return truncated(string)
		}
		if body is NSNull {
			return "null"
		}
		return truncated(String(describing: body))
	}

	private static func truncated(_ string: String) -> String {
		let limit = 500
		guard string.count > limit else {
			return string
		}
		return string.prefix(limit) + "… (\(string.count) символов)"
	}
}
