"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  createPackage,
  createRelease,
  deletePackage,
  findPackageByName,
  getPackage,
  getRelease,
  roleOf,
  setMember,
  updatePackage,
  updateRelease,
  type Package,
  type Role,
} from "@/lib/data"
import {
  dispatchWorkflow,
  getFile,
  getGitHubUser,
  getPackageJson,
  getRepo,
  GitHubError,
  mergePull,
  openWorkflowPr,
  pullNumber,
  setRepoSecret,
} from "@/lib/github"
import { getNpmInfo } from "@/lib/npm"
import { compare, gitTagFor, isValidDistTag, isValidVersion } from "@/lib/release"
import { requireUser, type User } from "@/lib/session"
import { isCurrentWorkflow, WORKFLOW_PATH } from "@/lib/workflow"
import { FieldValue } from "firebase-admin/firestore"
import { checkBaseUrl, DEFAULT_MODEL, getAiSettings, testAi, type StoredAiSettings } from "@/lib/ai"
import { encrypt } from "@/lib/crypto"
import { db } from "@/lib/firebase/admin"
import { suggestFix } from "@/lib/fix"
import { aiLaunchConfig, detectLaunchConfig, openLauncherPr, repoContext, validateLaunchConfig } from "@/lib/launcher"

export type ActionResult = { error?: string; ok?: string } | undefined

const message = (e: unknown) =>
  e instanceof GitHubError && e.status === 403
    ? `GitHub denied this: ${e.message}. You may need admin rights on the repo.`
    : (e as Error).message

async function packageFor(user: User, id: string, role?: Role): Promise<Package> {
  const pkg = await getPackage(user, id)
  if (!pkg) throw new Error("Package not found")
  if (role === "admin" && roleOf(pkg, user) !== "admin") throw new Error("Only package admins can do this")
  return pkg
}

const cleanDir = (d: string) => d.trim().replace(/^\.?\/+|\/+$/g, "") || "."

export async function addPackage(formData: FormData) {
  const user = await requireUser()
  const repoName = String(formData.get("repo"))
  const directory = cleanDir(String(formData.get("directory") ?? ""))
  if (directory.split("/").includes("..")) throw new Error("Invalid directory")

  const repo = await getRepo(user.githubToken, repoName)
  if (!repo.permissions?.push) throw new Error(`You need write access to ${repo.full_name} to add it`)
  const manifest = await getPackageJson(user.githubToken, repo.full_name, directory, repo.default_branch)
  if (!manifest?.name || typeof manifest.name !== "string") throw new Error("No package.json with a name found there")
  if (manifest.private === true) throw new Error(`${manifest.name} is marked "private": true and cannot be published`)
  if (await findPackageByName(manifest.name)) throw new Error(`${manifest.name} is already registered in npxhub; ask its admin to add you`)

  const id = await createPackage(user, {
    npmName: manifest.name,
    repo: repo.full_name,
    directory,
    defaultBranch: repo.default_branch,
    private: repo.private,
  })
  try {
    const prUrl = await openWorkflowPr(user.githubToken, repo.full_name, repo.default_branch)
    if (prUrl) await updatePackage(id, { workflowPrUrl: prUrl })
  } catch {
    // Non-fatal: the package page offers to open the PR again.
  }
  redirect(`/packages/${id}`)
}

export async function openWorkflowPrAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, id)
    const url = await openWorkflowPr(user.githubToken, pkg.repo, pkg.defaultBranch)
    if (url) await updatePackage(id, { workflowPrUrl: url })
    revalidatePath(`/packages/${id}`)
    return { ok: url ? "Pull request opened" : "The current workflow is already on the default branch" }
  } catch (e) {
    return { error: message(e) }
  }
}

// Merges one of npxhub's own PRs (workflow or launcher) from the dashboard.
export async function mergePackagePr(id: string, kind: "workflow" | "launcher"): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, id)
    const url = kind === "workflow" ? pkg.workflowPrUrl : pkg.launcherPrUrl
    const number = url ? pullNumber(url, pkg.repo) : null
    if (!number) return { error: "No npxhub PR to merge" }
    await mergePull(user.githubToken, pkg.repo, number)
    revalidatePath(`/packages/${id}`)
    return { ok: "Merged" }
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 405 || e.status === 409)) {
      return { error: `GitHub couldn't merge it: ${e.message}. Check the PR's required reviews or checks on GitHub.` }
    }
    return { error: message(e) }
  }
}

