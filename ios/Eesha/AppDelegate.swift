import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)

        let browserVC = BrowserViewController()
        let navigationController = UINavigationController(rootViewController: browserVC)
        navigationController.navigationBar.isHidden = true
        navigationController.setNavigationBarHidden(true, animated: false)

        window?.rootViewController = navigationController
        window?.makeKeyAndVisible()

        // Auto-update check on launch (with 24-hour cooldown)
        checkForUpdatesIfDue()

        return true
    }

    // MARK: - Auto-Update Check

    private func checkForUpdatesIfDue() {
        let autoUpdateEnabled = UserDefaults.standard.bool(forKey: "eesha.autoUpdateEnabled")
        // Default to true if not set
        if !autoUpdateEnabled && UserDefaults.standard.object(forKey: "eesha.autoUpdateEnabled") != nil {
            return // Explicitly disabled
        }

        let lastCheck = UserDefaults.standard.double(forKey: "eesha.lastUpdateCheck")
        let now = Date().timeIntervalSince1970
        let cooldown: TimeInterval = 24 * 60 * 60 // 24 hours

        if (now - lastCheck) < cooldown {
            return // Not due yet
        }

        // Check for updates silently
        let urlString = "https://api.github.com/repos/eesha-co/Eesha/releases/latest"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.setValue("Eesha-Browser-Update-Checker", forHTTPHeaderField: "User-Agent")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tagName = json["tag_name"] as? String else { return }

            let versionPattern = "v?(\\d+\\.\\d+\\.\\d+)"
            guard let versionRange = tagName.range(of: versionPattern, options: .regularExpression) else { return }
            let latestVersion = String(tagName[versionRange]).replacingOccurrences(of: "v", with: "")

            let currentVersion = "0.9.3"

            if Self.isNewerVersion(current: currentVersion, latest: latestVersion) {
                DispatchQueue.main.async {
                    let alert = UIAlertController(
                        title: "Update Available!",
                        message: "Eesha v\(latestVersion) is available (current: v\(currentVersion)).",
                        preferredStyle: .alert
                    )
                    alert.addAction(UIAlertAction(title: "Download", style: .default) { _ in
                        if let url = URL(string: "https://github.com/eesha-co/Eesha/releases/latest") {
                            UIApplication.shared.open(url)
                        }
                    })
                    alert.addAction(UIAlertAction(title: "Later", style: .cancel))

                    // Find the top view controller to present
                    if let topVC = Self.topViewController() {
                        topVC.present(alert, animated: true)
                    }
                }
            }

            // Update last check time
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "eesha.lastUpdateCheck")
        }.resume()
    }

    private static func isNewerVersion(current: String, latest: String) -> Bool {
        let cp = current.split(separator: ".").compactMap { Int($0) }
        let lp = latest.split(separator: ".").compactMap { Int($0) }
        let maxLen = max(cp.count, lp.count)
        for i in 0..<maxLen {
            let c = i < cp.count ? cp[i] : 0
            let l = i < lp.count ? lp[i] : 0
            if l > c { return true }
            if l < c { return false }
        }
        return false
    }

    private static func topViewController() -> UIViewController? {
        guard let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }),
              let rootVC = window.rootViewController else { return nil }

        var topVC = rootVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }
        return topVC
    }
}
