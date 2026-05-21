/**
 * Eesha Search - Eesha Browser's Own Search Engine Service
 * =========================================================
 * A lightweight search service that:
 * 1. Provides a JSON search API at /search?q=...&category=...
 * 2. Proxies to SearXNG on Render (aggregates 70+ search engines)
 * 3. Falls back to aggregating DuckDuckGo + Wikipedia if SearXNG is down
 * 4. Returns clean, structured results for the browser to display
 * 5. ZERO third-party branding — all results show "Eesha Search" branding
 *
 * SearXNG on Render: https://eesha-search.onrender.com
 * JSON API: /search?q=...&format=json
 *
 * Port: 3031
 */

const PORT = 3031;
// SearXNG instance on Render.com — aggregates Google, Bing, DuckDuckGo, Brave, etc.
const SEARXNG_URL = process.env.SEARXNG_URL || "https://eesha-search.onrender.com";

// ─── Search Result Types ─────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  description: string;
  engine?: string;
  category: string;
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

// ─── Safe fetch with AbortController ─────────────────────────────────────

async function safeFetch(url: string, options: RequestInit = {}, timeoutMs: number = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

// ─── Search Engine: Multi-Source Aggregation ─────────────────────────────

async function searchSearXNG(
  query: string,
  category: string = "general",
  page: number = 1
): Promise<SearchResponse> {
  const startTime = Date.now();

  // ─── Strategy: Category-specific search first, SearXNG for general ─────
  // SearXNG on Render often returns the same "general" results regardless
  // of the categories parameter. So for images/videos/news, we use our own
  // category-specific APIs directly. Only for "general" do we try SearXNG first.

  if (category !== "general") {
    // Use category-specific search directly (not SearXNG which ignores categories)
    return searchDirectAggregation(query, category, page);
  }

  // For general search: Try SearXNG first, then fallback
  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=${page}`;
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": "EeshaSearch/0.9.2 (Eesha Browser)",
        "Accept": "application/json",
      },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      // Filter results to only include general-category results from SearXNG
      const allResults = (data.results || []);
      // SearXNG sometimes returns results from other categories mixed in;
      // keep only results that have no category-specific metadata or are tagged general
      const filteredResults = allResults.filter((r: any) => {
        // If the result has a category field from SearXNG, only keep general
        if (r.category && r.category !== "general" && r.category !== "web") return false;
        return true;
      });

      const results: SearchResult[] = (filteredResults.length > 0 ? filteredResults : allResults).map(
        (r: any): SearchResult => ({
          title: r.title || "",
          url: r.url || "",
          description: r.content || "",
          engine: r.engine || "searxng",
          category: "general",
          thumbnail: r.thumbnail || r.img_src || undefined,
          publishedDate: r.publishedDate || undefined,
          duration: r.duration || undefined,
        })
      );

      if (results.length > 0) {
        return {
          query,
          category,
          totalResults: results.length,
          results,
          suggestions: data.suggestions || [],
          timeTaken: Date.now() - startTime,
          engine: "Eesha Search (SearXNG)",
        };
      }
    }
  } catch {
    // SearXNG unavailable - fall through
  }

  // Fallback: Aggregate from multiple sources directly
  return searchDirectAggregation(query, category, page);
}

async function searchDirectAggregation(
  query: string,
  category: string = "general",
  _page: number = 1
): Promise<SearchResponse> {
  const startTime = Date.now();
  let results: SearchResult[];

  // Dispatch to category-specific search
  switch (category) {
    case "images":
      results = await searchImages(query);
      break;
    case "videos":
      results = await searchVideos(query);
      break;
    case "news":
      results = await searchNews(query);
      break;
    default:
      results = await searchGeneral(query);
      break;
  }

  return {
    query,
    category,
    totalResults: results.length,
    results,
    suggestions: [],
    timeTaken: Date.now() - startTime,
    engine: "Eesha Search (Direct Aggregation)",
  };
}

// ─── General Search: DuckDuckGo + Wikipedia ────────────────────────────────

async function searchGeneral(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // DuckDuckGo Instant Answer API (no API key needed)
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await safeFetch(ddgUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          description: data.Abstract || "",
          engine: "duckduckgo",
          category: "general",
          thumbnail: data.Image || undefined,
        });
      }

      // Related topics
      for (const topic of (data.RelatedTopics || []).slice(0, 8)) {
        if (topic && topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 80),
            url: topic.FirstURL,
            description: topic.Text,
            engine: "duckduckgo",
            category: "general",
            thumbnail: (topic.Icon && topic.Icon.URL) || undefined,
          });
        }
      }

      // Results
      for (const result of (data.Results || []).slice(0, 5)) {
        if (result && result.Text && result.FirstURL) {
          results.push({
            title: result.Text || "",
            url: result.FirstURL || "",
            description: result.Text || "",
            engine: "duckduckgo",
            category: "general",
          });
        }
      }
    }
  } catch {
    // DuckDuckGo API failed
  }

  // Wikipedia API for knowledge results
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    const response = await safeFetch(wikiUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      for (const item of (data.query?.search || [])) {
        if (item) {
          results.push({
            title: item.title || "",
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title || "").replace(/ /g, "_"))}`,
            description: (item.snippet || "").replace(/<[^>]+>/g, ""),
            engine: "wikipedia",
            category: "general",
          });
        }
      }
    }
  } catch {
    // Wikipedia API failed
  }

  return results;
}

