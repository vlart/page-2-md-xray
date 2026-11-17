# Page to Markdown X-Ray

Turn a web page into readable Markdown, preserving its content, links, images, and page structure.

Version 0.11.1 is a Chrome extension that exports the current HTTP(S) page to a Markdown file. Analysis runs locally in the browser; page content is not sent to an external API. Images may be fetched again from their original websites when you open the preview.

## Features

- A popup for choosing the file name and export scope.
- A page-type dropdown with a tooltip. Choose automatic detection or select article, content item, feed, card-based page, or web app.
- Checkboxes for report sections and three text modes: full text, first paragraphs of each section, or headings only. The first-paragraph mode does not generate a summary.
- A **Preview** button that opens a tab with raw Markdown on the left and a rendered view on the right. You can also download the `.md` file from that tab.
- Extraction of headings, paragraphs, lists, tables, code blocks, links, and images from the DOM.
- A heading tree and an image list based on the available markup.
- A list of links and controls within the selected scope, without claiming to know the result of an action.
- Experimental technology detection with evidence and confidence levels. The local rules recognize Tilda, WordPress, Shopify, Webflow, Next.js, Nuxt, MediaWiki, and some React signals. A match in a URL path alone is not treated as proof.

Technology findings and analysis limitations can appear at the top of the Markdown report. Describing images by their visual content and recording interactions remain future work. Page screenshots are outside the export plan.

## Development

The repository contains the extension source, icons, and tests. Release archives in `dist/` are generated locally and excluded from Git. No build step or external dependencies are required: Chrome loads the extension directly from the project root.

Run the tests before sharing changes:

```sh
node --test tests/*.test.mjs
```

For a first commit, review `git status --short`, add the files you want to publish, and create a commit. The `origin` remote is already configured; pushing to GitHub is a separate step.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the project root.
4. Open a regular web page and click the extension icon.

After editing the source, click **Reload** on the extension card.

## Project structure

- `manifest.json` — Manifest V3 configuration and minimal permissions.
- `src/popup/` — popup interface and Markdown download.
- `src/content/fingerprints.js` — extensible local technology-detection rules.
- `src/content/extract.js` — page extraction and Markdown generation.
- `src/preview/` — side-by-side Markdown preview.
- `assets/` — Chrome icons and interface artwork.
- `tests/` — extraction, export-quality, and preview tests.
- `TODO.md` — development plan.

The editable logo source is `assets/xray-logo.svg`. It contains the full logo and a compact X-and-scan-mark symbol for small sizes. Chrome and the popup use ready-made PNGs from `assets/`; editing the SVG does not automatically update those PNGs. The original visual reference is `assets/logo-source.jpeg`.

## Current limitations

- The extension works only on `http://` and `https://` pages accessible to Chrome extensions.
- It does not inspect iframe content, hidden states, or the outcomes of clicks.
- Markdown images remain links to the original website. Viewing them later may require an internet connection or authentication.
- The preview keeps Markdown in `chrome.storage.session`. This data is cleared when the browser restarts or the extension reloads; older preview drafts are removed when a new preview is created after an hour.
- The built-in renderer supports the Markdown produced by the exporter: headings, paragraphs, lists, tables, links, images, quotes, and code blocks. It may not render arbitrary Markdown completely.
- Technology detection is experimental and cannot reveal hidden server-side components.

## Technology detection

The local rules examine the page domain, `meta[name="generator"]`, loaded resource URLs, and distinctive DOM elements. Each match is kept as separate evidence. A total weight of 1 means low confidence, 2 means medium confidence, and 3 or more means high confidence. A third-party resource may be an embedded widget, so interpret findings alongside their evidence. The analysis does not call an external API.

## Prepare a ZIP for the Chrome Web Store

After testing, run this from the project root:

```sh
zip -r /tmp/page-to-markdown-xray.zip manifest.json src assets
```

`manifest.json` must be at the root of the archive.

## Release notes

