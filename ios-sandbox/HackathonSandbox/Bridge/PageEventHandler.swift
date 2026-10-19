import Foundation

/// Итог обработки одного сообщения из Bridge.
enum BridgeResult: Equatable {
	case handled(PageEventType, actions: [BridgeAction], warnings: [String])
	case unknownEvent(type: String)
	case invalidMessage(reason: String)
}

/// Переводит сообщения страницы в Bridge Actions.
/// Хранит состояние одной сессии Game Screen, поэтому на каждый экран создаётся новый.
struct PageEventHandler {

	private var hasCompleted = false

	mutating func handle(body: Any) -> BridgeResult {
		switch PageMessageParser.parse(body) {
		case .failure(let failure):
			return .invalidMessage(reason: failure.reason)
		case .success(let event):
			return handle(event)
		}
	}

	private mutating func handle(_ event: PageEvent) -> BridgeResult {
		guard let type = event.knownType else {
			return .unknownEvent(type: event.type)
		}
		switch type {
		case .close:
			return .handled(type, actions: [.close], warnings: [])
		case .finish:
			return .handled(type, actions: [.showToast("Игра завершена")], warnings: [])
		case .completed:
			let warnings = hasCompleted
				? ["COMPLETED_EVENT отправлен повторно: по контракту его отправляют один раз"]
				: []
			hasCompleted = true
			return .handled(type, actions: [.showToast("Прогресс засчитан")], warnings: warnings)
		case .vibration:
			return .handled(type, actions: [.vibrate], warnings: [])
		case .sharing:
			return sharing(event)
		}
	}

	private func sharing(_ event: PageEvent) -> BridgeResult {
		var warnings: [String] = []
		let image = event.image.flatMap { raw -> ShareImage? in
			guard let image = ShareImage(string: raw) else {
				warnings.append("Поле image не распознано: нужен data URL с base64-картинкой или http(s)-ссылка")
				return nil
			}
			return image
		}
		guard event.text != nil || image != nil else {
			return .invalidMessage(reason: "SHARING_EVENT без text и image: делиться нечем")
		}
		return .handled(.sharing, actions: [.share(SharePayload(text: event.text, image: image))], warnings: warnings)
	}
}