// ─── Image Search: Wikimedia Commons + Wikipedia Images ────────────────────

async function searchImages(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Wikimedia Commons API — search for freely-licensed images
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=15&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400&format=json`;
    const response = await safeFetch(commonsUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      const pages = data.query?.pages || {};
      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        const imgInfo = page.imageinfo?.[0];
        if (imgInfo) {
          const desc = imgInfo.extmetadata?.ImageDescription?.value
            ? imgInfo.extmetadata.ImageDescription.value.replace(/<[^>]+>/g, "").trim()
            : page.title?.replace("File:", "").replace(/\.[^.]+$/, "") || "";
          results.push({
            title: page.title?.replace("File:", "").replace(/\.[^.]+$/, "") || query,
            url: imgInfo.descriptionurl || imgInfo.url || "",
            description: desc.substring(0, 200),
            engine: "wikimedia_commons",
            category: "images",
            thumbnail: imgInfo.thumburl || imgInfo.url || undefined,
          });
        }
      }
    }
  } catch {
    // Wikimedia Commons API failed
  }

  // Wikipedia image search — get images from articles matching the query
  try {
    const wikiImgUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=pageimages|extracts&pithumbsize=400&exintro=true&explaintext=true&exsentences=2&format=json`;
    const response = await safeFetch(wikiImgUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      const pages = data.query?.pages || {};
      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        if (page.thumbnail?.source) {
          results.push({
            title: page.title || query,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title || "").replace(/ /g, "_"))}`,
            description: page.extract || "",
            engine: "wikipedia_images",
            category: "images",
            thumbnail: page.thumbnail.source,
          });
        }
      }
    }
  } catch {
    // Wikipedia image search failed
  }

  // Unsplash Source (free, no API key) — redirect-based random images matching query
  try {
    const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&client_id=`; // Client ID would be needed; fallback to scraping
    // Alternative: Use Pixabay free API or skip if no key
    // For now, use the simpler Lorem Picsum with query seed as a visual fallback
    // Actually, let's try the DuckDuckGo Instant Answer API which sometimes returns image results
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await safeFetch(ddgUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      // DDG sometimes returns an image in the abstract
      if (data.Image && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          description: data.Abstract || "",
          engine: "duckduckgo_images",
          category: "images",
          thumbnail: data.Image.startsWith("/") ? `https://duckduckgo.com${data.Image}` : data.Image,
        });
      }
      // Related topics with images
      for (const topic of (data.RelatedTopics || []).slice(0, 6)) {
        if (topic?.Icon?.URL && topic.FirstURL) {
          results.push({
            title: topic.Text?.substring(0, 80) || query,
            url: topic.FirstURL,
            description: topic.Text || "",
            engine: "duckduckgo_images",
            category: "images",
            thumbnail: topic.Icon.URL.startsWith("/") ? `https://duckduckgo.com${topic.Icon.URL}` : topic.Icon.URL,
          });
        }
      }
    }
  } catch {
    // DuckDuckGo image fallback failed
  }

  return results;
}

// ─── Video Search: Piped API (YouTube proxy) + Invidious ───────────────────

