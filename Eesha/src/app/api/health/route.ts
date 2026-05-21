import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Eesha Search",
    version: "0.9.2",
    searxng_available: false,
  });
}
