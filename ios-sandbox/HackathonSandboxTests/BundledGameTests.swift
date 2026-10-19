import XCTest
import UIKit
import WebKit
@testable import HackathonSandbox

@MainActor
final class BundledGameTests: XCTestCase {

	func testBundledResourcesKeepTheirPathsAndMIMETypes() throws {
		let handler = BundledGameHandler()
		for (path, mimeType) in [
			("index.html", "text/html"),
			("src/app.js", "text/javascript"),
			("styles/game.css", "text/css"),
			("data/content.json", "application/json"),
			("assets/scenes/room.svg", "image/svg+xml"),
		] {
			let url = try XCTUnwrap(URL(string: path, relativeTo: PageAddress.bundledGame)?.absoluteURL)
			let (response, data) = try handler.resource(for: URLRequest(url: url))
			XCTAssertEqual(response.statusCode, 200)
			XCTAssertEqual(response.mimeType, mimeType)
			XCTAssertFalse(data.isEmpty, path)
			XCTAssertEqual(response.value(forHTTPHeaderField: "Cache-Control"), "no-store")
		}
		let (_, data) = try handler.resource(for: URLRequest(url: URL(string: "zasvet://game/data/content.json")!))
		let content = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
		XCTAssertEqual((content["levels"] as? [Any])?.count, 5)
	}

	func testHandlerDoesNotExposeFilesOutsideGame() throws {
		let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
		let game = directory.appendingPathComponent("game", isDirectory: true)
		try FileManager.default.createDirectory(at: game, withIntermediateDirectories: true)
		defer { try? FileManager.default.removeItem(at: directory) }
		let outside = directory.appendingPathComponent("outside.txt")
		try Data("outside".utf8).write(to: outside)
		try FileManager.default.createSymbolicLink(at: game.appendingPathComponent("link.txt"), withDestinationURL: outside)
		let handler = BundledGameHandler(gameDirectory: game)
		for address in [
			"zasvet://game/%2e%2e/outside.txt",
			"zasvet://game/link.txt",
			"zasvet://elsewhere/outside.txt",
			"https://game/outside.txt",
		] {
			XCTAssertThrowsError(try handler.resource(for: URLRequest(url: URL(string: address)!)), address)
		}
	}

	func testHeadHasNoBodyAndWritesAreRejected() throws {
		let handler = BundledGameHandler()
		var request = URLRequest(url: PageAddress.bundledGame)
		request.httpMethod = "HEAD"
		let (response, data) = try handler.resource(for: request)
		XCTAssertTrue(data.isEmpty)
		XCTAssertGreaterThan(Int(response.value(forHTTPHeaderField: "Content-Length") ?? "0") ?? 0, 0)
		request.httpMethod = "POST"
		XCTAssertThrowsError(try handler.resource(for: request))
	}

	func testOfflineGameLoadsModulesExportsPosterAndSendsAllEvents() async throws {
		let received = expectation(description: "All five events arrive through the injected bridge")
		received.expectedFulfillmentCount = 5
		let recorder = MessageRecorder(received: received)
		let configuration = GameWebView.configuration(messageHandler: recorder)
		XCTAssertFalse(configuration.websiteDataStore.isPersistent)
		XCTAssertEqual(configuration.mediaTypesRequiringUserActionForPlayback, .all)
		let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
		let loaded = expectation(description: "Bundled index.html loads")
		let navigation = NavigationRecorder(loaded: loaded)
		webView.navigationDelegate = navigation
		let window = UIWindow(frame: UIScreen.main.bounds)
		let controller = UIViewController()
		window.rootViewController = controller
		window.makeKeyAndVisible()
		controller.view.addSubview(webView)
		defer {
			webView.stopLoading()
			webView.configuration.userContentController.removeScriptMessageHandler(forName: BridgeScript.handlerName)
			window.isHidden = true
		}
		webView.load(URLRequest(url: PageAddress.bundledGame))
		await fulfillment(of: [loaded], timeout: 30)
		XCTAssertNil(navigation.error)
		let executed = expectation(description: "Game modules finish exporting and sending events")
		var scriptResult: Result<Any, Error>?
		webView.callAsyncJavaScript("""
		for (let attempt = 0; attempt < 200; attempt++) {
		  if (document.getElementById('start-screen')?.hidden === false) break;
		  await new Promise(resolve => setTimeout(resolve, 50));
		}
		if (document.getElementById('start-screen')?.hidden !== false) throw Error('Game did not start');
		const { loadContent, getRuntimeLevel } = await import('./src/content.js');
		const { createLevelState, placeSticker } = await import('./src/game.js');
		const { loadAssets } = await import('./src/assets.js');
		const { createPoster } = await import('./src/export.js');
		const { createBridge } = await import('./src/bridge.js');
		const content = await loadContent();
		if (content.isFallback) throw Error('Bundled content fell back to the practice frame');
		const assets = await loadAssets(content);
		if (assets.missing.length) throw Error('Missing artwork: ' + assets.missing.join(', '));
		const level = getRuntimeLevel(content, 0);
		let state = createLevelState(level);
		for (const secret of level.secrets) {
		  const [x, y, w, h] = secret.rect;
		  state = placeSticker(level, state, { stickerId: 'sock', x: x + w / 2, y: y + h / 2 }).state;
		}
		const poster = await createPoster({ level, placements: state.placements, assets });
		const bridge = createBridge();
		bridge.completeOnce(); bridge.completeOnce();
		bridge.finishOnce(); bridge.finishOnce();
		bridge.vibrate();
		bridge.sharePoster('Я прошёл «Засвет»!', poster);
		bridge.closeGame();
		return poster.length > 2000;
		""", arguments: [:], in: nil, in: .page) { result in
			scriptResult = result
			executed.fulfill()
		}
		await fulfillment(of: [executed], timeout: 30)
		let result = try XCTUnwrap(scriptResult).get()
		XCTAssertEqual(result as? Bool, true)
		await fulfillment(of: [received], timeout: 10)
		XCTAssertEqual(recorder.events.map(\.type), [.completed, .finish, .vibration, .sharing, .close])
		let image = try XCTUnwrap(recorder.events.first(where: { $0.type == .sharing })?.image)
		let payload = try XCTUnwrap(ShareImage(string: image))
		guard case let .data(data) = payload else { return XCTFail("Poster must be an offline PNG") }
		let poster = try XCTUnwrap(UIImage(data: data))
		XCTAssertEqual(poster.size, CGSize(width: 720, height: 960))
	}
}

@MainActor
private final class MessageRecorder: NSObject, WKScriptMessageHandler {

	struct Event {
		let type: PageEventType
		let image: String?
	}
	private let received: XCTestExpectation
	private(set) var events: [Event] = []

	init(received: XCTestExpectation) { self.received = received }

	func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
		guard case let .success(event) = PageMessageParser.parse(message.body), let type = event.knownType else {
			return XCTFail("Unexpected bridge message: \(message.body)")
		}
		events.append(Event(type: type, image: event.image))
		received.fulfill()
	}
}

@MainActor
private final class NavigationRecorder: NSObject, WKNavigationDelegate {
	private let loaded: XCTestExpectation
	private(set) var error: Error?

	init(loaded: XCTestExpectation) { self.loaded = loaded }
	func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded.fulfill() }
	func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
		self.error = error
		loaded.fulfill()
	}
}
