import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// ─── Safe fetch with timeout ──────────────────────────────────────────────

async function safeFetch(url: string, timeoutMs: number = 8000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch {
    return null;
  }
}

// ─── Search: DuckDuckGo + Wikipedia Aggregation ───────────────────────────

async function searchDuckDuckGo(query: string, category: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await safeFetch(ddgUrl, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;

      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          description: data.Abstract || "",
          engine: "duckduckgo",
          category,
          thumbnail: data.Image ? (data.Image.startsWith("http") ? data.Image : `https://duckduckgo.com${data.Image}`) : undefined,
        });
      }

      for (const topic of (data.RelatedTopics || []).slice(0, 10)) {
        if (topic && topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 80),
            url: topic.FirstURL,
            description: topic.Text,
            engine: "duckduckgo",
            category,
            thumbnail: topic.Icon?.URL ? (topic.Icon.URL.startsWith("http") ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`) : undefined,
          });
        }
      }

      for (const result of (data.Results || []).slice(0, 5)) {
        if (result && result.Text && result.FirstURL) {
          results.push({
            title: result.Text,
            url: result.FirstURL,
            description: result.Text,
            engine: "duckduckgo",
            category,
          });
        }
      }
    }
  } catch {
    // DuckDuckGo failed
  }
  return results;
}

async function searchWikipedia(query: string, category: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    const response = await safeFetch(wikiUrl, 8000);

    if (response && response.ok) {
      const data = await response.json() as any;
      for (const item of data.query?.search || []) {
        if (item) {
          results.push({
            title: item.title || "",
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title || "").replace(/ /g, "_"))}`,
            description: (item.snippet || "").replace(/<[^>]+>/g, ""),
            engine: "wikipedia",
            category,
          });
        }
      }
    }
  } catch {
    // Wikipedia failed
  }
  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "general";

  if (!query) {
    return NextResponse.json(
      { error: "Missing query parameter 'q'" },
      { status: 400 }
    );
  }

  const startTime = Date.now();

  // Run searches in parallel
  const [ddgResults, wikiResults] = await Promise.all([
    searchDuckDuckGo(query, category),
    searchWikipedia(query, category),
  ]);

  const allResults = [...ddgResults, ...wikiResults];

  const response: SearchResponse = {
    query,
    category,
    totalResults: allResults.length,
    results: allResults,
    suggestions: [],
    timeTaken: Date.now() - startTime,
    engine: "Eesha Search",
  };

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
