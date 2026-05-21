// browser_app.cpp - Eesha Browser Application implementation
#include "browser_app.h"
#include "browser_client.h"
#include "browser_window.h"

#include "include/cef_browser.h"
#include "include/cef_command_line.h"

#include <iostream>

EeshaBrowserApp::EeshaBrowserApp() {}

void EeshaBrowserApp::OnContextInitialized() {
    CEF_REQUIRE_UI_THREAD();

    // Create the main browser window
    auto* window = new EeshaBrowserWindow();
    if (!window->Create(1280, 800)) {
        std::cerr << "Eesha: Failed to create browser window" << std::endl;
        return;
    }

    // Load the Eesha new tab page
    window->LoadURL("eesha://newtab");
    window->Show();
}

void EeshaBrowserApp::OnBeforeChildProcessLaunch(
    CefRefPtr<CefCommandLine> command_line) {
    // Pass any Eesha-specific flags to child processes
}

void EeshaBrowserApp::OnRenderProcessThreadCreated(
    CefRefPtr<CefListValue> extra_info) {
    // Pass Eesha configuration to the renderer process
}

bool EeshaBrowserApp::OnChromeCommand(
    CefRefPtr<CefBrowser> browser,
    int command_id,
    cef_chrome_command_t disposition) {
    // Handle Chrome-specific commands (keyboard shortcuts, etc.)
    return false;
}
