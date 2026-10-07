// Where to go after sign-in: only paths on this site. "//host" and "/\host" are treated by browsers as
// other sites, so they are rejected along with absolute URLs and control characters.
export function safeNext(next: string | undefined, fallback = "/packages") {
  if (!next || !next.startsWith("/") || next[1] === "/" || next[1] === "\\" || /[\u0000-\u001f\\]/.test(next)) return fallback
  return next
}
