import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  if (!query || query.length < 2) {
    return NextResponse.json([], {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const ddgUrl = `https://ac.duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`;
    const response = await fetch(ddgUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json() as any[];
      const suggestions = Array.isArray(data) && data.length > 1 ? data[1] : [];
      return NextResponse.json(suggestions, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  } catch {
    // Fallback
  }

  return NextResponse.json([], {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
