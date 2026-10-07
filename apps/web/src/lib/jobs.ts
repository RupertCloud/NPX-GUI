import "server-only"
import { getAiSettings } from "./ai"
import { getPackage, getRelease, updatePackage, updateRelease } from "./data"
import { db } from "./firebase/admin"
import { suggestFix } from "./fix"
import { aiLaunchConfig, detectLaunchConfig, openLauncherPr, repoContext, validateLaunchConfig } from "./launcher"
import { appendLog, effectiveStatus, runnerToken, type Job, type JobKind, type LogLine } from "./job-utils"
import { userById, type User } from "./session"

export { effectiveStatus, toJobView, type Job, type JobKind, type LogLine } from "./job-utils"

// Long-running work (AI calls, multi-file PRs) runs as a job: state lives in Firestore, and a separate
// server-to-server request does the work, so it continues when the user refreshes or closes the page.

const jobs = db.collection("jobs")
export async function getJob(id: string): Promise<Job | null> {
  const snap = await jobs.doc(id).get()
  return snap.exists ? ({ ...snap.data(), id: snap.id } as Job) : null
}

// Most recent job for a package or release, if any.
export async function latestJob(kind: JobKind, target: string): Promise<Job | null> {
  const snap = await jobs.where("target", "==", target).get()
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Job).filter((j) => j.kind === kind)
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export async function latestJobs(packageIds: string[]): Promise<Job[]> {
  const out: Job[] = []
  for (let i = 0; i < packageIds.length; i += 30) {
    const snap = await jobs.where("packageId", "in", packageIds.slice(i, i + 30)).get()
    out.push(...snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Job))
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Creates a job unless one for the same target is already in progress.
export async function createJob(user: User, kind: JobKind, target: string, packageId: string): Promise<Job | { active: Job }> {
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(jobs.where("target", "==", target))
    const active = existing.docs
      .map((d) => ({ ...d.data(), id: d.id }) as Job)
      .find((j) => j.kind === kind && ["queued", "running"].includes(effectiveStatus(j)))
    if (active) return { active }
    const ref = jobs.doc()
    const job: Omit<Job, "id"> = { kind, target, packageId, uid: user.uid, login: user.login, status: "queued", createdAt: new Date().toISOString() }
    tx.set(ref, job)
    return { ...job, id: ref.id }
  })
}

// Keeps references to in-flight runner responses so they're read to the end and not garbage-collected.
const inFlight = new Set<Promise<unknown>>()

// Starts the runner request and returns once the runner has picked the job up.
export async function kickOff(jobId: string, origin: string) {
  const res = await fetch(`${origin}/api/jobs/${jobId}/run`, {
    method: "POST",
    headers: { "x-npxhub-job-token": runnerToken(jobId) },
    cache: "no-store",
  })
  if (!res.ok || !res.body) throw new Error(`Couldn't start the background job (${res.status})`)
  const reader = res.body.getReader()
  await reader.read() // the runner writes one line as soon as it starts
  const drain = (async () => {
    while (!(await reader.read()).done);
  })().catch(() => {})
  inFlight.add(drain)
  drain.finally(() => inFlight.delete(drain))
}

// What a running job reports: steps it takes, and what the AI writes as it streams.
export type JobLogger = { step: (text: string) => void; ai: (kind: "thinking" | "output", text: string) => void }

