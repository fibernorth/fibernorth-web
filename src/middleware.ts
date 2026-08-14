import { NextRequest, NextResponse } from "next/server";

// The App Hosting default domain serves an indexable duplicate of the whole
// site — permanently redirect it to the canonical domain.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host.endsWith(".hosted.app")) {
    const url = new URL(request.url);
    url.host = "fibernorth.com";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets; redirecting pages and API routes is enough.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
