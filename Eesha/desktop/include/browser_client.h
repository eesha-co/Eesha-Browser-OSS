// browser_client.h - Eesha Browser Client handler
#ifndef EESHA_BROWSER_CLIENT_H
#define EESHA_BROWSER_CLIENT_H

#include "include/cef_client.h"
#include "include/cef_display_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_request_handler.h"

#include <functional>
#include <string>

class EeshaBrowserClient : public CefClient,
                            public CefDisplayHandler,
                            public CefLoadHandler,
                            public CefLifeSpanHandler,
                            public CefRequestHandler {
public:
    // Callback types for UI updates
    using TitleChangeCallback = std::function<void(const std::string&)>;
    using URLChangeCallback = std::function<void(const std::string&)>;
    using LoadingStateCallback = std::function<void(bool, bool)>;

    EeshaBrowserClient(TitleChangeCallback title_cb,
                       URLChangeCallback url_cb,
                       LoadingStateCallback loading_cb);

    // CefClient methods - return handlers
    CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
    CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
    CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
    CefRefPtr<CefRequestHandler> GetRequestHandler() override { return this; }

    // CefDisplayHandler methods
    void OnTitleChange(CefRefPtr<CefBrowser> browser,
                       const CefString& title) override;
    void OnAddressChange(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefFrame> frame,
                         const CefString& url) override;
    void OnFaviconURLChange(CefRefPtr<CefBrowser> browser,
                            const std::vector<CefString>& icon_urls) override;

    // CefLoadHandler methods
    void OnLoadingStateChange(CefRefPtr<CefBrowser> browser,
                              bool isLoading,
                              bool canGoBack,
                              bool canGoForward) override;
    void OnLoadError(CefRefPtr<CefBrowser> browser,
                     CefRefPtr<CefFrame> frame,
                     ErrorCode errorCode,
                     const CefString& errorText,
                     const CefString& failedUrl) override;

    // CefLifeSpanHandler methods
    bool OnBeforePopup(CefRefPtr<CefBrowser> browser,
                       CefRefPtr<CefFrame> frame,
                       const CefString& target_url,
                       const CefString& target_frame_name,
                       CefLifeSpanHandler::WindowOpenDisposition target_disposition,
                       bool user_gesture,
                       const CefPopupFeatures& popupFeatures,
                       CefWindowInfo& windowInfo,
                       CefRefPtr<CefClient>& client,
                       CefBrowserSettings& settings,
                       CefRefPtr<CefDictionaryValue>& extra_info,
                       bool* no_javascript_access) override;
    void OnAfterCreated(CefRefPtr<CefBrowser> browser) override;

    // CefRequestHandler methods
    bool OnBeforeBrowse(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefFrame> frame,
                        CefRefPtr<CefRequest> request,
                        bool user_gesture,
                        bool is_redirect) override;
    CefRefPtr<CefResourceRequestHandler> GetResourceRequestHandler(
        CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefRefPtr<CefRequest> request,
        bool is_navigation,
        bool is_download,
        const CefString& request_initiator,
        bool& disable_default_handling) override;

    // Privacy: Block known tracking/ad domains
    static bool IsBlockedDomain(const std::string& url);
    static bool ShouldBlockTracker(const std::string& url);

private:
    TitleChangeCallback title_callback_;
    URLChangeCallback url_callback_;
    LoadingStateCallback loading_callback_;

    IMPLEMENT_REFCOUNTING(EeshaBrowserClient);
    DISALLOW_COPY_AND_ASSIGN(EeshaBrowserClient);
};

#endif // EESHA_BROWSER_CLIENT_H
