import UIKit
import WebKit

/**
 * Eesha Browser - Settings View Controller
 *
 * Privacy-first settings page with:
 * - Ad & Tracker Blocking toggle
 * - HTTPS-Only Mode toggle
 * - Fingerprint Protection toggle
 * - Search Engine selector
 * - Data clearing options
 * - About section
 */

// MARK: - Settings Keys

struct SettingsKeys {
    static let adBlockingEnabled = "adBlockingEnabled"
    static let httpsOnlyEnabled = "httpsOnlyEnabled"
    static let fingerprintProtectionEnabled = "fingerprintProtectionEnabled"
    static let searchEngine = "searchEngine"
    static let desktopSiteEnabled = "desktopSiteEnabled"
    static let bookmarks = "eesha.bookmarks"
    static let history = "eesha.history"

    static var defaults: UserDefaults { UserDefaults.standard }

    // Convenience accessors
    static func isAdBlockingEnabled() -> Bool {
        return defaults.object(forKey: adBlockingEnabled) as? Bool ?? true
    }
    static func isHTTPSOnlyEnabled() -> Bool {
        return defaults.object(forKey: httpsOnlyEnabled) as? Bool ?? true
    }
    static func isFingerprintProtectionEnabled() -> Bool {
        return defaults.object(forKey: fingerprintProtectionEnabled) as? Bool ?? true
    }
    static func isDesktopSiteEnabled() -> Bool {
        return defaults.object(forKey: desktopSiteEnabled) as? Bool ?? false
    }
    static func getSearchEngine() -> SearchEngine {
        let raw = defaults.string(forKey: searchEngine) ?? SearchEngine.eesha.rawValue
        return SearchEngine(rawValue: raw) ?? .eesha
    }
    static func getBookmarks() -> [[String: String]] {
        return defaults.array(forKey: bookmarks) as? [[String: String]] ?? []
    }
    static func saveBookmarks(_ bookmarks: [[String: String]]) {
        defaults.set(bookmarks, forKey: SettingsKeys.bookmarks)
    }
    static func getHistory() -> [[String: String]] {
        return defaults.array(forKey: history) as? [[String: String]] ?? []
    }
    static func saveHistory(_ history: [[String: String]]) {
        defaults.set(history, forKey: SettingsKeys.history)
    }
}

// MARK: - Search Engine

enum SearchEngine: String, CaseIterable {
    case eesha = "Eesha Search"
    case duckduckgo = "DuckDuckGo"
    case google = "Google"
    case brave = "Brave Search"
    case startpage = "StartPage"

    /// The SearXNG instance URL for Eesha Search API calls.
    static let eeshaSearchBaseURL = "https://eesha-search.onrender.com"

    /// SearXNG JSON API endpoint for fetching search results.
    static let searxngApiURL = "https://eesha-search.onrender.com/search"

    var searchURL: String {
        switch self {
        case .eesha: return "\(SearchEngine.eeshaSearchBaseURL)/search?q="
        case .duckduckgo: return "https://duckduckgo.com/?q="
        case .google: return "https://www.google.com/search?q="
        case .brave: return "https://search.brave.com/search?q="
        case .startpage: return "https://www.startpage.com/sp/search?query="
        }
    }

    var suggestURL: String {
        switch self {
        case .eesha: return "\(SearchEngine.eeshaSearchBaseURL)/suggest?q="
        case .duckduckgo: return "https://ac.duckduckgo.com/ac/?q="
        default: return ""
        }
    }

    var displayName: String {
        return self.rawValue
    }
}

// MARK: - Settings View Controller

protocol SettingsDelegate: AnyObject {
    func settingsDidChange()
    func clearBrowsingData()
}

class SettingsViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {

    weak var delegate: SettingsDelegate?

    private var tableView: UITableView!

    // MARK: - Section / Row Model

    private enum Section: Int, CaseIterable {
        case privacy = 0
        case search
        case data
        case update
        case about

