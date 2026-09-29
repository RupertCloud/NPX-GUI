"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type JobView = { id: string; status: "queued" | "running" | "succeeded" | "failed"; message?: string; error?: string; url?: string | null }

const ACTIVE = ["queued", "running"]

// Shows a background job and polls it until it finishes. State comes from the server, so it survives refreshes.
export function JobStatus({ initial, label, compact = false }: { initial: JobView; label: string; compact?: boolean }) {
  const router = useRouter()
  const [job, setJob] = useState(initial)
  const active = ACTIVE.includes(job.status)

  useEffect(() => setJob(initial), [initial])

  useEffect(() => {
    if (!active) return
    const t = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" })
      if (!res.ok) return
      const next = (await res.json()) as JobView
      setJob(next)
      if (!ACTIVE.includes(next.status)) router.refresh()
    }, 3000)
    return () => clearInterval(t)
  }, [active, job.id, router])

  if (active) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-sm text-primary">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {label}…{!compact && <span className="text-muted-foreground"> runs in the background; you can leave this page</span>}
      </span>
    )
  }
  if (job.status === "failed") {
    return (
      <span className={cn("inline-flex items-start gap-1.5 text-sm text-destructive", compact && "max-w-64")}>
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className={cn(compact && "line-clamp-2")} title={job.error}>
          {label} failed: {job.error}
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-success">
      <CheckCircle2 className="size-4" aria-hidden />
      {job.message ?? `${label} done`}
      {job.url && (
        <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
          PR <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </span>
  )
}
