import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const extractSource = readFileSync(new URL("../src/content/extract.js", import.meta.url), "utf8");

const text = (value) => ({ nodeType: 3, textContent: value });

function element(tagName, childNodes = [], attributes = {}) {
  const node = {
    nodeType: 1, tagName: tagName.toUpperCase(), childNodes, attributes,
    get parentElement() { return this.parent ?? null; },
    get children() { return this.childNodes.filter((child) => child.nodeType === 1); },
    get textContent() { return this.childNodes.map((child) => child.textContent).join(""); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    closest(selector) {
      for (let current = this.parent; current; current = current.parent) {
        if (selector === "a[href], figure" && (current.tagName === "A" && current.getAttribute("href") || current.tagName === "FIGURE")) return current;
        if (selector === "a[href]" && current.tagName === "A" && current.getAttribute("href")) return current;
        if (selector === "form" && current.tagName === "FORM") return current;
      }
      return null;
    },
    querySelectorAll(selector) {
      const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
      if (selector === "*") return descendants;
      if (selector === "h1") return descendants.filter((child) => child.tagName === "H1");
      if (selector === "article") return descendants.filter((child) => child.tagName === "ARTICLE");
      if (selector === "section") return descendants.filter((child) => child.tagName === "SECTION");
      if (selector === "p") return descendants.filter((child) => child.tagName === "P");
      if (selector === "h1,h2,h3,h4,h5,h6") return descendants.filter((child) => /^H[1-6]$/.test(child.tagName));
      if (selector === "h2,h3,h4,h5,h6") return descendants.filter((child) => /^H[2-6]$/.test(child.tagName));
      if (selector === "div, section, ul, ol") return descendants.filter((child) => ["DIV", "SECTION", "UL", "OL"].includes(child.tagName));
      if (selector === "div,section,nav") return descendants.filter((child) => ["DIV", "SECTION", "NAV"].includes(child.tagName));
      if (selector === "ul,ol,table") return descendants.filter((child) => ["UL", "OL", "TABLE"].includes(child.tagName));
      if (selector === "ul,ol") return descendants.filter((child) => ["UL", "OL"].includes(child.tagName));
      if (selector === "p,h1,h2,h3,h4,h5,h6") return descendants.filter((child) => child.tagName === "P" || /^H[1-6]$/.test(child.tagName));
      if (selector === "a[href*='/watch'], a[href*='/shorts/']") return descendants.filter((child) => child.tagName === "A" && /\/(?:watch|shorts\/)/.test(child.getAttribute("href") || ""));
      if (selector === "ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer") return descendants.filter((child) => /^YTD-(?:AD-SLOT|DISPLAY-AD|PROMOTED-VIDEO)-RENDERER$/.test(child.tagName));
      if (selector === "h2,h3") return descendants.filter((child) => /^H[23]$/.test(child.tagName));
      if (selector === "a[href*='#cite_note-']") return descendants.filter((child) => child.tagName === "A" && child.getAttribute("href")?.includes("#cite_note-"));
      if (selector === "ol.references > li[id], .references li[id^='cite_note-']") return descendants.filter((child) => child.tagName === "LI" && child.getAttribute("id")?.startsWith("cite_note-"));
      if (selector === "ol.references") return descendants.filter((child) => child.tagName === "OL" && (child.getAttribute("class") || "").split(/\s+/).includes("references"));
      if (selector === ".mw-cite-backlink, a[href*='#cite_ref-']") return descendants.filter((child) => (child.getAttribute("class") || "").includes("mw-cite-backlink") || child.tagName === "A" && child.getAttribute("href")?.includes("#cite_ref-"));
      if (selector.startsWith("section.noprint,")) return descendants.filter((child) => child.tagName === "SECTION" && (child.getAttribute("class") || "").includes("noprint") || (child.getAttribute("class") || "").includes("jp-share"));
      if (selector.startsWith("button, [role='button']")) return descendants.filter((child) => child.tagName === "BUTTON" || child.getAttribute("role") === "button" || child.tagName === "A" && ["#", "javascript:void(0)"].includes(child.getAttribute("href")));
      if (selector === "pre,audio,video") return descendants.filter((child) => ["PRE", "AUDIO", "VIDEO"].includes(child.tagName));
      if (selector === "tr") return descendants.filter((child) => child.tagName === "TR");
      if (selector === "input, textarea, select" || selector === "input,textarea,select") return descendants.filter((child) => ["INPUT", "TEXTAREA", "SELECT"].includes(child.tagName));
      if (selector === "form") return descendants.filter((child) => child.tagName === "FORM");
      if (selector === "button, input[type='submit']") return descendants.filter((child) => child.tagName === "BUTTON" || child.tagName === "INPUT" && child.getAttribute("type") === "submit");
      if (selector.startsWith("[role='article']")) return descendants.filter((child) => child.getAttribute("role") === "article" || selector.includes("ytd-rich-item-renderer") && ["YTD-RICH-ITEM-RENDERER", "YTD-VIDEO-RENDERER", "YTD-GRID-VIDEO-RENDERER"].includes(child.tagName));
      if (selector === "a[href]") return descendants.filter((child) => child.tagName === "A" && child.getAttribute("href"));
      if (selector === "img") return descendants.filter((child) => child.tagName === "IMG");
      if (selector === "img[alt]") return descendants.filter((child) => child.tagName === "IMG" && child.getAttribute("alt"));
      if (selector.startsWith("button, a[href]")) return descendants.filter((child) => child.tagName === "BUTTON" || child.tagName === "A");
      if (selector.startsWith("script, style")) return descendants.filter((child) => child.tagName === "NAV" || child.getAttribute("role") === "dialog");
      if (selector.startsWith("#p-lang,")) return descendants.filter((child) => ["p-lang", "p-lang-btn"].includes(child.getAttribute("id")) || /(?:vector-page-toolbar|vector-column-end|mw-editsection)/.test(child.getAttribute("class") || ""));
      return [];
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    cloneNode() { return element(this.tagName, this.childNodes.map((child) => child.nodeType === 3 ? text(child.textContent) : child.cloneNode(true)), { ...this.attributes }); },
    remove() { this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this); }
  };
  for (const child of childNodes) if (child.nodeType === 1) child.parent = node;
  return node;
}

function exportFixture(hasMain, extra = 0, url = "https://example.com/page", options = {}) {
  const body = element("body", [
    element("nav", [element("a", [text("Меню")], { href: "/menu" })]),
    element("div", [element("a", [text("Войти")], { href: "/login" }), element("a", [text("EN")], { href: "/en" })]),
    element("main", [
      element("h1", [text("Пример материала")]),
      element("div", [element("a", [text("Français")], { href: "/fr" })], { id: "p-lang-btn" }),
      element("div", [element("a", [text("Редактировать")], { href: "/edit" })], { class: "vector-page-toolbar" }),
      element("img", [], { src: "/star.svg", alt: "" }),
      element("img", [], { src: "/photo.jpg", alt: "" }),
      element("p", [text("Прослушали: "), element("strong", [text("2 563")]), element("span", [text("Скачали: ")]), element("strong", [text("1 682")])]),
      element("p", [element("img", [], { src: "/banner.png", alt: "Баннер" })]),
      element("p", [element("img", [], { src: "/banner.png", alt: "Баннер" })]),
      element("a", [element("img", [], { src: "/cover.jpg", alt: "Обложка" })], { href: "/cover", "aria-label": '<img src="cover.jpg">' }),
      element("h2", [text("Публикация")]), element("h2", [text("Публикация")]),
      element("a", [text("Поделиться")], { href: "/share" }),
      element("a", [text("Поделиться")], { href: "/share" }),
      element("a", [text("Увеличить шрифт")], { href: "javascript:void(0)" }),
      element("a", [text("Тональность")], { href: "#" }),
      element("div", ["A", "A#", "Bb", "H", "C", "C#", "D", "E"].map((note) => element("a", [text(note)], { href: "#" }))),
      element("button", [text("Сохранить")]),
      element("div", [element("button", [text("Закрыть")])], { role: "dialog" }),
      ...Array.from({ length: extra }, (_, index) => element("a", [text(`Ссылка ${index}`)], { href: `/item/${index}` })),
      ...Array.from({ length: extra }, (_, index) => element("img", [], { src: `/image/${index}.png`, alt: `Фото ${index}` })),
      ...Array.from({ length: extra }, (_, index) => element("h2", [text(`Раздел ${index}`)]))
    ])
  ]);
  const document = {
    title: "Пример", body,
    querySelector(selector) { return selector.startsWith("main,") && hasMain ? body.children[2] : null; }
  };
  const context = { document, location: new URL(url), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  context.globalThis = context;
  context.pageToMarkdownDetectTechnologies = () => [];
  runInNewContext(extractSource, context);
  return context.pageToMarkdownExtract({ scope: "main", sections: ["source", "limitations", "content", "map", "images", "actions"], ...options }).markdown;
}

const withMain = exportFixture(true);
assert(withMain.includes("Прослушали: **2 563** Скачали: **1 682**"));
assert(withMain.includes("- Область: основное содержимое"));
assert(withMain.includes("## Доступные элементы"));
assert(withMain.includes("| Обложка | Ссылка | https://example.com/cover | 1 |"));
assert(withMain.includes("| Поделиться | Ссылка | https://example.com/share | 2 |"));
assert(withMain.includes("| Увеличить шрифт | Действие | — | 1 |"));
assert(withMain.includes("| Тональность | Действие | — | 1 |"));
assert(withMain.includes("| Тональность: A, A#, Bb, H, C, C#, D, E | Действие | — | 8 |"));
assert(withMain.includes("- Пример материала\n  - Публикация\n  - Публикация"));
assert(withMain.includes("- Обложка: https://example.com/cover.jpg"));
assert(withMain.includes("- Без текстового описания: https://example.com/photo.jpg"));
assert(withMain.includes("- Баннер: https://example.com/banner.png (×2)"));
assert.equal(withMain.split("![Баннер](https://example.com/banner.png)").length - 1, 1);
assert(!withMain.includes("star.svg"));
assert(!withMain.includes("| Меню | Ссылка |"));
assert(!withMain.includes("| Закрыть | Действие |"));

const withoutMain = exportFixture(false);
assert(withoutMain.includes("- Область: вся доступная страница (основная область не найдена)"));
assert(!withoutMain.includes("| Меню | Ссылка |"));
assert(!withoutMain.includes("| Войти | Ссылка |"));
assert(!withoutMain.includes("| EN | Ссылка |"));

function exportPageBody(body) {
  const document = { title: "Главная", body, querySelector: () => null };
  const context = { document, location: new URL("https://example.com/"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  context.globalThis = context;
  context.pageToMarkdownDetectTechnologies = () => [];
  runInNewContext(extractSource, context);
  return context.pageToMarkdownExtract({ scope: "main", sections: ["source", "content", "map"] }).markdown;
}

const landingPage = element("body", [
  element("nav", [element("a", [text("Меню")], { href: "/menu" })]),
  element("section", [element("h2", [text("О компании")]), element("p", [text("Мы производим деревянные изделия и строим террасы.")])]),
  element("section", [element("h2", [text("Услуги")]), element("p", [text("Монтаж, отделка и проектирование для дома и сада.")])]),
  ...["Первый блог", "Второй блог", "Третий блог"].map((title) => element("article", [
    element("h3", [text(title)]), element("p", [text(`Описание: ${title}.`)])
  ]))
]);
const landingReport = exportPageBody(landingPage);
assert(landingReport.includes("- Тип страницы: Страница с карточками"));
assert(landingReport.includes("О компании"));
assert(landingReport.includes("Монтаж, отделка и проектирование"));
assert(landingReport.includes("Первый блог"));
assert(landingReport.includes("Третий блог"));
assert(!landingReport.includes("Меню"));

const primaryArticle = element("article", [
  element("h1", [text("Большая статья")]),
  ...[1, 2, 3].map((number) => element("p", [text(`Основной абзац ${number}: подробное содержимое материала для читателя.`)]))
]);
const articleWithRecommendation = element("body", [
  primaryArticle,
  element("article", [element("h3", [text("Похожая запись")]), element("p", [text("Краткая рекомендация.")])])
]);
const articleReport = exportPageBody(articleWithRecommendation);
assert(articleReport.includes("- Тип страницы: Статья"));
assert(articleReport.includes("Основной абзац 3"));
assert(!articleReport.includes("Похожая запись"));

const songArticle = element("article", [
  element("h1", [text("Песня с аккордами")]),
  element("pre", [text("Em  D\nСтрока песни")])
]);
const songBody = element("body", [
  element("form", [element("input", [], { placeholder: "Логин" })]),
  songArticle,
  ...["Похожая песня 1", "Похожая песня 2", "Похожая песня 3"].map((title) =>
    element("article", [element("h2", [text(title)]), element("p", [text("Краткое описание рекомендации")])]))
]);
const songReport = exportPageBody(songBody);
assert(songReport.includes("Песня с аккордами"));
assert(songReport.includes("Строка песни"));
assert(!songReport.includes("Похожая песня 1"));
assert(!songReport.includes("Логин"));

const wiki = exportFixture(true, 0, "https://ru.wikipedia.org/wiki/example");
assert(wiki.includes("## Пример материала"));
assert(!wiki.includes("Français"));
assert(!wiki.includes("Редактировать"));
const longPage = exportFixture(true, 65);
assert(longPage.includes("Показаны первые 40 из 68 заголовков."));
assert(longPage.includes("Показаны первые 50 из 68 разных изображений."));
assert(longPage.includes("Показаны первые 60 из 73 разных элементов."), longPage.match(/Показаны первые 60 из \d+ разных элементов\./)?.[0]);
assert(!longPage.includes("| Ссылка 64 |"));
assert(longPage.includes("Список элементов сокращён: 60 из 73."));
assert(longPage.includes("Список изображений сокращён: 50 из 68."));
const cardReport = exportFixture(true, 0, "https://example.com/page", { pageType: "card" });
assert(cardReport.includes("## Сведения о материале"));
assert(!cardReport.split("## Карточка материала")[1].split("## Дерево разделов")[0].includes("Увеличить шрифт"));
assert(cardReport.includes("| Увеличить шрифт | Действие |"));
assert(exportFixture(true, 0, "https://example.com/page", { pageType: "app" }).includes("## Возможные сценарии по разметке"));

const feedBody = element("body", [element("main", [
  element("div", [element("h2", [text("Боковая рекомендация")]), element("p", [text("Не входит в посты")])]),
  element("div", [element("h2", [text("Первый автор")]), element("p", [text("Первое содержимое публикации с достаточно длинным текстом для проверки отдельного блока.")]), element("div", [text("Комментарий, не относящийся к публикации")], { componentkey: "commentsSectionContainer123" }), element("div", [text("Follow")], { role: "button" }), element("div", [element("span", [text("45")]), element("a", [text("45 reactions")], { href: "/reactions" })])], { role: "article" }),
  element("div", [element("h2", [text("Второй автор")]), element("p", [text("Второе содержимое публикации с достаточно длинным текстом для проверки отдельного блока.")])], { role: "article" })
])]);
const feedDocument = {
  title: "Лента", body: feedBody,
  querySelector(selector) { return selector.startsWith("main,") ? feedBody.children[0] : null; },
  querySelectorAll(selector) { return feedBody.querySelectorAll(selector); }
};
const feedContext = { document: feedDocument, location: new URL("https://example.com/feed"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
feedContext.globalThis = feedContext;
feedContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, feedContext);
const feedResult = feedContext.pageToMarkdownExtract({ sections: ["source", "content", "map"] });
assert.equal(feedResult.pageType, "feed");
assert.equal(feedResult.posts, 2);
assert(feedResult.markdown.includes("### Публикация 1"));
assert(feedResult.markdown.includes("### Публикация 2"));
assert(!feedResult.markdown.includes("Боковая рекомендация"));
assert(!feedResult.markdown.includes("Комментарий, не относящийся к публикации"));
assert(!feedResult.markdown.includes("Follow"));
assert(!feedResult.markdown.includes("45 reactions"));
assert(feedResult.markdown.includes("Первое содержимое публикации"));
const youtubeMain = element("main", [
  element("button", [text("Previous")]),
  element("ytd-rich-item-renderer", [element("img", [], { src: "https://yt3.ggpht.com/avatar" }), element("h3", [element("a", [text("Первое видео")], { href: "/watch?v=one" })]), element("div", [text("Первый канал · 2 дня назад")])]),
  element("ytd-rich-item-renderer", [element("h3", [element("a", [text("Второе видео")], { href: "/shorts/two" })])]),
  element("ytd-rich-item-renderer", [element("ytd-ad-slot-renderer", [element("a", [text("Реклама")], { href: "/watch?v=ad" })])])
]);
const youtubeBody = element("body", [youtubeMain]);
const youtubeDocument = { title: "YouTube", body: youtubeBody, querySelector(selector) { return selector.startsWith("main,") ? youtubeMain : null; }, querySelectorAll(selector) { return youtubeBody.querySelectorAll(selector); } };
const youtubeContext = { document: youtubeDocument, location: new URL("https://www.youtube.com/"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
youtubeContext.globalThis = youtubeContext;
youtubeContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, youtubeContext);
const youtubeResult = youtubeContext.pageToMarkdownExtract({ sections: ["source", "limitations", "content", "map", "images"] });
assert.equal(youtubeResult.pageType, "feed");
assert.equal(youtubeResult.posts, 2);
assert(youtubeResult.markdown.includes("## Видео на главной"));
assert(youtubeResult.markdown.includes("### [Первое видео](https://www.youtube.com/watch?v=one)"));
assert(youtubeResult.markdown.includes("### [Второе видео](https://www.youtube.com/shorts/two)"));
assert(!youtubeResult.markdown.includes("### Видео 1"));
assert(!youtubeResult.markdown.split("## Видео на главной")[1].split("## Дерево разделов")[0].includes("yt3.ggpht.com"));
assert(youtubeResult.markdown.split("## Изображения")[1].includes("yt3.ggpht.com"));
assert(!youtubeResult.markdown.includes("Previous"));
assert(!youtubeResult.markdown.includes("Реклама"));
const appBody = element("body", [element("main", [
  element("form", [element("input", [], { type: "text", "aria-label": "Адрес сайта" }), element("button", [text("Искать")])]),
  element("form", [element("input", [], { type: "hidden" })])
])]);
const appDocument = { title: "Поиск", body: appBody, querySelector(selector) { return selector.startsWith("main,") ? appBody.children[0] : null; } };
const appContext = { document: appDocument, location: new URL("https://example.com/search"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
appContext.globalThis = appContext;
appContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, appContext);
const appReport = appContext.pageToMarkdownExtract({ pageType: "app", sections: ["content", "actions"] }).markdown;
assert(appReport.includes("Сценарий 1: заполнить Адрес сайта; Искать."));
assert(!appReport.includes("Сценарий 2"));
const placeholderMain = element("main", [element("form", [
  element("input", [], { type: "email", placeholder: "you@company.com" }),
  element("input", [], { type: "password", placeholder: "At least 8 characters" }),
  element("button", [text("Sign in")])
])]);
const placeholderBody = element("body", [placeholderMain]);
const placeholderDocument = { title: "Sign in", body: placeholderBody, querySelector(selector) { return selector.startsWith("main,") ? placeholderMain : null; }, querySelectorAll(selector) { return placeholderBody.querySelectorAll(selector); } };
const placeholderContext = { document: placeholderDocument, location: new URL("https://example.com/login"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
placeholderContext.globalThis = placeholderContext;
placeholderContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, placeholderContext);
const placeholderReport = placeholderContext.pageToMarkdownExtract({ sections: ["content", "actions"] }).markdown;
assert(placeholderReport.includes("| you@company.com | подсказка | email |"));
assert(placeholderReport.includes("заполнить email (подсказка: you@company.com), password (подсказка: At least 8 characters); Sign in"));

const mixedMain = element("main", [
  element("section", [
    ...["Быстрая доставка", "Семейные товары", "Подарки"].map((name, index) =>
      element("a", [element("h2", [text(name)]), element("img", [], { src: `/promo-${index}.jpg`, alt: name }), element("span", [text("Акция")])], { href: `/offers/${index}` }))
  ]),
  element("section", [
    ...["Free", "Startup", "Business"].map((name, index) =>
      element("div", [element("h3", [text(name)]), element("p", [text(`${index * 100} долларов в месяц`)]), element("ul", [element("li", [text("Условия плана")])]), element("a", [text("Получить доступ")], { href: `/plans/${index}` })]))
  ]),
  element("table", [element("tr", [element("th", [text("Параметр")]), element("th", [text("Free")])]), element("tr", [element("td", [text("Сессии")]), element("td", [text("1000")])])]),
  element("select", [element("option", [text("Внутренняя настройка")])])
]);
const mixedBody = element("body", [mixedMain]);
const mixedDocument = { title: "Каталог и тарифы", body: mixedBody, querySelector(selector) { return selector.startsWith("main,") ? mixedMain : null; }, querySelectorAll(selector) { return mixedBody.querySelectorAll(selector); } };
const mixedContext = { document: mixedDocument, location: new URL("https://example.com/"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
mixedContext.globalThis = mixedContext;
mixedContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, mixedContext);
const mixedResult = mixedContext.pageToMarkdownExtract({ sections: ["source", "limitations", "content", "images"] });
assert.equal(mixedResult.pageType, "mixed");
assert(mixedResult.markdown.includes("## Карточки и разделы"));
assert(mixedResult.markdown.includes("[Быстрая доставка](https://example.com/offers/0)"));
assert(mixedResult.markdown.includes("Кратко оформлено визуальных карточек: 3"));
assert(mixedResult.markdown.includes("100 долларов в месяц"));
assert(mixedResult.markdown.includes("| Параметр | Free |"));
assert(!mixedResult.markdown.includes("## Поля интерфейса"));
assert(mixedResult.markdown.includes("По повторяющейся разметке выделено 2 группы карточек"));
const articleMain = element("main", [
  element("article", [element("h1", [text("Большая статья")]), ...Array.from({ length: 3 }, () => element("p", [text("Подробное содержание основного материала занимает большую часть страницы и содержит связный текст.")]))]),
  element("section", ["Похожий материал 1", "Похожий материал 2", "Похожий материал 3"].map((title, index) =>
    element("a", [element("h3", [text(title)]), element("img", [], { src: `/related-${index}.jpg`, alt: title })], { href: `/related/${index}` })))
]);
const articleBody = element("body", [articleMain]);
const articleDocument = { title: "Большая статья", body: articleBody, querySelector(selector) { return selector.startsWith("main,") ? articleMain : null; }, querySelectorAll(selector) { return articleBody.querySelectorAll(selector); } };
const articleContext = { document: articleDocument, location: new URL("https://example.com/article"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
articleContext.globalThis = articleContext;
articleContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, articleContext);
assert.equal(articleContext.pageToMarkdownExtract({ sections: ["source", "content"] }).pageType, "article");

const longArticle = element("article", [
  element("h1", [text("Длинный материал")]),
  element("div", [text("On this page "), ...Array.from({ length: 5 }, (_, index) =>
    element("a", [text(`Раздел ${index + 1}`)], { href: `#section-${index + 1}` }))]),
  ...Array.from({ length: 6 }, (_, index) => element("p", [text(`Абзац ${index + 1}: содержательный текст статьи с объяснением темы и важными деталями.`)])),
  element("section", [element("h2", [text("Comments")]), element("p", [text("No comments yet")])])
]);
const articleAndCards = element("main", [longArticle,
  ...Array.from({ length: 4 }, (_, index) => element("article", [element("h2", [text(`Рекомендация ${index + 1}`)]), element("p", [text("Короткая аннотация")])]))
]);
const articleAndCardsBody = element("body", [articleAndCards]);
const articleAndCardsDocument = { title: "Длинный материал", body: articleAndCardsBody,
  querySelector(selector) { return selector.startsWith("main,") ? articleAndCards : null; },
  querySelectorAll(selector) { return articleAndCardsBody.querySelectorAll(selector); } };
const articleAndCardsContext = { document: articleAndCardsDocument, location: new URL("https://example.com/story"), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
articleAndCardsContext.globalThis = articleAndCardsContext;
articleAndCardsContext.pageToMarkdownDetectTechnologies = () => [];
runInNewContext(extractSource, articleAndCardsContext);
const cleanArticle = articleAndCardsContext.pageToMarkdownExtract({ sections: ["source", "content", "map"] });
assert.equal(cleanArticle.pageType, "article");
assert(cleanArticle.markdown.includes("Абзац 6"));
assert(!cleanArticle.markdown.includes("Рекомендация 1"));
assert(!cleanArticle.markdown.includes("No comments yet"));
assert(!cleanArticle.markdown.includes("On this page"));

function extractFromMain(main, url, sections, options = {}) {
  const body = element("body", [main]);
  const document = { title: "Материал", body, querySelector(selector) { return selector.startsWith("main,") ? main : null; } };
  const context = { document, location: new URL(url), URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  context.globalThis = context;
  context.pageToMarkdownDetectTechnologies = () => [];
  runInNewContext(extractSource, context);
  return context.pageToMarkdownExtract({ scope: "main", sections, ...options }).markdown;
}

const longDestination = `https://example.com/item?context=${"a".repeat(190)}`;
const cleaned = extractFromMain(element("main", [
  element("h1", [text("Материал")]),
  element("span", [text("Video Player is loading.")]),
  element("p", [element("span", [text("Video Player is loading.")])]),
  element("a", [text("Открыть материал")], { href: longDestination })
]), "https://example.com/", ["source", "content", "actions", "limitations"]);
assert(cleaned.includes("[Открыть материал][xray-link-1]"));
assert(cleaned.includes(`[xray-link-1]: <${longDestination}>`));
assert(cleaned.includes("Из основного текста исключено временных сообщений загрузки: 2"));
assert(!cleaned.split("## Текст статьи")[1].split("## Доступные элементы")[0].includes("Video Player is loading."));

const navigationList = element("ul", Array.from({ length: 9 }, (_, index) =>
  element("li", [element("a", [text(`Категория ${index + 1}`)], { href: `/category/${index + 1}` })])));
const mixedWithoutNavigation = extractFromMain(element("main", [
  element("h1", [text("Каталог")]), navigationList,
  element("h2", [text("Предложения")]), element("p", [text("Полезное описание предложений")])
]), "https://example.com/", ["content"], { pageType: "mixed" });
assert(!mixedWithoutNavigation.includes("Категория 1"));
assert(mixedWithoutNavigation.includes("Полезное описание предложений"));

const readable = extractFromMain(element("main", [
  element("h1", [text("Песня")]), element("p", [text("Главный текст песни остаётся на месте.")]),
  element("h2", [text("Куплет")]), element("h3", [text("Первая часть")]),
  element("section", [element("h2", [text("Похожие")]), element("a", [text("Другая песня")], { href: "/other" })], { class: "noprint" }),
  element("div", [element("h3", [text("Share")]), element("a", [text("Поделиться")], { href: "/share" })], { class: "jp-share" })
]), "https://example.com/songs/example", ["content", "map", "actions", "limitations"]);
assert(readable.includes("Главный текст песни остаётся на месте."));
assert(!readable.split("## Текст статьи")[1].split("## Дерево разделов")[0].includes("Другая песня"));
assert(!readable.split("## Дерево разделов")[1].split("## Доступные элементы")[0].includes("Похожие"));
assert(readable.includes("- Песня\n  - Куплет\n    - Первая часть"));
assert(readable.includes("| Другая песня | Ссылка | https://example.com/other |"));

const wikiReadable = extractFromMain(element("main", [
  element("h1", [text("Корабль")]),
  element("table", [element("tr", [element("td", [text("Длина"), element("sup", [element("a", [text("[2]")], { href: "#cite_note-length-2" })])])])]),
  element("p", [text("Проверенный факт"), element("sup", [element("a", [text("[1]")], { href: "#cite_note-source-1" })])]),
  element("h2", [text("Примечания")]),
  element("ol", [element("li", [
    element("span", [element("a", [text("↑")], { href: "#cite_ref-source-1" })], { class: "mw-cite-backlink" }),
    element("span", [element("a", [text("Источник")], { href: "https://source.example/item" })], { class: "reference-text" })
  ], { id: "cite_note-source-1" }), element("li", [element("span", [text("Другой источник")], { class: "reference-text" })], { id: "cite_note-length-2" })], { class: "references" })
]), "https://ru.wikipedia.org/wiki/Ship", ["content", "map"]);
assert(wikiReadable.includes("Проверенный факт [^1]"));
assert(wikiReadable.includes("Длина [^2]"));
assert(wikiReadable.includes("[^1]: [Источник](https://source.example/item)"));
assert(wikiReadable.includes("[^2]: Другой источник"));
assert(!wikiReadable.includes("Обратно к тексту"));
console.log("Markdown spacing, action labels and actual scope: OK");
