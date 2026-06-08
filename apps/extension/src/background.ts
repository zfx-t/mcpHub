chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get("serverUrl");
  if (!existing.serverUrl) {
    await chrome.storage.sync.set({ serverUrl: "http://localhost:3000" });
  }
});
