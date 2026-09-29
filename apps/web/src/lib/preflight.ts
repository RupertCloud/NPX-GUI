import "server-only"
import { checkSummary, getFile, getPackageJson, hasRepoSecret, joinPath } from "./github"
import type { Package } from "./data"
import type { NpmInfo } from "./npm"
import { isCurrentWorkflow, JOB_NAME, WORKFLOW_PATH } from "./workflow"

export type Check = { label: string; level: "blocker" | "warning"; passed: boolean; detail?: string }

// Pre-flight checks against the real repo and registry (SRS §5). The secret/key-file tarball scan runs inside the workflow.
export async function preflight(token: string, pkg: Package, branch: string, npm: NpmInfo): Promise<Check[]> {
  const [manifest, workflow, secret, ci] = await Promise.all([
    getPackageJson(token, pkg.repo, pkg.directory, branch),
    getFile(token, pkg.repo, WORKFLOW_PATH, branch),
    hasRepoSecret(token, pkg.repo, "NPM_TOKEN"),
    checkSummary(token, pkg.repo, branch, JOB_NAME),
  ])
  if (!manifest) return [{ label: "package.json found", level: "blocker", passed: false, detail: `No package.json in ${pkg.directory} on ${branch}` }]

  const checks: Check[] = []
  checks.push({
    label: "package.json name matches",
    level: "blocker",
    passed: manifest.name === pkg.npmName,
    detail: manifest.name === pkg.npmName ? undefined : `package.json says ${String(manifest.name)}`,
  })
  const current = isCurrentWorkflow(workflow)
  checks.push({
    label: "Current publish workflow on this branch",
    level: "blocker",
    passed: current,
    detail: current ? WORKFLOW_PATH : workflow ? "The workflow is outdated; update it from the package page" : "Add the workflow from the package page",
  })
  checks.push(
    secret === null
      ? { label: "NPM_TOKEN secret set", level: "warning", passed: false, detail: "Only repo admins can see secrets; the publish step fails if it is missing" }
      : { label: "NPM_TOKEN secret set", level: "blocker", passed: secret, detail: secret ? undefined : "Add your npm token on the package page" }
  )
  checks.push({
    label: "CI checks green",
    level: "blocker",
    passed: ci.failed.length === 0,
    detail: ci.failed.length ? `Failing: ${ci.failed.join(", ")}` : ci.total === 0 ? "No checks on this commit" : `${ci.total} checks`,
  })
  if (ci.pending.length) checks.push({ label: "CI finished", level: "warning", passed: false, detail: `Still running: ${ci.pending.join(", ")}` })

  const bin = manifest.bin
  const binFiles = typeof bin === "string" ? [bin] : bin && typeof bin === "object" ? Object.values(bin as Record<string, string>) : []
  if (binFiles.length) {
    const missing: string[] = []
    for (const f of binFiles) {
      if (!(await getFile(token, pkg.repo, joinPath(pkg.directory, f.replace(/^\.\//, "")), branch))) missing.push(f)
    }
    // A bin inside a build output directory (e.g. dist/) only exists after the build, so this is a warning.
    checks.push({ label: "bin files exist", level: "warning", passed: missing.length === 0, detail: missing.length ? `Not in repo (built?): ${missing.join(", ")}` : binFiles.join(", ") })
  } else {
    checks.push({ label: "bin field (for npx)", level: "warning", passed: false, detail: "No bin field; npx won't run this package" })
  }

  const repoUrl = typeof manifest.repository === "string" ? manifest.repository : (manifest.repository as { url?: string } | undefined)?.url
  checks.push({
    label: "repository.url matches GitHub repo",
    level: "warning",
    passed: !!repoUrl?.toLowerCase().includes(pkg.repo.toLowerCase()),
    detail: pkg.private ? "Private repo: published without provenance" : "Needed for provenance",
  })
  checks.push({ label: "engines.node set", level: "warning", passed: !!(manifest.engines as { node?: string } | undefined)?.node })
  checks.push({
    label: npm.exists ? "Name exists on npm" : "Name is free on npm",
    level: "warning",
    passed: true,
    detail: npm.exists ? "Your npm token must have publish rights to it" : "First publish claims it",
  })
  return checks
}
