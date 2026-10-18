import Foundation

/// Типы Page Event из контракта хакатона «страница → приложение».
enum PageEventType: String, CaseIterable {
	case close = "CLOSE_EVENT"
	case finish = "FINISH_EVENT"
	case completed = "COMPLETED_EVENT"
	case vibration = "VIBRATION_EVENT"
	case sharing = "SHARING_EVENT"
}

/// Одно сообщение, отправленное страницей через Bridge, после разбора.
struct PageEvent: Equatable {
	let type: String
	let text: String?
	let image: String?

	/// Тип из контракта или `nil`, если событие неизвестно.
	var knownType: PageEventType? {
		PageEventType(rawValue: type)
	}
}

enum PageMessageParser {

	enum Failure: Error, Equatable {
		case notAnObject
		case missingType

		var reason: String {
			switch self {
			case .notAnObject:
				return "Тело сообщения не объект и не JSON-строка с объектом"
			case .missingType:
				return "В сообщении нет непустого поля type"
			}
		}
	}

	/// Разбирает тело сообщения. Принимает три формата:
	/// `{ type, text, image }` (канонический), `{ type, params: { text, image } }`
	/// и `{ data: { type, params: { text, image } } }`.
	/// Тело может быть объектом или JSON-строкой с объектом.
	static func parse(_ body: Any) -> Result<PageEvent, Failure> {
		guard let dictionary = dictionary(from: body) else {
			return .failure(.notAnObject)
		}
		let container: [String: Any]
		if let data = dictionary["data"] as? [String: Any], data["type"] is String {
			container = data
		} else {
			container = dictionary
		}
		guard let type = container["type"] as? String, !type.isEmpty else {
			return .failure(.missingType)
		}
		let params = container["params"] as? [String: Any] ?? [:]
		return .success(
			PageEvent(
				type: type,
				text: nonEmptyString(container["text"]) ?? nonEmptyString(params["text"]),
				image: nonEmptyString(container["image"]) ?? nonEmptyString(params["image"])
			)
		)
	}

	private static func dictionary(from body: Any) -> [String: Any]? {
		if let dictionary = body as? [String: Any] {
			return dictionary
		}
		if let jsonString = body as? String,
		   let data = jsonString.data(using: .utf8),
		   let dictionary = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
			return dictionary
		}
		return nil
	}

	private static func nonEmptyString(_ value: Any?) -> String? {
		guard let string = value as? String, !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
			return nil
		}
		return string
	}
}
