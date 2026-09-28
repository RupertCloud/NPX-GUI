"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  createPackage,
  createRelease,
  deletePackage,
  findPackageByName,
  getPackage,
  roleOf,
  setMember,
  updatePackage,
  updateRelease,
  type Package,
  type Role,
} from "@/lib/data"
import { dispatchWorkflow, getGitHubUser, getPackageJson, getRepo, GitHubError, openWorkflowPr, setRepoSecret } from "@/lib/github"
import { getNpmInfo } from "@/lib/npm"
import { compare, gitTagFor, isValidDistTag, isValidVersion } from "@/lib/release"
import { requireUser, type User } from "@/lib/session"

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
    return { ok: url ? "Pull request opened" : "The workflow is already on the default branch" }
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

export async function startRelease(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let releaseId: string
  try {
    const user = await requireUser()
    const pkg = await packageFor(user, String(formData.get("packageId")))
    const version = String(formData.get("version") ?? "").trim()
    const distTag = String(formData.get("tag") ?? "").trim()
    const branch = String(formData.get("branch") ?? pkg.defaultBranch)
    const notes = String(formData.get("notes") ?? "").slice(0, 20_000)

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
    releaseId = created.id

    try {
      await dispatchWorkflow(user.githubToken, pkg.repo, branch, {
        version,
        tag: distTag,
        git_tag: gitTag,
        directory: pkg.directory,
        notes,
        provenance: !pkg.private,
        release_id: releaseId,
      })
      await updateRelease(releaseId, { status: "running" })
    } catch (e) {
      await updateRelease(releaseId, { status: "failed", error: message(e), finishedAt: new Date().toISOString() })
    }
  } catch (e) {
    return { error: message(e) }
  }
  redirect(`/releases/${releaseId}`)
}
