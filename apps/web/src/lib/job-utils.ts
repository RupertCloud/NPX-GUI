import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

// Pure job helpers, kept free of Firestore and Next.js imports so they can be unit tested.

export type JobKind = "launcher" | "fix"
export type JobStatus = "queued" | "running" | "succeeded" | "failed"

export type LogLine = { t: string; kind: "step" | "thinking" | "output" | "error"; text: string }

export type Job = {
  id: string
  kind: JobKind
  target: string // package id for "launcher", release id for "fix"
  packageId: string
  uid: string
  login: string
  status: JobStatus
  message?: string
  error?: string
  url?: string
  logs?: LogLine[]
  createdAt: string
  startedAt?: string
  heartbeatAt?: string // updated every minute while the job runs
  finishedAt?: string
}

const STALE_MS = 15 * 60_000

// A queued or running job with no sign of life (heartbeat) for 15 minutes is treated as failed.
export function effectiveStatus(job: Job, now = Date.now()): JobStatus {
  if (job.status !== "queued" && job.status !== "running") return job.status
  const lastSign = [job.createdAt, job.startedAt, job.heartbeatAt].filter(Boolean).map((t) => new Date(t!).getTime())
  return now - Math.max(...lastSign) > STALE_MS ? "failed" : job.status
}

export function runnerToken(jobId: string) {
  return createHmac("sha256", Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64")).update(`job:${jobId}`).digest("hex")
}

export function checkRunnerToken(jobId: string, token: string | null) {
  return safeEqual(runnerToken(jobId), token)
}

function safeEqual(expected: string, token: string | null) {
  const a = Buffer.from(expected)
  const b = Buffer.from(token ?? "")
  return a.length === b.length && timingSafeEqual(a, b)
}

const MAX_STEP_LOG = 40_000

// Appends output to one step's live log, keeping only its most recent part.
export function appendStepLog(current: string | undefined, text: string) {
  const next = (current ?? "") + text
  return next.length > MAX_STEP_LOG ? "…\n" + next.slice(-MAX_STEP_LOG) : next
}

// What the page needs to render a job; safe to pass to client components.
export function toJobView(job: Job) {
  const status = effectiveStatus(job)
  return {
    id: job.id,
    status,
    message: job.message,
    error: status === "failed" && !job.error ? "The job stopped responding; start it again" : job.error,
    url: job.url ?? null,
    logs: job.logs ?? [],
  }
}

const MAX_LOG_CHARS = 120_000

// Appends to a job's log, merging streamed chunks of the same kind into one line and keeping the total bounded.
export function appendLog(lines: LogLine[], kind: LogLine["kind"], text: string, now = new Date()): LogLine[] {
  const last = lines[lines.length - 1]
  if (last && last.kind === kind && (kind === "thinking" || kind === "output")) last.text += text
  else lines.push({ t: now.toISOString(), kind, text })
  let total = lines.reduce((n, l) => n + l.text.length, 0)
  while (total > MAX_LOG_CHARS && lines.length > 1) total -= lines.shift()!.text.length
  if (total > MAX_LOG_CHARS) lines[0].text = lines[0].text.slice(-MAX_LOG_CHARS)
  return lines
}
