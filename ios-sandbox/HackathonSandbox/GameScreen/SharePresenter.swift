import UIKit

/// Показывает системное «поделиться» поверх самого верхнего экрана.
enum SharePresenter {

	static func present(items: [Any]) {
		guard let topController = topViewController() else {
			return
		}
		let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
		controller.popoverPresentationController?.sourceView = topController.view
		topController.present(controller, animated: true)
	}

	private static func topViewController() -> UIViewController? {
		let window = UIApplication.shared.connectedScenes
			.compactMap { $0 as? UIWindowScene }
			.flatMap(\.windows)
			.first(where: \.isKeyWindow)
		var controller = window?.rootViewController
		while let presented = controller?.presentedViewController {
			controller = presented
		}
		return controller
	}
}
