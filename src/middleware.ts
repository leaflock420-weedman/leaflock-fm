import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function canonicalOrigin(): string {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://fm.leaflock.com.au";
  return raw.replace(/\/$/, "");
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (!host.endsWith(".onrender.com")) {
    return NextResponse.next();
  }

  const canonical = new URL(canonicalOrigin());
  if (host === canonical.hostname) {
    return NextResponse.next();
  }

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)"
};