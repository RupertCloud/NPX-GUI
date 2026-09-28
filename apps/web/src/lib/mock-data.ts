// Mock data standing in for the npxhub API until it exists.

export type ReleaseStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped"
export type Role = "developer" | "admin"

export const RELEASE_STEPS = [
  "Checkout",
  "Bump version and commit",
  "Build and test",
  "Tag and GitHub release",
  "Publish to npm",
  "Verify install",
] as const

export type Package = {
  name: string
  repo: string
  directory?: string
  defaultBranch: string
  latestVersion: string
  distTags: Record<string, string>
  weeklyDownloads: number
  lastPublished: string
  provenance: boolean
  trustedPublisherVerified: boolean
  role: Role
  bin: Record<string, string> | null
  settings: {
    defaultBump: "patch" | "minor" | "major"
    allowedDistTags: string[]
    requiredChecks: string[]
  }
  collaborators: { login: string; role: Role }[]
}

export type ReleaseStep = { status: StepStatus; durationSec?: number; log: string[] }

export type Release = {
  id: string
  packageName: string
  version: string
  distTag: string
  commitSha: string
  status: ReleaseStatus
  startedBy: string
  startedAt: string
  finishedAt?: string
  provenanceUrl?: string
  notes: string
  steps: ReleaseStep[]
}

export type Device = {
  id: string
  name: string
  os: string
  cliVersion: string
  createdAt: string
  lastUsedAt: string
}

export type Installation = {
  id: number
  accountLogin: string
  repos: number
  suspended: boolean
}

export const currentUser = { login: "amon", name: "Amon" }

export const packages: Package[] = [
  {
    name: "npxhub",
    repo: "rupertcloud/npxhub",
    directory: "packages/cli",
    defaultBranch: "main",
    latestVersion: "0.4.2",
    distTags: { latest: "0.4.2", next: "0.5.0-beta.1" },
    weeklyDownloads: 1840,
    lastPublished: "2026-09-26T14:12:00Z",
    provenance: true,
    trustedPublisherVerified: true,
    role: "admin",
    bin: { npxhub: "./dist/cli.js" },
    settings: { defaultBump: "patch", allowedDistTags: ["latest", "next"], requiredChecks: ["test", "lint"] },
    collaborators: [
      { login: "amon", role: "admin" },
      { login: "kato-dev", role: "developer" },
    ],
  },
  {
    name: "@silk/ui",
    repo: "silkcode/silk-ui",
    defaultBranch: "main",
    latestVersion: "2.8.0",
    distTags: { latest: "2.8.0" },
    weeklyDownloads: 12650,
    lastPublished: "2026-09-21T09:40:00Z",
    provenance: true,
    trustedPublisherVerified: true,
    role: "admin",
    bin: null,
    settings: { defaultBump: "minor", allowedDistTags: ["latest", "next", "canary"], requiredChecks: ["ci"] },
    collaborators: [
      { login: "amon", role: "admin" },
      { login: "nakato", role: "admin" },
      { login: "jb-okello", role: "developer" },
    ],
  },
  {
    name: "create-silk-app",
    repo: "silkcode/create-silk-app",
    defaultBranch: "main",
    latestVersion: "1.3.5",
    distTags: { latest: "1.3.5" },
    weeklyDownloads: 3120,
    lastPublished: "2026-09-27T17:05:00Z",
    provenance: true,
    trustedPublisherVerified: true,
    role: "developer",
    bin: { "create-silk-app": "./bin/index.js" },
    settings: { defaultBump: "patch", allowedDistTags: ["latest"], requiredChecks: ["test"] },
    collaborators: [
      { login: "nakato", role: "admin" },
      { login: "amon", role: "developer" },
    ],
  },
  {
    name: "ridelink-cli",
    repo: "ridelink/ridelink-cli",
    defaultBranch: "main",
    latestVersion: "0.9.1",
    distTags: { latest: "0.9.1" },
    weeklyDownloads: 214,
    lastPublished: "2026-08-30T11:22:00Z",
    provenance: false,
    trustedPublisherVerified: false,
    role: "admin",
    bin: { ridelink: "./dist/index.js" },
    settings: { defaultBump: "patch", allowedDistTags: ["latest"], requiredChecks: [] },
    collaborators: [{ login: "amon", role: "admin" }],
  },
  {
    name: "@rupert/coolify-deploy",
    repo: "rupertcloud/tools",
    directory: "packages/coolify-deploy",
    defaultBranch: "main",
    latestVersion: "0.2.0",
    distTags: { latest: "0.2.0" },
    weeklyDownloads: 57,
    lastPublished: "2026-07-14T08:03:00Z",
    provenance: false,
    trustedPublisherVerified: true,
    role: "admin",
    bin: { "coolify-deploy": "./cli.mjs" },
    settings: { defaultBump: "patch", allowedDistTags: ["latest"], requiredChecks: ["build"] },
    collaborators: [{ login: "amon", role: "admin" }],
  },
]

const ok = (log: string[], durationSec: number): ReleaseStep => ({ status: "succeeded", durationSec, log })

