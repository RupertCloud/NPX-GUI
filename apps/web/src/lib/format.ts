export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function duration(sec: number) {
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`
}

export function compactNumber(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n)
}
