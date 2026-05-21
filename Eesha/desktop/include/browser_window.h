// browser_window.h - Eesha Browser Window management
#ifndef EESHA_BROWSER_WINDOW_H
#define EESHA_BROWSER_WINDOW_H

#include "include/cef_browser.h"

#include <string>
#include <memory>

// Platform-specific window handle
#ifdef _WIN32
#include <windows.h>
typedef HWND NativeWindowHandle;
#elif defined(__APPLE__)
typedef void* NativeWindowHandle;
#else
#include <X11/Xlib.h>
typedef Window NativeWindowHandle;
#endif

class EeshaBrowserWindow {
public:
    EeshaBrowserWindow();
    ~EeshaBrowserWindow();

    // Create and show the browser window
    bool Create(int width = 1280, int height = 800);
    void Show();
    void Close();

    // Navigation
    void LoadURL(const std::string& url);
    void GoBack();
    void GoForward();
    void Reload();
    void StopLoad();

    // Get the browser instance
    CefRefPtr<CefBrowser> GetBrowser() const { return browser_; }

private:
    CefRefPtr<CefBrowser> browser_;
    NativeWindowHandle window_handle_;
    std::string current_url_;
    bool is_loading_;

    // Platform-specific window creation
    bool CreatePlatformWindow(int width, int height);
    void DestroyPlatformWindow();

#ifdef _WIN32
    static LRESULT CALLBACK WndProc(HWND hWnd, UINT message,
                                     WPARAM wParam, LPARAM lParam);
#endif
};

#endif // EESHA_BROWSER_WINDOW_H
