// browser_window.cpp - Platform-specific window management
#include "browser_window.h"
#include "browser_client.h"

#include "include/cef_browser.h"
#include "include/cef_window.h"

#include <iostream>

EeshaBrowserWindow::EeshaBrowserWindow()
    : window_handle_(nullptr), is_loading_(false) {}

EeshaBrowserWindow::~EeshaBrowserWindow() {
    DestroyPlatformWindow();
}

bool EeshaBrowserWindow::Create(int width, int height) {
    // Create CEF window info
    CefWindowInfo window_info;

#if defined(_WIN32)
    // Windows: Create the native window
    WNDCLASSEX wc = {0};
    wc.cbSize = sizeof(WNDCLASSEX);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = GetModuleHandle(nullptr);
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"EeshaBrowser";
    RegisterClassEx(&wc);

    HWND hwnd = CreateWindowEx(
        0, L"EeshaBrowser", L"Eesha",
        WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN,
        CW_USEDEFAULT, CW_USEDEFAULT, width, height,
        nullptr, nullptr, wc.hInstance, this);

    if (!hwnd) return false;
    window_handle_ = hwnd;

    // Create the CEF browser window inside our native window
    CefRect rect;
    GetClientRect(hwnd, &rect);
    window_info.SetAsChild(hwnd, rect);

#elif defined(__APPLE__)
    // macOS: Use CEF's native window support
    window_info.SetAsWindowed(nullptr);

#else
    // Linux: Use CEF's native window support
    window_info.SetAsWindowed(nullptr);
#endif

    // Browser settings
    CefBrowserSettings browser_settings;
    browser_settings.windowless_frame_rate = 60;
    browser_settings.webgl = STATE_ENABLED;
    browser_settings.plugins = STATE_ENABLED;
    browser_settings.javascript = STATE_ENABLED;
    browser_settings.javascript_access_clipboard = STATE_ENABLED;
    browser_settings.file_access_from_file_urls = STATE_ENABLED;
    browser_settings.universal_access_from_file_urls = STATE_ENABLED;

    // Create the browser client with callbacks
    CefRefPtr<EeshaBrowserClient> client = new EeshaBrowserClient(
        [this](const std::string& title) {
            // Title changed - update window title
#ifdef _WIN32
            if (window_handle_) {
                SetWindowTextW(window_handle_,
                    std::wstring(title.begin(), title.end()).c_str());
            }
#endif
        },
        [this](const std::string& url) {
            // URL changed
            current_url_ = url;
        },
        [this](bool canGoBack, bool canGoForward) {
            // Loading state changed
            // Could update navigation buttons here
        }
    );

    // Create the browser
    bool result = CefBrowserHost::CreateBrowser(
        window_info, client.get(), "eesha://newtab",
        browser_settings, nullptr, nullptr);

    return result;
}

void EeshaBrowserWindow::Show() {
#ifdef _WIN32
    if (window_handle_) {
        ShowWindow(window_handle_, SW_SHOW);
        UpdateWindow(window_handle_);
    }
#endif
}

void EeshaBrowserWindow::Close() {
    if (browser_) {
        browser_->GetHost()->CloseBrowser(true);
    }
    DestroyPlatformWindow();
}

void EeshaBrowserWindow::LoadURL(const std::string& url) {
    if (browser_) {
        browser_->GetMainFrame()->LoadURL(url);
    }
    current_url_ = url;
}

void EeshaBrowserWindow::GoBack() {
    if (browser_) {
        browser_->GoBack();
    }
}

void EeshaBrowserWindow::GoForward() {
    if (browser_) {
        browser_->GoForward();
    }
}

void EeshaBrowserWindow::Reload() {
    if (browser_) {
        browser_->Reload();
    }
}

void EeshaBrowserWindow::StopLoad() {
    if (browser_) {
        browser_->StopLoad();
    }
}

bool EeshaBrowserWindow::CreatePlatformWindow(int width, int height) {
    return true; // Handled in Create()
}

void EeshaBrowserWindow::DestroyPlatformWindow() {
#ifdef _WIN32
    if (window_handle_) {
        DestroyWindow(window_handle_);
        window_handle_ = nullptr;
    }
#endif
}

#ifdef _WIN32
LRESULT CALLBACK EeshaBrowserWindow::WndProc(
    HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
        case WM_SIZE: {
            // Resize the CEF browser when the window is resized
            EeshaBrowserWindow* self = reinterpret_cast<EeshaBrowserWindow*>(
                GetWindowLongPtr(hWnd, GWLP_USERDATA));
            if (self && self->browser_) {
                CefWindowHandle hwnd = self->browser_->GetHost()->GetWindowHandle();
                if (hwnd) {
                    HDWP hdwp = BeginDeferWindowPos(1);
                    hdwp = DeferWindowPos(hdwp, hwnd, nullptr, 0, 0,
                        LOWORD(lParam), HIWORD(lParam), SWP_NOZORDER);
                    EndDeferWindowPos(hdwp);
                }
            }
            return 0;
        }
    }
    return DefWindowProc(hWnd, message, wParam, lParam);
}
#endif
