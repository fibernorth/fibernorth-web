import { NextResponse } from "next/server";

// Which build the server is running, so an open admin page can tell the site
// was updated since it loaded (see UpdateBanner).

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_STAMP || "" }, { headers: { "Cache-Control": "no-store" } });
}
