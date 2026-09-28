# npxhub — Software Requirements Specification

Cloud publish dashboard for npm packages, linked from the terminal with `npx npxhub`

Sep 28, 2026 · @Amon

## 1. Introduction

npxhub is a public, cloud-hosted publish dashboard for npm packages: a developer runs `npx npxhub` once to link their machine and GitHub identity, then manages releases from a web app hosted on Rupert. This SRS defines what version 1.0 must do so it can be built and shipped.

**Scope.** In scope: the `npxhub` CLI on npm, the web app, release orchestration through GitHub Actions, npm registry and GitHub integration, multi-user accounts. Out of scope for 1.0 is listed in section 10.

**Definitions.**

| Term | Meaning |
| --- | --- |
| Package | An npm package the user owns or maintains, linked to one GitHub repo |
| Release | One publish of one version of a package, run as a tracked job |
| Trusted publishing | npm's OIDC flow: a named GitHub Actions workflow publishes with short-lived credentials and no stored token ([npm docs](https://docs.npmjs.com/trusted-publishers)) |
| Provenance | The signed attestation npm attaches to a publish, linking the tarball to the source commit and workflow |
| Machine link | A device record created by `npx npxhub`, holding a device-scoped refresh token |
| Rupert | The self-hosted Ubuntu/Coolify server at ripaplatform.com that runs the web app |

**Assumptions.** Users have a GitHub account and an npmjs.com account. Every package to be published lives in a GitHub repo the user can install a GitHub App on. Publishing runs on GitHub-hosted runners, because [trusted publishing does not support self-hosted runners](https://docs.npmjs.com/trusted-publishers) and npm has [restricted long-lived tokens since September 2025](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/); Rupert therefore orchestrates releases rather than running `npm publish` itself. The working name npxhub is a placeholder until the npm name is checked.

## 2. Product overview

npxhub replaces hand-written release workflows and stored `NPM_TOKEN` secrets with one dashboard that any developer can adopt in under five minutes. The product has two parts that ship together.

**The CLI (`npxhub` on npm).** A small Node package with a `bin` entry. `npx npxhub` opens a browser sign-in, links the machine, and prints the dashboard URL. It has three further commands: `npxhub init` (register the current repo as a package), `npxhub release` (start a release from the terminal), and `npxhub status`. It carries no UI and no publish logic.

**The web app (app.npxhub.dev, hosted on Rupert).** The Claude.ai-style dashboard shown in the mockups: Packages, Publish, Releases, Tokens & orgs. It stores accounts, packages and release history, talks to GitHub and the npm registry, and dispatches the workflow that does the actual publish.

**Who it is for.**

| Audience | What they get |
| --- | --- |
| Solo maintainers | One place to bump, tag and publish without remembering the ritual |
| Small teams with several packages | A cross-package view, release history, and who-published-what |
| Amon's own teams (Silk, Rupert, Ridelink) | The first users; their packages seed the beta |

**What makes it different from `npm publish` + a workflow file:** pre-flight checks before every publish (bin field, tarball contents, secrets scan, CI state), generated release notes, a verified `npx` install after publish, and provenance on by default.

## 3. User roles and key journeys

| Role | Can do |
| --- | --- |
| Visitor | Read the landing page and docs; nothing else |
| Developer | Link machines, add packages they have write access to, run and view releases for those packages |
| Package admin | Everything a developer can, plus add or remove collaborators on a package, set dist-tag policy, deprecate versions |
| Platform admin (Amon) | Manage the instance: feature flags, GitHub App credentials, abuse controls, usage limits |

**Journey A — first run (target: under 5 minutes).**

1. Developer runs `npx npxhub` in any terminal.
2. CLI prints a short code and opens `app.npxhub.dev/link`; developer signs in with GitHub and confirms the code.
3. CLI stores a device token in the OS keychain and prints the dashboard URL.
4. Dashboard asks to install the npxhub GitHub App on the repos to manage.
5. Developer picks a repo; npxhub reads `package.json`, checks the npm name, and creates the package record.

**Journey B — publish a release.**

1. From Packages, click Release (or run `npxhub release` in the repo).
2. Choose patch/minor/major or a dist-tag; review generated notes.
3. Pre-flight runs; warnings can be accepted, blockers cannot.
4. Click Publish. npxhub commits the version bump, tags, creates the GitHub release, and dispatches the publish workflow.
5. Release page streams the steps; ends with a verified `npx <pkg>@<version> --version`.

**Journey C — one-time trusted publishing setup (per package).**

1. npxhub opens a PR adding `.github/workflows/npxhub-publish.yml` to the repo.
2. Dashboard shows the exact values to enter on npmjs.com → package Settings → Trusted Publisher (org, repo, workflow file name).
3. Developer merges the PR and confirms; npxhub runs a dry-run publish to verify.

## 4. Functional requirements — CLI and machine linking

The CLI is deliberately thin: sign-in, a few remote commands, nothing that could leak a credential or drift from the web app.

| ID | Requirement | Priority |
| --- | --- | --- |
| CLI-1 | Package `npxhub` on npm with a `bin` entry; `npx npxhub` with no args runs the link flow | Must |
| CLI-2 | Supports Node 20 and 22 LTS; no native dependencies; install under 5 MB unpacked | Must |
| CLI-3 | Link flow uses the OAuth device-authorization pattern: CLI requests a user code, opens the browser to the link page, polls until confirmed, then receives a device-scoped refresh token | Must |
| CLI-4 | Tokens are stored in the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux); fall back to a `0600` file in `~/.config/npxhub/` with a printed warning | Must |
| CLI-5 | `npxhub init` reads `package.json` and `git remote`, registers the package if the user has write access on the repo, otherwise explains why not | Must |
| CLI-6 | `npxhub release [patch\|minor\|major\|<version>] [--tag <dist-tag>]` starts a release for the current repo and streams the job log to the terminal | Should |
| CLI-7 | `npxhub status` lists the user's packages, latest version and last release result | Should |
| CLI-8 | `npxhub logout` revokes the device token server-side and removes it locally | Must |
| CLI-9 | On every run, CLI checks the server for a minimum supported version and prints an upgrade notice; it never auto-updates | Must |
| CLI-10 | Exit codes: 0 success, 1 user error, 2 auth error, 3 release failed; all output is also available as `--json` | Should |

