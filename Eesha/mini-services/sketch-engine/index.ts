/**
 * Sketch Engine - Eesha Browser's Own Search Engine Service
 * =========================================================
 * A lightweight search service that:
 * 1. Provides a beautiful search UI at /
 * 2. Provides a JSON search API at /search?q=...&category=...
 * 3. Proxies to SearXNG when available (local OpenSearch powered)
 * 4. Falls back to aggregating multiple privacy-respecting search engines
 * 5. Returns clean, structured results for the browser to display
 *
 * Port: 3031
 */

const PORT = 3031;
const SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8888";

// ─── Search Result Types ─────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  description: string;
  engine?: string;
  category: "general" | "images" | "videos" | "news" | "it" | "science";
  thumbnail?: string;
  publishedDate?: string;
  duration?: string;
}

interface SearchResponse {
  query: string;
  category: string;
  totalResults: number;
  results: SearchResult[];
  suggestions: string[];
  timeTaken: number;
  engine: string;
}

// ─── Search Engine: Multi-Source Aggregation ─────────────────────────────

async function searchSearXNG(
  query: string,
  category: string = "general",
  page: number = 1
): Promise<SearchResponse> {
  const startTime = Date.now();

  try {
    // Try SearXNG first (local OpenSearch + other engines)
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=${category}&pageno=${page}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SketchEngine/0.9.2 (Eesha Browser)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const data = await response.json() as any;
      const results: SearchResult[] = (data.results || []).map(
        (r: any): SearchResult => ({
          title: r.title || "",
          url: r.url || "",
          description: r.content || "",
          engine: r.engine || "searxng",
          category: category as any,
          thumbnail: r.thumbnail || r.img_src || undefined,
          publishedDate: r.publishedDate || undefined,
          duration: r.duration || undefined,
        })
      );

      return {
        query,
        category,
        totalResults: results.length,
        results,
        suggestions: data.suggestions || [],
        timeTaken: Date.now() - startTime,
        engine: "Sketch Engine (SearXNG + OpenSearch)",
      };
    }
  } catch {
    // SearXNG unavailable - fall through to direct aggregation
  }

  // Fallback: Aggregate from multiple sources directly
  return searchDirectAggregation(query, category, page);
}

async function searchDirectAggregation(
  query: string,
  category: string = "general",
  page: number = 1
): Promise<SearchResponse> {
  const startTime = Date.now();
  const results: SearchResult[] = [];

  // DuckDuckGo Instant Answer API (no API key needed)
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(ddgUrl, {
      headers: { "User-Agent": "SketchEngine/0.9.2" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json() as any;

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          description: data.Abstract || "",
          engine: "duckduckgo",
          category: category as any,
          thumbnail: data.Image || undefined,
        });
      }

      // Related topics
      for (const topic of (data.RelatedTopics || []).slice(0, 8)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 80),
            url: topic.FirstURL,
            description: topic.Text,
            engine: "duckduckgo",
            category: category as any,
            thumbnail: topic.Icon?.URL || undefined,
          });
        }
      }

      // Results
      for (const result of (data.Results || []).slice(0, 5)) {
        results.push({
          title: result.Text || "",
          url: result.FirstURL || "",
          description: result.Text || "",
          engine: "duckduckgo",
          category: category as any,
        });
      }
    }
  } catch {
    // DuckDuckGo API failed
  }

  // Wikipedia API for knowledge results
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    const response = await fetch(wikiUrl, {
      headers: { "User-Agent": "SketchEngine/0.9.2" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json() as any;
      for (const item of data.query?.search || []) {
        results.push({
          title: item.title || "",
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
          description: item.snippet?.replace(/<[^>]+>/g, "") || "",
          engine: "wikipedia",
          category: category as any,
        });
      }
    }
  } catch {
    // Wikipedia API failed
  }

  return {
    query,
    category,
    totalResults: results.length,
    results,
    suggestions: [],
    timeTaken: Date.now() - startTime,
    engine: "Sketch Engine (Direct Aggregation)",
  };
}

