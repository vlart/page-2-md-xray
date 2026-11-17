const rawElement = document.getElementById("raw");
const renderedElement = document.getElementById("rendered");
const statusElement = document.getElementById("status");
const nameElement = document.getElementById("document-name");
const downloadButton = document.getElementById("download");
let currentDraft;
const seenFootnoteRefs = new Set();
const longLinkReferences = new Map();

function text(parent, value) {
  parent.append(document.createTextNode(value.replace(/\\([\\`*_{}\[\]<>|])/g, "$1")));
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function renderInline(parent, source) {
  const tokens = /(!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\))|(!?\[([^\]]*)\]\[(xray-link-\d+)\])|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[\^(\d+)\]/g;
  let cursor = 0;
  for (const match of source.matchAll(tokens)) {
    text(parent, source.slice(cursor, match.index));
    if (match[1] || match[4]) {
      const href = validUrl(match[1] ? match[3] : longLinkReferences.get(match[6]));
      const token = match[1] || match[4];
      const label = match[1] ? match[2] : match[5];
      if (href) {
        if (token.startsWith("!")) {
          const image = document.createElement("img");
          image.src = href;
          image.alt = label.replace(/\\([\\`*_{}\[\]<>|])/g, "$1");
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          parent.append(image);
        } else {
          const link = document.createElement("a");
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = label.replace(/\\([\\`*_{}\[\]<>|])/g, "$1");
          parent.append(link);
        }
      } else text(parent, token);
    } else if (match[10]) {
      const link = document.createElement("a");
      link.href = `#footnote-${match[10]}`;
      if (!seenFootnoteRefs.has(match[10])) { link.id = `footnote-ref-${match[10]}`; seenFootnoteRefs.add(match[10]); }
      link.textContent = `[${match[10]}]`;
      parent.append(link);
    } else {
      const element = document.createElement(match[7] ? "code" : match[8] ? "strong" : "em");
      element.textContent = match[7] || match[8] || match[9];
      parent.append(element);
    }
    cursor = match.index + match[0].length;
  }
  text(parent, source.slice(cursor));
}

function splitCells(line) {
  const cells = [];
  let cell = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") { cell += "|"; i++; continue; }
    if (line[i] === "|") { cells.push(cell.trim()); cell = ""; continue; }
    cell += line[i];
  }
  cells.push(cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells;
}

function isTableRule(line) {
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isBlock(line) {
  return /^#{1,6}\s|^```|^>\s|^([-*]|\d+\.)\s|^---+$|^\[\^\d+\]:|^\[xray-link-\d+\]:/.test(line) || line.startsWith("|");
}

function renderMarkdown(markdown) {
  renderedElement.replaceChildren();
  seenFootnoteRefs.clear();
  longLinkReferences.clear();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const definition = line.match(/^\[(xray-link-\d+)\]: <(https?:\/\/[^>]+)>$/);
    if (definition) longLinkReferences.set(definition[1], definition[2]);
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const longLinkDefinition = line.match(/^\[(xray-link-\d+)\]: <(https?:\/\/[^>]+)>$/);
    if (longLinkDefinition) {
      const link = document.createElement("a");
      link.href = validUrl(longLinkDefinition[2]);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${longLinkDefinition[1]} — ${new URL(longLinkDefinition[2]).hostname}`;
      const p = document.createElement("p");
      p.append(link); renderedElement.append(p);
      i++; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      renderInline(element, heading[2]);
      renderedElement.append(element);
      i++; continue;
    }
    const footnote = line.match(/^\[\^(\d+)\]:\s*(.*)$/);
    if (footnote) {
      const p = document.createElement("p");
      p.id = `footnote-${footnote[1]}`;
      const back = document.createElement("a");
      back.href = `#footnote-ref-${footnote[1]}`;
      back.textContent = `[${footnote[1]}] ↩ `;
      p.append(back);
      renderInline(p, footnote[2]);
      renderedElement.append(p);
      i++; continue;
    }
    if (line.startsWith("```")) {
      const code = document.createElement("code");
      const pre = document.createElement("pre");
      const content = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) content.push(lines[i++]);
      code.textContent = content.join("\n");
      pre.append(code);
      renderedElement.append(pre);
      if (i < lines.length) i++;
      continue;
    }
    if (line.startsWith("|") && isTableRule(lines[i + 1] || "")) {
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const cell of splitCells(line)) { const th = document.createElement("th"); renderInline(th, cell); headRow.append(th); }
      head.append(headRow); table.append(head);
      const body = document.createElement("tbody");
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        const row = document.createElement("tr");
        for (const cell of splitCells(lines[i])) { const td = document.createElement("td"); renderInline(td, cell); row.append(td); }
        body.append(row); i++;
      }
      table.append(body); renderedElement.append(table); continue;
    }
    if (/^---+$/.test(line)) { renderedElement.append(document.createElement("hr")); i++; continue; }
    if (/^>\s/.test(line)) {
      const quote = document.createElement("blockquote");
      while (i < lines.length && /^>\s/.test(lines[i])) {
        const p = document.createElement("p"); renderInline(p, lines[i].replace(/^>\s/, "")); quote.append(p); i++;
      }
      renderedElement.append(quote); continue;
    }
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const list = document.createElement(/^\d/.test(listMatch[2]) ? "ol" : "ul");
      while (i < lines.length) {
        const item = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
        if (!item) break;
        const li = document.createElement("li");
        li.style.marginLeft = `${Math.min(item[1].length * 8, 48)}px`;
        renderInline(li, item[3]); list.append(li); i++;
      }
      renderedElement.append(list); continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !isBlock(lines[i]))) paragraph.push(lines[i++]);
    const p = document.createElement("p");
    renderInline(p, paragraph.join(" "));
    renderedElement.append(p);
  }
}

function downloadMarkdown() {
  const blob = new Blob(["\uFEFF", currentDraft.markdown], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${currentDraft.filename}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function loadDraft() {
  const id = location.hash.slice(1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Некорректная ссылка предпросмотра.");
  const key = `preview:${id}`;
  const stored = await chrome.storage.session.get(key);
  const draft = stored[key];
  if (!draft || typeof draft.markdown !== "string") throw new Error("Черновик недоступен. Создайте предпросмотр повторно в popup.");
  currentDraft = draft;
  nameElement.textContent = draft.filename;
  document.title = `${draft.filename} — Markdown`;
  rawElement.textContent = draft.markdown;
  renderMarkdown(draft.markdown);
  statusElement.textContent = "Локальный предпросмотр";
  downloadButton.disabled = false;
}

downloadButton.addEventListener("click", downloadMarkdown);
loadDraft().catch((error) => {
  statusElement.textContent = "Ошибка";
  renderedElement.classList.add("error");
  renderedElement.textContent = error.message;
});