**Machine-link records.** Each link stores device name, OS, CLI version, created and last-used timestamps. Users can see and revoke links from Tokens & orgs. Refresh tokens expire after 90 days of inactivity; access tokens live 1 hour.

## 5. Functional requirements — packages, releases, pre-flight

A release is a tracked job with six fixed steps; every step is visible live and the record is kept permanently.

**Packages**

| ID | Requirement | Priority |
| --- | --- | --- |
| PKG-1 | Packages view lists every package the user can access: name, latest version, weekly downloads (from the npm downloads API), last published, provenance status | Must |
| PKG-2 | Add a package by picking a repo from the GitHub App installation; npxhub reads `package.json` (name, version, `bin`, `files`, `publishConfig`) and shows what it found before saving | Must |
| PKG-3 | Monorepos: a package may point at a subdirectory; one repo can back many packages | Should |
| PKG-4 | Package settings: default bump, allowed dist-tags, required CI check names, collaborators | Must |
| PKG-5 | Refresh version and download data from the registry at least every 15 minutes and on demand | Should |

**Releases**

| ID | Requirement | Priority |
| --- | --- | --- |
| REL-1 | Start a release from a chosen branch and commit; default is the default branch at HEAD | Must |
| REL-2 | Version choice: patch, minor, major, prerelease, or an explicit semver; the new version must be greater than the latest on the chosen dist-tag | Must |
| REL-3 | Release notes generated from commits since the last tag (conventional-commit aware), editable before publish | Should |
| REL-4 | The six steps, in order: checkout → bump version and commit → build and test → tag and GitHub release → publish to npm → verify install. A failure stops the job and later steps are marked skipped | Must |
| REL-5 | Live log streaming per step to the web app and the CLI (SSE); logs retained 90 days, step results forever | Must |
| REL-6 | Verify-install step runs `npx <name>@<version> --version` (or `--help` when no version flag) on a clean runner and records the output | Must |
| REL-7 | Deprecate a version with a message; undeprecate; unpublish is not offered (npm's 72-hour rule makes it a manual, deliberate action) | Should |
| REL-8 | Concurrency: one active release per package; a second request queues and says so | Must |

**Pre-flight checks** (run before the Publish button enables; each is a warning or a blocker)

| Check | Level |
| --- | --- |
| `bin` field present and points at an existing file (so `npx` works) | Blocker |
| `name` is free or owned by the user on npmjs.com; scope matches an org they belong to | Blocker |
| Required CI checks green on the chosen commit | Blocker |
| Trusted publisher configured (dry-run publish succeeded once) | Blocker |
| Dry-run pack: file count, unpacked size, any file matching `.env*`, `*.pem`, `id_rsa*`, or a secret-pattern scan hit | Warning; secret hit is a Blocker |
| `repository.url` matches the GitHub repo (needed for provenance) | Warning |
| `engines.node` set | Warning |
| README present and mentions the `npx` command | Warning |

## 6. Functional requirements — GitHub, npm, trusted publishing

npxhub never holds an npm write token for a user. The publish itself always runs inside the user's own GitHub Actions workflow under trusted publishing; npxhub prepares, dispatches, watches and records it.

**GitHub**

| ID | Requirement | Priority |
| --- | --- | --- |
| GH-1 | Sign-in via GitHub OAuth; the GitHub login is the account identity | Must |
| GH-2 | An npxhub GitHub App installed per repo with permissions: contents read/write, pull requests write, actions read/write, metadata read. Installation tokens are minted per job and expire in one hour | Must |
| GH-3 | On package setup, open a PR adding `.github/workflows/npxhub-publish.yml` (triggered by `workflow_dispatch` with inputs `version`, `tag`, `release_id`); never push to the default branch directly | Must |
| GH-4 | The workflow does: checkout at the given commit, `npm ci`, build, test, `npm publish --access public` (provenance is automatic under trusted publishing), then POSTs step results back to npxhub with a per-job callback token | Must |
| GH-5 | Release step "tag and GitHub release" creates an annotated tag `v<version>` and a GitHub release carrying the notes | Must |
| GH-6 | Version-bump commit is made by the App on a short-lived branch and merged by fast-forward when branch protection allows; otherwise it is opened as a PR and the release waits | Should |

**npm registry**

| ID | Requirement | Priority |
| --- | --- | --- |
| NPM-1 | Read package metadata, versions and dist-tags from `registry.npmjs.org` and downloads from `api.npmjs.org` without credentials | Must |
| NPM-2 | Show, per package, the exact trusted-publisher values to enter on npmjs.com ([org/user, repository, workflow filename, environment](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)) and a copy button; npxhub cannot set these itself (no npm API for it) | Must |
| NPM-3 | Workflow uses `actions/setup-node` with `registry-url` and pins npm ≥ 11.5.1, [the minimum for trusted publishing](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) | Must |
| NPM-4 | Deprecate/undeprecate require an npm token: 1.0 shows the exact `npm deprecate` command to run locally rather than storing a token | Should |
| NPM-5 | Fallback for packages that cannot use trusted publishing (private source repo): the workflow reads an `NPM_TOKEN` repo secret the user sets themselves; npxhub flags the package as "token publish, no provenance" | Could |

**Provenance.** Every release record stores whether an attestation was attached and links to it on npmjs.com. Packages whose last publish has no provenance are counted on the dashboard (the "without provenance" tile in the mockups).

## 7. System architecture and data model

&#91;embedded content: npxhub architecture · 7 components, 2 external systems\]

The API is the only component that talks to GitHub and npm; the browser and CLI talk only to it, and the publish command itself runs on a GitHub-hosted runner under the user's own repo identity.

**Stack.** Next.js (App Router) + TypeScript + ShadCN for the web app; a Node API service (same repo, separate Coolify app) for auth, job orchestration and SSE; Postgres for state; Redis for job queues and rate limits. Both apps deploy through Coolify on Rupert behind cloudflared, matching the Silkcode Cloud setup. The CLI is a separate npm package in the same monorepo.

**Data model.**

| Table | Key fields |
| --- | --- |
| users | id, github\_id, login, email, created\_at |
| devices | id, user\_id, name, os, cli\_version, refresh\_token\_hash, last\_used\_at, revoked\_at |
| installations | id, github\_installation\_id, account\_login, suspended\_at |
| packages | id, npm\_name, repo\_full\_name, directory, default\_branch, installation\_id, trusted\_publisher\_verified\_at, settings (jsonb) |
| package\_members | package\_id, user\_id, role (developer / admin) |
| releases | id, package\_id, version, dist\_tag, commit\_sha, notes, status, started\_by, started\_at, finished\_at, provenance\_url |
| release\_steps | release\_id, step (1–6), status, started\_at, finished\_at, log\_ref |
| registry\_snapshots | package\_id, fetched\_at, latest\_version, dist\_tags (jsonb), weekly\_downloads |
| audit\_log | id, actor\_id, action, target, at |

Release status is a fixed set: queued, running, succeeded, failed, cancelled. Step logs are stored as objects (S3-compatible, MinIO on Rupert) and referenced by `log_ref`, not in Postgres.

## 8. Non-functional requirements

The product's whole value rests on being safer than a stored token, so security requirements are all Must.

| ID | Requirement |
| --- | --- |
| SEC-1 | npxhub never stores an npm token for a user; the only credentials held are GitHub App private key (server), user OAuth tokens (encrypted at rest, AES-256-GCM, key in Coolify secrets), and device refresh-token hashes |
| SEC-2 | Workflow callbacks are authenticated with a per-release HMAC token that expires when the release finishes |
| SEC-3 | All inputs passed into the generated workflow (`version`, `tag`) are validated against semver / dist-tag grammar server-side before dispatch, to prevent injection into the runner |
| SEC-4 | Rate limits: 30 releases per package per day, 10 device links per user, 60 API requests per minute per token |
| SEC-5 | Audit log for every publish, deprecate, collaborator change and device revocation, visible to package admins |
| SEC-6 | Dependency and container scanning on every npxhub build; the CLI package is itself published with provenance |
| PERF-1 | Dashboard first load under 2 s on a 10 Mbps connection; Packages view renders 200 packages without pagination lag |
| PERF-2 | Release step updates appear in the UI within 3 s of the runner reporting them |
| PERF-3 | `npx npxhub` cold start to browser open under 4 s on Node 22 |
| REL-1 | 99.5 % monthly availability for the web app and API (Rupert is a single VM; this is the honest ceiling until a second node exists) |
| REL-2 | A release already dispatched to GitHub completes even if npxhub is down; results are reconciled from the Actions API on recovery |
| REL-3 | Nightly Postgres backups to off-site object storage, 30-day retention, restore tested monthly |
| CMP-1 | Privacy policy and terms published before public beta; GitHub Marketplace listing requires them |
| CMP-2 | Data stored: GitHub login, email, repo names, release metadata. No package source is retained on Rupert after a job |
| CMP-3 | Users can delete their account; all their data is removed within 30 days, audit-log rows anonymised |
| USA-1 | Keyboard-operable and WCAG 2.1 AA colour contrast, as in the mockups |
| USA-2 | CLI output readable in a 80-column terminal, no colour required to understand it |

## 9. Publishing npxhub itself

npxhub eats its own cooking: the CLI package is released through npxhub once the pipeline works, and by the same GitHub Actions workflow before that.

**Package shape.**

```json
{
  "name": "npxhub",
  "version": "0.1.0",
  "bin": { "npxhub": "./dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "repository": { "type": "git", "url": "git+https://github.com/[ORG]/npxhub.git", "directory": "packages/cli" },
  "publishConfig": { "access": "public" }
}
```

**Bootstrap workflow** (`.github/workflows/publish-cli.yml`, until npxhub can release itself):

```yaml
on:
  release: { types: [published] }
permissions: { id-token: write, contents: read }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: https://registry.npmjs.org }
      - run: npm i -g npm@latest
      - run: npm ci && npm run build -w packages/cli
      - run: npm publish -w packages/cli --access public
```

The trusted publisher on npmjs.com for `npxhub` points at `[ORG]/npxhub`, workflow `publish-cli.yml`.

**Versioning policy.**

- Semver. `0.x` until the public beta ends; `1.0.0` when the acceptance criteria in section 10 pass.
- The CLI and the server share one version number; the server publishes its minimum supported CLI version at `/api/meta`, and the CLI warns below it (CLI-9).
- Prereleases go to the `next` dist-tag; `latest` is only ever a stable release.
- Breaking API changes are versioned under `/api/v1`, `/api/v2`; a CLI major bump accompanies an API major bump.

**Name check.** Before any of this, confirm `npxhub` is free on npmjs.com (and whether a scoped fallback like `@silk/npxhub` is acceptable); the working name is unverified.

## 10. Delivery, acceptance, risks, open decisions

&#91;embedded content: delivery roadmap · 5 phases, 5 gates\]

Phase 3 is the accent because it carries the risk: everything before it is plumbing, everything after it is polish.

**Acceptance criteria for 1.0**

- [ ] A new user goes from `npx npxhub` to a registered package in under 5 minutes, measured on three fresh machines (macOS, Windows, Ubuntu)
- [ ] A release of a real package ends with a provenance attestation on npmjs.com and a passing verify-install step
- [ ] A release with a `.pem` file in the tarball is blocked before publish
- [ ] Revoking a device from the dashboard makes the CLI fail with exit code 2 on its next call
- [ ] npxhub's own CLI has been released through npxhub at least twice
- [ ] Three teams outside Silk/Rupert/Ridelink have shipped a release

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Trusted-publisher setup must be done by hand on npmjs.com | Onboarding friction; users drop out at Journey C | Exact copy-paste values, a screenshot walkthrough, and a dry-run that confirms success |
| Branch protection blocks the version-bump commit | Release stalls | GH-6: fall back to a PR and pause the release with a clear message |
| GitHub Actions minutes are the user's, not npxhub's | Cost surprise for private repos | State it on the package setup page; public repos are free |
| Rupert is a single VM | Outage stops new releases (in-flight ones finish, REL-2) | Backups (REL-3); second node is a post-1.0 item |
| npm changes trusted-publishing rules again | Workflow template breaks | Template is versioned server-side and re-issued as a PR to affected repos |
| Name `npxhub` taken | Rebrand | Check before Phase 1 (section 9) |

**Out of scope for 1.0**

- Publishing to registries other than npmjs.com (GitHub Packages, private registries)
- GitLab CI as a runner, self-hosted runners
- Changesets-style multi-package releases in one job
- Billing; 1.0 is free
- Mobile layout beyond read-only Releases

**Open decisions**

- [ ] Product name and npm name
- [ ] Domain: `npxhub.dev`, or under `ripaplatform.com` for the beta
- [ ] Whether the CLI should also run a release non-interactively in CI (`npxhub release --yes`) in 1.0 or after
- [ ] Store step logs in MinIO on Rupert or in Cloudflare R2
- [ ] Who builds it: which of the Silkcode/Rupert engineers, and whether Phase 3 is done before or after Silkcode Cloud Phase 3, which needs the same people