// ─── HTTP Server ──────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for browser integration
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ─── Search API ────────────────────────────────────────────────────
    if (path === "/search" || path === "/api/search") {
      const query = url.searchParams.get("q") || "";
      const category = url.searchParams.get("category") || "general";
      const page = parseInt(url.searchParams.get("page") || "1");
      const format = url.searchParams.get("format") || "json";

      if (!query) {
        return Response.json(
          { error: "Missing query parameter 'q'" },
          { status: 400, headers: corsHeaders }
        );
      }

      const results = await searchSearXNG(query, category, page);

      if (format === "html") {
        return new Response(renderResultsHTML(results), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      return Response.json(results, { headers: corsHeaders });
    }

    // ─── Suggestions API ───────────────────────────────────────────────
    if (path === "/suggest" || path === "/api/suggest") {
      const query = url.searchParams.get("q") || "";
      if (!query) {
        return Response.json([], { headers: corsHeaders });
      }

      try {
        const ddgUrl = `https://ac.duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`;
        const response = await fetch(ddgUrl, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const data = await response.json() as any[];
          const suggestions = Array.isArray(data) && data.length > 1 ? data[1] : [];
          return Response.json(suggestions, { headers: corsHeaders });
        }
      } catch {
        // Fallback: return empty
      }

      return Response.json([], { headers: corsHeaders });
    }

    // ─── OpenSearch Description ────────────────────────────────────────
    if (path === "/opensearch.xml") {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Sketch Engine</ShortName>
  <Description>Eesha Browser's own search engine - Privacy-first, self-hosted</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="text/html" method="get" template="http://localhost:${PORT}/search?q={searchTerms}&amp;category=general&amp;format=html"/>
  <Url type="application/json" method="get" template="http://localhost:${PORT}/search?q={searchTerms}&amp;category=general"/>
  <Url type="application/x-suggestions+json" method="get" template="http://localhost:${PORT}/suggest?q={searchTerms}"/>
  <Image width="16" height="16">data:image/svg+xml,&lt;svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e94560'&gt;&lt;circle cx='11' cy='11' r='8'/&gt;&lt;line x1='21' y1='21' x2='16.65' y2='16.65' stroke='white' stroke-width='2'/&gt;&lt;/svg&gt;</Image>
</OpenSearchDescription>`;
      return new Response(xml, {
        headers: { "Content-Type": "application/opensearchdescription+xml", ...corsHeaders },
      });
    }

    // ─── Health Check ──────────────────────────────────────────────────
    if (path === "/health") {
      return Response.json(
        {
          status: "ok",
          service: "Sketch Engine",
          version: "0.9.2",
          searxng_available: await checkSearXNG(),
        },
        { headers: corsHeaders }
      );
    }

    // ─── Main Search Page ──────────────────────────────────────────────
    return new Response(renderSearchPage(url.searchParams.get("q") || ""), {
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
  },
});

async function checkSearXNG(): Promise<boolean> {
  try {
    const response = await fetch(`${SEARXNG_URL}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Search Page HTML ─────────────────────────────────────────────────────

function renderSearchPage(initialQuery: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${initialQuery ? `${initialQuery} - Sketch Engine` : 'Sketch Engine - Search'}  </title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e94560'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65' stroke='white' stroke-width='2'/></svg>">
  <link rel="search" type="application/opensearchdescription+xml" title="Sketch Engine" href="/opensearch.xml">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' http://localhost:* https://api.duckduckgo.com https://en.wikipedia.org;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #0f0f1a;
      --surface: #1a1a2e;
      --surface2: #16213e;
      --border: #2a2a4a;
      --text: #e0e0e0;
      --text-muted: #8888aa;
      --accent: #e94560;
      --accent-hover: #c73652;
      --link: #6ea8fe;
      --green: #4caf50;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* ─── Header / Search Bar ────────────────────────────────────────── */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      flex-shrink: 0;
    }

    .logo-icon {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-text {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
    }

    .logo-text span { color: var(--accent); }

    .search-box {
      flex: 1;
      max-width: 680px;
      position: relative;
    }

    .search-input {
      width: 100%;
      padding: 10px 44px 10px 16px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 24px;
      color: var(--text);
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--text-muted); }

    .search-btn {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 36px;
      height: 36px;
      background: var(--accent);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .search-btn:hover { background: var(--accent-hover); }
    .search-btn svg { stroke: white; }

    /* ─── Category Tabs ──────────────────────────────────────────────── */
    .categories {
      display: flex;
      gap: 4px;
      padding: 8px 24px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .categories-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      gap: 4px;
    }

    .cat-tab {
      padding: 6px 16px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 13px;
      cursor: pointer;
      border-radius: 20px;
      transition: all 0.2s;
    }

    .cat-tab:hover { background: rgba(233, 69, 96, 0.1); color: var(--text); }
    .cat-tab.active { background: var(--accent); color: white; }

    /* ─── Homepage (no results yet) ──────────────────────────────────── */
    .homepage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 140px);
      padding: 40px 20px;
    }

    .homepage-logo {
      width: 80px;
      height: 80px;
      background: var(--accent);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      box-shadow: 0 4px 24px rgba(233, 69, 96, 0.3);
    }

    .homepage-title {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .homepage-title span { color: var(--accent); }

    .homepage-subtitle {
      font-size: 16px;
      color: var(--text-muted);
      margin-bottom: 32px;
    }

    .homepage-search {
      width: 100%;
      max-width: 584px;
      position: relative;
    }

    .homepage-search input {
      width: 100%;
      padding: 14px 52px 14px 20px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 28px;
      color: var(--text);
      font-size: 16px;
      outline: none;
      transition: all 0.2s;
    }

    .homepage-search input:focus {
      border-color: var(--accent);
      box-shadow: 0 2px 12px rgba(233, 69, 96, 0.2);
    }

    .homepage-search input::placeholder { color: var(--text-muted); }

    .homepage-search-btn {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      background: var(--accent);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .homepage-search-btn:hover { background: var(--accent-hover); }

    .engine-badges {
      display: flex;
      gap: 8px;
      margin-top: 24px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .engine-badge {
      padding: 4px 12px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ─── Results ────────────────────────────────────────────────────── */
    .results-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 24px;
    }

    .results-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .result-item {
      margin-bottom: 24px;
      max-width: 680px;
    }

    .result-url {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .result-url .favicon {
      width: 16px;
      height: 16px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .result-title {
      font-size: 18px;
      color: var(--link);
      text-decoration: none;
      display: block;
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .result-title:hover { text-decoration: underline; }

    .result-desc {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .result-desc b { color: var(--text); }

    .result-engine {
      font-size: 11px;
      color: var(--green);
      margin-top: 4px;
    }

    /* ─── Image Results ──────────────────────────────────────────────── */
    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      padding: 20px 0;
    }

    .image-card {
      background: var(--surface2);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .image-card:hover { transform: scale(1.02); }

    .image-card img {
      width: 100%;
      height: 160px;
      object-fit: cover;
    }

    .image-card-info {
      padding: 8px 12px;
    }

    .image-card-title {
      font-size: 12px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .image-card-source {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ─── Video Results ──────────────────────────────────────────────── */
    .video-card {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      background: var(--surface2);
      border-radius: 12px;
      overflow: hidden;
    }

    .video-thumb {
      width: 240px;
      height: 135px;
      background: var(--border);
      flex-shrink: 0;
      position: relative;
    }

    .video-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-duration {
      position: absolute;
      bottom: 6px;
      right: 6px;
      background: rgba(0,0,0,0.8);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: white;
    }

    .video-info {
      padding: 12px 16px 12px 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .video-title {
      font-size: 15px;
      color: var(--link);
      margin-bottom: 6px;
      text-decoration: none;
      display: block;
    }

    .video-title:hover { text-decoration: underline; }

    .video-meta {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ─── Loading ────────────────────────────────────────────────────── */
    .loading {
      text-align: center;
      padding: 60px;
      color: var(--text-muted);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ─── Suggestions ────────────────────────────────────────────────── */
    .suggestions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }

    .suggestion-chip {
      padding: 6px 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 16px;
      font-size: 13px;
      color: var(--text);
      cursor: pointer;
      transition: all 0.2s;
    }

    .suggestion-chip:hover {
      border-color: var(--accent);
      background: rgba(233, 69, 96, 0.1);
    }

    /* ─── Footer ─────────────────────────────────────────────────────── */
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }

    .footer a { color: var(--accent); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    /* ─── Responsive ─────────────────────────────────────────────────── */
    @media (max-width: 640px) {
      .header-inner { gap: 8px; }
      .logo-text { display: none; }
      .categories { padding: 8px 12px; overflow-x: auto; }
      .results-container { padding: 16px; }
      .video-card { flex-direction: column; }
      .video-thumb { width: 100%; height: auto; aspect-ratio: 16/9; }
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Header with search bar (shown during results) -->
    <header class="header" id="resultsHeader" style="display: none;">
      <div class="header-inner">
        <a class="logo" href="/">
          <div class="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div class="logo-text">Sketch<span>Engine</span></div>
        </a>
        <div class="search-box">
          <input type="text" class="search-input" id="headerSearch" placeholder="Search with Sketch Engine..." autocomplete="off">
          <button class="search-btn" onclick="doHeaderSearch()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Category tabs -->
    <nav class="categories" id="categoriesBar" style="display: none;">
      <div class="categories-inner">
        <button class="cat-tab active" data-cat="general" onclick="switchCategory('general')">All</button>
        <button class="cat-tab" data-cat="images" onclick="switchCategory('images')">Images</button>
        <button class="cat-tab" data-cat="videos" onclick="switchCategory('videos')">Videos</button>
        <button class="cat-tab" data-cat="news" onclick="switchCategory('news')">News</button>
        <button class="cat-tab" data-cat="it" onclick="switchCategory('it')">Tech</button>
        <button class="cat-tab" data-cat="science" onclick="switchCategory('science')">Science</button>
      </div>
    </nav>

    <!-- Homepage -->
    <div class="homepage" id="homepage">
      <div class="homepage-logo">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div class="homepage-title">Sketch<span>Engine</span></div>
      <div class="homepage-subtitle">Eesha Browser's own search engine — Privacy-first, self-hosted</div>
      <div class="homepage-search">
        <input type="text" id="homeSearch" placeholder="Search the web privately..." autocomplete="off" autofocus>
        <button class="homepage-search-btn" onclick="doHomeSearch()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
      <div class="engine-badges">
        <span class="engine-badge">OpenSearch</span>
        <span class="engine-badge">SearXNG</span>
        <span class="engine-badge">DuckDuckGo</span>
        <span class="engine-badge">Wikipedia</span>
        <span class="engine-badge">Brave</span>
        <span class="engine-badge">Qwant</span>
      </div>
    </div>

    <!-- Results container -->
    <div class="results-container" id="resultsContainer" style="display: none;"></div>
  </div>

  <script>
    var currentQuery = '${initialQuery.replace(/'/g, "\\'")}';
    var currentCategory = 'general';

    function doHomeSearch() {
      var q = document.getElementById('homeSearch').value.trim();
      if (q) performSearch(q, 'general');
    }

    function doHeaderSearch() {
      var q = document.getElementById('headerSearch').value.trim();
      if (q) performSearch(q, currentCategory);
    }

    function switchCategory(cat) {
      currentCategory = cat;
      document.querySelectorAll('.cat-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.cat === cat);
      });
      if (currentQuery) performSearch(currentQuery, cat);
    }

    function performSearch(query, category) {
      currentQuery = query;
      currentCategory = category;

      // Update URL without reload
      history.pushState(null, '', '/?q=' + encodeURIComponent(query) + '&category=' + category);

      // Show results UI
      document.getElementById('homepage').style.display = 'none';
      document.getElementById('resultsHeader').style.display = 'block';
      document.getElementById('categoriesBar').style.display = 'block';
      document.getElementById('headerSearch').value = query;

      // Show loading
      var container = document.getElementById('resultsContainer');
      container.style.display = 'block';
      container.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';

      // Fetch results
      fetch('/search?q=' + encodeURIComponent(query) + '&category=' + category)
        .then(function(r) { return r.json(); })
        .then(function(data) { renderResults(data); })
        .catch(function(err) {
          container.innerHTML = '<div class="loading">Search failed. Please try again.</div>';
        });
    }

    function renderResults(data) {
      var container = document.getElementById('resultsContainer');
      var html = '<div class="results-meta">' + data.totalResults + ' results in ' + (data.timeTaken / 1000).toFixed(2) + 's via ' + data.engine + '</div>';

      // Suggestions
      if (data.suggestions && data.suggestions.length > 0) {
        html += '<div class="suggestions">';
        data.suggestions.forEach(function(s) {
          html += '<button class="suggestion-chip" onclick="performSearch(\\'' + s.replace(/'/g, "\\\\'") + '\\', currentCategory)">' + escapeHtml(s) + '</button>';
        });
        html += '</div>';
      }

      // Results based on category
      if (currentCategory === 'images') {
        html += '<div class="images-grid">';
        data.results.forEach(function(r) {
          var thumb = r.thumbnail || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22160%22><rect fill=%22%231a1a2e%22 width=%22200%22 height=%22160%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%235a5a7a%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>No preview</text></svg>';
          html += '<a class="image-card" href="' + escapeAttr(r.url) + '" target="_blank">';
          html += '<img src="' + escapeAttr(thumb) + '" alt="' + escapeAttr(r.title) + '" loading="lazy">';
          html += '<div class="image-card-info">';
          html += '<div class="image-card-title">' + escapeHtml(r.title) + '</div>';
          html += '<div class="image-card-source">' + escapeHtml(new URL(r.url).hostname) + '</div>';
          html += '</div></a>';
        });
        html += '</div>';
      } else if (currentCategory === 'videos') {
        data.results.forEach(function(r) {
          var thumb = r.thumbnail || '';
          html += '<a class="video-card" href="' + escapeAttr(r.url) + '" target="_blank">';
          html += '<div class="video-thumb">';
          if (thumb) html += '<img src="' + escapeAttr(thumb) + '" alt="" loading="lazy">';
          if (r.duration) html += '<span class="video-duration">' + escapeHtml(r.duration) + '</span>';
          html += '</div>';
          html += '<div class="video-info">';
          html += '<span class="video-title">' + escapeHtml(r.title) + '</span>';
          html += '<div class="video-meta">' + escapeHtml(new URL(r.url).hostname) + (r.publishedDate ? ' • ' + escapeHtml(r.publishedDate.substring(0, 10)) : '') + '</div>';
          html += '</div></a>';
        });
      } else {
        // General / news / it / science results
        data.results.forEach(function(r) {
          var host = '';
          try { host = new URL(r.url).hostname; } catch(e) {}
          html += '<div class="result-item">';
          html += '<div class="result-url">';
          html += '<img class="favicon" src="https://' + escapeAttr(host) + '/favicon.ico" alt="" onerror="this.style.display=\\'none\\'">';
          html += escapeHtml(host);
          html += '</div>';
          html += '<a class="result-title" href="' + escapeAttr(r.url) + '" target="_blank">' + escapeHtml(r.title) + '</a>';
          html += '<div class="result-desc">' + escapeHtml(r.description) + '</div>';
          if (r.engine) html += '<div class="result-engine">via ' + escapeHtml(r.engine) + '</div>';
          html += '</div>';
        });
      }

      if (data.results.length === 0) {
        html += '<div class="loading">No results found for "' + escapeHtml(data.query) + '"</div>';
      }

      html += '<div class="footer">Sketch Engine v0.9.2 &mdash; Powered by <a href="https://opensearch.org">OpenSearch</a> + <a href="https://github.com/searxng/searxng">SearXNG</a> + <a href="https://nutch.apache.org">Apache Nutch</a></div>';

      container.innerHTML = html;
    }

    function escapeHtml(text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function escapeAttr(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Handle Enter key on search inputs
    document.getElementById('homeSearch').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doHomeSearch();
    });
    document.getElementById('headerSearch').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doHeaderSearch();
    });

    // Load initial query if provided
    if (currentQuery) {
      document.getElementById('homeSearch').value = currentQuery;
      performSearch(currentQuery, new URLSearchParams(window.location.search).get('category') || 'general');
    }
  </script>
</body>
</html>`;
}

// ─── Results-only HTML (for API format=html) ─────────────────────────────

function renderResultsHTML(data: SearchResponse): string {
  const results = data.results
    .map((r) => {
      let host = "";
      try {
        host = new URL(r.url).hostname;
      } catch {}
      return `
    <div style="margin-bottom:20px;max-width:680px;">
      <div style="font-size:12px;color:#8888aa;">${host}</div>
      <a href="${r.url}" style="font-size:17px;color:#6ea8fe;text-decoration:none;" target="_blank">${r.title}</a>
      <div style="font-size:13px;color:#8888aa;margin-top:2px;">${r.description}</div>
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="background:#0f0f1a;color:#e0e0e0;font-family:sans-serif;padding:20px;">
<div style="font-size:12px;color:#8888aa;margin-bottom:16px;">${data.totalResults} results via ${data.engine}</div>
${results || '<div style="color:#8888aa;">No results found.</div>'}
</body></html>`;
}

// ─── Start ────────────────────────────────────────────────────────────────

console.log(``);
console.log(`  ╔══════════════════════════════════════════╗`);
console.log(`  ║   Sketch Engine v0.9.2                  ║`);
console.log(`  ║   Eesha Browser's Search Engine         ║`);
console.log(`  ║   Running on http://localhost:${PORT}      ║`);
console.log(`  ╚══════════════════════════════════════════╝`);
console.log(``);
console.log(`  Endpoints:`);
console.log(`    GET /              - Search UI`);
console.log(`    GET /search?q=...  - Search API (JSON)`);
console.log(`    GET /suggest?q=... - Autocomplete`);
console.log(`    GET /opensearch.xml - Browser integration`);
console.log(`    GET /health        - Health check`);
console.log(``);
