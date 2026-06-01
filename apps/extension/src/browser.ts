export interface ExtensionBrowser {
  tabs: typeof chrome.tabs;
  scripting: typeof chrome.scripting;
  storage: typeof chrome.storage;
}

export function getBrowser(): ExtensionBrowser {
  return chrome;
}
