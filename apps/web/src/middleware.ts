import { NextResponse, type NextRequest } from "next/server"

// Cheap gate only; pages verify the token with firebase-admin.
export function middleware(req: NextRequest) {
  if (req.cookies.has("__session")) return NextResponse.next()
  const url = new URL("/login", req.url)
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico).*)"],
}
