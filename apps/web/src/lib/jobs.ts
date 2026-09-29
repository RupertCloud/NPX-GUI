import "server-only"
import { getAiSettings } from "./ai"
import { getPackage, getRelease, updatePackage, updateRelease } from "./data"
import { db } from "./firebase/admin"
import { suggestFix } from "./fix"
import { aiLaunchConfig, detectLaunchConfig, openLauncherPr, repoContext, validateLaunchConfig } from "./launcher"
import { effectiveStatus, runnerToken, type Job, type JobKind } from "./job-utils"
import { userById, type User } from "./session"

export { effectiveStatus, toJobView, type Job, type JobKind } from "./job-utils"

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

// Does the work for a job and records the outcome. Never throws.
export async function runJob(jobId: string) {
  const job = await getJob(jobId)
  if (!job || job.status !== "queued") return
  await jobs.doc(jobId).update({ status: "running", startedAt: new Date().toISOString() })
  try {
    const user = await userById(job.uid)
    if (!user) throw new Error("The user who started this job is no longer signed in to npxhub")
    const pkg = await getPackage(user, job.packageId)
    if (!pkg) throw new Error("Package not found")
    const result = job.kind === "launcher" ? await runLauncher(user, pkg) : await runFix(user, pkg, job.target)
    await jobs.doc(jobId).update({ status: "succeeded", finishedAt: new Date().toISOString(), ...result })
  } catch (e) {
    await jobs.doc(jobId).update({ status: "failed", finishedAt: new Date().toISOString(), error: (e as Error).message })
  }
}

async function runLauncher(user: User, pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>) {
  const { raw, paths, readme } = await repoContext(user.githubToken, pkg)
  if (!raw) throw new Error("No package.json found on the default branch")
  const manifest = JSON.parse(raw)
  if (manifest.bin) throw new Error("This package already has a bin, so npx can run it")
  const ai = await getAiSettings(user.uid)
  const config = ai ? await aiLaunchConfig(ai, manifest, paths, readme) : detectLaunchConfig(manifest)
  const invalid = validateLaunchConfig(config, manifest)
  if (invalid) throw new Error(`${ai ? "The AI's" : "The"} launcher config was rejected: ${invalid}`)
  const url = await openLauncherPr(user.githubToken, pkg, raw, config, ai ? "ai" : "rules")
  await updatePackage(pkg.id, { launcherPrUrl: url })
  return { url, message: `Launcher PR opened${ai ? " (configured with AI)" : ""}` }
}

async function runFix(user: User, pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>, releaseId: string) {
  const release = await getRelease(releaseId)
  if (!release || release.packageId !== pkg.id) throw new Error("Release not found")
  const ai = await getAiSettings(user.uid)
  if (!ai) throw new Error("Add an AI provider in Settings first")
  const fix = await suggestFix(user.githubToken, ai, pkg, release)
  await updateRelease(releaseId, { fix })
  return { url: fix.prUrl ?? null, message: fix.prUrl ? "Fix PR opened" : "Diagnosis ready; no file changes proposed" }
}

