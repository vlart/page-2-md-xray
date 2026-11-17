globalThis.pageToMarkdownExtract = (options = {}) => {
  const scope = options.scope === "full" ? "full" : "main";
  const textMode = ["full", "brief", "outline"].includes(options.textMode) ? options.textMode : "full";
  const requestedPageType = ["article", "card", "feed", "app", "mixed"].includes(options.pageType) ? options.pageType : "auto";
  const sections = new Set(Array.isArray(options.sections) ? options.sections : ["source", "description", "content", "map", "images", "actions", "technologies", "limitations"]);
  const compact = (value) => (value || "").replace(/\s+/g, " ").trim();
  const escapeInline = (value) => compact(value).replace(/([\\`*_{}\[\]<>|])/g, "\\$1");
  const escapeCell = (value) => escapeInline(value);
  const pluralRu = (count, one, few, many) => count % 10 === 1 && count % 100 !== 11 ? one
    : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? few : many;
  const readableText = (node, nested = false) => node.nodeType === Node.TEXT_NODE ? compact(node.textContent)
    : node.nodeType === Node.ELEMENT_NODE && !["SCRIPT", "STYLE", "SVG", "IMG"].includes(node.tagName) && (!nested || node.tagName !== "BUTTON")
      ? [...node.childNodes].map((child) => readableText(child, true)).filter(Boolean).join(" ").replace(/\s+([.,!?;:])/g, "$1").trim() : "";
  const humanDate = (value) => new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset"
  }).format(value);
  const longLinkIds = new Map();
  const markdownLink = (label, href, image = false) => {
    if (href.length <= 180) return `${image ? "!" : ""}[${label}](${href})`;
    if (!longLinkIds.has(href)) longLinkIds.set(href, `xray-link-${longLinkIds.size + 1}`);
    return `${image ? "!" : ""}[${label}][${longLinkIds.get(href)}]`;
  };
  const groupBy = (items, keyOf) => {
    const grouped = new Map();
    for (const item of items) {
      const key = keyOf(item);
      const previous = grouped.get(key);
      if (previous) previous.count++;
      else grouped.set(key, { ...item, count: 1 });
    }
    return [...grouped.values()];
  };
  const joinInline = (nodes) => nodes.reduce((result, node) => {
    const part = inline(node);
    if (!part) return result;
    const previous = result.at(-1);
    const needsSpace = previous && !/\s$/.test(previous.text) && !/^\s/.test(part)
      && (previous.node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.ELEMENT_NODE)
      && !/^[.,!?;:%)}\]]/.test(part) && !/[(\[{]$/.test(previous.text);
    result.push({ node, text: `${needsSpace ? " " : ""}${part}` });
    return result;
  }, []).map((item) => item.text).join("");
  const lines = [];
  let paragraphsInSection = 0;
  let clippedTables = 0;
  let clippedTableRows = 0;
  const wikiFootnotes = new Map();
  const usedFootnotes = new Set();
  let wikiFootnoteMode = false;
  let contentCardGroups = new Map();
  let summarizedCards = 0;
  let transientRemoved = 0;
  const isLoadingText = (value) => /^(?:video player is loading\.?|loading\.{0,3}|загрузка\.{0,3})$/i.test(compact(value));

  function cardGroupsIn(container) {
    const groups = new Map();
    for (const parent of [container, ...container.querySelectorAll("div, section, ul, ol")].slice(0, 1800)) {
      if (parent.closest?.("nav, aside, footer, [role='navigation'], [hidden], [aria-hidden='true']")) continue;
      const children = [...parent.children];
      if (children.length < 3 || children.length > 80) continue;
      const candidates = children.filter((child) => {
        if (!["DIV", "SECTION", "LI", "ARTICLE", "A"].includes(child.tagName)) return false;
        const heading = child.querySelector("h2,h3,h4,h5,h6");
        const image = child.querySelector("img[alt]");
        const link = child.tagName === "A" && child.getAttribute("href") || child.querySelector("a[href]");
        const label = compact(heading?.textContent || image?.getAttribute("alt"));
        return !!link && label.length >= 4 && label.length <= 180 && compact(child.textContent).length <= 1200;
      });
      if (candidates.length < 3 || candidates.length / children.length < 0.6) continue;
      const tagCounts = new Map();
      candidates.forEach((child) => tagCounts.set(child.tagName, (tagCounts.get(child.tagName) || 0) + 1));
      const [tag, count] = [...tagCounts].sort((a, b) => b[1] - a[1])[0];
      if (count < 3 || count / candidates.length < 0.7) continue;
      groups.set(parent, candidates.filter((child) => child.tagName === tag));
    }
    for (const parent of groups.keys()) {
      for (const nested of groups.keys()) {
        if (nested === parent) continue;
        let ancestor = nested.parentElement;
        while (ancestor && ancestor !== parent) ancestor = ancestor.parentElement;
        if (ancestor === parent) { groups.delete(parent); break; }
      }
    }
    return groups;
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      if (!/^https?:$/.test(url.protocol)) return "";
      url.username = "";
      url.password = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/token|key|secret|auth|session|password|code|signature|^sig$|jwt|access/i.test(key)) url.searchParams.delete(key);
      }
      return url.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
    } catch {
      return "";
    }
  }

  function inline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (scope === "main" && isLoadingText(node.textContent)) { transientRemoved++; return ""; }
      return (node.textContent || "").replace(/\s+/g, " ").replace(/([\\`*_{}\[\]<>|])/g, "\\$1");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "input", "textarea", "select", "button"].includes(tag)) return "";
    if (wikiFootnoteMode && tag === "sup") {
      const ref = node.querySelector("a[href*='#cite_note-']");
      const id = ref?.getAttribute("href")?.split("#")[1];
      const note = wikiFootnotes.get(id);
      if (note) { usedFootnotes.add(note.number); return `[^${note.number}]`; }
    }
    if (pageType === "card" && tag === "a" && (compact(node.getAttribute("href")) === "#" || /^javascript:/i.test(compact(node.getAttribute("href"))))) return "";
    if (tag === "br") return " ";
    if (tag === "img") {
      if (!sections.has("images")) return "";
      const src = safeUrl(node.getAttribute("src") || node.getAttribute("data-src"));
      return src ? markdownLink(escapeInline(node.getAttribute("alt") || "Изображение"), src, true) : "";
    }
    const childText = joinInline([...node.childNodes]).replace(/\s+/g, " ").trim();
    if (!childText) return "";
    if (tag === "a") {
      const href = safeUrl(node.getAttribute("href"));
      return href ? markdownLink(childText, href) : childText;
    }
    if (tag === "code") return `\`${childText.replace(/`/g, "\\`")}\``;
    if (tag === "strong" || tag === "b") return `**${childText}**`;
    if (tag === "em" || tag === "i") return `*${childText}*`;
    return childText;
  }

  function render(node, depth = 0) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (scope === "main" && node.children.length === 0 && isLoadingText(node.textContent)) {
      transientRemoved++;
      return;
    }
    if (pageType === "mixed" && scope === "main" && textMode !== "outline" && contentCardGroups.has(node)) {
      const cards = new Set(contentCardGroups.get(node));
      for (const card of node.children) {
        if (!cards.has(card)) { render(card, depth); continue; }
        const heading = card.querySelector("h2,h3,h4,h5,h6");
        const image = card.querySelector("img[alt]");
        const label = compact(heading?.textContent || image?.getAttribute("alt"));
        const ownLink = card.tagName === "A" ? card : null;
        const link = heading?.closest("a[href]") || ownLink || card.querySelector("a[href]");
        const href = safeUrl(link?.getAttribute("href"));
        const shortVisualCard = !!image && !!(ownLink || heading?.closest("a[href]"))
          && !card.querySelector("ul,ol,table") && compact(card.textContent).length <= 240;
        if (shortVisualCard) {
          summarizedCards++;
          const detail = readableText(card).replace(label, "").trim();
          lines.push(`${href ? markdownLink(escapeInline(label), href) : escapeInline(label)}`, detail ? escapeInline(detail) : "", "");
        } else render(card, depth);
      }
      return;
    }
    if (pageType === "card" && tag === "a" && (compact(node.getAttribute("href")) === "#" || /^javascript:/i.test(compact(node.getAttribute("href"))))) return;
    if (/^h[1-6]$/.test(tag)) {
      const text = inline(node);
      if (text) lines.push(`${"#".repeat(Math.min(Number(tag[1]) + 1, 6))} ${text}`, "");
      paragraphsInSection = 0;
      return;
    }
    if (textMode === "outline") {
      for (const child of node.children) render(child, depth);
      return;
    }
    if (tag === "p") {
      if (textMode === "brief" && paragraphsInSection > 0) return;
      const text = inline(node);
      if (text) { lines.push(text, ""); paragraphsInSection++; }
      return;
    }
    if (wikiFootnoteMode && tag === "ol" && /(?:^|\s)references(?:\s|$)/.test(node.getAttribute("class") || "")) {
      [...wikiFootnotes.values()].filter((note) => usedFootnotes.has(note.number)).sort((a, b) => a.number - b.number).forEach((note) => {
        const body = inline(note.node);
        if (body) lines.push(`[^${note.number}]: ${body}`, "");
      });
      return;
    }
    if (textMode === "brief" && ["pre", "ul", "ol", "table", "blockquote", "figure", "img"].includes(tag)) return;
    if (tag === "pre") {
      const code = (node.textContent || "").trim();
      if (code) lines.push("```", code, "```", "");
      return;
    }
    if (tag === "img") {
      const text = inline(node);
      if (text) lines.push(text, "");
      return;
    }
    if (tag === "ul" || tag === "ol") {
      [...node.children].filter((child) => child.tagName === "LI").forEach((item, index) => {
        const direct = joinInline([...item.childNodes].filter((child) => !(child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)))).trim();
        if (direct) lines.push(`${"  ".repeat(depth)}${tag === "ol" ? `${index + 1}.` : "-"} ${direct}`);
        [...item.children].filter((child) => /^(UL|OL)$/.test(child.tagName)).forEach((child) => render(child, depth + 1));
      });
      lines.push("");
      return;
    }
    if (tag === "table") {
      const allRows = [...node.querySelectorAll("tr")];
      if (allRows.length > 100) { clippedTables++; clippedTableRows += allRows.length - 100; }
      const rows = allRows.slice(0, 100).map((row) => [...row.children].filter((cell) => /^(TH|TD)$/.test(cell.tagName)).map((cell) => inline(cell)));
      if (rows.length) {
        const width = Math.max(...rows.map((row) => row.length));
        const row = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] || " ").join(" | ")} |`;
        lines.push(row(rows[0]), row(Array(width).fill("---")), ...rows.slice(1).map(row), "");
        if (allRows.length > rows.length) lines.push(`*Показаны первые ${rows.length} из ${allRows.length} строк таблицы.*`, "");
      }
      return;
    }
    if (tag === "blockquote") {
      const text = inline(node);
      if (text) lines.push(`> ${text}`, "");
      return;
    }
    if (tag === "hr") { lines.push("---", ""); return; }
    if (tag === "figure") {
      [...node.children].forEach((child) => render(child, depth));
      return;
    }
    if (tag === "figcaption") {
      const text = inline(node);
      if (text) lines.push(`*${text}*`, "");
      return;
    }
    if (["a", "div", "section", "span"].includes(tag) && !node.querySelector("h1,h2,h3,h4,h5,h6,p,ul,ol,table,pre,blockquote,figure,section,div")) {
      if (textMode === "brief") return;
      const text = inline(node);
      if (text) lines.push(text, "");
      return;
    }
    for (const child of node.children) render(child, depth);
  }

  const bodyArticles = scope === "main" ? [...document.body.querySelectorAll("article")] : [];
  const bodyTextLength = compact(document.body.innerText || document.body.textContent).length;
  const headedArticle = bodyArticles.find((node) => node.querySelector("h1")
    && (node.querySelector("pre,audio,video") || node.querySelectorAll("p").length >= 2));
  const dominantArticle = bodyArticles
    .filter((node) => node.querySelectorAll("p").length >= 2
      && compact(node.innerText || node.textContent).length >= bodyTextLength * 0.55)
    .sort((a, b) => compact(b.innerText || b.textContent).length - compact(a.innerText || a.textContent).length)[0];
  const main = scope === "main" ? document.querySelector("main, [role='main']") || headedArticle || dominantArticle : null;
  const source = main || document.body;
  const sourceFrames = source.querySelectorAll("iframe").length;
  const sourceHidden = source.querySelectorAll("[hidden], [aria-hidden='true']").length;
  const linkedinFeed = /(?:^|\.)linkedin\.com$/i.test(location.hostname) && /^\/feed\/?/.test(location.pathname);
  const youtubeHome = /(?:^|\.)youtube\.com$/i.test(location.hostname) && /^\/$/.test(location.pathname);
  const feedSelector = "[role='article'], article[data-urn], .feed-shared-update-v2, .occludable-update, [data-urn*='activity']"
    + (linkedinFeed ? ", main [role='listitem'], [role='main'] [role='listitem']" : "")
    + (youtubeHome ? ", ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer" : "");
  const isFeedPost = (node) => (youtubeHome && /^YTD-(?:RICH-ITEM|VIDEO|GRID-VIDEO)-RENDERER$/.test(node.tagName)
    ? !!node.querySelector("a[href*='/watch'], a[href*='/shorts/']") && !node.querySelector("ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer")
    : compact(node.textContent).length >= 60)
    && (!linkedinFeed || node.getAttribute("role") !== "listitem" || !!node.querySelector("h2,h3"));
  const feedCandidates = [...(document.querySelectorAll?.(feedSelector) || [])].filter((node) =>
    isFeedPost(node) && ![...node.querySelectorAll(feedSelector)].some(isFeedPost)
  );
  const repeatedCardGroups = scope === "main" ? cardGroupsIn(source) : new Map();
  const meaningfulInputs = [...source.querySelectorAll("input, textarea, select")].filter((node) =>
    !["hidden", "submit", "button", "reset", "checkbox", "radio"].includes((node.getAttribute("type") || "text").toLowerCase())
    && !node.closest("[hidden], [aria-hidden='true']")
  );
  const fieldLabel = (node) => {
    const id = node.getAttribute("id");
    const label = id ? source.querySelector?.(`label[for="${CSS.escape(id)}"]`) : null;
    return compact(node.getAttribute("aria-label") || label?.textContent || node.getAttribute("placeholder") || node.getAttribute("title"));
  };
  const fieldSource = (node) => {
    const id = node.getAttribute("id");
    const label = id ? source.querySelector?.(`label[for="${CSS.escape(id)}"]`) : null;
    return node.getAttribute("aria-label") || label?.textContent ? "подпись" : node.getAttribute("placeholder") ? "подсказка" : "атрибут title";
  };
  const namedInputs = meaningfulInputs.filter((node) => fieldLabel(node));
  const articleCandidates = [...source.querySelectorAll("article")];
  const sourceTextLength = compact(source.innerText || source.textContent).length;
  const substantialArticles = articleCandidates.filter((node) => node.querySelector("h1") && node.querySelectorAll("p").length >= 3
    && compact(node.innerText || node.textContent).length >= sourceTextLength * 0.5);
  const articleRoot = source.tagName?.toLowerCase() === "article" ? source
    : substantialArticles.sort((a, b) => compact(b.innerText || b.textContent).length - compact(a.innerText || a.textContent).length)[0]
      || (articleCandidates.length === 1 ? articleCandidates[0] : null);
  const articleDominant = !!articleRoot && articleRoot.querySelectorAll("p").length >= 3
    && compact(articleRoot.innerText || articleRoot.textContent).length >= sourceTextLength * 0.5;
  const ogTypeHint = compact(document.querySelector('meta[property="og:type"]')?.content);
  const cardSignal = /^(?:product|music\.|video\.)/i.test(ogTypeHint)
    || !!articleRoot?.querySelector("audio, video")
    || /\/(?:songs?|lyrics|chords?)\//i.test(location.pathname) && !!articleRoot?.querySelector("pre");
  const pageType = requestedPageType !== "auto" ? requestedPageType
    : feedCandidates.length >= 2 ? "feed"
    : cardSignal ? "card"
    : articleDominant || /(?:^|\.)wikipedia\.org$/i.test(location.hostname) ? "article"
    : (repeatedCardGroups.size || !main && bodyArticles.length >= 2) ? "mixed"
    : articleRoot ? "article"
    : namedInputs.some((node) => node.closest("form")) || namedInputs.length >= 2 ? "app" : "article";
  const pageTypeLabels = { article: "Статья", card: "Карточка материала", feed: "Лента", app: "Веб-приложение", mixed: "Страница с карточками" };
  const interfaceFields = namedInputs.slice(0, 25).map((node) => {
    return {
      label: fieldLabel(node).slice(0, 100),
      source: fieldSource(node),
      type: compact(node.getAttribute("type") || node.tagName.toLowerCase()),
      form: node.closest("form")
    };
  });
  const root = source.cloneNode(true);
  const excludedStructure = scope === "main" ? root.querySelectorAll("nav, aside, footer, [role='navigation'], [role='banner'], [role='complementary'], [role='contentinfo'], [role='dialog'], [aria-modal='true']").length : 0;
  const excluded = scope === "full"
    ? "script, style, noscript, template, iframe, svg, [hidden], [aria-hidden='true'], input, textarea, select"
    : "script, style, noscript, template, iframe, svg, nav, aside, footer, [role='navigation'], [role='banner'], [role='complementary'], [role='contentinfo'], [role='dialog'], [aria-modal='true'], [hidden], [aria-hidden='true'], input, textarea, select";
  root.querySelectorAll(excluded).forEach((node) => node.remove());
  if (scope === "main" && !main) {
    const firstHeading = root.querySelector("h1");
    let headingBranch = firstHeading;
    while (headingBranch?.parentElement && headingBranch.parentElement !== root) headingBranch = headingBranch.parentElement;
    if (headingBranch?.parentElement === root) {
      for (const sibling of [...root.children]) {
        if (sibling === headingBranch) break;
        const text = compact(sibling.textContent);
        const links = [...sibling.querySelectorAll("a[href]")];
        const linkedTextLength = links.reduce((sum, link) => sum + compact(link.textContent).length, 0);
        if (links.length >= 2 && text && linkedTextLength / text.length >= 0.6 && !sibling.querySelector("h1,h2,h3,h4,h5,h6")) sibling.remove();
      }
    }
  }
  if (scope === "main" && /(?:^|\.)wikipedia\.org$/i.test(location.hostname)) {
    root.querySelectorAll("#p-lang, #p-lang-btn, .vector-page-toolbar, .vector-column-end, .mw-editsection").forEach((node) => node.remove());
  }
  let styledHidden = 0;
  root.querySelectorAll("*").forEach((node) => {
    if (node.getAttribute("style")?.includes("display: none") || node.getAttribute("style")?.includes("visibility: hidden")) { styledHidden++; node.remove(); }
  });
  let decorativeRemoved = 0;
  if (scope === "main") root.querySelectorAll("img").forEach((node) => {
    const alt = compact(node.getAttribute("alt"));
    const src = node.getAttribute("src") || node.getAttribute("data-src") || "";
    const decorative = !alt && !node.closest("a[href], figure") && (
      node.getAttribute("role") === "presentation" || /\.svg(?:[?#]|$)/i.test(src)
      || Number(node.getAttribute("width")) > 0 && Number(node.getAttribute("width")) <= 32
    );
    if (decorative) { decorativeRemoved++; node.remove(); }
  });
  const articleInRoot = articleRoot && articleRoot !== source
    ? [...root.querySelectorAll("article")][articleCandidates.indexOf(articleRoot)] : null;
  const contentRoot = scope === "main" && pageType === "article" && articleInRoot
    ? articleInRoot.cloneNode(true)
    : scope === "main" && ["article", "card", "mixed"].includes(pageType) ? root.cloneNode(true) : root;
  let contentOnlyExcluded = 0;
  if (contentRoot !== root) {
    const serviceSelector = "section.noprint, #comments, #respond, .comment-respond, .jp-share, .share_dialog, [class*='social-share'], .mw-editsection, #toc, #catlinks, .vector-toc, .mw-indicators, form, [role='toolbar']";
    contentRoot.querySelectorAll(serviceSelector).forEach((node) => { contentOnlyExcluded++; node.remove(); });
    contentRoot.querySelectorAll("button, [role='button'], a[href='#'], a[href^='javascript:']").forEach((node) => { contentOnlyExcluded++; node.remove(); });
    if (pageType === "article") contentRoot.querySelectorAll("section").forEach((section) => {
      const headings = [...section.querySelectorAll("h1,h2,h3,h4,h5,h6")];
      if (headings.length === 1 && /^(?:comments?|комментарии|评论|留言|comentarios|commentaires)$/i.test(compact(headings[0].textContent))
        && compact(section.textContent).length < 500) { contentOnlyExcluded++; section.remove(); }
    });
    if (pageType === "article") contentRoot.querySelectorAll("div,section,nav").forEach((node) => {
      const text = compact(node.textContent);
      if (text.length > 1200 || node.querySelector("p,h1,h2,h3,h4,h5,h6")) return;
      const links = [...node.querySelectorAll("a[href]")];
      const localLinks = links.filter((link) => {
        try {
          const url = new URL(link.getAttribute("href"), location.href);
          return !!url.hash && url.origin === location.origin && url.pathname === location.pathname;
        } catch { return false; }
      });
      const linkedLength = links.reduce((sum, link) => sum + compact(link.textContent).length, 0);
      if (localLinks.length >= 5 && localLinks.length / links.length >= 0.8 && text.length && linkedLength / text.length >= 0.65) {
        contentOnlyExcluded++;
        node.remove();
      }
    });
  }
  if (scope === "main" && pageType === "mixed") {
    const ordered = [contentRoot, ...contentRoot.querySelectorAll("*")];
    const firstSection = ordered.findIndex((node) => /^H[2-6]$/.test(node.tagName));
    if (firstSection > 0) {
      for (const list of contentRoot.querySelectorAll("ul,ol")) {
        if (ordered.indexOf(list) >= firstSection) continue;
        const items = [...list.children].filter((node) => node.tagName === "LI");
        if (items.length < 8 || list.querySelector("p,h1,h2,h3,h4,h5,h6") || list.querySelectorAll("img").length > 1) continue;
        const linkedItems = items.filter((item) => item.querySelector("a[href]"));
        const textLength = compact(list.textContent).length;
        const linkLength = [...list.querySelectorAll("a[href]")].reduce((sum, link) => sum + compact(link.textContent).length, 0);
        if (linkedItems.length / items.length >= 0.8 && textLength && linkLength / textLength >= 0.65) {
          contentOnlyExcluded++;
          list.remove();
        }
      }
    }
  }
  if (pageType === "mixed") contentCardGroups = cardGroupsIn(contentRoot);
  wikiFootnoteMode = scope === "main" && pageType === "article" && /(?:^|\.)wikipedia\.org$/i.test(location.hostname);
  if (wikiFootnoteMode) {
    [...contentRoot.querySelectorAll("ol.references > li[id], .references li[id^='cite_note-']")].forEach((node, index) => {
      const id = node.getAttribute("id");
      const number = Number(id?.match(/-(\d+)$/)?.[1]) || index + 1;
      const clean = node.cloneNode(true);
      clean.querySelectorAll(".mw-cite-backlink, a[href*='#cite_ref-']").forEach((backlink) => backlink.remove());
      if (id) wikiFootnotes.set(id, { number, node: clean });
    });
  }
  let feedCount = 0;
  let posts = [];
  const feedItemName = youtubeHome ? "Видео" : "Публикация";
  if (pageType === "feed") {
    posts = [...root.querySelectorAll(feedSelector)].filter((node) =>
      isFeedPost(node) && ![...node.querySelectorAll(feedSelector)].some(isFeedPost)
    );
    feedCount = posts.length;
    if (scope === "main") posts = posts.map((post) => {
      const clean = post.cloneNode(true);
      clean.querySelectorAll("*").forEach((node) => {
        const signal = `${node.getAttribute("componentkey") || ""} ${node.getAttribute("id") || ""}`;
        if (/commentsSectionContainer|replaceableCommentTools|asyncInlineCommentBoxSlot|replaceableComment_/i.test(signal)) node.remove();
      });
      clean.querySelectorAll("a[href]").forEach((link) => {
        if (!/^\d[\d\s,.'’]*\s*(?:reactions?|likes?|comments?|views?|реакци[йия]|лайк(?:ов|а|и)?|评论|点赞)$/i.test(compact(link.textContent))) return;
        const group = link.parentElement;
        if (group && compact(group.textContent).length < 100 && !group.querySelector("p,h1,h2,h3,h4,h5,h6,img")) group.remove();
      });
      clean.querySelectorAll("button, [role='button']").forEach((node) => node.remove());
      return clean;
    });
    for (const [index, post] of posts.slice(0, 30).entries()) {
      paragraphsInSection = 0;
      const start = lines.length;
      render(post);
      if (youtubeHome) {
        const itemLines = lines.splice(start).filter((line) => !/^!\[Изображение\]\(https:\/\/yt3\.ggpht\.com\//.test(line));
        const titleIndex = itemLines.findIndex((line) => /^#{2,6} \[.+\](?:\(https:\/\/www\.youtube\.com\/(?:watch\?|shorts\/)|\[xray-link-\d+\])/.test(line));
        if (titleIndex >= 0) itemLines[titleIndex] = itemLines[titleIndex].replace(/^#{2,6} /, "### ");
        else itemLines.unshift(`### Видео ${index + 1}`, "");
        lines.push(...itemLines);
      } else lines.splice(start, 0, `### ${feedItemName} ${index + 1}`, "");
    }
    if (posts.length > 30) lines.push(`*Показаны первые 30 из ${posts.length} загруженных ${youtubeHome ? "видео" : "публикаций"}.*`, "");
    if (!posts.length) lines.push(`${youtubeHome ? "Видео" : "Публикации"} не найдены в доступном DOM. Прокрутите ленту или выберите другой тип страницы.`, "");
  } else render(contentRoot);
  const contentLines = scope === "main" ? lines.filter((line, index) =>
    !(line && line === lines[index - 2] && lines[index - 1] === "" && /!\[/.test(line))
  ) : lines;
  const findAll = (selector) => pageType === "feed" ? posts.slice(0, 30).flatMap((post) => [...post.querySelectorAll(selector)]) : [...root.querySelectorAll(selector)];

  const allHeadings = findAll("h1,h2,h3,h4,h5,h6").map((node) => compact(node.textContent)).filter(Boolean);
  const mapHeadingNodes = pageType === "feed" ? posts.slice(0, 30).flatMap((post) => [...post.querySelectorAll("h1,h2,h3,h4,h5,h6")]) : [...contentRoot.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const mapHeadings = mapHeadingNodes.map((node) => ({ label: compact(node.textContent), level: Number(node.tagName[1]) })).filter((item) => item.label);
  const headingStack = [];
  const headingTree = mapHeadings.slice(0, 40).map((item) => {
    while (headingStack.length && headingStack.at(-1) >= item.level) headingStack.pop();
    const depth = headingStack.length;
    headingStack.push(item.level);
    return `${"  ".repeat(depth)}- ${escapeInline(item.label)}`;
  });
  const selectedParagraphs = pageType === "feed" ? posts.slice(0, 30).reduce((sum, post) => sum + post.querySelectorAll("p").length, 0) : root.querySelectorAll("p").length;
  const allImages = findAll("img").map((node) => ({ alt: compact(node.getAttribute("alt")), src: safeUrl(node.getAttribute("src") || node.getAttribute("data-src")) })).filter((item) => item.src);
  const uniqueImages = groupBy(allImages, (item) => item.src);
  const images = uniqueImages.slice(0, 50);
  const allActions = findAll("button, a[href], input[type='submit'], input[type='button'], [role='button'], summary")
    .map((node) => {
      const siblings = [...(node.parentElement?.children || [])];
      const chordChoices = siblings.length >= 7 && siblings.every((sibling) =>
        /^(?:a|button)$/i.test(sibling.tagName) && /^[A-GH](?:#|b)?$/.test(compact(sibling.textContent))
      );
      const label = [node.getAttribute("aria-label"), readableText(node), node.getAttribute("title"), node.querySelector("img[alt]")?.getAttribute("alt")]
        .map((value) => compact(value?.replace(/<[^>]*>/g, "")))
        .find(Boolean) || "";
      const rawHref = node.tagName.toLowerCase() === "a" ? compact(node.getAttribute("href")) : "";
      const href = safeUrl(rawHref);
      const navigation = !!href && rawHref !== "#";
      return { label: chordChoices ? `Тональность: ${siblings.map((sibling) => compact(sibling.textContent)).join(", ")}` : label.slice(0, 90), type: chordChoices ? "Действие" : navigation ? "Ссылка" : "Действие", href: chordChoices ? "" : navigation ? href : "" };
    })
    .filter((item) => item.label);
  const uniqueActions = groupBy(allActions, (item) => `${item.type}\u0000${item.label}\u0000${item.href}`);
  const actions = uniqueActions.slice(0, 60);
  const analyzedAt = new Date();
  const technologies = sections.has("technologies") ? globalThis.pageToMarkdownDetectTechnologies(document, location, analyzedAt.toISOString()) : [];

  const title = compact(document.title) || "Страница без названия";
  const description = compact(document.querySelector('meta[name="description"]')?.content);
  const output = [`# ${escapeInline(title)}`, ""];
  const add = (heading, body) => output.push(`## ${heading}`, "", body, "");
  if (sections.has("source")) output.push(`- Источник: ${safeUrl(location.href)}`, `- Экспорт: ${humanDate(analyzedAt)}`, `- Область: ${scope === "full" ? "вся доступная страница" : main ? "основное содержимое" : "вся доступная страница (основная область не найдена)"}`, `- Тип страницы: ${pageTypeLabels[pageType]}${requestedPageType === "auto" ? " (определён по разметке)" : " (выбран вручную)"}`, "");
  if (sections.has("technologies")) add("Технологии — alpha (в разработке)", technologies.length ? [
    "Экспериментальное определение по доступным признакам; возможны пропуски и неточные выводы.", `Проверено: ${humanDate(analyzedAt)}. Выводы относятся к текущей странице; весь домен не обследовался.`, "",
    "| Технология | Тип улики | Признак | Уверенность |", "|---|---|---|---|",
    ...technologies.map((item) => `| ${escapeCell(item.name)} | ${escapeCell(item.evidenceTypes)} | ${escapeCell(item.evidence)} | ${item.confidence} |`)
  ].join("\n") : "Экспериментальное определение по доступным признакам. Технологии не определены.");
  if (sections.has("limitations")) {
    const limits = [
      `- На момент экспорта в DOM выбранной области: заголовков — ${allHeadings.length}, абзацев — ${selectedParagraphs}, изображений — ${allImages.length}.`,
      pageType === "mixed" ? `- По повторяющейся разметке выделено ${contentCardGroups.size} ${pluralRu(contentCardGroups.size, "группа", "группы", "групп")} карточек; содержимое других блоков сохранено.` : "",
      summarizedCards ? `- Кратко оформлено визуальных карточек: ${summarizedCards}; изображения остаются в исследовательском списке, если он включён.` : "",
      transientRemoved ? `- Из основного текста исключено временных сообщений загрузки: ${transientRemoved}.` : "",
      ["mixed", "app"].includes(pageType) && meaningfulInputs.length > namedInputs.length ? `- Полей без доступной подписи: ${meaningfulInputs.length - namedInputs.length}; в таблицу полей они не включены.` : "",
      pageType === "feed" ? `- В DOM найдено ${feedCount} ${youtubeHome ? "видео" : "публикаций"}; экспортировано ${Math.min(feedCount, 30)}. Лента не прокручивалась автоматически.` : "",
      youtubeHome ? "- Миниатюры YouTube могут быть фоном или загружаться позднее; отсутствие изображений в экспорте не означает их отсутствия на странице." : "",
      sourceFrames ? `- Найдено iframe: ${sourceFrames}; их содержимое не читалось.` : "- iframe в выбранной области не найдены.",
      sourceHidden || styledHidden ? `- Исключено скрытых узлов разметки: ${sourceHidden + styledHidden}. Их содержимое не анализировалось.` : "",
      excludedStructure ? `- Из основной области исключено навигационных, боковых и служебных узлов: ${excludedStructure}.` : "",
      contentOnlyExcluded ? `- Из основного текста исключено служебных элементов: ${contentOnlyExcluded}; они остаются доступны в исследовательских разделах, если включены.` : "",
      decorativeRemoved ? `- Исключено декоративных изображений: ${decorativeRemoved}.` : "",
      mapHeadings.length > 40 ? `- Карта разделов сокращена: 40 из ${mapHeadings.length} заголовков.` : "",
      uniqueImages.length > 50 ? `- Список изображений сокращён: ${50} из ${uniqueImages.length}.` : "",
      uniqueActions.length > 60 ? `- Список элементов сокращён: ${60} из ${uniqueActions.length}.` : "",
      clippedTables ? `- Таблиц с сокращением: ${clippedTables}; пропущено строк: ${clippedTableRows}.` : "",
      textMode === "brief" ? "- Выбран режим первых абзацев: остальные абзацы и сложные блоки текста не включены." : "",
      textMode === "outline" ? "- Выбран режим заголовков: основной текст не включён." : "",
      "- Экспорт основан на загруженном DOM текущей вкладки. Данные после взаимодействий и не загруженные части страницы не проверялись.",
      "- Описание изображений основано на тексте страницы; визуальное распознавание не выполнялось.",
      "- Технологии определяются по URL, ресурсам и разметке; серверные компоненты могут быть невидимы."
    ];
    add("Ограничения анализа", ["Раздел помогает оценить полноту экспорта: что было доступно, исключено или сокращено.", "", ...limits.filter(Boolean)].join("\n"));
  }
  if (sections.has("description")) add("Назначение страницы", description ? escapeInline(description) : "Описание в метаданных страницы отсутствует.");
  if (pageType === "card" && sections.has("content")) {
    const itemTitle = compact(articleRoot?.querySelector("h1")?.textContent || root.querySelector("h1")?.textContent || title);
    const published = compact(articleRoot?.querySelector("time")?.getAttribute("datetime") || articleRoot?.querySelector("time")?.textContent);
    const ogType = compact(document.querySelector('meta[property="og:type"]')?.content);
    add("Сведения о материале", [`- Название: ${escapeInline(itemTitle)}`, published ? `- Дата в разметке: ${escapeInline(published)}` : "", ogType ? `- Тип Open Graph: ${escapeInline(ogType)}` : ""].filter(Boolean).join("\n"));
  }
  if (pageType === "app" || pageType === "mixed" && interfaceFields.length) {
    if (sections.has("content")) add("Поля интерфейса", interfaceFields.length ? [
      "Значения полей не считывались. Подписи и подсказки взяты из DOM.", "",
      "| Поле | Откуда название | Тип |", "|---|---|---|", ...interfaceFields.map((field) => `| ${escapeCell(field.label)} | ${field.source} | ${escapeCell(field.type)} |`),
      meaningfulInputs.length > interfaceFields.length ? `\nПоказаны первые ${interfaceFields.length} из ${meaningfulInputs.length} полей.` : ""
    ].join("\n") : "Поля ввода в выбранной области не найдены.");
    if (sections.has("actions")) {
      const forms = [...source.querySelectorAll("form")].filter((form) => interfaceFields.some((field) => field.form === form));
      const scenarios = forms.slice(0, 12).map((form, index) => {
        const fields = interfaceFields.filter((field) => field.form === form).map((field) => field.source === "подсказка" ? `${field.type} (подсказка: ${field.label})` : field.label);
        const control = form.querySelector("button, input[type='submit']");
        const action = compact(control?.textContent || control?.getAttribute("value") || "отправка формы");
        return `- Сценарий ${index + 1}: ${fields.length ? `заполнить ${fields.map(escapeInline).join(", ")}; ` : ""}${escapeInline(action)}. Результат не проверялся.`;
      });
      add("Возможные сценарии по разметке", scenarios.length ? scenarios.join("\n") : "Формы с полями в выбранной области не найдены; доступные кнопки и ссылки перечислены ниже.");
    }
  }
  if (sections.has("content")) {
    const heading = youtubeHome && pageType === "feed" ? "Видео на главной" : { article: "Текст статьи", card: "Карточка материала", feed: "Публикации", app: "Содержание интерфейса", mixed: "Карточки и разделы" }[pageType];
    add(heading, contentLines.join("\n").trim() || "Содержимое не найдено.");
  }
  if (sections.has("map")) add("Дерево разделов (по заголовкам DOM)", headingTree.length ? [headingTree.join("\n"), mapHeadings.length > headingTree.length ? `\nПоказаны первые ${headingTree.length} из ${mapHeadings.length} заголовков.` : ""].join("") : "Заголовки секций не найдены.");
  if (sections.has("images")) add("Изображения", images.length ? [images.map((item) => `- ${item.alt ? escapeInline(item.alt) : "Без текстового описания"}: ${item.src.length > 180 ? markdownLink("Открыть изображение", item.src) : item.src}${item.count > 1 ? ` (×${item.count})` : ""}`).join("\n"), uniqueImages.length > images.length ? `\n\nПоказаны первые ${images.length} из ${uniqueImages.length} разных изображений.` : ""].join("") : "Изображения не найдены.");
  if (sections.has("actions")) {
    add("Доступные элементы", ["Ниже перечислены ссылки и элементы управления. Результат нажатия не проверялся.", "", actions.length ? ["| Элемент | Тип | Адрес перехода | Количество |", "|---|---|---|---:|", ...actions.map((item) => `| ${escapeCell(item.label)} | ${item.type} | ${item.href ? item.href.length > 180 ? markdownLink("Открыть", item.href) : escapeCell(item.href) : "—"} | ${item.count} |`)].join("\n") : "Интерактивные элементы не найдены.", uniqueActions.length > actions.length ? `\n\nПоказаны первые ${actions.length} из ${uniqueActions.length} разных элементов.` : ""].join("\n"));
  }
  if (longLinkIds.size) output.push("## Адреса длинных ссылок", "", "Полные адреса сохранены отдельно, чтобы основной текст было удобнее читать.", "", ...[...longLinkIds].map(([href, id]) => `[${id}]: <${href}>`), "");
  const markdown = output.join("\n");

  return { markdown, sections: mapHeadings.length, images: images.length, pageType, posts: feedCount };
};
