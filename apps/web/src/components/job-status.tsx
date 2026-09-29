"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react"
import { LogConsole } from "@/components/log-console"
import { cn } from "@/lib/utils"

export type LogLine = { t: string; kind: "step" | "thinking" | "output" | "error"; text: string }

export type JobView = {
  id: string
  status: "queued" | "running" | "succeeded" | "failed"
  message?: string
  error?: string
  url?: string | null
  logs?: LogLine[]
}

const ACTIVE = ["queued", "running"]

// Shows a background job and polls it until it finishes. State comes from the server, so it survives refreshes.
export function JobStatus({ initial, label, compact = false }: { initial: JobView; label: string; compact?: boolean }) {
  const job = usePolledJob(initial)
  if (compact) return <JobLine job={job} label={label} compact />
  return (
    <div className="w-full space-y-2">
      <JobLine job={job} label={label} />
      <JobConsole job={job} />
    </div>
  )
}

// Polls a job until it finishes, then re-renders the page from the server.
function usePolledJob(initial: JobView) {
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
    }, 1500)
    return () => clearInterval(t)
  }, [active, job.id, router])

  return job
}

function JobLine({ job, label, compact = false }: { job: JobView; label: string; compact?: boolean }) {
  const active = ACTIVE.includes(job.status)
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

const lineStyle: Record<LogLine["kind"], string> = {
  step: "text-[#e8e6dc]",
  thinking: "italic text-[#9c9a92]",
  output: "text-[#b5d6a7]",
  error: "text-[#f47067]",
}
const prefix: Record<LogLine["kind"], string> = { step: "›", thinking: "thinking", output: "ai", error: "error" }

// Log of what the job did and what the AI wrote. Open while the job runs.
function JobConsole({ job }: { job: JobView }) {
  const logs = job.logs ?? []
  const active = ACTIVE.includes(job.status)
  if (logs.length === 0 && !active) return null
  return (
    <LogConsole
      count={`${logs.length} ${logs.length === 1 ? "entry" : "entries"}`}
      active={active}
      size={logs.reduce((n, l) => n + l.text.length, 0)}
    >
      {logs.length === 0 && <div className="text-[#9c9a92]">Waiting for the job to start…</div>}
      {logs.map((l, i) => (
        <div key={i} className={lineStyle[l.kind]}>
          <span className="mr-2 text-[#6f6d66] select-none">
            {new Date(l.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} {prefix[l.kind]}
          </span>
          {l.text}
        </div>
      ))}
    </LogConsole>
  )
}
