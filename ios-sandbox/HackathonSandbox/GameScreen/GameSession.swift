import Combine
import UIKit

/// Состояние одного открытия Game Screen: Event Log, тосты и выполнение Bridge Actions.
final class GameSession: ObservableObject {

	struct Toast: Identifiable, Equatable {
		let id = UUID()
		let text: String
	}

	let pageURL: URL

	@Published private(set) var log: [EventLogEntry] = []
	@Published private(set) var toast: Toast?
	@Published private(set) var isClosed = false
	@Published private(set) var isLoading = true

	private var handler = PageEventHandler()
	private let haptics = UIImpactFeedbackGenerator(style: .medium)

	init(pageURL: URL) {
		self.pageURL = pageURL
	}

	func receive(body: Any, origin: String) {
		var entry: EventLogEntry
		var actions: [BridgeAction] = []
		switch handler.handle(body: body) {
		case let .handled(type, handledActions, warnings):
			entry = EventLogEntry(kind: .event(type))
			entry.warnings = warnings
			actions = handledActions
		case .unknownEvent(let type):
			entry = EventLogEntry(kind: .unknownEvent(type))
		case .invalidMessage(let reason):
			entry = EventLogEntry(kind: .invalidMessage(reason))
		}
		entry.origin = origin
		entry.rawBody = EventLogEntry.describe(body: body)
		entry.actions = actions.map(\.logDescription)
		log.append(entry)
		actions.forEach(perform)
	}

	func pageLoadingStarted() {
		isLoading = true
	}

	func pageLoadingCancelled() {
		isLoading = false
	}

	func pageLoaded(_ url: URL) {
		isLoading = false
		log.append(EventLogEntry(kind: .pageLoaded(url)))
	}

	func loadFailed(_ error: Error) {
		isLoading = false
		log.append(EventLogEntry(kind: .loadFailed(error.localizedDescription)))
		showToast("Не удалось загрузить страницу")
	}

	func navigationBlocked(_ description: String) {
		log.append(EventLogEntry(kind: .blockedNavigation(description)))
		showToast("Переход наружу заблокирован")
	}

	func clearLog() {
		log.removeAll()
	}

	func close() {
		isClosed = true
	}

	var exportedLog: String {
		log.map(\.exportText).joined(separator: "\n\n")
	}

	private func perform(_ action: BridgeAction) {
		switch action {
		case .close:
			close()
		case .showToast(let text):
			showToast(text)
		case .vibrate:
			haptics.impactOccurred()
		case .share(let payload):
			share(payload)
		}
	}

	private func showToast(_ text: String) {
		let toast = Toast(text: text)
		self.toast = toast
		Task {
			try? await Task.sleep(nanoseconds: 2_000_000_000)
			if self.toast == toast {
				self.toast = nil
			}
		}
	}

	private func share(_ payload: SharePayload) {
		switch payload.image {
		case .data(let data):
			presentShare(text: payload.text, image: UIImage(data: data))
		case .remote(let url):
			Task {
				let image = await downloadImage(from: url)
				if image == nil {
					log.append(EventLogEntry(kind: .loadFailed("Не удалось скачать картинку для шеринга: \(url.absoluteString)")))
				}
				presentShare(text: payload.text, image: image)
			}
		case nil:
			presentShare(text: payload.text, image: nil)
		}
	}

	private func downloadImage(from url: URL) async -> UIImage? {
		let session = URLSession(configuration: .ephemeral)
		guard let (data, _) = try? await session.data(from: url) else {
			return nil
		}
		return UIImage(data: data)
	}

	private func presentShare(text: String?, image: UIImage?) {
		let items: [Any] = [text as Any?, image as Any?].compactMap { $0 }
		guard !items.isEmpty else {
			return
		}
		SharePresenter.present(items: items)
	}
}
