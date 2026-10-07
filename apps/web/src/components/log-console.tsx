"use client"

import { useEffect, useRef, useState } from "react"

// Collapsible terminal-style panel that follows new output while open.
export function LogConsole({
  title = "Console",
  count,
  active,
  tail,
  children,
}: {
  title?: string
  count: string
  active: boolean
  tail: string // end of the content; changes whenever output is added, even once older output is trimmed
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(active)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "nearest" })
  }, [tail, open])

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-lg border">
      <summary className="cursor-pointer px-3 py-1.5 text-sm font-medium select-none">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </summary>
      <div
        role="log"
        aria-live="polite"
        className="max-h-96 overflow-auto rounded-b-lg bg-[#1f1e1d] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#e8e6dc]"
      >
        {children}
        <div ref={end} />
      </div>
    </details>
  )
}