// Buffers log lines and writes them to the job document at most once a second.
function jobLogger(jobId: string) {
  const lines: LogLine[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<unknown> = Promise.resolve()
  const flush = () => {
    timer = null
    writing = writing.then(() => jobs.doc(jobId).update({ logs: lines.map((l) => ({ ...l })) })).catch(() => {})
    return writing
  }
  const add = (kind: LogLine["kind"], text: string) => {
    appendLog(lines, kind, text)
    timer ??= setTimeout(flush, 1000)
  }
  const logger: JobLogger = { step: (text) => add("step", text), ai: (kind, text) => add(kind, text) }
  const close = async (error?: string) => {
    if (error) add("error", error)
    if (timer) clearTimeout(timer)
    await flush()
  }
  return { logger, close }
}

export async function failJob(jobId: string, error: string) {
  await jobs.doc(jobId).update({ status: "failed", finishedAt: new Date().toISOString(), error })
}

// Does the work for a job and records the outcome. Never throws.
export async function runJob(jobId: string) {
  const job = await getJob(jobId)
  if (!job || job.status !== "queued") return
  await jobs.doc(jobId).update({ status: "running", startedAt: new Date().toISOString() })
  const { logger, close } = jobLogger(jobId)
  // Shows the job is alive during long AI calls, so it isn't mistaken for a stuck one.
  const heartbeat = setInterval(() => {
    jobs.doc(jobId).update({ heartbeatAt: new Date().toISOString() }).catch(() => {})
  }, 60_000)
  try {
    const user = await userById(job.uid)
    if (!user) throw new Error("The user who started this job is no longer signed in to npxhub")
    const pkg = await getPackage(user, job.packageId)
    if (!pkg) throw new Error("Package not found")
    const result = job.kind === "launcher" ? await runLauncher(user, pkg, logger) : await runFix(user, pkg, job.target, logger)
    logger.step(result.message + (result.url ? `: ${result.url}` : ""))
    await close()
    await jobs.doc(jobId).update({ status: "succeeded", finishedAt: new Date().toISOString(), ...result })
  } catch (e) {
    await close((e as Error).message)
    await failJob(jobId, (e as Error).message)
  } finally {
    clearInterval(heartbeat)
  }
}

async function runLauncher(user: User, pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>, log: JobLogger) {
  log.step(`Reading package.json, file list and README from ${pkg.repo}`)
  const { raw, paths, readme } = await repoContext(user.githubToken, pkg)
  if (!raw) throw new Error("No package.json found on the default branch")
  const manifest = JSON.parse(raw)
  if (manifest.bin) throw new Error("This package already has a bin, so npx can run it")
  const ai = await getAiSettings(user.uid)
  log.step(ai ? `Asking ${ai.model} to configure the launcher` : "No AI provider set; choosing launcher settings from package.json")
  const config = ai ? await aiLaunchConfig(ai, manifest, paths, readme, log.ai) : detectLaunchConfig(manifest)
  const invalid = validateLaunchConfig(config, manifest)
  if (invalid) throw new Error(`${ai ? "The AI's" : "The"} launcher config was rejected: ${invalid}`)
  log.step(
    `Launcher: ${config.mode === "static" ? `serve ${config.staticDir}` : `npm run ${config.startScript}`} on port ${config.port}` +
      (config.files.length ? `; publish ${config.files.join(", ")}` : "") +
      (config.notes.length ? `\nNotes: ${config.notes.join(" ")}` : "")
  )
  log.step("Opening the launcher PR")
  const url = await openLauncherPr(user.githubToken, pkg, raw, config, ai ? "ai" : "rules")
  await updatePackage(pkg.id, { launcherPrUrl: url })
  return { url, message: `Launcher PR opened${ai ? " (configured with AI)" : ""}` }
}

async function runFix(user: User, pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>, releaseId: string, log: JobLogger) {
  const release = await getRelease(releaseId)
  if (!release || release.packageId !== pkg.id) throw new Error("Release not found")
  const ai = await getAiSettings(user.uid)
  if (!ai) throw new Error("Add an AI provider in Settings first")
  const fix = await suggestFix(user.githubToken, ai, pkg, release, log)
  await updateRelease(releaseId, { fix })
  const n = fix.edits.length
  return { url: null, message: n ? `Diagnosis ready: ${n} file ${n === 1 ? "change" : "changes"} proposed. Review and apply below.` : "Diagnosis ready; no file changes proposed" }
}