// Opens a PR that makes the package runnable with npx. Uses the user's AI provider when set, rules otherwise.
export async function makeRunnable(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, id)
    const { raw, paths, readme } = await repoContext(user.githubToken, pkg)
    if (!raw) return { error: "No package.json found on the default branch" }
    const manifest = JSON.parse(raw)
    if (manifest.bin) return { error: "This package already has a bin, so npx can run it" }
    const ai = await getAiSettings(user.uid)
    const config = ai ? await aiLaunchConfig(ai, manifest, paths, readme) : detectLaunchConfig(manifest)
    const invalid = validateLaunchConfig(config, manifest)
    if (invalid) return { error: `${ai ? "The AI's" : "The"} launcher config was rejected: ${invalid}` }
    const url = await openLauncherPr(user.githubToken, pkg, raw, config, ai ? "ai" : "rules")
    await updatePackage(id, { launcherPrUrl: url })
    revalidatePath(`/packages/${id}`)
    return { ok: `Launcher PR opened${ai ? " (configured with AI)" : ""}` }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function saveAiSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const provider = formData.get("provider") === "openai" ? "openai" : "anthropic"
    const baseUrl = String(formData.get("baseUrl") ?? "").trim()
    const model = String(formData.get("model") ?? "").trim() || DEFAULT_MODEL[provider]
    const apiKey = String(formData.get("apiKey") ?? "").trim()
    const badUrl = checkBaseUrl(baseUrl)
    if (badUrl) return { error: badUrl }
    if (!model) return { error: "Enter a model name" }
    if (!/^[\w.:/@-]{1,200}$/.test(model)) return { error: "That model name has unexpected characters" }

    const ref = db.collection("users").doc(user.uid)
    const existing = (await ref.get()).data()?.ai as StoredAiSettings | undefined
    if (!apiKey && !existing?.keyEnc) return { error: "Enter an API key" }
    const settings: StoredAiSettings = {
      provider,
      baseUrl,
      model,
      keyEnc: apiKey ? encrypt(apiKey) : existing!.keyEnc,
      keyHint: apiKey ? apiKey.slice(-4) : existing!.keyHint,
    }
    await ref.set({ ai: settings }, { merge: true })
    revalidatePath("/settings")
    return { ok: "Saved" }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function removeAiSettings(): Promise<ActionResult> {
  const user = await requireUser()
  await db.collection("users").doc(user.uid).update({ ai: FieldValue.delete() })
  revalidatePath("/settings")
  return { ok: "Removed" }
}

export async function testAiSettings(): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const ai = await getAiSettings(user.uid)
    if (!ai) return { error: "Save a provider first" }
    await testAi(ai)
    return { ok: `${ai.model} answered` }
  } catch (e) {
    return { error: message(e) }
  }
}

// Asks the user's AI provider to diagnose a failed release and, when it can, opens a fix PR.
export async function suggestReleaseFix(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const release = await getRelease(id)
    const pkg = release && (await getPackage(user, release.packageId))
    if (!release || !pkg) return { error: "Release not found" }
    if (release.status !== "failed") return { error: "Only failed releases can be diagnosed" }
    const ai = await getAiSettings(user.uid)
    if (!ai) return { error: "Add an AI provider in Settings first" }
    const fix = await suggestFix(user.githubToken, ai, pkg, release)
    await updateRelease(id, { fix })
    revalidatePath(`/releases/${id}`)
    return { ok: fix.prUrl ? "Fix PR opened" : "Diagnosis ready; no file changes proposed" }
  } catch (e) {
    return { error: message(e) }
  }
}

// Merges the AI fix PR for a release.
export async function mergeFixPr(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const release = await getRelease(id)
    const pkg = release && (await getPackage(user, release.packageId))
    const number = release?.fix?.prUrl && pkg ? pullNumber(release.fix.prUrl, pkg.repo) : null
    if (!release || !pkg || !number) return { error: "No fix PR to merge" }
    await mergePull(user.githubToken, pkg.repo, number)
    revalidatePath(`/releases/${id}`)
    return { ok: "Merged. Retry the release when ready." }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function setNpmToken(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, id, "admin")
    const token = String(formData.get("token") ?? "").trim()
    if (!/^npm_[A-Za-z0-9]{20,}$/.test(token)) return { error: "That doesn't look like an npm access token (npm_…)" }
    await setRepoSecret(user.githubToken, pkg.repo, "NPM_TOKEN", token)
    await updatePackage(id, { npmTokenSetAt: new Date().toISOString(), npmTokenSetBy: user.login })
    revalidatePath(`/packages/${id}`)
    return { ok: `Saved as the NPM_TOKEN secret on ${pkg.repo}` }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function addMember(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await packageFor(user, id, "admin")
    const login = String(formData.get("login") ?? "").trim().replace(/^@/, "")
    const role = formData.get("role") === "admin" ? "admin" : "developer"
    if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return { error: "Enter a GitHub username" }
    const gh = await getGitHubUser(user.githubToken, login).catch(() => null)
    if (!gh) return { error: `No GitHub user named ${login}` }
    await setMember(id, gh.login, role)
    revalidatePath(`/packages/${id}`)
    return { ok: `@${gh.login} added as ${role}. They can sign in with GitHub to see this package.` }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function removeMember(id: string, login: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, id, "admin")
    const admins = Object.entries(pkg.members).filter(([, r]) => r === "admin")
    if (pkg.members[login] === "admin" && admins.length === 1) return { error: "A package needs at least one admin" }
    await setMember(id, login, null)
    revalidatePath(`/packages/${id}`)
    return { ok: `@${login} removed` }
  } catch (e) {
    return { error: message(e) }
  }
}

