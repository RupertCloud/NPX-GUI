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
  finishedAt?: string
}

const STALE_MS = 15 * 60_000

// A queued or running job that stopped reporting is treated as failed.
export function effectiveStatus(job: Job, now = Date.now()): JobStatus {
  if (job.status !== "queued" && job.status !== "running") return job.status
  return now - new Date(job.startedAt ?? job.createdAt).getTime() > STALE_MS ? "failed" : job.status
}

export function runnerToken(jobId: string) {
  return createHmac("sha256", Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64")).update(`job:${jobId}`).digest("hex")
}

export function checkRunnerToken(jobId: string, token: string | null) {
  const expected = Buffer.from(runnerToken(jobId))
  const given = Buffer.from(token ?? "")
  return given.length === expected.length && timingSafeEqual(given, expected)
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
