# Task 3-b - Desktop (Electron) v0.10.0 Feature Additions

## Agent: code
## Status: COMPLETED

### Work Done
Added five major features to the Eesha browser Desktop (Electron) app for v0.10.0:

1. **Reader Mode** - Toggle button + menu item, JS injection extracts main content, applies clean readable style (#1a1a2e bg, #e0e0e0 text, 18px font, 700px max-width), per-tab state
2. **Per-Site Permissions** - Site Settings popup with toggles for JS, images, popups, notifications, location, media; stored in site-permissions.json; enforced via setPermissionRequestHandler
3. **Dark Mode Toggle** - Button + menu checkbox, CSS injection via insertCSS(), saved in settings
4. **Password Manager** - Form detection JS, auto-fill bar, eesha://passwords page, base64-encoded passwords.json
5. **Screenshot Capture** - Button + menu item, webContents.capturePage(), saves to Downloads folder

### Version: 0.9.0 → 0.10.0
