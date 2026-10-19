import UIKit

/// Картинка для системного «поделиться».
enum ShareImage: Equatable {
	/// Картинка пришла data URL и уже декодирована.
	case data(Data)
	/// Картинку нужно скачать перед показом шерилки.
	case remote(URL)

	/// Разбирает значение поля `image`: data URL с base64 или http(s)-ссылку.
	init?(string: String) {
		if string.hasPrefix("data:") {
			guard let data = Self.decodeDataURL(string), UIImage(data: data) != nil else {
				return nil
			}
			self = .data(data)
		} else if let url = URL(string: string), ["http", "https"].contains(url.scheme?.lowercased()), url.host != nil {
			self = .remote(url)
		} else {
			return nil
		}
	}

	private static func decodeDataURL(_ string: String) -> Data? {
		guard let comma = string.firstIndex(of: ",") else {
			return nil
		}
		let metadata = string[string.index(string.startIndex, offsetBy: 5)..<comma]
		guard metadata.hasSuffix(";base64") else {
			return nil
		}
		return Data(base64Encoded: String(string[string.index(after: comma)...]), options: .ignoreUnknownCharacters)
	}
}

struct SharePayload: Equatable {
	let text: String?
	let image: ShareImage?
}

/// Реакция приложения на Page Event.
enum BridgeAction: Equatable {
	case close
	case showToast(String)
	case vibrate
	case share(SharePayload)

	var logDescription: String {
		switch self {
		case .close:
			return "Закрыть экран игры"
		case .showToast(let text):
			return "Тост «\(text)»"
		case .vibrate:
			return "Вибрация (impact .medium)"
		case .share(let payload):
			let parts = [
				payload.text.map { "текст «\($0)»" },
				payload.image.map {
					switch $0 {
					case .data(let data):
						return "картинка data URL, \(ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file))"
					case .remote(let url):
						return "картинка \(url.absoluteString)"
					}
				}
			].compactMap { $0 }
			return "Поделиться: " + parts.joined(separator: ", ")
		}
	}
}
