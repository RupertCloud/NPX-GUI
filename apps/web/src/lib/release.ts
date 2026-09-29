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

// Git tag for a release: v1.2.3, or name@1.2.3 for a package in a subdirectory (monorepos).
export function gitTagFor(npmName: string, directory: string, version: string) {
  return directory && directory !== "." ? `${npmName}@${version}` : `v${version}`
}

// Release notes from commit subjects, grouped by conventional-commit type (REL-3).
export function draftNotes(subjects: string[]) {
  const groups: Record<string, string[]> = { Features: [], Fixes: [], Other: [] }
  for (const s of subjects) {
    if (/^chore\(release\)/.test(s) || /^Merge (pull request|branch)/.test(s)) continue
    const m = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/.exec(s)
    const group = m?.[1] === "feat" ? "Features" : m?.[1] === "fix" ? "Fixes" : "Other"
    groups[group].push(`- ${m ? m[3] : s}`)
  }
  const out = Object.entries(groups)
    .filter(([, lines]) => lines.length)
    .map(([title, lines]) => `### ${title}\n${lines.join("\n")}`)
  return out.join("\n\n") || "- No changes listed"
}