- **0.11.1:** Detects a dominant long article by its structure and share of the main text, even when recommendation cards are nearby. In the main-content mode, removes recommendations outside the article, short comment blocks, anchor-link tables of contents, feed buttons, and reaction counts. These rules use page structure rather than site-specific domains.
- **0.11.0:** Removes isolated comment threads inside feed posts, dense navigation lists before card-based sections, and nested loading messages from main content. The whole-page mode retains the available DOM text.
- **0.10.9:** When multiple `<article>` elements exist, selects a primary item with a first-level heading and substantial text or media. This preserves the compact KG-MUSIC song export after improvements to home pages such as Woodlebs.
- **0.10.8:** Keeps the page-type tooltip within the settings panel when switching languages.
- **0.10.7:** Adds English, Russian, and Chinese UI choices at the top of the popup. The initial choice follows the browser language and is saved in `chrome.storage.local`. Popup labels, the tooltip, and messages are translated; generated Markdown and the preview interface remain in Russian.
- **0.10.5:** Prefers semantic `<main>` or `[role="main"]` over the first `<article>`. Without a main container, selects a single article only when it contains most of the visible text. Otherwise, analyzes the cleaned full page. This fixes short Woodlebs exports without a site-specific rule.
- **0.10.4:** Makes the popup more compact. **Elements and links**, **Technologies (alpha)**, and **Analysis limitations** are off by default and can be enabled before export.
- **0.10.3:** Updates the logo and toolbar icon based on the supplied reference artwork.
- **0.10.1:** Shows export and technology-check dates in a readable format with time zone. Marks technology detection as alpha and makes its section optional. Explains available, skipped, and truncated data in an optional limitations section. Separates field placeholders from labels, removes temporary loading messages from main text, and stores long Markdown link URLs at the end of the file.
- **0.10.0:** Detects repeated card groups from DOM structure without domain-specific rules. Summarizes visual cards with linked headings while preserving detailed cards, tables, and adjacent sections. Unlabeled fields no longer imply a web app; their count appears in limitations. Adds a manual **Card-based page** type.
- **0.9.2:** Uses linked video titles as headings on the YouTube home page and avoids duplicate channel avatars in main content.
- **0.9.1:** Exports loaded YouTube home-page videos as separate feed items, excluding ad cards from the main export. Background-only or unloaded thumbnails are not described as images. Removes Wikipedia maintenance categories from article text while retaining them in research lists.
- **0.9.0:** Separates readable main content from research lists. Service sections and controls stay out of article or item text but remain in the selected scope's links and actions. Adds a filtered heading tree, Wikipedia-style footnotes with source links, links inside tables, and improved preview formatting.
- **0.8.0:** Adds evidence types and check time to the technology table, clarifies that findings apply to the current page, and recognizes MediaWiki with its generator version. Removes screenshots from the interface and plan.
- **0.7.0:** Adds page-specific limitation counts for headings, paragraphs, images, iframes, excluded service and hidden nodes, and list/table limits. Feeds report found and exported posts. Empty forms no longer create scenarios, and key-change controls stay out of song text.
- **0.6.1:** Changes page-type selection to a dropdown with an explanatory tooltip.
- **0.6.0:** Exports up to 30 loaded feed posts individually. Adds basic item metadata and lists web-app fields and possible form scenarios before page text. Scenarios describe form structure only; input values and action outcomes are not read.
- **0.5.3:** Removes link-heavy blocks before the first heading when no semantic main container exists. Excludes Wikipedia language and page tools. Marks `href="#"` and `javascript:` links as actions and groups musical key options.
- **0.5.2:** In main-content mode, excludes semantic menus, sidebars, dialogs, and small decorative images. Groups repeated headings, images, and controls while keeping distinct link URLs separate. Reports original item counts when lists or tables are shortened. Whole-page mode retains text blocks without this extra cleanup.
- **0.5.1:** Fixes spacing between adjacent text elements, labels for image links, and the actual export-scope description. Applies the same cleanup to main-content elements and text.
