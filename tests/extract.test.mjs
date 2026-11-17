import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const fingerprintSource = readFileSync(new URL("../src/content/fingerprints.js", import.meta.url), "utf8");
const extractSource = readFileSync(new URL("../src/content/extract.js", import.meta.url), "utf8");

function exportPage(url, { assets = [], selectors = [], generator = "" } = {}) {
  const root = {
    nodeType: 1, tagName: "MAIN", children: [], childNodes: [],
    querySelectorAll: () => [], cloneNode() { return this; }
  };
  const resources = assets.map((value) => ({ getAttribute: (name) => name === "src" ? value : null }));
  const document = {
    title: "Пример страницы", body: root,
    querySelector: (selector) => selector.startsWith("main,") ? root : selector === 'meta[name="generator"]' && generator ? { content: generator } : selectors.includes(selector) ? {} : null,
    querySelectorAll: (selector) => selector === "script[src], link[href], img[src]" ? resources : []
  };
  const location = new URL(url);
  const context = { document, location, URL, Date, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  context.globalThis = context;
  runInNewContext(fingerprintSource, context);
  runInNewContext(extractSource, context);
  return context.pageToMarkdownExtract({ sections: ["source", "technologies", "limitations", "content"] }).markdown;
}

const tildaDomain = exportPage("https://project123.tilda.ws/page.html");
assert(tildaDomain.includes("| Tilda | домен | домен tilda.ws | высокая |"));
assert(tildaDomain.includes("## Технологии — alpha (в разработке)"));
assert(/- Экспорт: \d{1,2} [а-яё]+ \d{4}/i.test(tildaDomain));
assert(!/- Экспорт: \d{4}-\d{2}-\d{2}T/.test(tildaDomain));
assert(tildaDomain.indexOf("## Технологии") < tildaDomain.indexOf("## Текст статьи"));
assert(tildaDomain.indexOf("## Ограничения анализа") < tildaDomain.indexOf("## Текст статьи"));

const tildaCustom = exportPage("https://example.com/", { assets: ["https://static.tildacdn.info/js/tilda.js"], selectors: [".t-records, .t-rec[data-record-type]"] });
assert(tildaCustom.includes("| Tilda | ресурс, DOM | ресурс tildacdn; блоки t-records / t-rec | высокая |"));

const wordpress = exportPage("https://example.com/", { assets: ["https://example.com/wp-content/themes/theme/main.css"] });
assert(wordpress.includes("| WordPress | ресурс | ресурс /wp-content/ на этом домене | средняя |"));
const remoteWordpressImage = exportPage("https://example.com/", { assets: ["https://other.example/wp-content/uploads/image.jpg"] });
assert(!remoteWordpressImage.includes("| WordPress |"));

const shopify = exportPage("https://shop.example/", { assets: ["https://shop.example/cdn/shop/files/hero.jpg"], selectors: ['[id^="shopify-section-"]'] });
assert(shopify.includes("| Shopify | ресурс, DOM | ресурс /cdn/shop/ на этом домене; секция shopify-section | высокая |"));

const next = exportPage("https://app.example/", { selectors: ["script#__NEXT_DATA__"] });
assert(/\| Next\.js \| .* \| высокая \|/.test(next));

const mediaWiki = exportPage("https://wiki.example/wiki/Ship", { generator: "MediaWiki 1.48.0", selectors: [".mw-parser-output"] });
assert(mediaWiki.includes('MediaWiki | метатег, DOM | meta\\[name="generator"\\]: MediaWiki 1.48.0; разметка mw-parser-output | высокая |'));
assert(mediaWiki.includes("Выводы относятся к текущей странице; весь домен не обследовался."));

const pathOnly = exportPage("https://example.com/tilda-article");
assert(pathOnly.includes("Технологии не определены."));
console.log("Technology fingerprints, evidence and report order: OK");
