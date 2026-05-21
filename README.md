# Eesha Browser

A privacy-focused web browser powered by **Blink/Chromium** — built for the future of an independent web.

> **Strategy**: Blink NOW → Ladybird later. Ship a competitive browser today, build toward engine independence tomorrow.

## Architecture

| Platform | Engine | Technology |
|----------|--------|------------|
| Desktop (Linux/Windows/macOS) | **Blink** | Electron (Chromium 134+) |
| Android | **Blink** | Android WebView (Chromium) |
| iOS | **WebKit** | WKWebView (Apple mandate) |

## Features

### Privacy & Security
- 🔒 **Privacy-first**: Built-in ad and tracker blocking (350+ domains)
- 🚫 **No Google telemetry**: All Google tracking services removed
- 🔍 **DuckDuckGo**: Default search engine (privacy-focused)
- 🛡️ **HTTPS upgrade**: Enforces secure connections
- 🕵️ **Fingerprint protection**: Canvas, WebGL, audio, and browser fingerprinting defense
- 🔌 **WebRTC leak protection**: Prevents real IP address leaks

### Browsing
- 📑 **Multi-tab browsing**: Full tab management on all platforms
- ⭐ **Bookmarks**: Save and organize your favorite sites
- 📜 **History**: Browsing history with search
- 🔎 **Find in page**: Search within any page (Ctrl+F / Menu → Find)
- 📥 **Downloads manager**: Download files with progress tracking
- 📤 **Share**: Share pages via system share (mobile) or clipboard (desktop)
- 🕶 **Private browsing**: Separate sessions with no history/cookies saved

### UI/UX
- 🎨 **Custom new tab**: Eesha-branded with search and quick shortcuts
- 🌙 **Dark theme**: Beautiful Eesha dark UI (#1a1a2e)
- 📱 **Cross-platform**: Desktop + Android + iOS
- 🔄 **Swipe navigation**: Edge swipe to go back/forward (mobile)
- 🖥 **Desktop site toggle**: Request desktop versions of sites

## Project Structure

```
├── desktop/          # Electron-based desktop browser
│   ├── main.js       # Electron main process
│   ├── preload.js    # Secure IPC bridge
│   └── renderer/     # Browser UI (HTML/CSS/JS)
├── android/          # WebView-based Android browser (Kotlin)
│   └── app/          # Android app module
├── ios/              # WKWebView-based iOS browser (Swift)
│   └── Eesha/        # iOS app source
├── shared/           # Shared assets
│   ├── icons/        # Eesha icons and logos
│   ├── resources/    # Shared HTML pages
│   └── security/     # Blocklists and protection scripts
└── .github/
    └── workflows/    # CI/CD pipelines
```

## Installation

### Desktop

**Linux:**
1. Download the `.AppImage` from [Releases](https://github.com/eesha-co/Eesha/releases)
2. `chmod +x Eesha-*.AppImage`
3. `./Eesha-*.AppImage`

**Windows:**
1. Download the `.exe` installer from [Releases](https://github.com/eesha-co/Eesha/releases)
2. Run the installer

**macOS:**
1. Download the `.dmg` from [Releases](https://github.com/eesha-co/Eesha/releases)
2. Open the DMG, drag Eesha to Applications

### Android

1. Download the `.apk` from [Releases](https://github.com/eesha-co/Eesha/releases)
2. Enable "Install from unknown sources" in your device settings
3. Install the APK

### iOS

> iOS requires building from source with Xcode and an Apple Developer account.

1. Clone the repository
2. `cd ios && brew install xcodegen && ./create_xcodeproj.sh`
3. Open the generated `.xcodeproj` in Xcode
4. Select your team and build

## Building from Source

### Desktop

```bash
cd desktop
npm install
npm start          # Development
npm run build:all  # Production builds
```

### Android

```bash
cd android
./gradlew assembleDebug
```

### iOS

```bash
cd ios
brew install xcodegen
./create_xcodeproj.sh
# Then open in Xcode
```

## Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+Shift+P` | New private tab |
| `Ctrl+W` | Close tab |
| `Ctrl+L` | Focus URL bar |
| `Ctrl+F` | Find in page |
| `Ctrl+D` | Bookmark page |
| `Ctrl+J` | Downloads |
| `Ctrl+R` | Reload page |
| `Alt+←` | Go back |
| `Alt+→` | Go forward |

## Roadmap

| Phase | Version | Status | Features |
|-------|---------|--------|----------|
| **Phase 1** | v0.2 | ✅ Done | Working browser on all platforms |
| **Phase 2** | v0.5 | ✅ Done | Privacy features, ad blocker, fingerprint protection |
| **Phase 3** | v0.7 | ✅ Done | Bookmarks, history, settings, private browsing |
| **Phase 4** | v0.8 | ✅ Done | Downloads, find in page, multi-tab mobile, share |
| **Phase 5** | v1.0 | 🔜 Next | Reader mode, password manager, extension support |
| **Future** | v2.0 | 📋 Planned | Evaluate Ladybird integration |

## License

Apache-2.0 OR MIT
