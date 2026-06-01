import type { DetectSiteResponse } from "./types.js";
import { buildDetectionPayload, collectPageMetadata } from "./metadata.js";
import { getBrowser } from "./browser.js";
import "./styles.css";

const browser = getBrowser();
const serverInput = element<HTMLInputElement>("serverUrl");
const saveButton = element<HTMLButtonElement>("saveServer");
const detectButton = element<HTMLButtonElement>("detect");
const copyButton = element<HTMLButtonElement>("copy");
const statusBadge = element<HTMLSpanElement>("statusBadge");
const hostLabel = element<HTMLParagraphElement>("host");
const sourceName = element<HTMLHeadingElement>("sourceName");
const message = element<HTMLParagraphElement>("message");
const details = element<HTMLPreElement>("details");

let lastCopyValue = "";

void init();

async function init(): Promise<void> {
  const stored = await browser.storage.sync.get("serverUrl");
  serverInput.value = String(stored.serverUrl || "http://localhost:3000");
  const tab = await currentTab();
  hostLabel.textContent = tab.url ? new URL(tab.url).hostname : "No active tab";
}

saveButton.addEventListener("click", async () => {
  await browser.storage.sync.set({ serverUrl: serverInput.value.replace(/\/$/, "") });
  setStatus("saved", "neutral");
});

detectButton.addEventListener("click", async () => {
  setStatus("checking", "neutral");
  copyButton.disabled = true;
  lastCopyValue = "";

  try {
    const tab = await currentTab();
    if (!tab.id || !tab.url) {
      throw new Error("No active tab URL is available.");
    }
    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageMetadata
    });
    const payload = buildDetectionPayload(tab.url, injected.result ?? {});
    const response = await fetch(`${serverInput.value.replace(/\/$/, "")}/api/detect-site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as DetectSiteResponse;
    renderResult(result);
  } catch (error) {
    renderResult({
      status: "error",
      message: error instanceof Error ? error.message : "Detection failed."
    });
  }
});

copyButton.addEventListener("click", async () => {
  if (lastCopyValue) {
    await navigator.clipboard.writeText(lastCopyValue);
    setStatus("copied", "available");
  }
});

async function currentTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderResult(result: DetectSiteResponse): void {
  setStatus(result.status, result.status === "available" ? "available" : result.status === "error" ? "error" : "neutral");
  sourceName.textContent = result.sourceName || result.status;
  message.textContent = result.message;
  details.textContent = JSON.stringify(result, null, 2);
  lastCopyValue = result.resourceUri || result.mcpServerUrl || "";
  copyButton.disabled = !lastCopyValue;
}

function setStatus(text: string, tone: "available" | "error" | "neutral"): void {
  statusBadge.textContent = text;
  statusBadge.className = `badge ${tone}`;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element #${id}`);
  }
  return node as T;
}
