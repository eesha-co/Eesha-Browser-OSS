// content-preload.js - Preload script for web content tabs
// Exposes password manager APIs to injected scripts so they can communicate
// with the main process via IPC

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eesha', {
  // Password Manager APIs (used by injected detection/auto-fill scripts)
  saveCredential: (url, username, password) => ipcRenderer.invoke('save-credential', url, username, password),
  autoFillCredentials: (credentials) => ipcRenderer.invoke('auto-fill-credentials', credentials),

  // Navigation APIs (used by eesha:// internal pages injected into content views)
  navigate: (url) => ipcRenderer.invoke('navigate', url),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),

  // Bookmark APIs (used by eesha:// internal pages)
  addBookmark: (url, title) => ipcRenderer.invoke('add-bookmark', url, title),
  removeBookmark: (url) => ipcRenderer.invoke('remove-bookmark', url),
  isBookmarked: (url) => ipcRenderer.invoke('is-bookmarked', url),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),

  // History APIs (used by eesha:// internal pages)
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  removeHistoryEntry: (url) => ipcRenderer.invoke('remove-history-entry', url),

  // Settings APIs (used by eesha:// internal pages)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),

  // Data management (used by eesha:// internal pages)
  clearBrowsingData: () => ipcRenderer.invoke('clear-browsing-data'),

  // Block stats (used by eesha:// internal pages)
  getBlockStats: () => ipcRenderer.invoke('get-block-stats'),

  // Downloads (used by eesha:// internal pages)
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  openDownloadFolder: (filePath) => ipcRenderer.invoke('open-download-folder', filePath),

  // Password management (used by eesha://passwords page)
  getPasswords: () => ipcRenderer.invoke('get-passwords'),
  deletePassword: (url, username) => ipcRenderer.invoke('delete-password', url, username),

  // Share (used by eesha:// internal pages)
  shareUrl: (url) => ipcRenderer.invoke('share-url', url),

  // Tab creation (used by eesha:// internal pages)
  createTab: (url) => ipcRenderer.invoke('create-tab', url),

  // Downloads update listener
  onDownloadsUpdated: (callback) => {
    ipcRenderer.on('downloads-updated', (_, data) => callback(data));
  },
});