        var title: String {
            switch self {
            case .privacy: return "Privacy & Security"
            case .search: return "Search Engine"
            case .data: return "Browsing Data"
            case .update: return "Update"
            case .about: return "About Eesha"
            }
        }

        var rowCount: Int {
            switch self {
            case .privacy: return 3
            case .search: return 1
            case .data: return 2
            case .update: return 2
            case .about: return 2
            }
        }
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Settings"
        view.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)

        // Navigation bar styling
        navigationController?.navigationBar.barTintColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)
        navigationController?.navigationBar.titleTextAttributes = [.foregroundColor: UIColor.white]
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Done", style: .done, target: self, action: #selector(doneTapped)
        )
        navigationItem.leftBarButtonItem?.tintColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)

        setupTableView()
    }

    private func setupTableView() {
        tableView = UITableView(frame: .zero, style: .insetGrouped)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.delegate = self
        tableView.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)
        tableView.separatorColor = UIColor(white: 1, alpha: 0.1)
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        view.addSubview(tableView)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    @objc private func doneTapped() {
        dismiss(animated: true)
    }

    // MARK: - UITableViewDataSource

    func numberOfSections(in tableView: UITableView) -> Int {
        return Section.allCases.count
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return Section(rawValue: section)?.rowCount ?? 0
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        return Section(rawValue: section)?.title
    }

    func tableView(_ tableView: UITableView, willDisplayHeaderView view: UIView, forSection section: Int) {
        if let header = view as? UITableViewHeaderFooterView {
            header.textLabel?.textColor = UIColor(white: 1, alpha: 0.6)
        }
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        cell.backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.28, alpha: 1.0)
        cell.textLabel?.textColor = .white
        cell.detailTextLabel?.textColor = UIColor(white: 1, alpha: 0.5)
        cell.selectionStyle = .none
        cell.accessoryView = nil
        cell.accessoryType = .none
        cell.textLabel?.text = ""
        cell.detailTextLabel?.text = nil

        guard let section = Section(rawValue: indexPath.section) else { return cell }

        switch section {
        case .privacy:
            configurePrivacyCell(cell, row: indexPath.row)
        case .search:
            configureSearchCell(cell)
        case .data:
            configureDataCell(cell, row: indexPath.row)
        case .update:
            configureUpdateCell(cell, row: indexPath.row)
        case .about:
            configureAboutCell(cell, row: indexPath.row)
        }

        return cell
    }

    // MARK: - Cell Configuration

    private func configurePrivacyCell(_ cell: UITableViewCell, row: Int) {
        switch row {
        case 0: // Ad & Tracker Blocking
            cell.textLabel?.text = "Ad & Tracker Blocking"
            let toggle = makeToggle(isOn: SettingsKeys.isAdBlockingEnabled()) { isOn in
                SettingsKeys.defaults.set(isOn, forKey: SettingsKeys.adBlockingEnabled)
                self.delegate?.settingsDidChange()
            }
            cell.accessoryView = toggle

        case 1: // HTTPS-Only
            cell.textLabel?.text = "HTTPS-Only Mode"
            let toggle = makeToggle(isOn: SettingsKeys.isHTTPSOnlyEnabled()) { isOn in
                SettingsKeys.defaults.set(isOn, forKey: SettingsKeys.httpsOnlyEnabled)
                self.delegate?.settingsDidChange()
            }
            cell.accessoryView = toggle

        case 2: // Fingerprint Protection
            cell.textLabel?.text = "Fingerprint Protection"
            let toggle = makeToggle(isOn: SettingsKeys.isFingerprintProtectionEnabled()) { isOn in
                SettingsKeys.defaults.set(isOn, forKey: SettingsKeys.fingerprintProtectionEnabled)
                self.delegate?.settingsDidChange()
            }
            cell.accessoryView = toggle

        default:
            break
        }
    }

    private func configureSearchCell(_ cell: UITableViewCell) {
        cell.textLabel?.text = "Search Engine"
        let current = SettingsKeys.getSearchEngine()
        cell.detailTextLabel?.text = current.displayName

        // Create a detail label manually since default cell doesn't show it
        let detailLabel = UILabel()
        detailLabel.text = current.displayName
        detailLabel.textColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        detailLabel.sizeToFit()
        cell.accessoryView = detailLabel
    }

    private func configureDataCell(_ cell: UITableViewCell, row: Int) {
        switch row {
        case 0:
            cell.textLabel?.text = "Clear Browsing History"
            cell.textLabel?.textColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
            cell.selectionStyle = .default

        case 1:
            cell.textLabel?.text = "Clear Cookies & Website Data"
            cell.textLabel?.textColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
            cell.selectionStyle = .default

        default:
            break
        }
    }

    private func configureUpdateCell(_ cell: UITableViewCell, row: Int) {
        switch row {
        case 0: // Auto-Check for Updates toggle
            cell.textLabel?.text = "Auto-Check for Updates"
            let autoUpdate = UserDefaults.standard.bool(forKey: "eesha.autoUpdateEnabled")
            let toggle = makeToggle(isOn: autoUpdate ?? true) { isOn in
                UserDefaults.standard.set(isOn, forKey: "eesha.autoUpdateEnabled")
            }
            cell.accessoryView = toggle

        case 1: // Check for Updates Now
            cell.textLabel?.text = "Check for Updates Now"
            cell.selectionStyle = .default
            let lastCheck = UserDefaults.standard.double(forKey: "eesha.lastUpdateCheck")
            if lastCheck > 0 {
                let timeAgo = Self.formatTimeAgo(timestamp: lastCheck)
                let detailLabel = UILabel()
                detailLabel.text = "Last: \(timeAgo)"
                detailLabel.textColor = UIColor(white: 1, alpha: 0.4)
                detailLabel.font = UIFont.systemFont(ofSize: 12)
                detailLabel.sizeToFit()
                cell.accessoryView = detailLabel
            }

        default:
            break
        }
    }

    private static func formatTimeAgo(timestamp: Double) -> String {
        let interval = Date().timeIntervalSince1970 - timestamp
        let minutes = Int(interval / 60)
        let hours = Int(interval / 3600)
        let days = Int(interval / 86400)

        if minutes < 1 { return "Just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        if hours < 24 { return "\(hours)h ago" }
        return "\(days)d ago"
    }

    private func configureAboutCell(_ cell: UITableViewCell, row: Int) {
        switch row {
        case 0:
            cell.textLabel?.text = "Version"
            let versionLabel = UILabel()
            versionLabel.text = "0.9.3"
            versionLabel.textColor = UIColor(white: 1, alpha: 0.5)
            versionLabel.sizeToFit()
            cell.accessoryView = versionLabel

        case 1:
            cell.textLabel?.text = "Eesha Browser"
            cell.textLabel?.textColor = UIColor(white: 1, alpha: 0.6)
            cell.textLabel?.font = UIFont.italicSystemFont(ofSize: 14)

        default:
            break
        }
    }

    private func makeToggle(isOn: Bool, handler: @escaping (Bool) -> Void) -> UISwitch {
        let toggle = UISwitch()
        toggle.isOn = isOn
        toggle.onTintColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        toggle.addTarget(self, action: #selector(toggleChanged(_:)), for: .valueChanged)
        toggle.tag = Int.random(in: 1...Int.max) // unique tag
        // Store handler in a map
        toggleHandlers[toggle.tag] = handler
        return toggle
    }

    private var toggleHandlers: [Int: (Bool) -> Void] = [:]

    @objc private func toggleChanged(_ sender: UISwitch) {
        toggleHandlers[sender.tag]?(sender.isOn)
    }

    // MARK: - UITableViewDelegate

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let section = Section(rawValue: indexPath.section) else { return }

        switch section {
        case .search:
            showSearchEnginePicker()

        case .data:
            if indexPath.row == 0 {
                clearHistory()
            } else if indexPath.row == 1 {
                clearCookies()
            }

        case .update:
            if indexPath.row == 1 {
                checkForUpdates()
            }

        default:
            break
        }
    }

    // MARK: - Actions

    private func showSearchEnginePicker() {
        let alert = UIAlertController(title: "Search Engine", message: nil, preferredStyle: .actionSheet)
        let current = SettingsKeys.getSearchEngine()

        for engine in SearchEngine.allCases {
            let isSelected = engine == current
            let title = isSelected ? "✓ \(engine.displayName)" : engine.displayName
            alert.addAction(UIAlertAction(title: title, style: .default) { _ in
                SettingsKeys.defaults.set(engine.rawValue, forKey: SettingsKeys.searchEngine)
                self.delegate?.settingsDidChange()
                self.tableView.reloadData()
            })
        }

        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(alert, animated: true)
    }

    private func clearHistory() {
        let alert = UIAlertController(
            title: "Clear History",
            message: "This will delete all browsing history.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Clear", style: .destructive) { _ in
            SettingsKeys.saveHistory([])
            self.delegate?.clearBrowsingData()
        })
        present(alert, animated: true)
    }

    private func clearCookies() {
        let alert = UIAlertController(
            title: "Clear Cookies & Data",
            message: "This will delete all cookies and website data.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Clear", style: .destructive) { _ in
            WKWebsiteDataStore.default().removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: Date.distantPast
            ) {
                self.delegate?.clearBrowsingData()
            }
        })
        present(alert, animated: true)
    }

    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        return 48
    }

    // MARK: - Auto-Update

    private func checkForUpdates() {
        let alert = UIAlertController(title: "Checking for Updates…", message: nil, preferredStyle: .alert)
        present(alert, animated: true)

        let urlString = "https://api.github.com/repos/eesha-co/Eesha/releases/latest"
        guard let url = URL(string: urlString) else {
            alert.dismiss(animated: true)
            return
        }

        var request = URLRequest(url: url)
        request.setValue("Eesha-Browser-Update-Checker", forHTTPHeaderField: "User-Agent")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                alert.dismiss(animated: true) {
                    guard let self = self else { return }

                    if let error = error {
                        self.showUpdateAlert(title: "Update Check Failed", message: error.localizedDescription)
                        return
                    }

                    guard let data = data,
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let tagName = json["tag_name"] as? String else {
                        self.showUpdateAlert(title: "Update Check Failed", message: "Could not read release info.")
                        return
                    }

                    // Save last check time
                    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "eesha.lastUpdateCheck")

                    // Extract version number from tag like "eesha-v0.9.3"
                    let versionPattern = "v?(\\d+\\.\\d+\\.\\d+)"
                    guard let versionRange = tagName.range(of: versionPattern, options: .regularExpression) else {
                        self.showUpdateAlert(title: "Update Check Failed", message: "Could not parse version.")
                        return
                    }
                    let latestVersion = String(tagName[versionRange]).replacingOccurrences(of: "v", with: "")

                    let currentVersion = "0.9.3"

                    if Self.isNewerVersion(current: currentVersion, latest: latestVersion) {
                        self.showUpdateAlert(
                            title: "Update Available!",
                            message: "Eesha v\(latestVersion) is available (current: v\(currentVersion)).\n\nVisit GitHub to download the latest version.",
                            showDownload: true
                        )
                    } else {
                        self.showUpdateAlert(title: "Eesha is Up to Date", message: "v\(currentVersion) is the latest version.")
                    }
                }
            }
        }.resume()
    }

    private func showUpdateAlert(title: String, message: String, showDownload: Bool = false) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        if showDownload {
            alert.addAction(UIAlertAction(title: "Open GitHub", style: .default) { _ in
                if let url = URL(string: "https://github.com/eesha-co/Eesha/releases/latest") {
                    UIApplication.shared.open(url)
                }
            })
        }
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
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
}
