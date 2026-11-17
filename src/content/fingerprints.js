// Local, inspectable fingerprints. No network requests or page-script execution.
globalThis.pageToMarkdownDetectTechnologies = (page = document, pageUrl = location, analyzedAt = new Date().toISOString()) => {
  const hostname = pageUrl.hostname.toLowerCase();
  const generator = (page.querySelector('meta[name="generator"]')?.content || "").trim();
  const resources = [...page.querySelectorAll("script[src], link[href], img[src]")]
    .map((node) => {
      try {
        const url = new URL(node.getAttribute("src") || node.getAttribute("href"), pageUrl.href);
        return /^https?:$/.test(url.protocol) ? url : null;
      } catch { return null; }
    })
    .filter(Boolean);

  const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);
  const assetHost = (domain) => resources.some((url) => hostIs(url.hostname.toLowerCase(), domain));
  const assetPath = (pattern) => resources.some((url) => pattern.test(url.pathname));
  const ownAssetPath = (pattern) => resources.some((url) => url.hostname.toLowerCase() === hostname && pattern.test(url.pathname));
  const has = (selector) => !!page.querySelector(selector);
  const meta = (pattern) => pattern.test(generator);

  const rules = [
    {
      name: "Tilda",
      signals: [
        { label: "домен tilda.ws", type: "домен", score: 3, match: () => hostIs(hostname, "tilda.ws") },
        { label: 'meta[name="generator"]: Tilda', type: "метатег", score: 3, match: () => meta(/tilda/i) },
        { label: "ресурс tildacdn", type: "ресурс", score: 2, match: () => assetHost("tildacdn.com") || assetHost("tildacdn.info") },
        { label: "блоки t-records / t-rec", type: "DOM", score: 1, match: () => has(".t-records, .t-rec[data-record-type]") }
      ]
    },
    {
      name: "WordPress",
      signals: [
        { label: 'meta[name="generator"]: WordPress', type: "метатег", score: 3, match: () => meta(/wordpress/i) },
        { label: "ресурс /wp-content/ на этом домене", type: "ресурс", score: 2, match: () => ownAssetPath(/\/wp-content\//i) },
        { label: "ссылка на WP REST API", type: "DOM", score: 2, match: () => has('link[rel="https://api.w.org/"]') }
      ]
    },
    {
      name: "Shopify",
      signals: [
        { label: 'meta[name="generator"]: Shopify', type: "метатег", score: 3, match: () => meta(/shopify/i) },
        { label: "ресурс /cdn/shop/ на этом домене", type: "ресурс", score: 2, match: () => ownAssetPath(/\/cdn\/shop\//i) },
        { label: "секция shopify-section", type: "DOM", score: 2, match: () => has('[id^="shopify-section-"]') }
      ]
    },
    {
      name: "Webflow",
      signals: [
        { label: 'meta[name="generator"]: Webflow', type: "метатег", score: 3, match: () => meta(/webflow/i) },
        { label: "атрибут data-wf-page", type: "DOM", score: 2, match: () => has("[data-wf-page]") },
        { label: "ресурс webflow.js", type: "ресурс", score: 1, match: () => assetPath(/\/webflow(?:\.[a-z0-9_-]+)?\.js$/i) }
      ]
    },
    {
      name: "Next.js",
      signals: [
        { label: "данные #__NEXT_DATA__", type: "DOM", score: 3, match: () => has("script#__NEXT_DATA__") },
        { label: "контейнер #__next", type: "DOM", score: 2, match: () => has("#__next") },
        { label: "ресурс /_next/static/ на этом домене", type: "ресурс", score: 2, match: () => ownAssetPath(/\/_next\/static\//) }
      ]
    },
    {
      name: "Nuxt",
      signals: [
        { label: "данные #__NUXT_DATA__", type: "DOM", score: 3, match: () => has("script#__NUXT_DATA__") },
        { label: "контейнер #__nuxt", type: "DOM", score: 2, match: () => has("#__nuxt") },
        { label: "ресурс /_nuxt/ на этом домене", type: "ресурс", score: 2, match: () => ownAssetPath(/\/_nuxt\//) }
      ]
    },
    {
      name: "React",
      signals: [
        { label: "атрибут data-reactroot / data-reactid", type: "DOM", score: 2, match: () => has("[data-reactroot], [data-reactid]") }
      ]
    },
    {
      name: "MediaWiki",
      signals: [
        { label: `meta[name="generator"]: ${generator.slice(0, 80)}`, type: "метатег", score: 3, match: () => meta(/^MediaWiki(?:\s|$)/i) },
        { label: "разметка mw-parser-output", type: "DOM", score: 1, match: () => has(".mw-parser-output") },
        { label: "ресурс /w/load.php на этом домене", type: "ресурс", score: 2, match: () => ownAssetPath(/\/w\/load\.php$/i) }
      ]
    }
  ];

  const detected = rules.flatMap((rule) => {
    const evidence = rule.signals.filter((signal) => signal.match());
    if (!evidence.length) return [];
    const score = evidence.reduce((sum, signal) => sum + signal.score, 0);
    return [{ name: rule.name, evidence: evidence.map((signal) => signal.label).join("; "), evidenceTypes: [...new Set(evidence.map((signal) => signal.type))].join(", "), scope: "текущая страница", analyzedAt, confidence: score >= 3 ? "высокая" : score >= 2 ? "средняя" : "низкая" }];
  });

  if (generator && !rules.some((rule) => generator.toLowerCase().includes(rule.name.toLowerCase()))) {
    detected.push({ name: generator.slice(0, 100), evidence: 'meta[name="generator"]', evidenceTypes: "метатег", scope: "текущая страница", analyzedAt, confidence: "средняя" });
  }
  return detected;
};
