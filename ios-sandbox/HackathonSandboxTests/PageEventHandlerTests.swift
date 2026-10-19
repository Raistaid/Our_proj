import XCTest
@testable import HackathonSandbox

final class PageEventHandlerTests: XCTestCase {

	/// Валидный PNG 1×1.
	private let pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

	private var pngDataURL: String {
		"data:image/png;base64," + pngBase64
	}

	// MARK: Разбор сообщения

	func testFlatFormat() {
		var handler = PageEventHandler()
		let result = handler.handle(body: ["type": "SHARING_EVENT", "text": "Привет"])
		XCTAssertEqual(result, .handled(.sharing, actions: [.share(SharePayload(text: "Привет", image: nil))], warnings: []))
	}

	func testParamsFormat() {
		var handler = PageEventHandler()
		let result = handler.handle(body: ["type": "SHARING_EVENT", "params": ["text": "Привет"]])
		XCTAssertEqual(result, .handled(.sharing, actions: [.share(SharePayload(text: "Привет", image: nil))], warnings: []))
	}

	func testDataParamsFormat() {
		var handler = PageEventHandler()
		let body: [String: Any] = ["data": ["type": "SHARING_EVENT", "params": ["text": "Привет"]]]
		XCTAssertEqual(
			handler.handle(body: body),
			.handled(.sharing, actions: [.share(SharePayload(text: "Привет", image: nil))], warnings: [])
		)
	}

	func testJSONStringBody() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: #"{"type":"VIBRATION_EVENT"}"#), .handled(.vibration, actions: [.vibrate], warnings: []))
	}

	func testPlainStringIsInvalid() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: "hello"), .invalidMessage(reason: PageMessageParser.Failure.notAnObject.reason))
	}

	func testNullIsInvalid() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: NSNull()), .invalidMessage(reason: PageMessageParser.Failure.notAnObject.reason))
	}

	func testMissingTypeIsInvalid() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: ["score": 42]), .invalidMessage(reason: PageMessageParser.Failure.missingType.reason))
		XCTAssertEqual(handler.handle(body: ["type": ""]), .invalidMessage(reason: PageMessageParser.Failure.missingType.reason))
	}

	func testUnknownEvent() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: ["type": "LEVEL_UP_EVENT"]), .unknownEvent(type: "LEVEL_UP_EVENT"))
	}

	// MARK: События контракта

	func testClose() {
		var handler = PageEventHandler()
		XCTAssertEqual(handler.handle(body: ["type": "CLOSE_EVENT"]), .handled(.close, actions: [.close], warnings: []))
	}

	func testFinish() {
		var handler = PageEventHandler()
		XCTAssertEqual(
			handler.handle(body: ["type": "FINISH_EVENT"]),
			.handled(.finish, actions: [.showToast("Игра завершена")], warnings: [])
		)
	}

	func testCompletedTwiceWarnsOnSecond() {
		var handler = PageEventHandler()
		XCTAssertEqual(
			handler.handle(body: ["type": "COMPLETED_EVENT"]),
			.handled(.completed, actions: [.showToast("Прогресс засчитан")], warnings: [])
		)
		guard case let .handled(_, _, warnings) = handler.handle(body: ["type": "COMPLETED_EVENT"]) else {
			return XCTFail("Повторный COMPLETED_EVENT должен обрабатываться")
		}
		XCTAssertEqual(warnings.count, 1)
	}

	func testCompletedStateIsPerHandler() {
		var first = PageEventHandler()
		_ = first.handle(body: ["type": "COMPLETED_EVENT"])
		var second = PageEventHandler()
		XCTAssertEqual(
			second.handle(body: ["type": "COMPLETED_EVENT"]),
			.handled(.completed, actions: [.showToast("Прогресс засчитан")], warnings: [])
		)
	}

	// MARK: Шеринг

	func testSharingWithDataURLImage() {
		var handler = PageEventHandler()
		let result = handler.handle(body: ["type": "SHARING_EVENT", "text": "Я прошёл", "image": pngDataURL])
		let image = Data(base64Encoded: pngBase64)!
		XCTAssertEqual(
			result,
			.handled(.sharing, actions: [.share(SharePayload(text: "Я прошёл", image: .data(image)))], warnings: [])
		)
	}

	func testSharingWithRemoteImageOnly() {
		var handler = PageEventHandler()
		let url = URL(string: "https://cdn.example.com/result.png")!
		XCTAssertEqual(
			handler.handle(body: ["type": "SHARING_EVENT", "image": url.absoluteString]),
			.handled(.sharing, actions: [.share(SharePayload(text: nil, image: .remote(url)))], warnings: [])
		)
	}

	func testSharingWithBrokenImageKeepsTextAndWarns() {
		var handler = PageEventHandler()
		guard case let .handled(_, actions, warnings) = handler.handle(
			body: ["type": "SHARING_EVENT", "text": "Текст", "image": "data:image/png;base64,AAAA"]
		) else {
			return XCTFail("Шеринг с текстом должен обрабатываться")
		}
		XCTAssertEqual(actions, [.share(SharePayload(text: "Текст", image: nil))])
		XCTAssertEqual(warnings.count, 1)
	}

	func testSharingWithoutContentIsInvalid() {
		var handler = PageEventHandler()
		guard case .invalidMessage = handler.handle(body: ["type": "SHARING_EVENT", "text": "  "]) else {
			return XCTFail("Шеринг без text и image — некорректное сообщение")
		}
	}

	func testSharingWithOnlyBrokenImageIsInvalid() {
		var handler = PageEventHandler()
		guard case .invalidMessage = handler.handle(body: ["type": "SHARING_EVENT", "image": "javascript:alert(1)"]) else {
			return XCTFail("Шеринг только с битой картинкой — некорректное сообщение")
		}
	}
}

final class PageAddressTests: XCTestCase {

	func testAddsHTTPSWhenSchemeMissing() {
		XCTAssertEqual(PageAddress.url(from: " example.com/game/ "), URL(string: "https://example.com/game/"))
	}

	func testKeepsHTTPForLocalServers() {
		XCTAssertEqual(PageAddress.url(from: "http://192.168.1.10:8080"), URL(string: "http://192.168.1.10:8080"))
	}

	func testRejectsNonWebSchemesAndEmptyInput() {
		XCTAssertNil(PageAddress.url(from: "ftp://example.com"))
		XCTAssertNil(PageAddress.url(from: "   "))
	}
}
