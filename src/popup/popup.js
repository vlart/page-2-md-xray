const titleElement = document.getElementById("page-title");
const urlElement = document.getElementById("page-url");
const filenameElement = document.getElementById("filename");
const form = document.getElementById("export-form");
const button = document.getElementById("export-button");
const previewButton = document.getElementById("preview-button");
const statusElement = document.getElementById("status");
const languageElement = document.getElementById("language");
let language = "en";
const t = (key) => popupTranslations[language][key];

function applyLanguage(next) {
  language = popupTranslations[next] ? next : "en";
  languageElement.value = language;
  document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  if (!urlElement.textContent) titleElement.textContent = t("loadingPage");
  setStatus(t("idle"));
}

languageElement.addEventListener("change", async () => {
  applyLanguage(languageElement.value);
  await chrome.storage.local.set({ popupLanguage: language });
  await loadPage();
});

function setStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
}

function safeFilename(name) {
  return (name || "page")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 90) || "page";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:\/\//i.test(tab.url || "")) {
    throw new Error(t("invalidTab"));
  }
  return tab;
}

async function loadPage() {
  try {
    const tab = await getActiveTab();
    titleElement.textContent = tab.title || t("untitled");
    urlElement.textContent = tab.url;
    filenameElement.value = safeFilename(tab.title || new URL(tab.url).hostname);
  } catch (error) {
    titleElement.textContent = t("unavailable");
    setStatus(error.message, "error");
    button.disabled = true;
  }
}

function downloadMarkdown(markdown, filename) {
  const blob = new Blob(["\uFEFF", markdown], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${safeFilename(filename)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function prunePreviews() {
  const stored = await chrome.storage.session.get(null);
  const expired = Object.entries(stored)
    .filter(([key, value]) => key.startsWith("preview:") && (!value?.createdAt || Date.now() - value.createdAt > 60 * 60 * 1000))
    .map(([key]) => key);
  if (expired.length) await chrome.storage.session.remove(expired);
}

async function runExport(action) {
  const data = new FormData(form);
  const sections = data.getAll("sections");
  if (!sections.length) {
    setStatus(t("chooseSection"), "error");
    return;
  }
  button.disabled = true;
  previewButton.disabled = true;
  setStatus(t("extracting"));
  try {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/fingerprints.js", "src/content/extract.js"]
    });
    const options = { scope: data.get("scope"), pageType: data.get("pageType"), textMode: data.get("textMode"), sections };
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selectedOptions) => globalThis.pageToMarkdownExtract(selectedOptions),
      args: [options]
    });
    if (!result || !result.markdown) throw new Error(t("noContent"));
    if (action === "preview") {
      await prunePreviews();
      const id = crypto.randomUUID();
      await chrome.storage.session.set({ [`preview:${id}`]: { markdown: result.markdown, filename: safeFilename(filenameElement.value), createdAt: Date.now() } });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`src/preview/preview.html#${id}`) });
      setStatus(t("previewOpened"), "success");
    } else {
      downloadMarkdown(result.markdown, filenameElement.value);
      setStatus(t("done")(result), "success");
    }
  } catch (error) {
    setStatus(error.message || t("saveError"), "error");
  } finally {
    button.disabled = false;
    previewButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runExport("download");
});

previewButton.addEventListener("click", () => runExport("preview"));

async function initialize() {
  const saved = await chrome.storage.local.get("popupLanguage");
  const browserLanguage = navigator.language.toLowerCase().split("-")[0];
  applyLanguage(saved.popupLanguage || browserLanguage);
  await loadPage();
}

initialize();
