import SwiftUI
import WebKit

/// WebView с Bridge, настроенная как в продукте: без кэша и хранилища между запусками,
/// звук только после действия пользователя, переходы за пределы Origin страницы блокируются.
struct GameWebView: UIViewRepresentable {

	let session: GameSession

	func makeCoordinator() -> Coordinator {
		Coordinator(session: session)
	}

	func makeUIView(context: Context) -> WKWebView {
		let configuration = Self.configuration(messageHandler: context.coordinator)
		let webView = WKWebView(frame: .zero, configuration: configuration)
		webView.navigationDelegate = context.coordinator
		webView.uiDelegate = context.coordinator
		webView.isOpaque = false
		webView.backgroundColor = .systemBackground
		if #available(iOS 16.4, *) {
			webView.isInspectable = true
		}

		let url = session.pageURL
		if url.isFileURL {
			webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
		} else {
			webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData))
		}
		return webView
	}

	static func configuration(messageHandler: WKScriptMessageHandler) -> WKWebViewConfiguration {
		let configuration = WKWebViewConfiguration()
		configuration.websiteDataStore = .nonPersistent()
		configuration.allowsInlineMediaPlayback = true
		configuration.mediaTypesRequiringUserActionForPlayback = .all
		// Иначе WebKit молча гасит window.open без жеста пользователя, и нарушение не попадает в Event Log.
		configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
		configuration.userContentController.addUserScript(BridgeScript.userScript)
		configuration.userContentController.add(
			WeakScriptMessageHandler(messageHandler),
			name: BridgeScript.handlerName
		)

		configuration.setURLSchemeHandler(BundledGameHandler(), forURLScheme: BundledGameHandler.scheme)
		return configuration
	}

	func updateUIView(_ webView: WKWebView, context: Context) {}

	static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
		webView.configuration.userContentController.removeScriptMessageHandler(forName: BridgeScript.handlerName)
		webView.stopLoading()
	}

	final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {

		private let session: GameSession
		/// Origin страницы: фиксируется на первом показе, чтобы редиректы при открытии не считались нарушением.
		private var pageOrigin: String?

		init(session: GameSession) {
			self.session = session
		}

		// MARK: WKScriptMessageHandler

		func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
			guard message.name == BridgeScript.handlerName else {
				return
			}
			session.receive(body: message.body, origin: Self.origin(of: message.frameInfo.securityOrigin))
		}

		// MARK: WKNavigationDelegate

		func webView(
			_ webView: WKWebView,
			decidePolicyFor navigationAction: WKNavigationAction,
			decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
		) {
			// Без targetFrame это новое окно: его блокирует createWebViewWith.
			guard let url = navigationAction.request.url,
				  navigationAction.targetFrame?.isMainFrame == true,
				  let pageOrigin else {
				decisionHandler(.allow)
				return
			}
			if url.scheme == "about" || Self.origin(of: url) == pageOrigin {
				decisionHandler(.allow)
			} else {
				session.navigationBlocked("Переход на \(url.absoluteString)")
				decisionHandler(.cancel)
			}
		}

		func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
			session.pageLoadingStarted()
		}

		func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
			if pageOrigin == nil, let url = webView.url {
				pageOrigin = Self.origin(of: url)
			}
		}

		func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
			if let url = webView.url {
				session.pageLoaded(url)
			}
		}

		func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
			reportFailure(error, in: webView)
		}

		func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
			reportFailure(error, in: webView)
		}

		// MARK: WKUIDelegate

		func webView(
			_ webView: WKWebView,
			createWebViewWith configuration: WKWebViewConfiguration,
			for navigationAction: WKNavigationAction,
			windowFeatures: WKWindowFeatures
		) -> WKWebView? {
			let target = navigationAction.request.url?.absoluteString ?? "пустой адрес"
			session.navigationBlocked("Открытие нового окна: \(target)")
			return nil
		}

		// MARK: Private

		private func reportFailure(_ error: Error, in webView: WKWebView) {
			// Отмена навигации (в том числе нашей блокировкой) не считается ошибкой загрузки.
			let error = error as NSError
			let isCancelled = error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled
			let isInterruptedByPolicy = error.domain == "WebKitErrorDomain" && error.code == 102
			guard !isCancelled, !isInterruptedByPolicy else {
				if !webView.isLoading {
					session.pageLoadingCancelled()
				}
				return
			}
			session.loadFailed(error)
		}

		private static func origin(of url: URL) -> String {
			let scheme = url.scheme?.lowercased() ?? ""
			let host = url.host?.lowercased() ?? ""
			let port = url.port.map { ":\($0)" } ?? ""
			return "\(scheme)://\(host)\(port)"
		}

		private static func origin(of securityOrigin: WKSecurityOrigin) -> String {
			let port = securityOrigin.port == 0 ? "" : ":\(securityOrigin.port)"
			return "\(securityOrigin.protocol)://\(securityOrigin.host)\(port)"
		}
	}
}
