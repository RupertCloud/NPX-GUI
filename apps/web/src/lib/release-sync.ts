import "server-only"
import { findRun, getRun, getRunJob, type JobStep } from "./github"
import { getProvenanceUrl } from "./npm"
import { updateRelease, type Release, type StepStatus } from "./data"
import { RELEASE_STEPS } from "./workflow"

const TERMINAL = ["succeeded", "failed", "cancelled"]

function stepStatus(s: JobStep | undefined): StepStatus {
  if (!s) return "pending"
  if (s.status === "in_progress") return "running"
  if (s.status !== "completed") return "pending"
  if (s.conclusion === "success") return "succeeded"
  if (s.conclusion === "skipped") return "skipped"
  return "failed"
}

// Pulls the latest state of a release from GitHub Actions and saves it (REL-2: works after downtime too).
export async function syncRelease(token: string, release: Release): Promise<Release> {
  if (TERMINAL.includes(release.status)) return release

  let { runId, runUrl } = release
  if (!runId) {
    const since = new Date(new Date(release.startedAt).getTime() - 60_000).toISOString()
    const run = await findRun(token, release.repo, release.id, since)
    if (!run) {
      if (Date.now() - new Date(release.startedAt).getTime() > 10 * 60_000) {
        const failed = { status: "failed" as const, error: "The workflow run never started on GitHub", finishedAt: new Date().toISOString() }
        await updateRelease(release.id, failed)
        return { ...release, ...failed }
      }
      return release
    }
    runId = run.id
    runUrl = run.html_url
  }

  const [run, job] = await Promise.all([getRun(token, release.repo, runId), getRunJob(token, release.repo, runId)])
  const steps = RELEASE_STEPS.map((name) => stepStatus(job?.steps?.find((s) => s.name === name)))
  const update: Partial<Release> = { runId, runUrl, steps, status: run.status === "completed" ? "failed" : "running" }

  if (run.status === "completed") {
    update.status = run.conclusion === "success" ? "succeeded" : run.conclusion === "cancelled" ? "cancelled" : "failed"
    update.finishedAt = new Date().toISOString()
    update.steps = steps.map((s) => (s === "pending" || s === "running" ? "skipped" : s))
    if (update.status === "succeeded") {
      const url = await getProvenanceUrl(release.npmName, release.version)
      if (url) update.provenanceUrl = url
    }
  }
  await updateRelease(release.id, update)
  return { ...release, ...update }
}
