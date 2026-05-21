// browser_app.h - Eesha Browser Application class
#ifndef EESHA_BROWSER_APP_H
#define EESHA_BROWSER_APP_H

#include "include/cef_app.h"
#include "include/cef_command_handler.h"

class EeshaBrowserApp : public CefApp,
                        public CefBrowserProcessHandler,
                        public CefCommandHandler {
public:
    EeshaBrowserApp();

    // CefApp methods
    CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override {
        return this;
    }
    CefRefPtr<CefCommandHandler> GetCommandHandler() override {
        return this;
    }

    // CefBrowserProcessHandler methods
    void OnContextInitialized() override;
    void OnBeforeChildProcessLaunch(CefRefPtr<CefCommandLine> command_line) override;
    void OnRenderProcessThreadCreated(CefRefPtr<CefListValue> extra_info) override;

    // CefCommandHandler methods
    bool OnChromeCommand(CefRefPtr<CefBrowser> browser,
                         int command_id,
                         cef_chrome_command_t disposition) override;

private:
    IMPLEMENT_REFCOUNTING(EeshaBrowserApp);
    DISALLOW_COPY_AND_ASSIGN(EeshaBrowserApp);
};

#endif // EESHA_BROWSER_APP_H
