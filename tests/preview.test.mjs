import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class FakeText {
  constructor(value) { this.value = value; this.tagName = "#text"; }
  get textContent() { return this.value; }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.classList = { add() {} };
    this.disabled = false;
    this.value = "";
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  addEventListener() {}
  set textContent(value) { this.children = [new FakeText(value)]; }
  get textContent() { return this.children.map((child) => child.textContent).join(""); }
}

const elements = Object.fromEntries(["raw", "rendered", "status", "document-name", "download"].map((id) => [id, new FakeElement("div")]));
const document = {
  title: "",
  body: new FakeElement("body"),
  getElementById: (id) => elements[id],
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (value) => new FakeText(value)
};
const id = "12345678-1234-1234-1234-123456789abc";
const markdown = [
  "# Заголовок",
  "",
  "Текст с [ссылкой](https://example.com/) и <script>опасным HTML</script>.",
  "Длинный адрес: [открыть][xray-link-1].",
  "",
  "Это **жирный** и *курсив* с `кодом`.",
  "",
  "| Поле | Значение |",
  "|---|---|",
  "| Один | Два |",
  "",
  "```",
  "const answer = 42;",
  "```",
  "",
  "Факт[^4].",
  "",
  "[^4]: [Источник](https://example.com/source)",
  "",
  "[xray-link-1]: <https://example.com/a-very-long-address?utm_source=sample>"
].join("\n");
const context = {
  document, URL, Blob, crypto,
  location: { hash: `#${id}` },
  chrome: { storage: { session: { get: async () => ({ [`preview:${id}`]: { markdown, filename: "sample" } }) } } }
};
runInNewContext(readFileSync(new URL("../src/preview/preview.js", import.meta.url), "utf8"), context);
await new Promise((resolve) => setTimeout(resolve, 0));

const descendants = (element) => element.children.flatMap((child) => [child, ...("children" in child ? descendants(child) : [])]);
const tags = descendants(elements.rendered).map((element) => element.tagName);
assert(tags.includes("H1"));
assert(tags.includes("TABLE"));
assert(tags.includes("A"));
assert(tags.includes("PRE"));
assert(tags.includes("STRONG"));
assert(tags.includes("EM"));
assert(tags.filter((tag) => tag === "CODE").length >= 2);
assert(descendants(elements.rendered).some((element) => element.tagName === "A" && element.href === "#footnote-4"));
assert(descendants(elements.rendered).some((element) => element.tagName === "A" && element.href === "https://example.com/a-very-long-address?utm_source=sample" && element.textContent === "открыть"));
assert(descendants(elements.rendered).some((element) => element.tagName === "P" && element.id === "footnote-4"));
assert(!tags.includes("SCRIPT"));
assert(elements.rendered.textContent.includes("<script>опасным HTML</script>"));
assert.equal(elements.raw.textContent, markdown);
assert.equal(elements.download.disabled, false);
console.log("Preview rendering and HTML safety: OK");