export const releases: Release[] = [
  {
    id: "rel_7f3a",
    packageName: "create-silk-app",
    version: "1.3.5",
    distTag: "latest",
    commitSha: "a91c4e2",
    status: "succeeded",
    startedBy: "nakato",
    startedAt: "2026-09-27T17:02:10Z",
    finishedAt: "2026-09-27T17:05:31Z",
    provenanceUrl: "https://www.npmjs.com/package/create-silk-app/v/1.3.5#provenance",
    notes: "### Fixes\n- Template no longer overwrites an existing .gitignore",
    steps: [
      ok(["Checked out silkcode/create-silk-app@a91c4e2"], 4),
      ok(["package.json 1.3.4 → 1.3.5", "Committed chore(release): 1.3.5"], 6),
      ok(["npm ci", "npm run build", "npm test — 48 passed"], 94),
      ok(["Tagged v1.3.5", "Created GitHub release v1.3.5"], 3),
      ok(["npm publish --access public", "+ create-silk-app@1.3.5", "Provenance statement published"], 21),
      ok(["$ npx create-silk-app@1.3.5 --version", "1.3.5"], 12),
    ],
  },
  {
    id: "rel_7e91",
    packageName: "npxhub",
    version: "0.4.2",
    distTag: "latest",
    commitSha: "3be0d17",
    status: "succeeded",
    startedBy: "amon",
    startedAt: "2026-09-26T14:08:44Z",
    finishedAt: "2026-09-26T14:12:02Z",
    provenanceUrl: "https://www.npmjs.com/package/npxhub/v/0.4.2#provenance",
    notes: "### Fixes\n- `npxhub status` respects `--json`",
    steps: [
      ok(["Checked out rupertcloud/npxhub@3be0d17"], 3),
      ok(["packages/cli/package.json 0.4.1 → 0.4.2"], 5),
      ok(["npm ci", "npm run build -w packages/cli", "npm test — 112 passed"], 118),
      ok(["Tagged v0.4.2", "Created GitHub release v0.4.2"], 3),
      ok(["npm publish -w packages/cli --access public", "+ npxhub@0.4.2"], 19),
      ok(["$ npx npxhub@0.4.2 --version", "0.4.2"], 10),
    ],
  },
  {
    id: "rel_7d02",
    packageName: "ridelink-cli",
    version: "0.9.2",
    distTag: "latest",
    commitSha: "c04f9aa",
    status: "failed",
    startedBy: "amon",
    startedAt: "2026-09-24T10:15:00Z",
    finishedAt: "2026-09-24T10:17:12Z",
    notes: "### Features\n- `ridelink trips --since`",
    steps: [
      ok(["Checked out ridelink/ridelink-cli@c04f9aa"], 4),
      ok(["package.json 0.9.1 → 0.9.2"], 5),
      {
        status: "failed",
        durationSec: 61,
        log: ["npm ci", "npm test", "FAIL src/trips.test.ts", "  ✕ parses --since as ISO date (12 ms)", "Tests: 1 failed, 33 passed", "Process exited with code 1"],
      },
      { status: "skipped", log: [] },
      { status: "skipped", log: [] },
      { status: "skipped", log: [] },
    ],
  },
  {
    id: "rel_7c55",
    packageName: "@silk/ui",
    version: "2.8.0",
    distTag: "latest",
    commitSha: "e8d2210",
    status: "succeeded",
    startedBy: "jb-okello",
    startedAt: "2026-09-21T09:34:40Z",
    finishedAt: "2026-09-21T09:40:03Z",
    provenanceUrl: "https://www.npmjs.com/package/@silk/ui/v/2.8.0#provenance",
    notes: "### Features\n- `<Combobox>` component\n### Fixes\n- Focus ring contrast in dark mode",
    steps: [
      ok(["Checked out silkcode/silk-ui@e8d2210"], 5),
      ok(["package.json 2.7.3 → 2.8.0"], 6),
      ok(["npm ci", "npm run build", "npm test — 604 passed"], 241),
      ok(["Tagged v2.8.0", "Created GitHub release v2.8.0"], 4),
      ok(["npm publish --access public", "+ @silk/ui@2.8.0"], 27),
      ok(["No bin field; checked `node -e \"require('@silk/ui')\"`", "ok"], 14),
    ],
  },
  {
    id: "rel_7b10",
    packageName: "@rupert/coolify-deploy",
    version: "0.2.0",
    distTag: "latest",
    commitSha: "71aa0c3",
    status: "succeeded",
    startedBy: "amon",
    startedAt: "2026-07-14T08:00:00Z",
    finishedAt: "2026-07-14T08:03:10Z",
    notes: "### Features\n- `--app` flag",
    steps: [
      ok(["Checked out rupertcloud/tools@71aa0c3"], 3),
      ok(["packages/coolify-deploy/package.json 0.1.4 → 0.2.0"], 5),
      ok(["npm ci", "npm test — 9 passed"], 40),
      ok(["Tagged coolify-deploy@0.2.0"], 3),
      ok(["NPM_TOKEN publish (no provenance)", "+ @rupert/coolify-deploy@0.2.0"], 15),
      ok(["$ npx @rupert/coolify-deploy@0.2.0 --version", "0.2.0"], 9),
    ],
  },
]

export const devices: Device[] = [
  { id: "dev_1", name: "amon-mbp", os: "macOS 16.1", cliVersion: "0.4.2", createdAt: "2026-06-02T08:00:00Z", lastUsedAt: "2026-09-28T07:41:00Z" },
  { id: "dev_2", name: "rupert", os: "Ubuntu 24.04", cliVersion: "0.4.1", createdAt: "2026-07-11T12:30:00Z", lastUsedAt: "2026-09-19T22:10:00Z" },
  { id: "dev_3", name: "DESKTOP-K2L9", os: "Windows 11", cliVersion: "0.3.0", createdAt: "2026-05-20T15:12:00Z", lastUsedAt: "2026-07-01T09:00:00Z" },
]

export const installations: Installation[] = [
  { id: 5501, accountLogin: "rupertcloud", repos: 3, suspended: false },
  { id: 5502, accountLogin: "silkcode", repos: 6, suspended: false },
  { id: 5503, accountLogin: "ridelink", repos: 1, suspended: false },
]

export function getPackage(name: string) {
  return packages.find((p) => p.name === name)
}

export function getRelease(id: string) {
  return releases.find((r) => r.id === id)
}
