import "server-only"
import sodium from "libsodium-wrappers"
import { isCurrentWorkflow, WORKFLOW_FILE, WORKFLOW_PATH, WORKFLOW_YAML } from "./workflow"

const API = "https://api.github.com"

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

// Every call runs as the signed-in user, so GitHub's own permissions apply.
async function gh<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new GitHubError(res.status, body.message ?? `GitHub returned ${res.status} for ${path}`)
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>
}

const is404 = (e: unknown) => e instanceof GitHubError && e.status === 404

export type Repo = {
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  pushed_at: string
  permissions?: { admin: boolean; push: boolean }
}

export const listRepos = (token: string) =>
  gh<Repo[]>(token, "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member")

export const getRepo = (token: string, repo: string) => gh<Repo>(token, `/repos/${repo}`)

export const getGitHubUser = (token: string, login: string) =>
  gh<{ login: string; id: number }>(token, `/users/${encodeURIComponent(login)}`)

export async function listBranches(token: string, repo: string) {
  const branches = await gh<{ name: string }[]>(token, `/repos/${repo}/branches?per_page=100`)
  return branches.map((b) => b.name)
}

export async function getFile(token: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const file = await gh<{ content: string }>(
      token,
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`
    )
    return Buffer.from(file.content, "base64").toString("utf8")
  } catch (e) {
    if (is404(e)) return null
    throw e
  }
}

export function joinPath(directory: string, file: string) {
  return directory && directory !== "." ? `${directory.replace(/\/+$/, "")}/${file}` : file
}

export async function getPackageJson(token: string, repo: string, directory: string, ref: string) {
  const raw = await getFile(token, repo, joinPath(directory, "package.json"), ref)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

// Opens a PR adding or updating the publish workflow (GH-3). Returns null when the current version is already on base.
export async function openWorkflowPr(token: string, repo: string, base: string): Promise<string | null> {
  const existing = await getFile(token, repo, WORKFLOW_PATH, base)
  if (isCurrentWorkflow(existing)) return null
  const { object } = await gh<{ object: { sha: string } }>(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`)
  const branch = `npxhub/setup-${Date.now()}`
  await gh(token, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: object.sha }),
  })
  // Updating a file needs its current blob sha.
  const sha = existing
    ? (await gh<{ sha: string }>(token, `/repos/${repo}/contents/${WORKFLOW_PATH}?ref=${encodeURIComponent(branch)}`)).sha
    : undefined
  await gh(token, `/repos/${repo}/contents/${WORKFLOW_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: existing ? "ci: update npxhub publish workflow" : "ci: add npxhub publish workflow",
      content: Buffer.from(WORKFLOW_YAML).toString("base64"),
      branch,
      sha,
    }),
  })
  const pr = await gh<{ html_url: string }>(token, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: existing ? "Update npxhub publish workflow" : "Add npxhub publish workflow",
      head: branch,
      base,
      body: "Adds or updates `.github/workflows/npxhub-publish.yml`, which npxhub runs to publish releases of this package to npm.\n\nThe workflow reads the `NPM_TOKEN` repository secret that npxhub sets when you add your npm token.",
    }),
  })
  return pr.html_url
}

export type PullState = { number: number; state: "open" | "closed"; merged: boolean; mergeable: boolean | null; html_url: string }

export const getPull = (token: string, repo: string, number: number) => gh<PullState>(token, `/repos/${repo}/pulls/${number}`)

// Merges a PR as the signed-in user; GitHub's branch protection and permissions still apply.
export async function mergePull(token: string, repo: string, number: number) {
  await gh(token, `/repos/${repo}/pulls/${number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) })
}

export function pullNumber(url: string, repo: string): number | null {
  const m = new RegExp(`^https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/(\\d+)$`, "i").exec(url)
  return m ? Number(m[1]) : null
}

// Stores the npm token as an encrypted Actions secret. npxhub itself never keeps it.
export async function setRepoSecret(token: string, repo: string, name: string, value: string) {
  const key = await gh<{ key_id: string; key: string }>(token, `/repos/${repo}/actions/secrets/public-key`)
  await sodium.ready
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL))
  await gh(token, `/repos/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id: key.key_id }),
  })
}

// true / false, or null when the user cannot see repo secrets (not a repo admin).
export async function hasRepoSecret(token: string, repo: string, name: string): Promise<boolean | null> {
  try {
    await gh(token, `/repos/${repo}/actions/secrets/${name}`)
    return true
  } catch (e) {
    if (is404(e)) return false
    if (e instanceof GitHubError && e.status === 403) return null
    throw e
  }
}

export async function dispatchWorkflow(token: string, repo: string, ref: string, inputs: Record<string, string | boolean>) {
  await gh(token, `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  })
}

export type Run = { id: number; html_url: string; status: string; conclusion: string | null; display_title: string }

// Runs are matched by their run-name, which carries the npxhub release id.
export async function findRun(token: string, repo: string, releaseId: string, since: string): Promise<Run | null> {
  const { workflow_runs } = await gh<{ workflow_runs: Run[] }>(
    token,
    `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=30&created=${encodeURIComponent(`>=${since}`)}`
  )
  return workflow_runs.find((r) => r.display_title === `npxhub ${releaseId}`) ?? null
}

export const getRun = (token: string, repo: string, runId: number) => gh<Run>(token, `/repos/${repo}/actions/runs/${runId}`)

export type JobStep = { name: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null }
export type Job = { id: number; status: string; conclusion: string | null; steps?: JobStep[] }

export async function getRunJob(token: string, repo: string, runId: number): Promise<Job | null> {
  const { jobs } = await gh<{ jobs: Job[] }>(token, `/repos/${repo}/actions/runs/${runId}/jobs`)
  return jobs[0] ?? null
}

// Job logs are only downloadable once the job has finished.
export async function getJobLog(token: string, repo: string, jobId: number): Promise<string | null> {
  const res = await fetch(`${API}/repos/${repo}/actions/jobs/${jobId}/logs`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  })
  return res.ok ? res.text() : null
}

// Commit subjects since the last release tag, or the latest commits when there is no tag yet (REL-3).
export async function commitSubjects(token: string, repo: string, fromTag: string | null, head: string) {
  type Commit = { commit: { message: string } }
  let commits: Commit[]
  try {
    if (!fromTag) throw new GitHubError(404, "no tag")
    commits = (await gh<{ commits: Commit[] }>(token, `/repos/${repo}/compare/${encodeURIComponent(fromTag)}...${encodeURIComponent(head)}`)).commits
  } catch (e) {
    if (!is404(e)) throw e
    commits = await gh<Commit[]>(token, `/repos/${repo}/commits?sha=${encodeURIComponent(head)}&per_page=30`)
  }
  return commits.map((c) => c.commit.message.split("\n")[0])
}

export type CheckSummary = { total: number; failed: string[]; pending: string[] }

// CI state of the branch head, ignoring npxhub's own publish job.
export async function checkSummary(token: string, repo: string, ref: string, ignore: string): Promise<CheckSummary> {
  const { check_runs } = await gh<{ check_runs: { name: string; status: string; conclusion: string | null }[] }>(
    token,
    `/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`
  )
  const runs = check_runs.filter((r) => r.name !== ignore)
  return {
    total: runs.length,
    failed: runs.filter((r) => r.status === "completed" && !["success", "skipped", "neutral"].includes(r.conclusion ?? "")).map((r) => r.name),
    pending: runs.filter((r) => r.status !== "completed").map((r) => r.name),
  }
}