export async function removePackage(id: string) {
  const user = await requireUser()
  await packageFor(user, id, "admin")
  await deletePackage(id)
  redirect("/packages")
}

type ReleaseInput = { version: string; distTag: string; branch: string; notes: string }

// Validates, records and dispatches a release. Returns the new release id or an error.
async function launchRelease(user: User, pkg: Package, input: ReleaseInput): Promise<{ id: string } | { error: string }> {
  const { version, distTag, branch, notes } = input
  // Validate server-side before anything reaches the runner (SEC-3, REL-2).
  if (!isValidVersion(version)) return { error: "Not a valid semver version" }
  if (!isValidDistTag(distTag)) return { error: "Not a valid dist-tag" }
  if (distTag === "latest" && version.includes("-")) return { error: "Prereleases go to a non-latest dist-tag" }
  const npm = await getNpmInfo(pkg.npmName)
  if (npm.exists) {
    const current = npm.distTags[distTag] ?? npm.latest
    if (current && compare(version, current) <= 0) return { error: `Must be greater than ${current}` }
  }

  const gitTag = gitTagFor(pkg.npmName, pkg.directory, version)
  const created = await createRelease({
    packageId: pkg.id,
    npmName: pkg.npmName,
    repo: pkg.repo,
    version,
    distTag,
    gitTag,
    branch,
    notes,
    status: "queued",
    startedBy: user.login,
    startedAt: new Date().toISOString(),
  })
  if ("active" in created) return { error: `${pkg.npmName}@${created.active.version} is still releasing; wait for it to finish` }

  try {
    await dispatchWorkflow(user.githubToken, pkg.repo, branch, {
      version,
      tag: distTag,
      git_tag: gitTag,
      directory: pkg.directory,
      notes,
      provenance: !pkg.private,
      release_id: created.id,
    })
    await updateRelease(created.id, { status: "running" })
  } catch (e) {
    await updateRelease(created.id, { status: "failed", error: message(e), finishedAt: new Date().toISOString() })
  }
  return { id: created.id }
}

export async function startRelease(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let releaseId: string
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, String(formData.get("packageId")))
    const result = await launchRelease(user, pkg, {
      version: String(formData.get("version") ?? "").trim(),
      distTag: String(formData.get("tag") ?? "").trim(),
      branch: String(formData.get("branch") ?? pkg.defaultBranch),
      notes: String(formData.get("notes") ?? "").slice(0, 20_000),
    })
    if ("error" in result) return result
    releaseId = result.id
  } catch (e) {
    return { error: message(e) }
  }
  redirect(`/releases/${releaseId}`)
}

// Runs a failed or cancelled release again with the same version, tag, branch and notes.
export async function retryRelease(id: string): Promise<ActionResult> {
  let releaseId: string
  try {
    const user = await requireUser()
    const previous = await getRelease(id)
    const pkg = previous && (await getPackage(user, previous.packageId))
    if (!previous || !pkg) return { error: "Release not found" }
    if (previous.status !== "failed" && previous.status !== "cancelled")
      return { error: "Only failed or cancelled releases can be retried" }
    if (!isCurrentWorkflow(await getFile(user.githubToken, pkg.repo, WORKFLOW_PATH, previous.branch))) {
      return { error: "The publish workflow on this branch is missing or outdated. Update it from the package page, then retry." }
    }
    const result = await launchRelease(user, pkg, previous)
    if ("error" in result) return result
    releaseId = result.id
  } catch (e) {
    return { error: message(e) }
  }
  redirect(`/releases/${releaseId}`)
}
