import type { Package } from "./mock-data"

export type Bump = "patch" | "minor" | "major" | "prerelease"

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const DIST_TAG = /^[a-z][a-z0-9-]{0,31}$/

export function isValidVersion(v: string) {
  return SEMVER.test(v)
}

export function isValidDistTag(t: string) {
  return DIST_TAG.test(t) && !SEMVER.test(t)
}

export function bump(version: string, kind: Bump, preid = "beta"): string {
  const m = SEMVER.exec(version)
  if (!m) return version
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const pre = m[4]
  switch (kind) {
    case "major":
      return `${maj + 1}.0.0`
    case "minor":
      return `${maj}.${min + 1}.0`
    case "patch":
      return pre ? `${maj}.${min}.${pat}` : `${maj}.${min}.${pat + 1}`
    case "prerelease": {
      const n = pre?.startsWith(`${preid}.`) ? Number(pre.split(".")[1]) + 1 : 0
      return pre ? `${maj}.${min}.${pat}-${preid}.${n}` : `${maj}.${min}.${pat + 1}-${preid}.0`
    }
  }
}

// Returns >0 when a > b. Prerelease ordering is simplified to string compare.
export function compare(a: string, b: string): number {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (!pa || !pb) return 0
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d
  }
  if (pa[4] === pb[4]) return 0
  if (!pa[4]) return 1
  if (!pb[4]) return -1
  return pa[4].localeCompare(pb[4], undefined, { numeric: true })
}

export type Check = { label: string; level: "blocker" | "warning"; passed: boolean; detail?: string }

// Pre-flight results as the API would return them (SRS §5), derived from mock package state.
export function preflight(pkg: Package): Check[] {
  return [
    {
      label: "bin field points at an existing file",
      level: pkg.bin ? "blocker" : "warning",
      passed: !!pkg.bin,
      detail: pkg.bin ? Object.values(pkg.bin).join(", ") : "No bin field; npx will not run this package",
    },
    { label: "Name owned on npmjs.com", level: "blocker", passed: true },
    {
      label: "Required CI checks green",
      level: "blocker",
      passed: pkg.name !== "ridelink-cli",
      detail: pkg.settings.requiredChecks.length ? pkg.settings.requiredChecks.join(", ") : "No required checks configured",
    },
    {
      label: "Trusted publisher configured",
      level: "blocker",
      passed: pkg.trustedPublisherVerified,
      detail: pkg.trustedPublisherVerified ? "Dry-run publish succeeded" : "Finish setup on the package page",
    },
    { label: "Dry-run pack: no secrets or key files", level: "blocker", passed: true, detail: "38 files, 212 kB unpacked" },
    { label: "repository.url matches GitHub repo", level: "warning", passed: true },
    { label: "engines.node set", level: "warning", passed: pkg.name !== "@rupert/coolify-deploy" },
    { label: "README mentions the npx command", level: "warning", passed: !!pkg.bin },
  ]
}
