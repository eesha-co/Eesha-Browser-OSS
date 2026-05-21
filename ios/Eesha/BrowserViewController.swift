import UIKit
import WebKit
import Security

/**
 * Eesha Browser - Main Browser View Controller (v0.9.2)
 *
 * A privacy-focused web browser powered by WKWebView (WebKit).
 * On iOS, Apple requires all browsers to use WebKit — even Chrome uses it on iOS.
 *
 * Features:
 * - Native ad/tracker blocking via WKContentRuleList (200+ domains)
 * - Fingerprint protection injection via WKUserScript
 * - HTTPS-only mode with upgrade enforcement
 * - Private browsing mode (non-persistent data store)
 * - Bookmarks & History with internal pages
 * - Address bar autocomplete
 * - Settings page with privacy toggles
 * - Swipe gestures for navigation
 * - Desktop site toggle
 * - Multi-tab support with tab switcher
 * - Find in Page with find bar
 * - Downloads Manager
 * - Share Sheet
 */

// MARK: - UIImageView Extension for Remote Images

extension UIImageView {
    func loadRemoteImage(from urlString: String) {
        guard let url = URL(string: urlString) else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            if let data = data, let image = UIImage(data: data) {
                DispatchQueue.main.async {
                    self?.image = image
                }
            }
        }.resume()
    }
}

// MARK: - Download Item

class DownloadItem {
    let id: UUID
    let url: String
    var filename: String
    var progress: Double = 0
    var state: String = "downloading" // downloading, completed, failed
    var localPath: String?
    let startTime: Date

    init(url: String, filename: String) {
        self.id = UUID()
        self.url = url
        self.filename = filename
        self.startTime = Date()
    }
}

// MARK: - Tab Info

struct TabInfo {
    let id: UUID
    var webView: WKWebView
    var title: String
    var url: String
    let isPrivate: Bool
}

class BrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate,
                              UITextFieldDelegate, UITableViewDataSource, UITableViewDelegate,
                              WKScriptMessageHandler, SettingsDelegate {

    // MARK: - Status Bar

    override var prefersStatusBarHidden: Bool {
        return true
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    // MARK: - UI Elements

    private var webView: WKWebView!
    private var urlBar: UITextField!
    private var progressBar: UIProgressView!
    private var btnBack: UIButton!
    private var btnForward: UIButton!
    private var btnRefresh: UIButton!
    private var btnHome: UIButton!
    private var btnMenu: UIButton!
    private var btnSettings: UIButton!
    private var navigationBarView: UIView!
    private var privateModeIndicator: UIView!

    // Tab count button
    private var tabCountBtn: UIButton!

    // Find bar
    private var findBar: UIView!
    private var findInput: UITextField!
    private var findCountLabel: UILabel!
    private var findPrevBtn: UIButton!
    private var findNextBtn: UIButton!
    private var findCloseBtn: UIButton!

    // Autocomplete
    private var autocompleteTable: UITableView!
    private var autocompleteResults: [AutocompleteItem] = []

    // Download toast
    private var downloadToast: UIView?
    private var downloadProgressView: UIProgressView?
    private var downloadLabel: UILabel?

    // MARK: - State

    private var isPrivateMode = false
    private var currentUrl: String = ""
    private var isLoadingInternalPage = false
    private var faviconDataUri: String = ""
    private var progressBarTopConstraint: NSLayoutConstraint!

    // Tab management
    private var tabs: [TabInfo] = []
    private var activeTabIndex: Int = 0

    // Downloads
    private var downloads: [DownloadItem] = []
    private var activeDownloadTask: URLSessionDownloadTask?
    private var activeDownloadItem: DownloadItem?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupFavicon()
        setupUI()
        setupFindBar()
        setNeedsStatusBarAppearanceUpdate()
        // Set initial progress bar top constraint (non-private mode)
        progressBarTopConstraint = progressBar.topAnchor.constraint(equalTo: navigationBarView.bottomAnchor)
        progressBarTopConstraint?.isActive = true
        setupGestures()
        createNewTab()
    }

    // MARK: - Favicon

    private func setupFavicon() {
        if let logoImage = UIImage(named: "EeshaLogo"),
           let pngData = logoImage.pngData() {
            faviconDataUri = "data:image/png;base64,\(pngData.base64EncodedString())"
        } else if let iconUrl = Bundle.main.url(forResource: "eesha-logo", withExtension: "png", subdirectory: "Eesha"),
                  let iconData = try? Data(contentsOf: iconUrl) {
            faviconDataUri = "data:image/png;base64,\(iconData.base64EncodedString())"
        }
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)

        // Navigation bar
        navigationBarView = UIView()
        navigationBarView.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)
        navigationBarView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(navigationBarView)

        // Back button
        btnBack = UIButton(type: .system)
        btnBack.setTitle("◀", for: .normal)
        btnBack.tintColor = .white
        btnBack.addTarget(self, action: #selector(goBack), for: .touchUpInside)
        btnBack.translatesAutoresizingMaskIntoConstraints = false

        // Forward button
        btnForward = UIButton(type: .system)
        btnForward.setTitle("▶", for: .normal)
        btnForward.tintColor = .white
        btnForward.addTarget(self, action: #selector(goForward), for: .touchUpInside)
        btnForward.translatesAutoresizingMaskIntoConstraints = false

        // URL bar
        urlBar = UITextField()
        urlBar.backgroundColor = UIColor(red: 0.188, green: 0.169, blue: 0.388, alpha: 1.0)
        urlBar.textColor = .white
        urlBar.attributedPlaceholder = NSAttributedString(
            string: "Search or enter URL",
            attributes: [.foregroundColor: UIColor(white: 1, alpha: 0.4)]
        )
        urlBar.font = UIFont.systemFont(ofSize: 14)
        urlBar.layer.cornerRadius = 18
        urlBar.clipsToBounds = true
        urlBar.returnKeyType = .go
        urlBar.autocorrectionType = .no
        urlBar.autocapitalizationType = .none
        urlBar.spellCheckingType = .no
        urlBar.keyboardType = .webSearch
        urlBar.delegate = self
        urlBar.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 36))
        urlBar.leftViewMode = .always
        urlBar.clearButtonMode = .whileEditing
        urlBar.translatesAutoresizingMaskIntoConstraints = false
        urlBar.addTarget(self, action: #selector(urlBarTextChanged), for: .editingChanged)

        // Refresh button
        btnRefresh = UIButton(type: .system)
        btnRefresh.setTitle("↻", for: .normal)
        btnRefresh.tintColor = .white
        btnRefresh.addTarget(self, action: #selector(refresh), for: .touchUpInside)
        btnRefresh.translatesAutoresizingMaskIntoConstraints = false

        // Home button
        btnHome = UIButton(type: .system)
        btnHome.setTitle("⌂", for: .normal)
        btnHome.tintColor = .white
        btnHome.addTarget(self, action: #selector(goHome), for: .touchUpInside)
        btnHome.translatesAutoresizingMaskIntoConstraints = false

        // Tab count button
        tabCountBtn = UIButton(type: .system)
        tabCountBtn.setTitle("1", for: .normal)
        tabCountBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 12)
        tabCountBtn.setTitleColor(.white, for: .normal)
        tabCountBtn.backgroundColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        tabCountBtn.layer.cornerRadius = 12
        tabCountBtn.clipsToBounds = true
        tabCountBtn.addTarget(self, action: #selector(showTabSwitcher), for: .touchUpInside)
        tabCountBtn.translatesAutoresizingMaskIntoConstraints = false

        // Menu button (triple dot)
        btnMenu = UIButton(type: .system)
        btnMenu.setTitle("⋮", for: .normal)
        btnMenu.titleLabel?.font = UIFont.systemFont(ofSize: 22, weight: .bold)
        btnMenu.tintColor = .white
        btnMenu.addTarget(self, action: #selector(showMenu), for: .touchUpInside)
        btnMenu.translatesAutoresizingMaskIntoConstraints = false

        // Settings button (gear)
        btnSettings = UIButton(type: .system)
        btnSettings.setTitle("⚙", for: .normal)
        btnSettings.titleLabel?.font = UIFont.systemFont(ofSize: 18)
        btnSettings.tintColor = .white
        btnSettings.addTarget(self, action: #selector(showSettings), for: .touchUpInside)
        btnSettings.translatesAutoresizingMaskIntoConstraints = false

        navigationBarView.addSubview(btnBack)
        navigationBarView.addSubview(btnForward)
        navigationBarView.addSubview(urlBar)
        navigationBarView.addSubview(btnRefresh)
        navigationBarView.addSubview(btnHome)
        navigationBarView.addSubview(tabCountBtn)
        navigationBarView.addSubview(btnMenu)
        navigationBarView.addSubview(btnSettings)

        // Private mode indicator
        privateModeIndicator = UIView()
        privateModeIndicator.backgroundColor = UIColor(red: 0.4, green: 0.2, blue: 0.6, alpha: 1.0)
        privateModeIndicator.isHidden = true
        privateModeIndicator.translatesAutoresizingMaskIntoConstraints = false
        let privateLabel = UILabel()
        privateLabel.text = "  🕶 Private"
        privateLabel.textColor = .white
        privateLabel.font = UIFont.boldSystemFont(ofSize: 12)
        privateLabel.translatesAutoresizingMaskIntoConstraints = false
        privateModeIndicator.addSubview(privateLabel)
        view.addSubview(privateModeIndicator)

        // Progress bar
        progressBar = UIProgressView(progressViewStyle: .bar)
        progressBar.progressTintColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        progressBar.trackTintColor = .clear
        progressBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progressBar)

        // Autocomplete table
        autocompleteTable = UITableView()
        autocompleteTable.dataSource = self
        autocompleteTable.delegate = self
        autocompleteTable.register(UITableViewCell.self, forCellReuseIdentifier: "autocompleteCell")
        autocompleteTable.backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.28, alpha: 0.95)
        autocompleteTable.layer.cornerRadius = 8
        autocompleteTable.clipsToBounds = true
        autocompleteTable.isHidden = true
        autocompleteTable.translatesAutoresizingMaskIntoConstraints = false
        autocompleteTable.separatorColor = UIColor(white: 1, alpha: 0.1)
        view.addSubview(autocompleteTable)

        // Layout constraints
        NSLayoutConstraint.activate([
            navigationBarView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            navigationBarView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            navigationBarView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            navigationBarView.heightAnchor.constraint(equalToConstant: 48),

            btnBack.leadingAnchor.constraint(equalTo: navigationBarView.leadingAnchor, constant: 4),
            btnBack.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnBack.widthAnchor.constraint(equalToConstant: 28),

            btnForward.leadingAnchor.constraint(equalTo: btnBack.trailingAnchor, constant: 1),
            btnForward.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnForward.widthAnchor.constraint(equalToConstant: 28),

            urlBar.leadingAnchor.constraint(equalTo: btnForward.trailingAnchor, constant: 4),
            urlBar.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            urlBar.heightAnchor.constraint(equalToConstant: 36),

            btnRefresh.leadingAnchor.constraint(equalTo: urlBar.trailingAnchor, constant: 2),
            btnRefresh.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnRefresh.widthAnchor.constraint(equalToConstant: 28),

            btnHome.leadingAnchor.constraint(equalTo: btnRefresh.trailingAnchor, constant: 1),
            btnHome.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnHome.widthAnchor.constraint(equalToConstant: 28),

            tabCountBtn.leadingAnchor.constraint(equalTo: btnHome.trailingAnchor, constant: 2),
            tabCountBtn.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            tabCountBtn.widthAnchor.constraint(equalToConstant: 24),
            tabCountBtn.heightAnchor.constraint(equalToConstant: 24),

            btnMenu.leadingAnchor.constraint(equalTo: tabCountBtn.trailingAnchor, constant: 2),
            btnMenu.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnMenu.widthAnchor.constraint(equalToConstant: 24),

            btnSettings.leadingAnchor.constraint(equalTo: btnMenu.trailingAnchor, constant: 1),
            btnSettings.centerYAnchor.constraint(equalTo: navigationBarView.centerYAnchor),
            btnSettings.widthAnchor.constraint(equalToConstant: 24),
            btnSettings.trailingAnchor.constraint(equalTo: navigationBarView.trailingAnchor, constant: -4),

            privateModeIndicator.topAnchor.constraint(equalTo: navigationBarView.bottomAnchor),
            privateModeIndicator.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            privateModeIndicator.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            privateModeIndicator.heightAnchor.constraint(equalToConstant: 24),
            privateLabel.leadingAnchor.constraint(equalTo: privateModeIndicator.leadingAnchor),
            privateLabel.centerYAnchor.constraint(equalTo: privateModeIndicator.centerYAnchor),

            progressBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressBar.heightAnchor.constraint(equalToConstant: 2),

            autocompleteTable.topAnchor.constraint(equalTo: navigationBarView.bottomAnchor, constant: 2),
            autocompleteTable.leadingAnchor.constraint(equalTo: urlBar.leadingAnchor),
            autocompleteTable.trailingAnchor.constraint(equalTo: urlBar.trailingAnchor),
            autocompleteTable.heightAnchor.constraint(lessThanOrEqualToConstant: 200),
        ])
    }

    // MARK: - Find Bar Setup

    private func setupFindBar() {
        findBar = UIView()
        findBar.backgroundColor = UIColor(red: 0.086, green: 0.075, blue: 0.243, alpha: 1.0) // #16213e
        findBar.isHidden = true
        findBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(findBar)

        findInput = UITextField()
        findInput.backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.28, alpha: 1.0)
        findInput.textColor = .white
        findInput.font = UIFont.systemFont(ofSize: 14)
        findInput.placeholder = "Find..."
        findInput.attributedPlaceholder = NSAttributedString(
            string: "Find...",
            attributes: [.foregroundColor: UIColor(white: 1, alpha: 0.4)]
        )
        findInput.autocorrectionType = .no
        findInput.autocapitalizationType = .none
        findInput.spellCheckingType = .no
        findInput.returnKeyType = .search
        findInput.delegate = self
        findInput.tag = 999 // Tag to distinguish from URL bar
        findInput.layer.cornerRadius = 6
        findInput.clipsToBounds = true
        findInput.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 8, height: 28))
        findInput.leftViewMode = .always
        findInput.translatesAutoresizingMaskIntoConstraints = false
        findBar.addSubview(findInput)

        findCountLabel = UILabel()
        findCountLabel.text = "0/0"
        findCountLabel.textColor = UIColor(white: 1, alpha: 0.6)
        findCountLabel.font = UIFont.systemFont(ofSize: 12)
        findCountLabel.translatesAutoresizingMaskIntoConstraints = false
        findBar.addSubview(findCountLabel)

        findPrevBtn = UIButton(type: .system)
        findPrevBtn.setTitle("▲", for: .normal)
        findPrevBtn.setTitleColor(.white, for: .normal)
        findPrevBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        findPrevBtn.addTarget(self, action: #selector(findPreviousAction), for: .touchUpInside)
        findPrevBtn.translatesAutoresizingMaskIntoConstraints = false
        findBar.addSubview(findPrevBtn)

        findNextBtn = UIButton(type: .system)
        findNextBtn.setTitle("▼", for: .normal)
        findNextBtn.setTitleColor(.white, for: .normal)
        findNextBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        findNextBtn.addTarget(self, action: #selector(findNextAction), for: .touchUpInside)
        findNextBtn.translatesAutoresizingMaskIntoConstraints = false
        findBar.addSubview(findNextBtn)

        findCloseBtn = UIButton(type: .system)
        findCloseBtn.setTitle("✕", for: .normal)
        findCloseBtn.setTitleColor(UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0), for: .normal)
        findCloseBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 14)
        findCloseBtn.addTarget(self, action: #selector(hideFindBarAction), for: .touchUpInside)
        findCloseBtn.translatesAutoresizingMaskIntoConstraints = false
        findBar.addSubview(findCloseBtn)

        NSLayoutConstraint.activate([
            findBar.topAnchor.constraint(equalTo: progressBar.bottomAnchor),
            findBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            findBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            findBar.heightAnchor.constraint(equalToConstant: 44),

            findInput.leadingAnchor.constraint(equalTo: findBar.leadingAnchor, constant: 8),
            findInput.centerYAnchor.constraint(equalTo: findBar.centerYAnchor),
            findInput.heightAnchor.constraint(equalToConstant: 30),

            findCountLabel.leadingAnchor.constraint(equalTo: findInput.trailingAnchor, constant: 8),
            findCountLabel.centerYAnchor.constraint(equalTo: findBar.centerYAnchor),
            findCountLabel.widthAnchor.constraint(equalToConstant: 36),

            findPrevBtn.leadingAnchor.constraint(equalTo: findCountLabel.trailingAnchor, constant: 4),
            findPrevBtn.centerYAnchor.constraint(equalTo: findBar.centerYAnchor),
            findPrevBtn.widthAnchor.constraint(equalToConstant: 28),

            findNextBtn.leadingAnchor.constraint(equalTo: findPrevBtn.trailingAnchor, constant: 2),
            findNextBtn.centerYAnchor.constraint(equalTo: findBar.centerYAnchor),
            findNextBtn.widthAnchor.constraint(equalToConstant: 28),

            findCloseBtn.leadingAnchor.constraint(equalTo: findNextBtn.trailingAnchor, constant: 4),
            findCloseBtn.centerYAnchor.constraint(equalTo: findBar.centerYAnchor),
            findCloseBtn.widthAnchor.constraint(equalToConstant: 28),
            findCloseBtn.trailingAnchor.constraint(equalTo: findBar.trailingAnchor, constant: -8),
        ])
    }

    // MARK: - Find in Page

    @objc private func showFindBar() {
        findBar.isHidden = false
        findInput.becomeFirstResponder()
        view.bringSubviewToFront(findBar)
    }

    @objc private func hideFindBarAction() {
        findBar.isHidden = true
        findInput.text = ""
        findInput.resignFirstResponder()
        findCountLabel.text = "0/0"
        // Clear find highlights
        if #available(iOS 16.0, *) {
            webView.find("nomatch_\(UUID().uuidString)", configuration: WKFindConfiguration()) { _ in }
        }
    }

    private func findInPage(_ text: String) {
        guard !text.isEmpty else {
            findCountLabel.text = "0/0"
            return
        }
        if #available(iOS 16.0, *) {
            webView.find(text, configuration: WKFindConfiguration()) { [weak self] result in
                self?.findCountLabel.text = "\(result.matchIndex + 1)/\(result.matchesFound)"
            }
        } else {
            let escaped = text.replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.find('\(escaped)')") { [weak self] _, _ in
                self?.findCountLabel.text = "?/?"
            }
        }
    }

    @objc private func findNextAction() {
        let text = findInput.text ?? ""
        guard !text.isEmpty else { return }
        if #available(iOS 16.0, *) {
            let config = WKFindConfiguration()
            config.wrapping = true
            webView.find(text, configuration: config) { [weak self] result in
                self?.findCountLabel.text = "\(result.matchIndex + 1)/\(result.matchesFound)"
            }
        } else {
            let escaped = text.replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.find('\(escaped)')") { _, _ in }
        }
    }

    @objc private func findPreviousAction() {
        let text = findInput.text ?? ""
        guard !text.isEmpty else { return }
        if #available(iOS 16.0, *) {
            let config = WKFindConfiguration()
            config.wrapping = true
            config.backwards = true
            webView.find(text, configuration: config) { [weak self] result in
                self?.findCountLabel.text = "\(result.matchIndex + 1)/\(result.matchesFound)"
            }
        } else {
            let escaped = text.replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.find('\(escaped)', false, true)") { _, _ in }
        }
    }

    // MARK: - Tab Management

    private func createNewTab(url: String = "eesha://newtab", isPrivate: Bool = false) {
        let newWebView = createWebView(isPrivate: isPrivate)

        // Add to view hierarchy
        view.insertSubview(newWebView, belowSubview: autocompleteTable)
        newWebView.isHidden = true

        // Set up constraints after adding to view hierarchy
        NSLayoutConstraint.activate([
            newWebView.topAnchor.constraint(equalTo: findBar.bottomAnchor),
            newWebView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            newWebView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            newWebView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let tabTitle = isPrivate ? "Private Tab" : "New Tab"
        let tab = TabInfo(id: UUID(), webView: newWebView, title: tabTitle, url: url, isPrivate: isPrivate)
        tabs.append(tab)

        // Switch to new tab
        switchToTab(index: tabs.count - 1)

        // Load URL
        if url == "eesha://newtab" || url == "eesha://bookmarks" || url == "eesha://history" || url == "eesha://downloads" || url.hasPrefix("eesha://search") {
            handleInternalPage(url)
        } else if let requestUrl = URL(string: url) {
            newWebView.load(URLRequest(url: requestUrl))
        }

        updateTabCount()
        updatePrivateModeIndicator()
    }

    private func createWebView(isPrivate: Bool) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Data store based on mode
        if isPrivate {
            config.websiteDataStore = .nonPersistent()
        } else {
            config.websiteDataStore = .default()
        }

        config.preferences.javaScriptCanOpenWindowsAutomatically = false

        // Register script message handlers for internal pages
        config.userContentController.add(self, name: "bookmarkAction")
        config.userContentController.add(self, name: "historyAction")
        config.userContentController.add(self, name: "downloadAction")

        // Fingerprint protection injection
        if SettingsKeys.isFingerprintProtectionEnabled() {
            injectFingerprintProtection(into: config)
        }

        let newWebView = WKWebView(frame: .zero, configuration: config)
        newWebView.navigationDelegate = self
        newWebView.uiDelegate = self
        newWebView.translatesAutoresizingMaskIntoConstraints = false
        newWebView.isOpaque = false
        newWebView.backgroundColor = UIColor(red: 0.059, green: 0.047, blue: 0.161, alpha: 1.0)
        newWebView.allowsBackForwardNavigationGestures = true

        // Observe loading progress
        newWebView.addObserver(self, forKeyPath: "estimatedProgress", options: .new, context: nil)
        newWebView.addObserver(self, forKeyPath: "title", options: .new, context: nil)

        // Apply content blocker
        if SettingsKeys.isAdBlockingEnabled() {
            ContentBlocker.shared.compileAndApply(to: newWebView) { success in
                if success {
                    print("[Eesha] Content blocker applied with \(ContentBlocker.shared.blockedCount) rules")
                }
            }
        }

        // Desktop site mode
        if SettingsKeys.isDesktopSiteEnabled() {
            newWebView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        }

        return newWebView
    }

    private func switchToTab(index: Int) {
        guard index >= 0 && index < tabs.count else { return }

        // Hide current webView
        if activeTabIndex < tabs.count {
            tabs[activeTabIndex].webView.isHidden = true
            // Update tab info before switching
            tabs[activeTabIndex].title = tabs[activeTabIndex].webView.title ?? tabs[activeTabIndex].title
            tabs[activeTabIndex].url = tabs[activeTabIndex].webView.url?.absoluteString ?? tabs[activeTabIndex].url
        }

        // Show target webView
        activeTabIndex = index
        let tab = tabs[activeTabIndex]
        tab.webView.isHidden = false
        webView = tab.webView

        // Update URL bar
        let tabUrl = tab.url
        if tabUrl.hasPrefix("eesha://") {
            urlBar.text = tabUrl == "eesha://newtab" ? "" : tabUrl
        } else {
            urlBar.text = tabUrl
        }
        currentUrl = tabUrl

        updatePrivateModeIndicator()
    }

    private func closeTab(index: Int) {
        guard index >= 0 && index < tabs.count else { return }

        let tab = tabs[index]
        tab.webView.removeObserver(self, forKeyPath: "estimatedProgress")
        tab.webView.removeObserver(self, forKeyPath: "title")
        tab.webView.removeFromSuperview()
        tab.webView.stopLoading()
        tabs.remove(at: index)

        if tabs.isEmpty {
            createNewTab()
            return
        }

        let newIndex = min(index, tabs.count - 1)
        if activeTabIndex == index {
            switchToTab(index: newIndex)
        } else if activeTabIndex > index {
            activeTabIndex -= 1
        }

        updateTabCount()
    }

    private func updateTabCount() {
        tabCountBtn.setTitle("\(tabs.count)", for: .normal)
    }

    private func updatePrivateModeIndicator() {
        guard activeTabIndex < tabs.count else { return }
        let isPrivate = tabs[activeTabIndex].isPrivate
        isPrivateMode = isPrivate
        privateModeIndicator.isHidden = !isPrivate

        // Update progress bar position
        progressBarTopConstraint?.isActive = false
        if isPrivate {
            progressBarTopConstraint = progressBar.topAnchor.constraint(equalTo: privateModeIndicator.bottomAnchor)
        } else {
            progressBarTopConstraint = progressBar.topAnchor.constraint(equalTo: navigationBarView.bottomAnchor)
        }
        progressBarTopConstraint?.isActive = true
    }

    @objc private func showTabSwitcher() {
        let switcherVC = UIViewController()
        switcherVC.modalPresentationStyle = .pageSheet
        if #available(iOS 15.0, *) {
            if let sheet = switcherVC.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
            }
        }

        // Dark background
        switcherVC.view.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)

        // Header
        let headerView = UIView()
        headerView.translatesAutoresizingMaskIntoConstraints = false
        switcherVC.view.addSubview(headerView)

        let titleLabel = UILabel()
        titleLabel.text = "Tabs (\(tabs.count))"
        titleLabel.textColor = .white
        titleLabel.font = UIFont.boldSystemFont(ofSize: 18)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(titleLabel)

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("Done", for: .normal)
        closeButton.setTitleColor(UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0), for: .normal)
        closeButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 16)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(closeButton)

        // ScrollView for tab cards
        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        switcherVC.view.addSubview(scrollView)

        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 8
        stackView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stackView)

        // Add tab cards
        for (index, tab) in tabs.enumerated() {
            // Update tab info before displaying
            let displayTitle: String
            let tabUrl = tab.webView.url?.absoluteString ?? tab.url
            let webViewTitle = tab.webView.title

            if let wt = webViewTitle, !wt.isEmpty, wt != "New Tab", wt != "Private Tab" {
                displayTitle = wt
            } else if tab.title.isEmpty || tab.title == "New Tab" || tab.title == "Private Tab" {
                displayTitle = tab.isPrivate ? "Private Tab" : "New Tab"
            } else {
                displayTitle = tab.title
            }

            let cardView = createTabCard(title: displayTitle, url: tabUrl, isPrivate: tab.isPrivate, index: index, isActive: index == activeTabIndex, webView: tab.webView)
            // Add tap gesture to switch
            let tapGesture = UITapGestureRecognizer(target: self, action: #selector(self.switchToTabFromGesture(_:)))
            cardView.tag = index
            cardView.addGestureRecognizer(tapGesture)
            stackView.addArrangedSubview(cardView)
        }

        // New Tab button
        let newTabBtn = UIButton(type: .system)
        newTabBtn.setTitle("+ New Tab", for: .normal)
        newTabBtn.setTitleColor(.white, for: .normal)
        newTabBtn.backgroundColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        newTabBtn.layer.cornerRadius = 10
        newTabBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 15)
        newTabBtn.translatesAutoresizingMaskIntoConstraints = false
        newTabBtn.addTarget(self, action: #selector(self.createNewTabFromSwitcher), for: .touchUpInside)
        newTabBtn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        stackView.addArrangedSubview(newTabBtn)

        // New Private Tab button
        let newPrivateTabBtn = UIButton(type: .system)
        newPrivateTabBtn.setTitle("+ New Private Tab", for: .normal)
        newPrivateTabBtn.setTitleColor(.white, for: .normal)
        newPrivateTabBtn.backgroundColor = UIColor(red: 0.4, green: 0.2, blue: 0.6, alpha: 1.0)
        newPrivateTabBtn.layer.cornerRadius = 10
        newPrivateTabBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 15)
        newPrivateTabBtn.translatesAutoresizingMaskIntoConstraints = false
        newPrivateTabBtn.addTarget(self, action: #selector(self.createNewPrivateTabFromSwitcher), for: .touchUpInside)
        newPrivateTabBtn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        stackView.addArrangedSubview(newPrivateTabBtn)

        // Close button action
        closeButton.addTarget(switcherVC, action: #selector(UIViewController.dismiss(animated:completion:)), for: .touchUpInside)

        // Layout constraints
        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: switcherVC.view.safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: switcherVC.view.leadingAnchor, constant: 16),
            headerView.trailingAnchor.constraint(equalTo: switcherVC.view.trailingAnchor, constant: -16),
            headerView.heightAnchor.constraint(equalToConstant: 44),

            titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            closeButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
            closeButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: switcherVC.view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: switcherVC.view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: switcherVC.view.bottomAnchor),

            stackView.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 8),
            stackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: 16),
            stackView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -16),
            stackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -16),
            stackView.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -32),
        ])

        present(switcherVC, animated: true)
    }

    private func createTabCard(title: String, url: String, isPrivate: Bool, index: Int, isActive: Bool, webView: WKWebView) -> UIView {
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = isActive ? UIColor(red: 0.086, green: 0.075, blue: 0.243, alpha: 1.0) : UIColor(red: 0.12, green: 0.11, blue: 0.24, alpha: 0.8)
        card.layer.cornerRadius = 10
        card.layer.borderWidth = isActive ? 1.5 : 0
        card.layer.borderColor = isActive ? UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0).cgColor : nil

        // Favicon
        let faviconImg = UIImageView()
        faviconImg.translatesAutoresizingMaskIntoConstraints = false
        faviconImg.contentMode = .scaleAspectFit
        faviconImg.layer.cornerRadius = 4
        faviconImg.clipsToBounds = true

        // Try to get favicon directly from the website's own /favicon.ico
        // No third-party API used — fully self-reliant
        if let favUrl = webView.url, !url.hasPrefix("eesha://") {
            let scheme = favUrl.scheme ?? "https"
            let host = favUrl.host ?? ""
            let faviconUrl = "\(scheme)://\(host)/favicon.ico"
            faviconImg.loadRemoteImage(from: faviconUrl)
        } else {
            faviconImg.image = UIImage(systemName: isPrivate ? "eye.slash" : "globe")
            faviconImg.tintColor = UIColor(white: 1, alpha: 0.5)
        }

        // Private indicator
        let privIcon = UILabel()
        if isPrivate {
            privIcon.text = "🕶"
            privIcon.font = UIFont.systemFont(ofSize: 12)
        }
        privIcon.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        let displayTitle = title.isEmpty || title == "New Tab" || title == "Private Tab" ? (isPrivate ? "Private Tab" : "New Tab") : title
        titleLabel.text = (isActive ? "● " : "") + displayTitle
        titleLabel.textColor = isActive ? UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0) : .white
        titleLabel.font = UIFont.systemFont(ofSize: 14, weight: isActive ? .semibold : .regular)
        titleLabel.numberOfLines = 1
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let urlLabel = UILabel()
        urlLabel.text = url.hasPrefix("eesha://") ? "" : url
        urlLabel.textColor = UIColor(white: 1, alpha: 0.4)
        urlLabel.font = UIFont.systemFont(ofSize: 11)
        urlLabel.numberOfLines = 1
        urlLabel.lineBreakMode = .byTruncatingTail
        urlLabel.translatesAutoresizingMaskIntoConstraints = false

        let closeBtn = UIButton(type: .system)
        closeBtn.setTitle("✕", for: .normal)
        closeBtn.setTitleColor(UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0), for: .normal)
        closeBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 14)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        closeBtn.tag = index
        closeBtn.addTarget(self, action: #selector(closeTabFromSwitcher(_:)), for: .touchUpInside)

        card.addSubview(faviconImg)
        if isPrivate { card.addSubview(privIcon) }
        card.addSubview(titleLabel)
        card.addSubview(urlLabel)
        card.addSubview(closeBtn)

        NSLayoutConstraint.activate([
            card.heightAnchor.constraint(equalToConstant: 64),

            faviconImg.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            faviconImg.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            faviconImg.widthAnchor.constraint(equalToConstant: 28),
            faviconImg.heightAnchor.constraint(equalToConstant: 28),

            titleLabel.leadingAnchor.constraint(equalTo: faviconImg.trailingAnchor, constant: 10),
            titleLabel.trailingAnchor.constraint(equalTo: closeBtn.leadingAnchor, constant: -8),
            titleLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),

            urlLabel.leadingAnchor.constraint(equalTo: faviconImg.trailingAnchor, constant: 10),
            urlLabel.trailingAnchor.constraint(equalTo: closeBtn.leadingAnchor, constant: -8),
            urlLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 2),

            closeBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -8),
            closeBtn.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            closeBtn.widthAnchor.constraint(equalToConstant: 28),
            closeBtn.heightAnchor.constraint(equalToConstant: 28),
        ])

        if isPrivate {
            NSLayoutConstraint.activate([
                privIcon.leadingAnchor.constraint(equalTo: faviconImg.trailingAnchor, constant: -4),
                privIcon.topAnchor.constraint(equalTo: faviconImg.topAnchor, constant: -2),
            ])
        }

        return card
    }

    @objc private func switchToTabFromGesture(_ gesture: UITapGestureRecognizer) {
        guard let index = gesture.view?.tag, index < tabs.count else { return }
        dismiss(animated: true) {
            self.switchToTab(index: index)
        }
    }

    @objc private func closeTabFromSwitcher(_ sender: UIButton) {
        let index = sender.tag
        dismiss(animated: true) {
            self.closeTab(index: index)
        }
    }

    @objc private func createNewTabFromSwitcher() {
        dismiss(animated: true) {
            self.createNewTab()
        }
    }

    @objc private func createNewPrivateTabFromSwitcher() {
        dismiss(animated: true) {
            self.createNewTab(isPrivate: true)
        }
    }

    // MARK: - WebView Setup (Legacy - used by settingsDidChange)

    private func setupWebView(normalMode: Bool) {
        // Close current active tab's webView and recreate it
        guard activeTabIndex < tabs.count else { return }

        let oldTab = tabs[activeTabIndex]
        let oldUrl = oldTab.webView.url?.absoluteString ?? oldTab.url
        let wasPrivate = oldTab.isPrivate

        // Remove old webView
        oldTab.webView.removeObserver(self, forKeyPath: "estimatedProgress")
        oldTab.webView.removeObserver(self, forKeyPath: "title")
        oldTab.webView.removeFromSuperview()

        // Create new webView with updated config
        let newWebView = createWebView(isPrivate: wasPrivate)
        view.insertSubview(newWebView, belowSubview: autocompleteTable)
        newWebView.isHidden = false

        // Set up constraints
        NSLayoutConstraint.activate([
            newWebView.topAnchor.constraint(equalTo: findBar.bottomAnchor),
            newWebView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            newWebView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            newWebView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        // Replace the tab's webView
        tabs[activeTabIndex] = TabInfo(
            id: oldTab.id,
            webView: newWebView,
            title: oldTab.title,
            url: oldUrl,
            isPrivate: wasPrivate
        )
        webView = newWebView

        // Reload current page if not a new tab
        if !oldUrl.isEmpty && !oldUrl.hasPrefix("eesha://") {
            if let url = URL(string: oldUrl) {
                newWebView.load(URLRequest(url: url))
            }
        } else {
            loadEeshaNewTab()
        }
    }

    // MARK: - Fingerprint Protection

    private func injectFingerprintProtection(into config: WKWebViewConfiguration) {
        var fpsScript = ""

        // Try to load from bundle first
        if let fpsURL = Bundle.main.url(forResource: "fingerprint-protection", withExtension: "js"),
           let fpsData = try? Data(contentsOf: fpsURL) {
            fpsScript = String(data: fpsData, encoding: .utf8) ?? ""
        }

        // Fallback: inline script
        if fpsScript.isEmpty {
            fpsScript = getFallbackFingerprintScript()
        }

        if !fpsScript.isEmpty {
            let script = WKUserScript(
                source: fpsScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
            config.userContentController.addUserScript(script)
        }
    }

    private func getFallbackFingerprintScript() -> String {
        return """
        (function(){
          'use strict';
          // Canvas Fingerprint Protection
          const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function() {
            try {
              const ctx = this.getContext('2d');
              if (ctx && this.width > 0 && this.height > 0) {
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4 * 37) {
                  data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * 2));
                }
                ctx.putImageData(imageData, 0, 0);
              }
            } catch(e) {}
            return origToDataURL.apply(this, arguments);
          };
          // WebGL Fingerprint Protection
          const getParamHandler = {
            apply: function(target, thisArg, args) {
              if (args[0] === 0x9245) return 'GPU Vendor';
              if (args[0] === 0x9246) return 'GPU Renderer';
              return target.apply(thisArg, args);
            }
          };
          try {
            WebGLRenderingContext.prototype.getParameter = new Proxy(
              WebGLRenderingContext.prototype.getParameter, getParamHandler);
            if (typeof WebGL2RenderingContext !== 'undefined') {
              WebGL2RenderingContext.prototype.getParameter = new Proxy(
                WebGL2RenderingContext.prototype.getParameter, getParamHandler);
            }
          } catch(e) {}
          // Hardware info protection
          try {
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
            if ('deviceMemory' in navigator) {
              Object.defineProperty(navigator, 'deviceMemory', { get: () => 4, configurable: true });
            }
          } catch(e) {}
          // Battery API protection
          try {
            if (navigator.getBattery) {
              navigator.getBattery = () => Promise.resolve({
                charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
                addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){ return true; }
              });
            }
          } catch(e) {}
          // Plugins protection
          try {
            Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true });
            Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true });
          } catch(e) {}
          // WebRTC leak protection
          try {
            const origRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
            if (origRTC) {
              window.RTCPeerConnection = function(config, constraints) {
                if (config && config.iceServers) { config.iceTransportPolicy = 'relay'; }
                else { config = { iceTransportPolicy: 'relay' }; }
                return new origRTC(config, constraints);
              };
              window.RTCPeerConnection.prototype = origRTC.prototype;
            }
          } catch(e) {}
        })();
        """
    }

    // MARK: - Gestures

    private func setupGestures() {
        // Forward swipe gesture (right edge -> go forward)
        let forwardSwipe = UISwipeGestureRecognizer(target: self, action: #selector(handleForwardSwipe(_:)))
        forwardSwipe.direction = .left
        forwardSwipe.numberOfTouchesRequired = 1
        view.addGestureRecognizer(forwardSwipe)
    }

    @objc private func handleForwardSwipe(_ gesture: UISwipeGestureRecognizer) {
        if webView.canGoForward {
            webView.goForward()
        }
    }

    @objc private func handleBackSwipe(_ gesture: UIScreenEdgePanGestureRecognizer) {
        if gesture.state == .ended, webView.canGoBack {
            webView.goBack()
        }
    }

    // MARK: - KVO

    override func observeValue(forKeyPath keyPath: String?, of object: Any?,
                                change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        // Only update UI for the active tab's webView
        guard let observedWV = object as? WKWebView, observedWV == webView else { return }

        if keyPath == "estimatedProgress" {
            progressBar.progress = Float(webView.estimatedProgress)
            progressBar.isHidden = webView.estimatedProgress >= 1.0
        } else if keyPath == "title" {
            if let title = webView.title, !title.isEmpty {
                navigationItem.title = title
                // Update active tab title
                if activeTabIndex < tabs.count {
                    tabs[activeTabIndex].title = title
                }
            }
        }
    }

    // MARK: - Navigation

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if textField.tag == 999 {
            // Find bar input - search next
            findInPage(findInput.text ?? "")
            return true
        }

        textField.resignFirstResponder()
        hideAutocomplete()
        if let input = textField.text?.trimmingCharacters(in: .whitespacesAndNewlines), !input.isEmpty {
            navigateToUrl(input)
        }
        return true
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        if textField.tag != 999 {
            textField.selectAll(nil)
        }
    }

    func textFieldShouldClear(_ textField: UITextField) -> Bool {
        if textField.tag != 999 {
            hideAutocomplete()
        }
        return true
    }

    private func navigateToUrl(_ input: String) {
        // Handle internal pages
        if input == "eesha://bookmarks" || input == "eesha://history" || input == "eesha://settings" || input == "eesha://downloads" || input.hasPrefix("eesha://search") {
            handleInternalPage(input)
            return
        }

        let url: String
        if input.hasPrefix("http://") || input.hasPrefix("https://") {
            url = input
        } else if input.hasPrefix("eesha://") {
            handleInternalPage(input)
            return
        } else if input.contains(".") && !input.contains(" ") {
            // Looks like a URL — navigate directly
            url = "https://\(input)"
        } else {
            // Search query — route through the appropriate engine
            let engine = SettingsKeys.getSearchEngine()
            let encoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? input
            url = "\(engine.searchURL)\(encoded)"
        }

        if var requestUrl = URL(string: url) {
            // HTTPS-only upgrade
            if SettingsKeys.isHTTPSOnlyEnabled(),
               requestUrl.scheme == "http",
               var components = URLComponents(url: requestUrl, resolvingAgainstBaseURL: false) {
                components.scheme = "https"
                if let upgraded = components.url {
                    requestUrl = upgraded
                }
            }
            webView.load(URLRequest(url: requestUrl))
        }
    }

    @objc private func goBack() {
        if webView.canGoBack {
            webView.goBack()
        }
    }

    @objc private func goForward() { webView.goForward() }
    @objc private func refresh() { webView.reload() }
    @objc private func goHome() { loadEeshaNewTab() }

    // MARK: - Address Bar Autocomplete

    @objc private func urlBarTextChanged() {
        guard let query = urlBar.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !query.isEmpty else {
            hideAutocomplete()
            return
        }

        let results = searchAutocomplete(query: query)
        if results.isEmpty {
            hideAutocomplete()
        } else {
            autocompleteResults = results
            autocompleteTable.reloadData()
            autocompleteTable.isHidden = false
            view.bringSubviewToFront(autocompleteTable)
        }
    }

    private func searchAutocomplete(query: String) -> [AutocompleteItem] {
        let lowerQuery = query.lowercased()
        var results: [AutocompleteItem] = []

        // Search bookmarks
        let bookmarks = SettingsKeys.getBookmarks()
        for bookmark in bookmarks {
            if let title = bookmark["title"]?.lowercased(), let url = bookmark["url"],
               title.contains(lowerQuery) || url.lowercased().contains(lowerQuery) {
                results.append(AutocompleteItem(title: bookmark["title"] ?? url, url: url, type: .bookmark))
            }
        }

        // Search history
        let history = SettingsKeys.getHistory()
        for item in history {
            if let title = item["title"]?.lowercased(), let url = item["url"],
               title.contains(lowerQuery) || url.lowercased().contains(lowerQuery) {
                results.append(AutocompleteItem(title: item["title"] ?? url, url: url, type: .history))
            }
        }

        return Array(results.prefix(5))
    }

    private func hideAutocomplete() {
        autocompleteTable.isHidden = true
        autocompleteResults = []
    }

    // MARK: - Autocomplete Table View

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return autocompleteResults.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "autocompleteCell", for: indexPath)
        let item = autocompleteResults[indexPath.row]

        cell.backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.28, alpha: 0.95)
        cell.textLabel?.textColor = .white
        cell.detailTextLabel?.textColor = UIColor(white: 1, alpha: 0.5)

        let typeIcon = item.type == .bookmark ? "🔖" : "🕐"
        cell.textLabel?.text = "\(typeIcon) \(item.title)"
        cell.textLabel?.font = UIFont.systemFont(ofSize: 13)
        cell.textLabel?.lineBreakMode = .byTruncatingTail

        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let item = autocompleteResults[indexPath.row]
        urlBar.text = item.url
        hideAutocomplete()
        urlBar.resignFirstResponder()
        navigateToUrl(item.url)
    }

    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        return 40
    }

    // MARK: - Menu

    @objc private func showMenu() {
        let alert = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)

        alert.addAction(UIAlertAction(title: "📖 Bookmarks", style: .default) { _ in
            self.handleInternalPage("eesha://bookmarks")
        })

        alert.addAction(UIAlertAction(title: "🕐 History", style: .default) { _ in
            self.handleInternalPage("eesha://history")
        })

        alert.addAction(UIAlertAction(title: "📥 Downloads", style: .default) { _ in
            self.handleInternalPage("eesha://downloads")
        })

        let privateTitle = isPrivateMode ? "🚪 Exit Private Tab" : "🕶 New Private Tab"
        alert.addAction(UIAlertAction(title: privateTitle, style: .default) { _ in
            self.togglePrivateMode()
        })

        let desktopTitle = SettingsKeys.isDesktopSiteEnabled() ? "📱 Request Mobile Site" : "🖥 Request Desktop Site"
        alert.addAction(UIAlertAction(title: desktopTitle, style: .default) { _ in
            self.toggleDesktopSite()
        })

        alert.addAction(UIAlertAction(title: "🔍 Find in Page", style: .default) { _ in
            self.showFindBar()
        })

        alert.addAction(UIAlertAction(title: "📤 Share", style: .default) { _ in
            self.shareCurrentPage()
        })

        alert.addAction(UIAlertAction(title: "➕ Add Bookmark", style: .default) { _ in
            self.addCurrentPageAsBookmark()
        })

        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(alert, animated: true)
    }

    // MARK: - Settings

    @objc private func showSettings() {
        let settingsVC = SettingsViewController()
        settingsVC.delegate = self
        let nav = UINavigationController(rootViewController: settingsVC)
        nav.modalPresentationStyle = .formSheet
        present(nav, animated: true)
    }

    // MARK: - Settings Delegate

    func settingsDidChange() {
        // Re-create web view to apply fingerprint protection / content blocker changes
        setupWebView(normalMode: !isPrivateMode)
    }

    func clearBrowsingData() {
        // Data is already cleared by the settings controller
        // Just reload the current page
        if let url = webView.url {
            webView.load(URLRequest(url: url))
        }
    }

    // MARK: - Private Mode

    private func togglePrivateMode() {
        if isPrivateMode {
            // If already in private mode, create a new normal tab
            createNewTab(isPrivate: false)
        } else {
            // Create a new private tab
            createNewTab(isPrivate: true)
        }
    }

    // MARK: - Desktop Site

    private func toggleDesktopSite() {
        let newValue = !SettingsKeys.isDesktopSiteEnabled()
        SettingsKeys.defaults.set(newValue, forKey: SettingsKeys.desktopSiteEnabled)

        if newValue {
            webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        } else {
            webView.customUserAgent = nil
        }
        webView.reload()
    }

    // MARK: - Bookmarks

    private func addCurrentPageAsBookmark() {
        guard let url = webView.url?.absoluteString, !url.hasPrefix("eesha://") else {
            showAlert(title: "Cannot Bookmark", message: "This page cannot be bookmarked.")
            return
        }

        let title = webView.title ?? url

        // Check if already bookmarked
        var bookmarks = SettingsKeys.getBookmarks()
        if bookmarks.contains(where: { $0["url"] == url }) {
            showAlert(title: "Already Bookmarked", message: "This page is already in your bookmarks.")
            return
        }

        bookmarks.insert(["title": title, "url": url], at: 0)
        SettingsKeys.saveBookmarks(bookmarks)
        showAlert(title: "Bookmarked", message: "\(title) added to bookmarks.")
    }

    private func removeBookmark(url: String) {
        var bookmarks = SettingsKeys.getBookmarks()
        bookmarks.removeAll { $0["url"] == url }
        SettingsKeys.saveBookmarks(bookmarks)
    }

    // MARK: - History

    private func addToHistory(url: String, title: String) {
        guard !url.hasPrefix("eesha://") else { return }
        if isPrivateMode { return } // Don't save history in private mode

        var history = SettingsKeys.getHistory()

        // Remove duplicate
        history.removeAll { $0["url"] == url }

        // Add to front
        let timestamp = Int(Date().timeIntervalSince1970)
        history.insert(["url": url, "title": title, "timestamp": "\(timestamp)"], at: 0)

        // Keep only last 500 entries
        if history.count > 500 {
            history = Array(history.prefix(500))
        }

        SettingsKeys.saveHistory(history)
    }

    private func removeHistoryEntry(url: String) {
        var history = SettingsKeys.getHistory()
        history.removeAll { $0["url"] == url }
        SettingsKeys.saveHistory(history)
    }

    // MARK: - Downloads Manager

    private let downloadableExtensions: Set<String> = [
        "pdf", "zip", "apk", "dmg", "exe", "msi", "tar", "gz", "rar", "7z",
        "doc", "docx", "xls", "xlsx", "ppt", "pptx", "mp3", "mp4", "avi",
        "mov", "wav", "flac", "iso", "deb", "rpm", "pkg", "bin"
    ]

    private func isDownloadableUrl(_ url: URL) -> Bool {
        let pathExtension = url.pathExtension.lowercased()
        return downloadableExtensions.contains(pathExtension)
    }

    private func startDownload(url: String) {
        guard let downloadUrl = URL(string: url) else { return }

        let filename = downloadUrl.lastPathComponent.isEmpty
            ? "download_\(Int(Date().timeIntervalSince1970))"
            : downloadUrl.lastPathComponent

        let item = DownloadItem(url: url, filename: filename)
        downloads.append(item)
        activeDownloadItem = item

        showDownloadToast(filename: filename)

        let task = URLSession.shared.downloadTask(with: downloadUrl) { [weak self] tempUrl, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    item.state = "failed"
                    item.progress = 0
                    self?.updateDownloadToast(message: "Download failed: \(error.localizedDescription)")
                    self?.dismissDownloadToastDelayed()
                    return
                }

                guard let tempUrl = tempUrl else {
                    item.state = "failed"
                    self?.updateDownloadToast(message: "Download failed")
                    self?.dismissDownloadToastDelayed()
                    return
                }

                // Determine filename from response or URL
                let finalFilename: String
                if let suggestedFilename = response?.suggestedFilename, !suggestedFilename.isEmpty {
                    finalFilename = suggestedFilename
                } else {
                    finalFilename = filename
                }
                item.filename = finalFilename

                // Save to Documents directory
                let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let destinationUrl = documentsDir.appendingPathComponent(finalFilename)

                do {
                    // Remove existing file if any
                    if FileManager.default.fileExists(atPath: destinationUrl.path) {
                        try FileManager.default.removeItem(at: destinationUrl)
                    }
                    try FileManager.default.moveItem(at: tempUrl, to: destinationUrl)
                    item.state = "completed"
                    item.progress = 1.0
                    item.localPath = destinationUrl.path
                    self?.updateDownloadToast(message: "Downloaded: \(finalFilename)")
                    self?.dismissDownloadToastDelayed()
                } catch {
                    item.state = "failed"
                    self?.updateDownloadToast(message: "Save failed: \(error.localizedDescription)")
                    self?.dismissDownloadToastDelayed()
                }
            }
        }

        activeDownloadTask = task
        task.resume()

        // Monitor progress
        let observation = task.progress.observe(\.fractionCompleted) { [weak self] progress, _ in
            DispatchQueue.main.async {
                item.progress = progress.fractionCompleted
                self?.downloadProgressView?.progress = Float(progress.fractionCompleted)
            }
        }
        // Store observation (it will be released when task completes)
        objc_setAssociatedObject(task, "progressObservation", observation, .OBJC_ASSOCIATION_RETAIN)
    }

    private func showDownloadToast(filename: String) {
        // Remove existing toast
        downloadToast?.removeFromSuperview()

        let toast = UIView()
        toast.backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.28, alpha: 0.95)
        toast.layer.cornerRadius = 12
        toast.clipsToBounds = true
        toast.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = "Downloading: \(filename)"
        label.textColor = .white
        label.font = UIFont.systemFont(ofSize: 13)
        label.translatesAutoresizingMaskIntoConstraints = false
        toast.addSubview(label)

        let progress = UIProgressView(progressViewStyle: .default)
        progress.progressTintColor = UIColor(red: 0.914, green: 0.271, blue: 0.376, alpha: 1.0)
        progress.trackTintColor = UIColor(white: 1, alpha: 0.1)
        progress.translatesAutoresizingMaskIntoConstraints = false
        toast.addSubview(progress)

        view.addSubview(toast)

        NSLayoutConstraint.activate([
            toast.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            toast.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            toast.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            toast.heightAnchor.constraint(equalToConstant: 56),

            label.topAnchor.constraint(equalTo: toast.topAnchor, constant: 8),
            label.leadingAnchor.constraint(equalTo: toast.leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: toast.trailingAnchor, constant: -12),

            progress.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 6),
            progress.leadingAnchor.constraint(equalTo: toast.leadingAnchor, constant: 12),
            progress.trailingAnchor.constraint(equalTo: toast.trailingAnchor, constant: -12),
        ])

        downloadToast = toast
        downloadProgressView = progress
        downloadLabel = label
    }

    private func updateDownloadToast(message: String) {
        downloadLabel?.text = message
        if message.hasPrefix("Downloaded") {
            downloadProgressView?.progress = 1.0
        }
    }

    private func dismissDownloadToastDelayed() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            UIView.animate(withDuration: 0.3, animations: {
                self?.downloadToast?.alpha = 0
            }) { _ in
                self?.downloadToast?.removeFromSuperview()
                self?.downloadToast = nil
                self?.downloadProgressView = nil
                self?.downloadLabel = nil
            }
        }
    }

    private func loadDownloadsPage() {
        var downloadItems = ""

        if downloads.isEmpty {
            downloadItems = """
            <div class="empty-state">
                <div class="empty-icon">📥</div>
                <p>No downloads yet</p>
                <p class="hint">Downloaded files will appear here</p>
            </div>
            """
        } else {
            for (index, item) in downloads.enumerated() {
                let stateIcon: String
                let stateColor: String
                switch item.state {
                case "downloading":
                    stateIcon = "⏳"
                    stateColor = "#FFA500"
                case "completed":
                    stateIcon = "✅"
                    stateColor = "#4CAF50"
                case "failed":
                    stateIcon = "❌"
                    stateColor = "#e94560"
                default:
                    stateIcon = "?"
                    stateColor = "#999"
                }

                let sizeStr = item.state == "completed" ? "Completed" : (item.state == "downloading" ? "\(Int(item.progress * 100))%" : "Failed")
                let dateStr = formatDate(timestamp: item.startTime.timeIntervalSince1970)

                downloadItems += """
                <div class="item">
                    <div class="item-icon" style="background: \(stateColor);">
                        \(stateIcon)
                    </div>
                    <div class="item-content">
                        <div class="item-title">\(escapeHTML(item.filename))</div>
                        <div class="item-url">\(sizeStr) - \(dateStr)</div>
                    </div>
                    <button class="delete-btn" onclick="deleteDownload(\(index))">✕</button>
                </div>
                """
            }
        }

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Downloads</title>
            <link rel="icon" type="image/png" href="\(faviconDataUri)">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
                    padding: 16px; padding-top: 60px;
                }
                .header {
                    position: fixed; top: 0; left: 0; right: 0;
                    background: #1a1a2e; padding: 12px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    z-index: 10; display: flex; align-items: center; justify-content: space-between;
                }
                .header h1 { font-size: 20px; font-weight: 700; color: #e94560; }
                .header .count { font-size: 13px; color: rgba(255,255,255,0.4); }
                .item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px; border-radius: 12px; margin-bottom: 4px;
                    background: rgba(255,255,255,0.04); transition: background 0.15s;
                }
                .item:active { background: rgba(255,255,255,0.08); }
                .item-icon {
                    width: 40px; height: 40px; border-radius: 50%;
                    display: flex; align-items: center;
                    justify-content: center; font-weight: 700; color: #fff; font-size: 16px;
                    flex-shrink: 0;
                }
                .item-content { flex: 1; min-width: 0; }
                .item-title {
                    font-size: 15px; font-weight: 500; color: #fff;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .item-url {
                    font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .delete-btn {
                    width: 32px; height: 32px; border-radius: 50%; border: none;
                    background: rgba(233,69,96,0.15); color: #e94560;
                    font-size: 14px; cursor: pointer; flex-shrink: 0;
                }
                .delete-btn:active { background: rgba(233,69,96,0.3); }
                .empty-state {
                    text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.4);
                }
                .empty-icon { font-size: 48px; margin-bottom: 16px; }
                .empty-state p { font-size: 16px; margin-bottom: 4px; }
                .hint { font-size: 13px !important; color: rgba(255,255,255,0.25) !important; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Downloads</h1>
                <span class="count">\(downloads.count) items</span>
            </div>
            \(downloadItems)
            <script>
                function deleteDownload(index) {
                    window.webkit.messageHandlers.downloadAction.postMessage({action: 'delete', index: index});
                }
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "eesha://downloads"))
    }

    // MARK: - Share

    private func shareCurrentPage() {
        guard let url = webView.url, !url.absoluteString.hasPrefix("eesha://") else {
            showAlert(title: "Cannot Share", message: "This page cannot be shared.")
            return
        }
        let title = webView.title ?? url.absoluteString

        let items: [Any] = [title, url]
        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)

        // For iPad
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = btnMenu
            popover.sourceRect = btnMenu.bounds
        }

        present(activityVC, animated: true)
    }

    // MARK: - Internal Pages

    private func handleInternalPage(_ page: String) {
        isLoadingInternalPage = true

        if page.hasPrefix("eesha://search") {
            // Redirect eesha://search to SearXNG directly
            if let components = URLComponents(string: page),
               let queryItem = components.queryItems?.first(where: { $0.name == "q" }),
               let query = queryItem.value, !query.isEmpty {
                let category = components.queryItems?.first(where: { $0.name == "category" })?.value
                
                // ── IMAGES: Load custom image viewer instead of SearXNG's heavy page ──
                // Image grids in SearXNG cause OOM crashes on iOS (WKWebView process killed).
                // Our custom viewer uses thumbnail_src (small) + lazy loading + concurrent
                // load limiting to stay within memory limits.
                if category == "images" {
                    loadImageViewer(query: query)
                    isLoadingInternalPage = false
                    return
                }
                
                let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
                let searchUrl: String
                if let cat = category, cat != "general" {
                    searchUrl = "\(SearchEngine.eeshaSearchBaseURL)/search?q=\(encoded)&categories=\(cat)"
                } else {
                    searchUrl = "\(SearchEngine.eeshaSearchBaseURL)/search?q=\(encoded)"
                }
                if let url = URL(string: searchUrl) {
                    webView.load(URLRequest(url: url))
                }
                urlBar.text = query
            } else {
                if let url = URL(string: SearchEngine.eeshaSearchBaseURL) {
                    webView.load(URLRequest(url: url))
                }
                urlBar.text = SearchEngine.eeshaSearchBaseURL
            }
            isLoadingInternalPage = false
            return
        }

        urlBar.text = page

        switch page {
        case "eesha://bookmarks":
            loadBookmarksPage()
        case "eesha://history":
            loadHistoryPage()
        case "eesha://settings":
            showSettings()
            isLoadingInternalPage = false
        case "eesha://downloads":
            loadDownloadsPage()
        default:
            isLoadingInternalPage = false
        }
    }

    // MARK: - Custom Image Viewer (Memory-Safe)
    // Loads images from SearXNG JSON API with:
    // - thumbnail_src for grid (small, ~150px)
    // - img_src for full-screen view (one at a time)
    // - IntersectionObserver lazy loading
    // - Concurrent load limiting (max 4 at once)
    // - "Load More" button (10 per batch)
    // - WKWebView process termination handling for crash recovery

    private func loadImageViewer(query: String) {
        let safeQuery = query.replacingOccurrences(of: "'", with: "\\'").replacingOccurrences(of: "\"", with: "\\\"")
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let apiBase = SearchEngine.eeshaSearchBaseURL

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://eesha-search.onrender.com https://commons.wikimedia.org https://en.wikipedia.org;">
            <title>Images - \(safeQuery)</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
                    padding-top: 8px; -webkit-overflow-scrolling: touch;
                }
                .header {
                    display: flex; align-items: center; gap: 10px;
                    padding: 8px 12px; background: #16213e;
                    position: sticky; top: 0; z-index: 100;
                    border-bottom: 1px solid #0f3460;
                }
                .back-btn {
                    background: none; border: none; color: #e94560;
                    font-size: 20px; cursor: pointer; padding: 4px 8px;
                    -webkit-tap-highlight-color: transparent;
                }
                .header-title {
                    font-size: 15px; font-weight: 600; color: #e0e0e0;
                    flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .header-count { font-size: 11px; color: #6a6a8a; }
                .image-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 4px; padding: 6px;
                }
                .image-card {
                    background: #16213e; border-radius: 6px; overflow: hidden;
                    cursor: pointer; position: relative; aspect-ratio: 1;
                    -webkit-tap-highlight-color: transparent;
                }
                .image-card img {
                    width: 100%; height: 100%; object-fit: cover; display: block;
                }
                .image-card .placeholder {
                    width: 100%; height: 100%;
                    background: linear-gradient(135deg, #16213e 25%, #1a2a4e 50%, #16213e 75%);
                    background-size: 200% 200%;
                    animation: shimmer 1.5s ease-in-out infinite;
                }
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .image-card .img-title {
                    position: absolute; bottom: 0; left: 0; right: 0;
                    background: linear-gradient(transparent, rgba(0,0,0,0.7));
                    padding: 16px 4px 3px; font-size: 9px; color: #e0e0e0;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .load-more-btn {
                    display: block; width: calc(100% - 12px); margin: 10px 6px 24px;
                    padding: 11px; background: #16213e; color: #e94560;
                    border: 1px solid #0f3460; border-radius: 10px;
                    font-size: 14px; font-weight: 500; cursor: pointer; text-align: center;
                    -webkit-tap-highlight-color: transparent;
                }
                .load-more-btn:active { background: #0f3460; }
                .loading {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 80px 16px; gap: 14px;
                }
                .spinner {
                    width: 32px; height: 32px;
                    border: 3px solid #0f3460; border-top-color: #e94560;
                    border-radius: 50%; animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .loading-text { font-size: 13px; color: #6a6a8a; }
                .error {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 60px 16px; gap: 10px;
                    text-align: center;
                }
                .error-icon { font-size: 42px; }
                .error-title { font-size: 17px; font-weight: 600; color: #e94560; }
                .error-message { font-size: 13px; color: #8a8aaa; max-width: 320px; }
                .retry-btn {
                    margin-top: 8px; padding: 9px 22px;
                    background: #e94560; color: #fff; border: none;
                    border-radius: 22px; font-size: 14px; cursor: pointer;
                }
                .retry-btn:active { background: #c73852; }
                .fullscreen-overlay {
                    display: none; position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.95); z-index: 200;
                    flex-direction: column; align-items: center; justify-content: center;
                }
                .fullscreen-overlay.active { display: flex; }
                .fullscreen-close {
                    position: absolute; top: 16px; right: 16px;
                    background: none; border: none; color: #fff;
                    font-size: 26px; cursor: pointer; z-index: 201; padding: 8px;
                }
                .fullscreen-counter {
                    position: absolute; top: 16px; left: 16px;
                    color: rgba(255,255,255,0.7); font-size: 13px; z-index: 201;
                }
                .fullscreen-img {
                    max-width: 95%; max-height: 75vh;
                    object-fit: contain; border-radius: 4px;
                }
                .fullscreen-source {
                    position: absolute; bottom: 30px;
                    color: rgba(255,255,255,0.5); font-size: 11px; z-index: 201;
                }
                .fullscreen-nav {
                    position: absolute; top: 50%; transform: translateY(-50%);
                    background: rgba(255,255,255,0.15); border: none;
                    color: #fff; font-size: 24px; cursor: pointer;
                    padding: 20px 14px; z-index: 201;
                }
                .fullscreen-nav:active { background: rgba(255,255,255,0.25); }
                .fullscreen-prev { left: 6px; }
                .fullscreen-next { right: 6px; }
            </style>
        </head>
        <body>
            <div class="header">
                <button class="back-btn" onclick="closeViewer()">←</button>
                <div class="header-title">Images: \(safeQuery)</div>
                <div class="header-count" id="resultCount"></div>
            </div>
            <div id="content">
                <div class="loading"><div class="spinner"></div><div class="loading-text">Loading images...</div></div>
            </div>
            <div class="fullscreen-overlay" id="fullscreenOverlay">
                <button class="fullscreen-close" onclick="closeFullscreen()">✕</button>
                <div class="fullscreen-counter" id="fullscreenCounter"></div>
                <button class="fullscreen-nav fullscreen-prev" onclick="navFullscreen(-1)">‹</button>
                <img class="fullscreen-img" id="fullscreenImg" src="" alt="">
                <button class="fullscreen-nav fullscreen-next" onclick="navFullscreen(1)">›</button>
                <div class="fullscreen-source" id="fullscreenSource"></div>
            </div>
            <script>
            (function() {
                var query = '\(safeQuery)';
                var API_BASE = '\(apiBase)';
                var allResults = [];
                var shownCount = 0;
                var BATCH_SIZE = 10;
                var MAX_CONCURRENT_LOADS = 4;
                var activeLoads = 0;
                var loadQueue = [];

                function escapeHtml(t) {
                    if (!t) return '';
                    var d = document.createElement('div');
                    d.textContent = t; return d.innerHTML;
                }
                function getHostname(u) {
                    try { return new URL(u).hostname; } catch(e) { return u; }
                }
                function closeViewer() { history.back(); }

                function queueImageLoad(imgEl, src) {
                    if (activeLoads < MAX_CONCURRENT_LOADS) {
                        activeLoads++;
                        imgEl.src = src;
                        imgEl.onload = imgEl.onerror = function() { activeLoads--; processQueue(); };
                    } else { loadQueue.push({ img: imgEl, src: src }); }
                }
                function processQueue() {
                    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
                        var item = loadQueue.shift();
                        activeLoads++;
                        item.img.src = item.src;
                        item.img.onload = item.img.onerror = function() { activeLoads--; processQueue(); };
                    }
                }

                var lazyObserver = new IntersectionObserver(function(entries) {
                    entries.forEach(function(entry) {
                        if (entry.isIntersecting) {
                            var card = entry.target;
                            var dataSrc = card.getAttribute('data-src');
                            var imgEl = card.querySelector('img');
                            if (dataSrc && imgEl) {
                                card.removeAttribute('data-src');
                                var ph = card.querySelector('.placeholder');
                                if (ph) ph.style.display = 'none';
                                imgEl.style.display = 'block';
                                queueImageLoad(imgEl, dataSrc);
                            }
                            lazyObserver.unobserve(card);
                        }
                    });
                }, { rootMargin: '300px' });

                function fetchImages() {
                    var content = document.getElementById('content');
                    content.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading images...</div></div>';
                    var searxUrl = API_BASE + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=images';
                    var fetches = [
                        fetch(searxUrl).then(function(r){if(!r.ok)throw new Error('Search failed');return r.json();}).catch(function(){return{results:[],suggestions:[]};})
                    ];
                    fetches.push(fetch('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(query)+'&gsrlimit=15&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=150&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];try{var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){try{var p=pages[pid];var img=(p.imageinfo&&p.imageinfo[0])||null;if(img){results.push({title:(p.title||'').replace('File:','').replace(/\\.[^.]+$/,'')||query,url:img.descriptionurl||img.url||'',content:'',thumbnail_src:img.thumburl||img.url||'',img_src:img.url||'',engine:'wikimedia',category:'images'});}}catch(e){}});}catch(e){}return results;}).catch(function(){return[];}));
                    fetches.push(fetch('https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(query)+'&gsrlimit=10&prop=pageimages|extracts&pithumbsize=150&exintro=true&explaintext=true&exsentences=1&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];try{var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){try{var p=pages[pid];if(p.thumbnail&&p.thumbnail.source){results.push({title:p.title||query,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent((p.title||'').replace(/ /g,'_')),content:p.extract||'',thumbnail_src:p.thumbnail.source,img_src:p.thumbnail.source.replace('/150px-','/800px-'),engine:'wikipedia',category:'images'});}}catch(e){}});}catch(e){}return results;}).catch(function(){return[];}));

                    Promise.all(fetches).then(function(responses){
                        var searxData=responses[0];var extraResults=[];
                        for(var i=1;i<responses.length;i++){if(Array.isArray(responses[i])){extraResults=extraResults.concat(responses[i]);}}
                        var searxResults=(searxData.results||[]).filter(function(r){return r.thumbnail_src||r.img_src||r.thumbnail;});
                        var merged=extraResults.concat(searxResults);
                        var seen={};merged=merged.filter(function(r){var k=r.thumbnail_src||r.img_src||r.url;if(seen[k])return false;seen[k]=true;return true;});
                        allResults=merged;shownCount=0;
                        document.getElementById('resultCount').textContent=merged.length+' images';
                        if(merged.length===0){content.innerHTML='<div class="error"><div class="error-icon">🔍</div><div class="error-title">No images found</div><div class="error-message">Try different keywords.</div></div>';return;}
                        content.innerHTML='<div class="image-grid" id="imageGrid"></div><div id="loadMoreArea"></div>';
                        appendBatch();
                    }).catch(function(err){
                        content.innerHTML='<div class="error"><div class="error-icon">⚠️</div><div class="error-title">Something went wrong</div><div class="error-message">'+escapeHtml(err.message||'Could not fetch images')+'</div><button class="retry-btn" onclick="fetchImages()">Try Again</button></div>';
                    });
                }

                function appendBatch() {
                    var grid=document.getElementById('imageGrid');if(!grid)return;
                    var end=Math.min(shownCount+BATCH_SIZE,allResults.length);
                    var fragment=document.createDocumentFragment();
                    for(var i=shownCount;i<end;i++){
                        var r=allResults[i];
                        var thumbnail=r.thumbnail_src||r.thumbnail||r.img_src||'';
                        var fullImg=r.img_src||r.thumbnail_src||r.thumbnail||'';
                        var title=escapeHtml(r.title||getHostname(r.url));
                        var url=r.url||'';var host=getHostname(url);
                        var card=document.createElement('div');
                        card.className='image-card';card.setAttribute('data-src',thumbnail);
                        card.setAttribute('data-full',fullImg);card.setAttribute('data-title',title);
                        card.setAttribute('data-source',host);card.setAttribute('data-index',i);
                        card.innerHTML='<div class="placeholder"></div><img style="display:none" alt="" onerror="this.parentElement.style.display=\'none\'"><div class="img-title">'+title+'</div>';
                        card.addEventListener('click',function(){openFullscreen(this.getAttribute('data-full'),this.getAttribute('data-title'),this.getAttribute('data-source'),parseInt(this.getAttribute('data-index')));});
                        fragment.appendChild(card);lazyObserver.observe(card);
                    }
                    grid.appendChild(fragment);shownCount=end;
                    var loadMoreArea=document.getElementById('loadMoreArea');
                    if(shownCount<allResults.length){loadMoreArea.innerHTML='<button class="load-more-btn" onclick="appendBatch()">Load More ('+(allResults.length-shownCount)+' remaining)</button>';}
                    else{loadMoreArea.innerHTML='';}
                }

                var currentFullscreenIndex=-1;
                function openFullscreen(src,title,source,index){
                    currentFullscreenIndex=index;
                    document.getElementById('fullscreenImg').src=src;
                    document.getElementById('fullscreenCounter').textContent=(index+1)+' / '+allResults.length;
                    document.getElementById('fullscreenSource').textContent=source;
                    document.getElementById('fullscreenOverlay').classList.add('active');
                }
                function closeFullscreen(){
                    document.getElementById('fullscreenOverlay').classList.remove('active');
                    document.getElementById('fullscreenImg').src='';currentFullscreenIndex=-1;
                }
                function navFullscreen(dir){
                    if(currentFullscreenIndex<0)return;var ni=currentFullscreenIndex+dir;
                    if(ni<0||ni>=allResults.length)return;var r=allResults[ni];
                    openFullscreen(r.img_src||r.thumbnail_src||r.thumbnail||'',r.title||getHostname(r.url),getHostname(r.url),ni);
                }
                window.fetchImages=fetchImages;window.appendBatch=appendBatch;
                window.closeFullscreen=closeFullscreen;window.navFullscreen=navFullscreen;window.closeViewer=closeViewer;
                fetchImages();
            })();
            </script>
        </body>
        </html>
        """

        webView.loadHTMLString(html, baseURL: URL(string: "eesha://images"))
        urlBar.text = query
        currentUrl = "eesha://search?q=\(encodedQuery)&category=images"

        // Update tab info
        if activeTabIndex < tabs.count {
            tabs[activeTabIndex].title = "Images: \(query)"
            tabs[activeTabIndex].url = "eesha://search?q=\(encodedQuery)&category=images"
        }
    }

    // MARK: - Eesha Search Results Page (SearXNG JSON API)

    private func loadSearchResultsPage(_ urlStr: String) {
        // Extract query from URL parameter: eesha://search?q=...
        var query = ""
        if let components = URLComponents(string: urlStr),
           let queryItem = components.queryItems?.first(where: { $0.name == "q" }),
           let q = queryItem.value {
            query = q
        }

        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let apiURL = "\(SearchEngine.searxngApiURL)?q=\(encodedQuery)&format=json"

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Eesha Search</title>
            <link rel="icon" type="image/png" href="\(faviconDataUri)">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src https: data:; connect-src https://eesha-search.onrender.com https://commons.wikimedia.org https://en.wikipedia.org https://pipedapi.kavin.rocks https://pipedapi.adminforge.de https://news.google.com;">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
                    padding-top: 0;
                }
                .category-tabs {
                    display: flex; gap: 0; padding: 8px 16px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    overflow-x: auto; -webkit-overflow-scrolling: touch;
                }
                .category-tabs::-webkit-scrollbar { display: none; }
                .tab {
                    padding: 8px 18px; font-size: 13px; font-weight: 500;
                    color: rgba(255,255,255,0.5); cursor: pointer;
                    border-bottom: 2px solid transparent;
                    white-space: nowrap; transition: all 0.15s;
                    -webkit-tap-highlight-color: transparent;
                }
                .tab.active { color: #e94560; border-bottom-color: #e94560; }
                .tab:active { color: #e94560; }
                .results-area { padding: 12px 16px 80px; }
                .result-count {
                    font-size: 12px; color: rgba(255,255,255,0.35); margin-bottom: 12px;
                }
                .result {
                    margin-bottom: 20px; padding: 0;
                }
                .result-host {
                    font-size: 12px; color: rgba(255,255,255,0.45); margin-bottom: 2px;
                    display: flex; align-items: center; gap: 6px;
                }
                .result-host img {
                    width: 16px; height: 16px; border-radius: 2px;
                }
                .result-title {
                    font-size: 16px; font-weight: 500; color: #8ab4f8;
                    text-decoration: none; line-height: 1.3;
                    display: block; margin-bottom: 4px;
                }
                .result-title:active { color: #c23152; }
                .result-snippet {
                    font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.5;
                }
                .result-snippet b { color: #e94560; font-weight: 600; }
                .suggestions {
                    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
                }
                .suggestion {
                    padding: 6px 14px; border-radius: 16px; font-size: 13px;
                    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6);
                    cursor: pointer; border: 1px solid rgba(255,255,255,0.08);
                    -webkit-tap-highlight-color: transparent;
                }
                .suggestion:active { background: rgba(233,69,96,0.15); color: #e94560; border-color: #e94560; }
                .loading {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 60px 20px; gap: 16px;
                }
                .spinner {
                    width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #e94560; border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .loading-text { font-size: 14px; color: rgba(255,255,255,0.4); }
                .error-state {
                    text-align: center; padding: 60px 20px;
                }
                .error-icon { font-size: 48px; margin-bottom: 16px; }
                .error-title { font-size: 18px; font-weight: 600; color: #e94560; margin-bottom: 8px; }
                .error-msg { font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.5; }
                .retry-btn {
                    margin-top: 16px; padding: 10px 24px; border-radius: 20px;
                    background: #e94560; color: #fff; border: none;
                    font-size: 14px; font-weight: 600; cursor: pointer;
                }
                .retry-btn:active { background: #c23152; }
                .empty-state {
                    text-align: center; padding: 60px 20px;
                }
                .empty-icon { font-size: 48px; margin-bottom: 16px; }
                .empty-state p { font-size: 16px; color: rgba(255,255,255,0.45); }
                .footer {
                    text-align: center; padding: 20px; font-size: 11px;
                    color: rgba(255,255,255,0.2); border-top: 1px solid rgba(255,255,255,0.04);
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="category-tabs">
                <div class="tab active" data-cat="general" onclick="switchCategory(this)">All</div>
                <div class="tab" data-cat="images" onclick="switchCategory(this)">Images</div>
                <div class="tab" data-cat="videos" onclick="switchCategory(this)">Videos</div>
                <div class="tab" data-cat="news" onclick="switchCategory(this)">News</div>
            </div>
            <div class="results-area" id="resultsArea">
                <div class="loading" id="loadingState">
                    <div class="spinner"></div>
                    <div class="loading-text">Searching...</div>
                </div>
            </div>
            <div class="footer">Powered by Eesha</div>
            <script>
                var currentQuery = "\(encodedQuery)";
                var currentCategory = "general";

                function switchCategory(el) {
                    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
                    el.classList.add('active');
                    currentCategory = el.dataset.cat;
                    fetchResults(currentQuery, currentCategory);
                }

                function fetchResults(q, category) {
                    var area = document.getElementById('resultsArea');
                    area.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Searching...</div></div>';

                    var cat = category || 'general';
                    var searxUrl = "\(SearchEngine.searxngApiURL)?q=" + encodeURIComponent(q) + "&format=json&categories=" + cat;
                    var extraFetches = [];

                    if (cat === 'images') {
                        extraFetches.push(fetch('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){var p=pages[pid];var img=(p.imageinfo&&p.imageinfo[0])||null;if(img){results.push({title:(p.title||'').replace('File:','').replace(/\\.[^.]+$/,'')||q,url:img.descriptionurl||img.url||'',content:'',thumbnail:img.thumburl||img.url||'',engine:'wikimedia',category:'images'});}});return results;}).catch(function(){return[];}));
                        extraFetches.push(fetch('https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(q)+'&gsrlimit=8&prop=pageimages|extracts&pithumbsize=400&exintro=true&explaintext=true&exsentences=2&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){var p=pages[pid];if(p.thumbnail&&p.thumbnail.source){results.push({title:p.title||q,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent((p.title||'').replace(/ /g,'_')),content:p.extract||'',thumbnail:p.thumbnail.source,engine:'wikipedia',category:'images'});}});return results;}).catch(function(){return[];}));
                    } else if (cat === 'videos') {
                        extraFetches.push(fetch('https://pipedapi.kavin.rocks/search?q='+encodeURIComponent(q)+'&filter=videos').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];(data.items||[]).slice(0,10).forEach(function(item){if(item.url&&item.title){var vidUrl=item.url.startsWith('/')?'https://youtube.com'+item.url:item.url;results.push({title:item.title||'',url:vidUrl,content:(item.uploaderName?'By '+item.uploaderName:'')+(item.uploadedDate?' · '+item.uploadedDate:''),thumbnail:item.thumbnail||'',duration:item.duration>0?fmtDur(item.duration):'',engine:'piped',category:'videos'});}});return results;}).catch(function(){return[];}));
                    } else if (cat === 'news') {
                        extraFetches.push(fetch('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-US&gl=US&ceid=US:en').then(function(r){return r.ok?r.text():'';}).then(function(xml){var results=[];var items=xml.match(/<item[\\s>][\\s\\S]*?<\\/item>/gi)||[];items.slice(0,12).forEach(function(ix){var tm=ix.match(/<title><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/title>/i)||ix.match(/<title>([\\s\\S]*?)<\\/title>/i);var lm=ix.match(/<link>([\\s\\S]*?)<\\/link>/i);var pm=ix.match(/<pubDate>([\\s\\S]*?)<\\/pubDate>/i);if(tm&&lm){results.push({title:tm[1].trim(),url:lm[1].trim(),content:pm?pm[1].trim():'',publishedDate:pm?pm[1].trim():'',engine:'google_news',category:'news'});}});return results;}).catch(function(){return[];}));
                    }

                    var allFetches=[fetch(searxUrl).then(function(r){return r.ok?r.json():{results:[],suggestions:[]};}).catch(function(){return{results:[],suggestions:[]};})].concat(extraFetches);

                    Promise.all(allFetches).then(function(responses){
                        var searxData=responses[0];
                        var extraResults=[];
                        for(var i=1;i<responses.length;i++){if(Array.isArray(responses[i])){extraResults=extraResults.concat(responses[i]);}}
                        var searxResults=searxData.results||[];
                        if(cat==='images'){searxResults=searxResults.filter(function(r){return r.thumbnail||r.img_src;});}
                        else if(cat==='videos'){searxResults=searxResults.filter(function(r){return r.thumbnail||r.duration;});}
                        else if(cat==='news'){searxResults=searxResults.filter(function(r){return r.publishedDate;});}
                        var merged=extraResults.concat(searxResults);
                        var seen={};merged=merged.filter(function(r){if(seen[r.url])return false;seen[r.url]=true;return true;});
                        renderResults({results:merged,suggestions:searxData.suggestions||[],number_of_results:searxData.number_of_results||merged.length},cat);
                    }).catch(function(err){renderError(err);});
                }

                function fmtDur(s){if(!s||s<0)return'';var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);var sec=s%60;if(h>0)return h+':'+('0'+m).slice(-2)+':'+('0'+sec).slice(-2);return m+':'+('0'+sec).slice(-2);}

                function renderResults(data, category) {
                    var area = document.getElementById('resultsArea');
                    var results = data.results || [];
                    var suggestions = data.suggestions || [];
                    var html = '';

                    if (suggestions.length > 0) {
                        html += '<div class="suggestions">';
                        suggestions.forEach(function(s, i) {
                            html += '<div class="suggestion" data-sq="' + escapeAttr(s) + '">' + escapeHtml(s) + '</div>';
                        });
                        html += '</div>';
                    }

                    if (results.length === 0) {
                        html += '<div class="empty-state"><div class="empty-icon">🔍</div><p>No results found</p></div>';
                    } else {
                        html += '<div class="result-count">About ' + (data.number_of_results || results.length).toLocaleString() + ' results</div>';

                        if (category === 'images') {
                            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">';
                            results.forEach(function(r) {
                                var thumb = r.thumbnail || '';
                                html += '<a href="' + escapeAttr(r.url) + '" style="text-decoration:none;">';
                                html += '<div style="background:rgba(255,255,255,0.04);border-radius:8px;overflow:hidden;">';
                                if (thumb) {
                                    html += '<img src="' + escapeAttr(thumb) + '" alt="" style="width:100%;height:100px;object-fit:cover;display:block;">';
                                } else {
                                    html += '<div style="width:100%;height:100px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:24px;">🖼</div>';
                                }
                                html += '<div style="padding:6px 8px;font-size:11px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(r.title || '') + '</div>';
                                html += '</div></a>';
                            });
                            html += '</div>';
                        } else if (category === 'videos') {
                            html += '<div style="display:grid;grid-template-columns:1fr;gap:12px;">';
                            results.forEach(function(r) {
                                var thumb = r.thumbnail || '';
                                var host = getHost(r.url);
                                html += '<a href="' + escapeAttr(r.url) + '" style="text-decoration:none;display:flex;gap:12px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.03);">';
                                if (thumb) {
                                    html += '<div style="position:relative;width:120px;height:68px;flex-shrink:0;border-radius:6px;overflow:hidden;"><img src="' + escapeAttr(thumb) + '" alt="" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;">▶</div></div>';
                                } else {
                                    html += '<div style="width:120px;height:68px;flex-shrink:0;border-radius:6px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:20px;">▶</div>';
                                }
                                html += '<div style="flex:1;min-width:0;"><div style="font-size:14px;color:#8ab4f8;font-weight:500;line-height:1.3;margin-bottom:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + escapeHtml(r.title || '') + '</div>';
                                html += '<div style="font-size:11px;color:rgba(255,255,255,0.35);">' + escapeHtml(host) + '</div></div></a>';
                            });
                            html += '</div>';
                        } else {
                            results.forEach(function(r) {
                                var host = getHost(r.url);
                                var favicon = 'https://' + host + '/favicon.ico';
                                html += '<div class="result">';
                                html += '<div class="result-host"><img src="' + escapeAttr(favicon) + '" alt="" onerror="this.remove()">' + escapeHtml(host) + '</div>';
                                html += '<a class="result-title" href="' + escapeAttr(r.url) + '">' + escapeHtml(r.title || '') + '</a>';
                                if (r.content) {
                                    html += '<div class="result-snippet">' + escapeHtml(r.content) + '</div>';
                                }
                                html += '</div>';
                            });
                        }
                    }

                    html += '<div class="footer">Powered by Eesha</div>';
                    area.innerHTML = html;
                }

                function renderError(err) {
                    var area = document.getElementById('resultsArea');
                    area.innerHTML = '<div class="error-state"><div class="error-icon">⚠️</div><div class="error-title">Search Failed</div><div class="error-msg">Could not fetch results. Please check your connection and try again.</div><button class="retry-btn" onclick="fetchResults(currentQuery, currentCategory)">Retry</button></div>';
                }

                function getHost(url) {
                    try { return new URL(url).hostname; } catch(e) { return url; }
                }

                function escapeHtml(str) {
                    var d = document.createElement('div');
                    d.textContent = str;
                    return d.innerHTML;
                }

                function escapeAttr(str) {
                    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }

                // Auto-fetch results on page load
                fetchResults(currentQuery, currentCategory);

                // Delegate click events for suggestions
                document.getElementById('resultsArea').addEventListener('click', function(e) {
                    var el = e.target;
                    while (el && !el.classList.contains('suggestion')) { el = el.parentElement; }
                    if (el && el.dataset.sq) {
                        location.href = 'eesha://search?q=' + encodeURIComponent(el.dataset.sq);
                    }
                });
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "eesha://search"))
    }

    private func loadBookmarksPage() {
        let bookmarks = SettingsKeys.getBookmarks()
        var bookmarkItems = ""

        if bookmarks.isEmpty {
            bookmarkItems = """
            <div class="empty-state">
                <div class="empty-icon">🔖</div>
                <p>No bookmarks yet</p>
                <p class="hint">Browse the web and add bookmarks from the menu</p>
            </div>
            """
        } else {
            for (index, bookmark) in bookmarks.enumerated() {
                let title = bookmark["title"] ?? "Untitled"
                let url = bookmark["url"] ?? ""
                let domain = URL(string: url)?.host ?? url
                let initial = String(title.prefix(1)).uppercased()
                bookmarkItems += """
                <div class="item" data-url="\(escapeHTML(url))">
                    <div class="item-icon" onclick="navigate(this.parentElement.dataset.url)">
                        \(initial)
                    </div>
                    <div class="item-content" onclick="navigate(this.parentElement.dataset.url)">
                        <div class="item-title">\(escapeHTML(title))</div>
                        <div class="item-url">\(escapeHTML(domain))</div>
                    </div>
                    <button class="delete-btn" onclick="deleteBookmark(\(index))">✕</button>
                </div>
                """
            }
        }

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bookmarks</title>
            <link rel="icon" type="image/png" href="\(faviconDataUri)">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
                    padding: 16px; padding-top: 60px;
                }
                .header {
                    position: fixed; top: 0; left: 0; right: 0;
                    background: #1a1a2e; padding: 12px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    z-index: 10; display: flex; align-items: center; justify-content: space-between;
                }
                .header h1 { font-size: 20px; font-weight: 700; color: #e94560; }
                .header .count { font-size: 13px; color: rgba(255,255,255,0.4); }
                .item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px; border-radius: 12px; margin-bottom: 4px;
                    background: rgba(255,255,255,0.04); transition: background 0.15s;
                }
                .item:active { background: rgba(255,255,255,0.08); }
                .item-icon {
                    width: 40px; height: 40px; border-radius: 50%;
                    background: #e94560; display: flex; align-items: center;
                    justify-content: center; font-weight: 700; color: #fff; font-size: 16px;
                    flex-shrink: 0; cursor: pointer;
                }
                .item-content { flex: 1; min-width: 0; cursor: pointer; }
                .item-title {
                    font-size: 15px; font-weight: 500; color: #fff;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .item-url {
                    font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .delete-btn {
                    width: 32px; height: 32px; border-radius: 50%; border: none;
                    background: rgba(233,69,96,0.15); color: #e94560;
                    font-size: 14px; cursor: pointer; flex-shrink: 0;
                }
                .delete-btn:active { background: rgba(233,69,96,0.3); }
                .empty-state {
                    text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.4);
                }
                .empty-icon { font-size: 48px; margin-bottom: 16px; }
                .empty-state p { font-size: 16px; margin-bottom: 4px; }
                .hint { font-size: 13px !important; color: rgba(255,255,255,0.25) !important; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Bookmarks</h1>
                <span class="count">\(bookmarks.count) items</span>
            </div>
            \(bookmarkItems)
            <script>
                function navigate(url) {
                    window.location.href = url;
                }
                function deleteBookmark(index) {
                    window.webkit.messageHandlers.bookmarkAction.postMessage({action: 'delete', index: index});
                }
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "eesha://bookmarks"))
    }

    private func loadHistoryPage() {
        let history = SettingsKeys.getHistory()
        var historyItems = ""

        if history.isEmpty {
            historyItems = """
            <div class="empty-state">
                <div class="empty-icon">🕐</div>
                <p>No browsing history</p>
                <p class="hint">Your browsing history will appear here</p>
            </div>
            """
        } else {
            var lastDate = ""
            for (index, item) in history.enumerated() {
                let title = item["title"] ?? "Untitled"
                let url = item["url"] ?? ""
                let timestampStr = item["timestamp"] ?? "0"
                let timestamp = Double(timestampStr) ?? 0
                let date = formatDate(timestamp: timestamp)

                if date != lastDate {
                    lastDate = date
                    historyItems += "<div class=\"date-header\">\(escapeHTML(date))</div>"
                }

                let domain = URL(string: url)?.host ?? url
                let initial = String(title.prefix(1)).uppercased()
                historyItems += """
                <div class="item" data-url="\(escapeHTML(url))">
                    <div class="item-icon" onclick="navigate(this.parentElement.dataset.url)">
                        \(initial)
                    </div>
                    <div class="item-content" onclick="navigate(this.parentElement.dataset.url)">
                        <div class="item-title">\(escapeHTML(title))</div>
                        <div class="item-url">\(escapeHTML(domain))</div>
                    </div>
                    <button class="delete-btn" onclick="deleteHistory(\(index))">✕</button>
                </div>
                """
            }
        }

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>History</title>
            <link rel="icon" type="image/png" href="\(faviconDataUri)">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
                    padding: 16px; padding-top: 108px;
                }
                .header {
                    position: fixed; top: 0; left: 0; right: 0;
                    background: #1a1a2e; padding: 12px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    z-index: 10;
                }
                .header-top { display: flex; align-items: center; justify-content: space-between; }
                .header h1 { font-size: 20px; font-weight: 700; color: #e94560; }
                .header .count { font-size: 13px; color: rgba(255,255,255,0.4); }
                .clear-btn {
                    background: rgba(233,69,96,0.15); color: #e94560;
                    border: none; padding: 6px 12px; border-radius: 8px;
                    font-size: 13px; cursor: pointer;
                }
                .clear-btn:active { background: rgba(233,69,96,0.3); }
                .search-box {
                    width: 100%; padding: 8px 12px; border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
                    color: #fff; font-size: 14px; margin-top: 8px; outline: none;
                }
                .search-box::placeholder { color: rgba(255,255,255,0.3); }
                .date-header {
                    font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.3);
                    padding: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;
                }
                .item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px; border-radius: 12px; margin-bottom: 4px;
                    background: rgba(255,255,255,0.04); transition: background 0.15s;
                }
                .item:active { background: rgba(255,255,255,0.08); }
                .item-icon {
                    width: 40px; height: 40px; border-radius: 50%;
                    background: #533483; display: flex; align-items: center;
                    justify-content: center; font-weight: 700; color: #fff; font-size: 16px;
                    flex-shrink: 0; cursor: pointer;
                }
                .item-content { flex: 1; min-width: 0; cursor: pointer; }
                .item-title {
                    font-size: 15px; font-weight: 500; color: #fff;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .item-url {
                    font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .delete-btn {
                    width: 32px; height: 32px; border-radius: 50%; border: none;
                    background: rgba(233,69,96,0.15); color: #e94560;
                    font-size: 14px; cursor: pointer; flex-shrink: 0;
                }
                .delete-btn:active { background: rgba(233,69,96,0.3); }
                .empty-state {
                    text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.4);
                }
                .empty-icon { font-size: 48px; margin-bottom: 16px; }
                .empty-state p { font-size: 16px; margin-bottom: 4px; }
                .hint { font-size: 13px !important; color: rgba(255,255,255,0.25) !important; }
                .hidden { display: none; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-top">
                    <h1>History</h1>
                    <div>
                        <span class="count">\(history.count) items</span>
                        <button class="clear-btn" onclick="clearAll()">Clear All</button>
                    </div>
                </div>
                <input type="text" class="search-box" id="search" placeholder="Search history..." oninput="filterHistory()">
            </div>
            <div id="historyList">
                \(historyItems)
            </div>
            <script>
                function navigate(url) {
                    window.location.href = url;
                }
                function deleteHistory(index) {
                    window.webkit.messageHandlers.historyAction.postMessage({action: 'delete', index: index});
                }
                function clearAll() {
                    window.webkit.messageHandlers.historyAction.postMessage({action: 'clearAll'});
                }
                function filterHistory() {
                    var query = document.getElementById('search').value.toLowerCase();
                    var items = document.querySelectorAll('.item');
                    var headers = document.querySelectorAll('.date-header');
                    items.forEach(function(item) {
                        var title = item.querySelector('.item-title').textContent.toLowerCase();
                        var url = item.querySelector('.item-url').textContent.toLowerCase();
                        if (title.includes(query) || url.includes(query)) {
                            item.classList.remove('hidden');
                        } else {
                            item.classList.add('hidden');
                        }
                    });
                    headers.forEach(function(header) {
                        var next = header.nextElementSibling;
                        var hasVisible = false;
                        while (next && !next.classList.contains('date-header')) {
                            if (!next.classList.contains('hidden')) hasVisible = true;
                            next = next.nextElementSibling;
                        }
                        header.classList.toggle('hidden', !hasVisible);
                    });
                }
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "eesha://history"))
    }

    // MARK: - Helper Methods

    private func escapeHTML(_ string: String) -> String {
        return string
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private func formatDate(timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp)
        let formatter = DateFormatter()
        let calendar = Calendar.current

        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }
    }

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    // MARK: - New Tab Page

    private func loadEeshaNewTab() {
        let engine = SettingsKeys.getSearchEngine()
        let searchPlaceholder: String
        switch engine {
        case .eesha: searchPlaceholder = "Search with Eesha Search or enter URL"
        case .duckduckgo: searchPlaceholder = "Search with DuckDuckGo or enter URL"
        case .google: searchPlaceholder = "Search with Google or enter URL"
        case .brave: searchPlaceholder = "Search with Brave or enter URL"
        case .startpage: searchPlaceholder = "Search with StartPage or enter URL"
        }

        let html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';">
            <title>Eesha - New Tab</title>
            <link rel="icon" type="image/png" href="\(faviconDataUri)">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #ffffff;
                    color: #202124; min-height: 100vh;
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: flex-start; padding: 12vh 1rem 1rem;
                    position: relative; overflow: hidden;
                }
                body::after {
                    content: '';
                    position: fixed;
                    top: 25%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 70vmin; height: 38vmin;
                    background-image: url('\(faviconDataUri)');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    opacity: 0.18;
                    pointer-events: none;
                    z-index: 0;
                }
                .search-container {
                    width: 100%; max-width: 500px;
                    position: relative; z-index: 1;
                }
                .search-box {
                    width: 100%; padding: 14px 16px 14px 46px; font-size: 16px;
                    border: 1px solid #dfe1e5; border-radius: 24px;
                    background: #fff; color: #202124; outline: none;
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .search-box:hover { box-shadow: 0 1px 6px rgba(32,33,36,0.28); border-color: transparent; }
                .search-box:focus { box-shadow: 0 1px 6px rgba(32,33,36,0.28); border-color: transparent; }
                .search-box::placeholder { color: #9aa0a6; }
                .search-icon {
                    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
                    color: #9aa0a6; pointer-events: none;
                }
                .shortcuts {
                    display: flex; flex-wrap: wrap; justify-content: center;
                    gap: 16px; margin-top: 28px; max-width: 500px; width: 100%;
                    position: relative; z-index: 1;
                }
                .shortcut {
                    display: flex; flex-direction: column; align-items: center; gap: 8px;
                    padding: 8px; border-radius: 12px;
                    text-decoration: none; color: #202124; width: 76px;
                    transition: background 0.15s;
                }
                .shortcut:active { background: #f1f3f4; }
                .shortcut-icon {
                    width: 48px; height: 48px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 20px; font-weight: 700; color: #fff;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
                    overflow: hidden; background: #1a1a2e;
                }
                .shortcut-icon img {
                    width: 32px; height: 32px; border-radius: 50%;
                    object-fit: contain;
                }
                .shortcut-name {
                    font-size: 11px; color: #5f6368; text-align: center;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 68px;
                }
                .privacy-badge {
                    position: fixed; bottom: 12px; left: 0; right: 0;
                    text-align: center; z-index: 1;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                }
                .privacy-badge span {
                    font-size: 11px; color: #9aa0a6;
                }
                .privacy-badge .shield { font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="search-container">
                <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="search-box" id="search" placeholder="\(searchPlaceholder)" autofocus>
            </div>
            <div class="shortcuts">
                <a class="shortcut" href="https://eesha-search.onrender.com">
                    <div class="shortcut-icon" style="background:#6C3FC5;"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div><span class="shortcut-name">Eesha Search</span>
                </a>
                <a class="shortcut" href="https://www.wikipedia.org">
                    <div class="shortcut-icon" style="background:#636466;"><img src="https://en.wikipedia.org/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">Wikipedia</span>
                </a>
                <a class="shortcut" href="https://github.com">
                    <div class="shortcut-icon" style="background:#24292e;"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg></div><span class="shortcut-name">GitHub</span>
                </a>
                <a class="shortcut" href="https://www.youtube.com">
                    <div class="shortcut-icon" style="background:#FF0000;"><img src="https://www.youtube.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">YouTube</span>
                </a>
                <a class="shortcut" href="https://www.reddit.com">
                    <div class="shortcut-icon" style="background:#FF4500;"><img src="https://www.reddit.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">Reddit</span>
                </a>
                <a class="shortcut" href="https://x.com">
                    <div class="shortcut-icon" style="background:#1DA1F2;"><img src="https://x.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">X</span>
                </a>
                <a class="shortcut" href="https://news.ycombinator.com">
                    <div class="shortcut-icon" style="background:#FF6600;"><img src="https://news.ycombinator.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">HN</span>
                </a>
                <a class="shortcut" href="https://stackoverflow.com">
                    <div class="shortcut-icon" style="background:#F48024;"><img src="https://stackoverflow.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;"></div><span class="shortcut-name">Stack Overflow</span>
                </a>
            </div>
            <div class="privacy-badge">
                <span class="shield">&#x1F6E1;</span>
                <span>Eesha Browser v0.9.2 &middot; Privacy Protected</span>
            </div>
            <script>
                document.getElementById('search').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        var q = this.value.trim();
                        if (q) {
                            if (q.match(/^(https?:\\/\\/|www\\.)/)) {
                                location.href = q.startsWith('www.') ? 'https://' + q : q;
                            } else if (q.includes('.') && !q.includes(' ')) {
                                location.href = 'https://' + q;
                            } else {
                                location.href = '\(engine == .eesha ? "eesha://search?q=" : engine.searchURL)' + encodeURIComponent(q);
                            }
                        }
                    }
                });
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "eesha://newtab"))
        urlBar.text = ""
        currentUrl = ""
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let urlStr = url.absoluteString

        // Handle internal pages
        if urlStr.hasPrefix("eesha://") {
            if urlStr != "eesha://newtab" {
                handleInternalPage(urlStr)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }

        // ── INTERCEPT SEARXNG IMAGES URL → Load custom image viewer ──
        // When user taps "Images" tab on the SearXNG page, intercept the navigation
        // and load our lightweight image viewer instead. This prevents OOM crashes
        // because SearXNG's image grid loads many full-resolution images at once.
        if urlStr.contains("eesha-search.onrender.com/search") && urlStr.contains("categories=images") {
            if let components = URLComponents(string: urlStr),
               let queryItem = components.queryItems?.first(where: { $0.name == "q" }),
               let query = queryItem.value, !query.isEmpty {
                loadImageViewer(query: query)
                decisionHandler(.cancel)
                return
            }
        }

        // Download interception - check for downloadable file types
        if navigationAction.navigationType == .linkActivated || navigationAction.navigationType == .other {
            if isDownloadableUrl(url) {
                startDownload(url: urlStr)
                decisionHandler(.cancel)
                return
            }
        }

        // HTTPS-only upgrade
        if SettingsKeys.isHTTPSOnlyEnabled() && url.scheme == "http" {
            if var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
                components.scheme = "https"
                if let upgradedURL = components.url {
                    webView.load(URLRequest(url: upgradedURL))
                    decisionHandler(.cancel)
                    return
                }
            }
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        // Only update UI for the active tab
        guard webView == self.webView else { return }
        if let url = webView.url?.absoluteString {
            if !url.hasPrefix("eesha://") {
                // Show search query instead of full URL for Eesha Search results
                if url.contains("eesha-search.onrender.com/search"), let components = URLComponents(string: url), let q = components.queryItems?.first(where: { $0.name == "q" })?.value {
                    urlBar.text = q
                } else {
                    urlBar.text = url
                }
                currentUrl = url
            }
        }
        hideAutocomplete()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Only update UI for the active tab
        guard webView == self.webView else { return }
        if let url = webView.url?.absoluteString {
            if !url.hasPrefix("eesha://") {
                // Show search query instead of full URL for Eesha Search results
                if url.contains("eesha-search.onrender.com/search"), let components = URLComponents(string: url), let q = components.queryItems?.first(where: { $0.name == "q" })?.value {
                    urlBar.text = q
                } else {
                    urlBar.text = url
                }
                currentUrl = url

                // Add to history
                let title = webView.title ?? url
                addToHistory(url: url, title: title)

                // Update tab info
                if activeTabIndex < tabs.count {
                    tabs[activeTabIndex].url = url
                    tabs[activeTabIndex].title = title
                }

                // Hide SearXNG header/search bar when loading the SearXNG page directly
                if url.contains("eesha-search.onrender.com") {
                    let hideHeaderJS = """
                    (function(){
                        var style = document.createElement('style');
                        style.textContent = '#search_header, #search, form#search, #links_on_top, #categories, .search_filters, #search_logo, #search_view, .search_box, #clear_search, #send_search, nav#links_on_top { display: none !important; } #main_results { padding-top: 0 !important; margin-top: 0 !important; } #urls { padding-top: 8px !important; } body { padding-top: 0 !important; }';
                        document.head.appendChild(style);
                    })();
                    """
                    webView.evaluateJavaScript(hideHeaderJS)
                }
            }
        }
        isLoadingInternalPage = false
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowInfo) -> WKWebView? {
        // Open new window requests in the same view
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            if let serverTrust = challenge.protectionSpace.serverTrust {
                // First, attempt default SSL validation
                var secTrustResult: SecTrustResultType = .invalid
                let status = SecTrustEvaluate(serverTrust, &secTrustResult)

                if status == errSecSuccess && (secTrustResult == .unspecified || secTrustResult == .proceed) {
                    // Certificate is valid — proceed normally
                    let credential = URLCredential(trust: serverTrust)
                    completionHandler(.useCredential, credential)
                    return
                }

                // Certificate is invalid — ask the user
                let host = challenge.protectionSpace.host
                DispatchQueue.main.async {
                    let alert = UIAlertController(
                        title: "SSL Certificate Warning",
                        message: "The certificate for \"\(host)\" is not trusted. Connecting to this site may be unsafe.\n\nDo you want to continue anyway?",
                        preferredStyle: .alert
                    )
                    alert.addAction(UIAlertAction(title: "Go Back", style: .cancel) { _ in
                        completionHandler(.cancel, nil)
                    })
                    alert.addAction(UIAlertAction(title: "Continue Anyway", style: .default) { _ in
                        let credential = URLCredential(trust: serverTrust)
                        completionHandler(.useCredential, credential)
                    })
                    self.present(alert, animated: true)
                }
                return
            }
        }
        completionHandler(.performDefaultHandling, nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Only handle for the active tab
        guard webView == self.webView else { return }

        let nsError = error as NSError

        // Detect SSL/TLS handshake errors (NSURLErrorDomain)
        let sslErrorCodes: Set<Int> = [-1200, -1201, -1202, -1203, -1204, -1205, -1206]
        guard nsError.domain == NSURLErrorDomain && sslErrorCodes.contains(nsError.code) else {
            // Not an SSL error — show generic message
            showNavigationErrorAlert(message: error.localizedDescription, isRenderSleep: false, url: webView.url)
            return
        }

        let failingURL: URL?
        if let urlStr = nsError.userInfo["NSErrorFailingURLStringKey"] as? String {
            failingURL = URL(string: urlStr)
        } else {
            failingURL = webView.url
        }

        // Check if this is a .onrender.com URL (sleeping service cold start)
        let isRenderSleep = failingURL?.host?.hasSuffix(".onrender.com") ?? false

        if isRenderSleep {
            showNavigationErrorAlert(
                message: "This site may be temporarily unavailable (waking up from sleep mode).",
                isRenderSleep: true,
                url: failingURL
            )
        } else {
            showNavigationErrorAlert(
                message: "A secure connection could not be established.\n\(error.localizedDescription)",
                isRenderSleep: false,
                url: failingURL
            )
        }
    }

    private func showNavigationErrorAlert(message: String, isRenderSleep: Bool, url: URL?) {
        let alert = UIAlertController(
            title: "Connection Error",
            message: message,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))

        if isRenderSleep, let retryURL = url {
            alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in
                // Wait 5 seconds before retrying to allow the service to wake up
                DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
                    self.webView.load(URLRequest(url: retryURL))
                }
            })
        } else if let retryURL = url {
            alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in
                self.webView.load(URLRequest(url: retryURL))
            })
        }

        present(alert, animated: true)
    }

    // MARK: - WKScriptMessageHandler support for internal pages

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        if message.name == "bookmarkAction" {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            if action == "delete", let index = body["index"] as? Int {
                var bookmarks = SettingsKeys.getBookmarks()
                if index >= 0 && index < bookmarks.count {
                    bookmarks.remove(at: index)
                    SettingsKeys.saveBookmarks(bookmarks)
                    loadBookmarksPage() // Reload
                }
            }
        } else if message.name == "historyAction" {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            if action == "delete", let index = body["index"] as? Int {
                var history = SettingsKeys.getHistory()
                if index >= 0 && index < history.count {
                    history.remove(at: index)
                    SettingsKeys.saveHistory(history)
                    loadHistoryPage() // Reload
                }
            } else if action == "clearAll" {
                SettingsKeys.saveHistory([])
                loadHistoryPage() // Reload
            }
        } else if message.name == "downloadAction" {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            if action == "delete", let index = body["index"] as? Int {
                if index >= 0 && index < downloads.count {
                    downloads.remove(at: index)
                    loadDownloadsPage() // Reload
                }
            }
        }
    }

    // MARK: - Deinit

    deinit {
        for tab in tabs {
            tab.webView.removeObserver(self, forKeyPath: "estimatedProgress")
            tab.webView.removeObserver(self, forKeyPath: "title")
        }
    }
}

// MARK: - Autocomplete Item

struct AutocompleteItem {
    let title: String
    let url: String
    let type: ItemType

    enum ItemType {
        case bookmark
        case history
    }
}
