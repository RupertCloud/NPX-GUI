"use client"

import { useEffect, useState } from "react"
import { ReleaseView } from "@/components/release-view"
import { currentUser, type Package, type Release } from "@/lib/mock-data"

// Simulates the SSE stream the API will send while the publish workflow runs.
function script(pkg: Package, version: string, tag: string): string[][] {
  const bin = pkg.bin ? Object.keys(pkg.bin)[0] : null
  return [
    [`Checked out ${pkg.repo}@${pkg.defaultBranch}`],
    [`package.json ${pkg.latestVersion} → ${version}`, `Committed chore(release): ${version}`],
    ["npm ci", "npm run build", "npm test", "All tests passed"],
    [`Tagged v${version}`, `Created GitHub release v${version}`],
    [`npm publish --access public --tag ${tag}`, `+ ${pkg.name}@${version}`, "Provenance statement published"],
    bin ? [`$ npx ${pkg.name}@${version} --version`, version] : [`$ node -e "require('${pkg.name}')"`, "ok"],
  ]
}

export function LiveRelease({ pkg, version, tag }: { pkg: Package; version: string; tag: string }) {
  const [lines] = useState(() => script(pkg, version, tag))
  const [tick, setTick] = useState(0)
  const total = lines.reduce((n, l) => n + l.length, 0)

  useEffect(() => {
    if (tick >= total) return
    const t = setTimeout(() => setTick((n) => n + 1), 700)
    return () => clearTimeout(t)
  }, [tick, total])

  let remaining = tick
  let runningAssigned = false
  const steps: Release["steps"] = lines.map((log) => {
    const shown = Math.min(remaining, log.length)
    remaining -= shown
    if (shown === log.length) return { status: "succeeded", log, durationSec: log.length }
    const status = runningAssigned ? "pending" : "running"
    runningAssigned = true
    return { status, log: log.slice(0, shown) }
  })

  const done = tick >= total
  const release: Release = {
    id: "rel_live",
    packageName: pkg.name,
    version,
    distTag: tag,
    commitSha: "HEAD",
    status: done ? "succeeded" : "running",
    startedBy: currentUser.login,
    startedAt: new Date().toISOString(),
    provenanceUrl: done ? `https://www.npmjs.com/package/${pkg.name}/v/${version}#provenance` : undefined,
    notes: "Notes as entered on the Publish page.",
    steps,
  }

  return <ReleaseView release={release} />
}
