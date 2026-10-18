import Combine
import Foundation

enum PageAddress {

	static let bundledGame = BundledGameHandler.pageURL

	/// Превращает ввод пользователя в URL страницы. Без схемы подставляет `https://`.
	static func url(from input: String) -> URL? {
		let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmed.isEmpty else {
			return nil
		}
		let withScheme = trimmed.contains("://") ? trimmed : "https://" + trimmed
		guard let url = URL(string: withScheme),
			  let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
			  let host = url.host, !host.isEmpty else {
			return nil
		}
		return url
	}

	/// Встроенная Test Page.
	static var testPage: URL? {
		Bundle.main.url(forResource: "test-page", withExtension: "html")
	}
}

/// Последние открытые адреса, новые сверху.
final class LaunchHistory: ObservableObject {

	@Published private(set) var urls: [URL]

	private let defaults: UserDefaults
	private let limit = 10

	init(defaults: UserDefaults = .standard) {
		self.defaults = defaults
		urls = (defaults.stringArray(forKey: SettingsKey.launchHistory) ?? []).compactMap(URL.init(string:))
	}

	func add(_ url: URL) {
		urls.removeAll { $0 == url }
		urls.insert(url, at: 0)
		urls = Array(urls.prefix(limit))
		save()
	}

	func remove(at offsets: IndexSet) {
		urls = urls.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)
		save()
	}

	private func save() {
		defaults.set(urls.map(\.absoluteString), forKey: SettingsKey.launchHistory)
	}
}
