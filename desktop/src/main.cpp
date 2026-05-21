// main.cpp - Eesha Browser entry point
// A Blink-based web browser powered by Chromium Embedded Framework (CEF)

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_command_line.h"

#include "browser_app.h"

#include <iostream>
#include <string>

// Platform-specific entry points
#if defined(_WIN32)
int APIENTRY WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                     LPSTR lpCmdLine, int nCmdShow) {
    CefMainArgs main_args(hInstance);
#else
int main(int argc, char* argv[]) {
    CefMainArgs main_args(argc, argv);
#endif

    // Parse command line
    CefRefPtr<CefCommandLine> command_line = CefCommandLine::CreateCommandLine();
#if defined(_WIN32)
    command_line->InitFromString(GetCommandLineW());
#else
    command_line->InitFromArgv(argc, argv);
#endif

    // Create the application
    CefRefPtr<EeshaBrowserApp> app = new EeshaBrowserApp();

    // CEF sub-process execution - handles renderer, GPU, etc.
    int exit_code = CefExecuteProcess(main_args, app.get(), nullptr);
    if (exit_code >= 0) {
        return exit_code;
    }

    // Configure CEF settings
    CefSettings settings;
    settings.no_sandbox = true;
    settings.multi_threaded_message_loop = false;
    settings.windowless_rendering_enabled = false;

    // Eesha-specific settings
    settings.user_agent_product = "Eesha/0.2.0";

    // Use Eesha's own cache path
#if defined(_WIN32)
    std::string cache_path = std::string(getenv("LOCALAPPDATA") ? getenv("LOCALAPPDATA") : "") + "\\Eesha\\cache";
#elif defined(__APPLE__)
    std::string cache_path = std::string(getenv("HOME") ? getenv("HOME") : "") + "/Library/Application Support/Eesha/cache";
#else
    std::string cache_path = std::string(getenv("HOME") ? getenv("HOME") : "") + "/.local/share/eesha/cache";
#endif
    CefString(&settings.cache_path) = cache_path;

    // Initialize CEF
    if (!CefInitialize(main_args, settings, app.get(), nullptr)) {
        std::cerr << "Eesha: Failed to initialize CEF (Chromium Embedded Framework)" << std::endl;
        return 1;
    }

    // Run the CEF message loop - this blocks until the app exits
    CefRunMessageLoop();

    // Shut down CEF
    CefShutdown();

    return 0;
}
