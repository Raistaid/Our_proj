import WebKit

/// JS-часть Bridge: страница вызывает `window.postMessage`, скрипт пересылает сообщение в приложение.
enum BridgeScript {

	static let handlerName = "hackathonBridge"

	static var userScript: WKUserScript {
		WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
	}

	private static let source = """
	(function () {
	  if (window.__hackathonBridgeInstalled) { return; }
	  window.__hackathonBridgeInstalled = true;
	  var handler = window.webkit.messageHandlers.\(handlerName);
	  window.addEventListener('message', function (event) {
	    if (event.source !== window) { return; }
	    try {
	      handler.postMessage(event.data);
	    } catch (error) {
	      try { handler.postMessage(JSON.stringify(event.data)); } catch (_) { handler.postMessage(String(event.data)); }
	    }
	  });
	})();
	"""
}

/// Не даёт `WKUserContentController` удерживать обработчик сообщений.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
	private weak var delegate: WKScriptMessageHandler?

	init(_ delegate: WKScriptMessageHandler) {
		self.delegate = delegate
	}

	func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
		delegate?.userContentController(userContentController, didReceive: message)
	}
}
