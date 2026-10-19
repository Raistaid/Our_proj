import Foundation
import WebKit

/// Serves the bundled ES modules, JSON and artwork through public WebKit APIs.
/// game/ is a folder reference to the repository's game, so paths stay unchanged.
final class BundledGameHandler: NSObject, WKURLSchemeHandler {

	static let scheme = "zasvet"
	static let pageURL = URL(string: "zasvet://game/index.html")!

	private let gameDirectory: URL?

	init(gameDirectory: URL? = Bundle.main.url(forResource: "game", withExtension: nil)) {
		self.gameDirectory = gameDirectory?.resolvingSymlinksInPath().standardizedFileURL
		super.init()
	}

	func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
		do {
			let (response, data) = try resource(for: urlSchemeTask.request)
			urlSchemeTask.didReceive(response)
			urlSchemeTask.didReceive(data)
			urlSchemeTask.didFinish()
		} catch {
			urlSchemeTask.didFailWithError(error)
		}
	}

	func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
		// Reads and callbacks above finish synchronously; no pending work to cancel.
	}

	func resource(for request: URLRequest) throws -> (HTTPURLResponse, Data) {
		guard let url = request.url,
			  url.scheme?.lowercased() == Self.scheme,
			  url.host?.lowercased() == "game",
			  let gameDirectory else {
			throw URLError(.unsupportedURL)
		}
		guard ["GET", "HEAD"].contains(request.httpMethod ?? "GET") else {
			throw URLError(.unsupportedURL)
		}
		let path = url.path == "/" || url.path.isEmpty ? "index.html" : url.path
		let file = gameDirectory.appendingPathComponent(path)
			.resolvingSymlinksInPath().standardizedFileURL
		guard file.path.hasPrefix(gameDirectory.path + "/") else {
			throw URLError(.noPermissionsToReadFile)
		}
		let data = try Data(contentsOf: file)
		let mimeTypes = [
			"html": "text/html; charset=utf-8",
			"js": "text/javascript; charset=utf-8",
			"json": "application/json; charset=utf-8",
			"css": "text/css; charset=utf-8",
			"svg": "image/svg+xml",
			"png": "image/png",
			"webp": "image/webp",
		]
		guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: [
			"Content-Type": mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream",
			"Content-Length": String(data.count),
			"Cache-Control": "no-store",
			"Access-Control-Allow-Origin": "*",
		]) else {
			throw URLError(.badServerResponse)
		}
		return (response, request.httpMethod == "HEAD" ? Data() : data)
	}
}
