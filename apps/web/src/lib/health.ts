import "server-only"
import type { Package, Release } from "./data"
import { getFile, getPackageJson, getPull, hasRepoSecret, pullNumber } from "./github"
import { effectiveStatus, type Job } from "./jobs"
import { isCurrentWorkflow, WORKFLOW_PATH } from "./workflow"

// The single most useful next action for a package, shown on the Packages list.
export type NextStep =
  | { kind: "job"; job: Job; label: string }
  | { kind: "merge-workflow"; number: number }
  | { kind: "workflow"; outdated: boolean }
  | { kind: "token" }
  | { kind: "fix"; releaseId: string; version: string }
  | { kind: "review-fix"; releaseId: string }
  | { kind: "merge-launcher"; number: number }
  | { kind: "runnable" }
  | { kind: "ready" }
  | { kind: "unknown"; reason: string }

const openPr = async (token: string, pkg: Package, url?: string) => {
  const n = url ? pullNumber(url, pkg.repo) : null
  const pr = n ? await getPull(token, pkg.repo, n).catch(() => null) : null
  return pr?.state === "open" ? pr.number : null
}

export async function nextStep(token: string, pkg: Package, lastRelease: Release | undefined, jobs: Job[]): Promise<NextStep> {
  const active = jobs.find((j) => j.packageId === pkg.id && ["queued", "running"].includes(effectiveStatus(j)))
  if (active) return { kind: "job", job: active, label: active.kind === "fix" ? "Fixing with AI" : "Making runnable" }
  try {
    const [workflow, secret, manifest] = await Promise.all([
      getFile(token, pkg.repo, WORKFLOW_PATH, pkg.defaultBranch),
      hasRepoSecret(token, pkg.repo, "NPM_TOKEN"),
      getPackageJson(token, pkg.repo, pkg.directory, pkg.defaultBranch),
    ])
    if (!isCurrentWorkflow(workflow)) {
      const n = await openPr(token, pkg, pkg.workflowPrUrl)
      return n ? { kind: "merge-workflow", number: n } : { kind: "workflow", outdated: !!workflow }
    }
    if (secret === false) return { kind: "token" }
    if (lastRelease?.status === "failed" && lastRelease.runId) {
      const fix = lastRelease.fix
      if (fix?.edits?.length && !fix.commitSha && !fix.mergedAt) return { kind: "review-fix", releaseId: lastRelease.id }
      if (!fix) return { kind: "fix", releaseId: lastRelease.id, version: lastRelease.version }
    }
    if (manifest && !manifest.bin) {
      const n = await openPr(token, pkg, pkg.launcherPrUrl)
      return n ? { kind: "merge-launcher", number: n } : { kind: "runnable" }
    }
    return { kind: "ready" }
  } catch (e) {
    return { kind: "unknown", reason: (e as Error).message }
  }
}
