import SwiftUI
import UIKit

/// Стартовый экран: ввод URL страницы, история адресов, Test Page и настройки.
struct LauncherScreen: View {

	private struct OpenedPage: Identifiable {
		let id = UUID()
		let url: URL
	}

	@StateObject private var history = LaunchHistory()
	@AppStorage(SettingsKey.showsDebugControls) private var showsDebugControls = true
	@State private var address = ""
	@State private var openedPage: OpenedPage?
	@State private var isAddressInvalid = false

	var body: some View {
		NavigationView {
			Form {
				Section {
					Button("Играть в «Засвет»") {
						openedPage = OpenedPage(url: PageAddress.bundledGame)
					}
				} footer: {
					Text("Игра встроена в приложение. Интернет для неё не нужен.")
				}
				Section {
					TextField("Ссылка на index.html игры", text: $address)
						.keyboardType(.URL)
						.textInputAutocapitalization(.never)
						.disableAutocorrection(true)
						.submitLabel(.go)
						.onSubmit(openAddress)
					Button("Открыть", action: openAddress)
						.disabled(address.trimmingCharacters(in: .whitespaces).isEmpty)
				} header: {
					Text("Адрес игры")
				} footer: {
					if isAddressInvalid {
						Text("Нужен адрес http(s), например https://example.com/game/")
							.foregroundColor(.red)
					}
				}

				Section {
					Button("Открыть тестовую страницу") {
						if let url = PageAddress.testPage {
							openedPage = OpenedPage(url: url)
						}
					}
				} footer: {
					Text("Кнопка на каждое событие контракта: проверить мост без своей игры.")
				}

				if !history.urls.isEmpty {
					Section("Недавние") {
						ForEach(history.urls, id: \.self) { url in
							Button(url.absoluteString) {
								open(url)
							}
							.lineLimit(2)
						}
						.onDelete(perform: history.remove)
					}
				}

				Section {
					Toggle("Кнопка лога на экране игры", isOn: $showsDebugControls)
				} footer: {
					Text("Выключите для чистого вида на демо. Кнопка «закрыть» остаётся всегда.")
				}
			}
			.navigationTitle("Засвет — песочница")
		}
		.navigationViewStyle(.stack)
		.fullScreenCover(item: $openedPage) { page in
			GameScreen(pageURL: page.url)
		}
	}

	private func openAddress() {
		guard let url = PageAddress.url(from: address) else {
			isAddressInvalid = true
			return
		}
		isAddressInvalid = false
		open(url)
	}

	private func open(_ url: URL) {
		history.add(url)
		address = url.absoluteString
		openedPage = OpenedPage(url: url)
	}
}