async function searchVideos(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Try multiple Piped API instances — free, no API key YouTube proxies
  const pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.r4fo.com",
    "https://pipedapi.in.projectsegfau.lt",
  ];

  for (const instance of pipedInstances) {
    if (results.length >= 10) break;
    try {
      const pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const response = await safeFetch(pipedUrl, {
        headers: { "User-Agent": "EeshaSearch/0.9.2" },
      }, 6000);

      if (response && response.ok) {
        const data = await response.json() as any;
        const items = data.items || [];
        for (const item of items.slice(0, 15)) {
          if (item.url && item.title) {
            const videoUrl = item.url.startsWith("/") ? `https://youtube.com${item.url}` : item.url;
            results.push({
              title: item.title || "",
              url: videoUrl,
              description: item.uploaderName ? `By ${item.uploaderName}` + (item.uploadedDate ? ` • ${item.uploadedDate}` : "") + (item.views ? ` • ${item.views.toLocaleString()} views` : "") : (item.shortDescription || ""),
              engine: "piped_youtube",
              category: "videos",
              thumbnail: item.thumbnail || undefined,
              duration: item.duration ? formatDuration(item.duration) : undefined,
            });
          }
        }
      }
    } catch {
      // Piped instance failed, try next
    }
  }

  // Try multiple Invidious API instances — alternative YouTube proxies
  if (results.length < 5) {
    const invidiousInstances = [
      "https://invidious.fdn.fr",
      "https://invidious.snopyta.org",
      "https://inv.nadeko.net",
      "https://vid.puffyan.us",
    ];

    for (const instance of invidiousInstances) {
      if (results.length >= 10) break;
      try {
        const invUrl = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
        const response = await safeFetch(invUrl, {
          headers: { "User-Agent": "EeshaSearch/0.9.2" },
        }, 5000);

        if (response && response.ok) {
          const data = await response.json() as any[];
          for (const item of (data || []).slice(0, 10)) {
            if (item.videoId) {
              results.push({
                title: item.title || "",
                url: `https://youtube.com/watch?v=${item.videoId}`,
                description: item.author ? `By ${item.author}` + (item.lengthSeconds ? ` • ${formatDuration(item.lengthSeconds)}` : "") + (item.viewCount ? ` • ${item.viewCount.toLocaleString()} views` : "") : "",
                engine: "invidious_youtube",
                category: "videos",
                thumbnail: item.videoThumbnails?.[0]?.url || undefined,
                duration: item.lengthSeconds ? formatDuration(item.lengthSeconds) : undefined,
                publishedDate: item.publishedText || undefined,
              });
            }
          }
        }
      } catch {
        // Invidious instance failed, try next
      }
    }
  }

  // Final fallback: DuckDuckGo Instant Answer API with video hints
  if (results.length < 3) {
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + " video")}&format=json&no_html=1&skip_disambig=1`;
      const response = await safeFetch(ddgUrl, {
        headers: { "User-Agent": "EeshaSearch/0.9.2" },
      }, 8000);

      if (response && response.ok) {
        const data = await response.json() as any;
        if (data.Abstract) {
          results.push({
            title: data.Heading || query,
            url: data.AbstractURL || "",
            description: data.Abstract || "",
            engine: "duckduckgo_videos",
            category: "videos",
            thumbnail: data.Image || undefined,
          });
        }
        for (const topic of (data.RelatedTopics || []).slice(0, 5)) {
          if (topic?.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.substring(0, 80),
              url: topic.FirstURL,
              description: topic.Text,
              engine: "duckduckgo_videos",
              category: "videos",
              thumbnail: topic.Icon?.URL || undefined,
            });
          }
        }
      }
    } catch {
      // DuckDuckGo video fallback failed
    }
  }

  return results;
}

// ─── News Search: Google News RSS + Wikipedia Current Events ───────────────

async function searchNews(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Google News RSS — free, no API key
  try {
    const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await safeFetch(newsUrl, {
      headers: { "User-Agent": "EeshaSearch/0.9.2" },
    }, 8000);

    if (response && response.ok) {
      const xmlText = await response.text();
      // Parse RSS XML to extract items
      const itemRegex = /<item[\s>][\s\S]*?<\/item>/gi;
      const items = xmlText.match(itemRegex) || [];

      for (const itemXml of items.slice(0, 15)) {
        const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || itemXml.match(/<description>([\s\S]*?)<\/description>/i);
        const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

        const title = titleMatch ? titleMatch[1].trim() : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : undefined;
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        const source = sourceMatch ? sourceMatch[1].trim() : "";

        if (title && link) {
          results.push({
            title,
            url: link,
            description: source ? `${source}: ${description}` : description,
            engine: "google_news",
            category: "news",
            publishedDate: pubDate,
          });
        }
      }
    }
  } catch {
    // Google News RSS failed
  }

  // Wikipedia current events fallback
  if (results.length < 5) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + " news")}&format=json&srlimit=8`;
      const response = await safeFetch(wikiUrl, {
        headers: { "User-Agent": "EeshaSearch/0.9.2" },
      }, 8000);

      if (response && response.ok) {
        const data = await response.json() as any;
        for (const item of (data.query?.search || [])) {
          if (item) {
            results.push({
              title: item.title || "",
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title || "").replace(/ /g, "_"))}`,
              description: (item.snippet || "").replace(/<[^>]+>/g, ""),
              engine: "wikipedia_news",
              category: "news",
              publishedDate: item.timestamp || undefined,
            });
          }
        }
      }
    } catch {
      // Wikipedia news fallback failed
    }
  }

  return results;
}

// ─── Duration Formatter ─────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for browser integration
    const corsHeaders: Record<string, string> = {
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

      if (!query) {
        return Response.json(
          { error: "Missing query parameter 'q'" },
          { status: 400, headers: corsHeaders }
        );
      }

      try {
        const results = await searchSearXNG(query, category, page);
        return Response.json(results, { headers: corsHeaders });
      } catch (err) {
        return Response.json(
          {
            query,
            category,
            totalResults: 0,
            results: [],
            suggestions: [],
            timeTaken: 0,
            engine: "Eesha Search (Error)",
          },
          { headers: corsHeaders }
        );
      }
    }

    // ─── Suggestions API ───────────────────────────────────────────────
    if (path === "/suggest" || path === "/api/suggest") {
      const query = url.searchParams.get("q") || "";
      if (!query) {
        return Response.json([], { headers: corsHeaders });
      }

      try {
        const ddgUrl = `https://ac.duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`;
        const response = await safeFetch(ddgUrl, {}, 3000);
        if (response && response.ok) {
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
  <ShortName>Eesha Search</ShortName>
  <Description>Eesha Browser's own search engine - Privacy-first, self-hosted</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="application/json" method="get" template="http://localhost:${PORT}/search?q={searchTerms}&amp;category=general"/>
  <Url type="application/x-suggestions+json" method="get" template="http://localhost:${PORT}/suggest?q={searchTerms}"/>
</OpenSearchDescription>`;
      return new Response(xml, {
        headers: { "Content-Type": "application/opensearchdescription+xml", ...corsHeaders },
      });
    }

    // ─── Health Check ──────────────────────────────────────────────────
    if (path === "/health") {
      let searxngAvailable = false;
      try {
        const response = await safeFetch(`${SEARXNG_URL}/healthz`, {}, 2000);
        searxngAvailable = response !== null && response.ok;
      } catch {}

      return Response.json(
        {
          status: "ok",
          service: "Eesha Search",
          version: "0.9.2",
          searxng_available: searxngAvailable,
          searxng_url: SEARXNG_URL,
          backend: "SearXNG (aggregates 70+ engines)",
        },
        { headers: corsHeaders }
      );
    }

    // ─── Fallback ──────────────────────────────────────────────────────
    return Response.json(
      { service: "Eesha Search", version: "0.9.2", endpoints: ["/search?q=...", "/suggest?q=...", "/opensearch.xml", "/health"] },
      { headers: corsHeaders }
    );
  },

  error(error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  },
});

// ─── Start ────────────────────────────────────────────────────────────────

console.log(``);
console.log(`  ╔══════════════════════════════════════════╗`);
console.log(`  ║   Eesha Search v0.9.2                  ║`);
console.log(`  ║   Eesha Browser's Search Engine         ║`);
console.log(`  ║   Running on http://localhost:${PORT}      ║`);
console.log(`  ╚══════════════════════════════════════════╝`);
console.log(``);
console.log(`  Endpoints:`);
console.log(`    GET /search?q=...  - Search API (JSON)`);
console.log(`    GET /suggest?q=... - Autocomplete`);
console.log(`    GET /opensearch.xml - Browser integration`);
console.log(`    GET /health        - Health check`);
console.log(``);
