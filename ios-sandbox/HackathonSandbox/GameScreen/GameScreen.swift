import SwiftUI

/// Полноэкранный экран игры: Page в WebView, нативная кнопка «закрыть» и кнопка Event Log поверх.
struct GameScreen: View {

	@StateObject private var session: GameSession
	@AppStorage(SettingsKey.showsDebugControls) private var showsDebugControls = true
	@Environment(\.dismiss) private var dismiss
	@State private var isLogPresented = false

	init(pageURL: URL) {
		_session = StateObject(wrappedValue: GameSession(pageURL: pageURL))
	}

	var body: some View {
		ZStack(alignment: .topTrailing) {
			GameWebView(session: session)
				.ignoresSafeArea()

			if session.isLoading {
				LoadingView()
					.transition(.opacity)
			}

			HStack(spacing: 8) {
				if showsDebugControls {
					OverlayButton(systemImage: "list.bullet.rectangle", badge: problemCount) {
						isLogPresented = true
					}
					.accessibilityLabel("Лог событий")
				}
				OverlayButton(systemImage: "xmark") {
					session.close()
				}
				.accessibilityLabel("Закрыть")
			}
			.padding(.horizontal, 12)
			.padding(.top, 4)

			if let toast = session.toast {
				Text(toast.text)
					.font(.subheadline.weight(.semibold))
					.foregroundColor(.white)
					.padding(.horizontal, 16)
					.padding(.vertical, 10)
					.background(Capsule().fill(Color.black.opacity(0.8)))
					.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
					.padding(.bottom, 24)
					.transition(.move(edge: .bottom).combined(with: .opacity))
					.id(toast.id)
					.allowsHitTesting(false)
			}
		}
		.animation(.easeInOut(duration: 0.2), value: session.toast)
		.animation(.easeOut(duration: 0.25), value: session.isLoading)
		.sheet(isPresented: $isLogPresented) {
			EventLogScreen(session: session)
		}
		.onChange(of: session.isClosed) { isClosed in
			if isClosed {
				dismiss()
			}
		}
	}

	private var problemCount: Int {
		session.log.filter(\.isProblem).count
	}
}

/// Заглушка поверх WebView, пока страница загружается.
private struct LoadingView: View {
	var body: some View {
		VStack(spacing: 12) {
			ProgressView()
				.scaleEffect(1.4)
			Text("Загружаем игру…")
				.font(.subheadline)
				.foregroundColor(.secondary)
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.background(Color(.systemBackground).ignoresSafeArea())
	}
}

private struct OverlayButton: View {
	let systemImage: String
	var badge = 0
	let action: () -> Void

	var body: some View {
		Button(action: action) {
			Image(systemName: systemImage)
				.font(.system(size: 15, weight: .semibold))
				.foregroundColor(.white)
				.frame(width: 36, height: 36)
				.background(Circle().fill(Color.black.opacity(0.45)))
				.overlay(alignment: .topTrailing) {
					if badge > 0 {
						Text("\(badge)")
							.font(.caption2.weight(.bold))
							.foregroundColor(.white)
							.padding(.horizontal, 5)
							.padding(.vertical, 1)
							.background(Capsule().fill(Color.red))
							.offset(x: 6, y: -4)
					}
				}
		}
	}
}
