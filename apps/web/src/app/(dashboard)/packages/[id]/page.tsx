import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { CopyButton } from "@/components/copy-button"
import { NpmTokenLink } from "@/components/npm-token-link"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPackage, listReleases, roleOf } from "@/lib/data"
import { compactNumber, timeAgo } from "@/lib/format"
import { getFile, getPackageJson, getPull, hasRepoSecret, pullNumber } from "@/lib/github"
import { db } from "@/lib/firebase/admin"
import { latestJob, toJobView } from "@/lib/jobs"
import { JobStatus } from "@/components/job-status"
import { getNpmInfo } from "@/lib/npm"
import { requireUser } from "@/lib/session"
import { isCurrentWorkflow, WORKFLOW_PATH } from "@/lib/workflow"
import { addMember, makeRunnable, mergePackagePr, openWorkflowPrAction, removeMember, removePackage, setNpmToken } from "../../actions"

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const pkg = await getPackage(user, (await params).id)
  if (!pkg) notFound()

  const isAdmin = roleOf(pkg, user) === "admin"
  const [npm, workflow, secret, history, manifest] = await Promise.all([
    getNpmInfo(pkg.npmName).catch(() => null),
    getFile(user.githubToken, pkg.repo, WORKFLOW_PATH, pkg.defaultBranch).catch(() => null),
    hasRepoSecret(user.githubToken, pkg.repo, "NPM_TOKEN").catch(() => null),
    listReleases([pkg.id]),
    getPackageJson(user.githubToken, pkg.repo, pkg.directory, pkg.defaultBranch).catch(() => null),
  ])
  const workflowCurrent = isCurrentWorkflow(workflow)
  const prNumber = pkg.workflowPrUrl ? pullNumber(pkg.workflowPrUrl, pkg.repo) : null
  const pr = !workflowCurrent && prNumber ? await getPull(user.githubToken, pkg.repo, prNumber).catch(() => null) : null
  const hasBin = !!manifest?.bin
  const launcherNumber = !hasBin && pkg.launcherPrUrl ? pullNumber(pkg.launcherPrUrl, pkg.repo) : null
  const launcherPr = launcherNumber ? await getPull(user.githubToken, pkg.repo, launcherNumber).catch(() => null) : null
  const hasAi = !!(await db.collection("users").doc(user.uid).get()).data()?.ai?.keyEnc
  const launcherJob = !hasBin ? await latestJob("launcher", pkg.id) : null
  const launcherJobView = launcherJob ? toJobView(launcherJob) : null
  const launcherBusy = launcherJobView?.status === "queued" || launcherJobView?.status === "running"
  const deprecate = `npm deprecate ${pkg.npmName}@"<version>" "<message>"`

  return (
    <>
      <PageHeader
        title={<span className="break-all">{pkg.npmName}</span>}
        description={
          <>
            <a href={`https://github.com/${pkg.repo}`} className="hover:underline">
              {pkg.repo}
            </a>
            {pkg.directory !== "." && ` · ${pkg.directory}`} · you are {isAdmin ? "an admin" : "a developer"}
          </>
        }
      >
        {npm?.exists && (
          <a
            href={`https://www.npmjs.com/package/${pkg.npmName}`}
            className={buttonVariants({ variant: "outline" })}
            target="_blank"
            rel="noreferrer"
          >
            npm <ExternalLink />
          </a>
        )}
        <Link href={`/publish?package=${pkg.id}`} className={buttonVariants()}>
          Release
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Latest on npm</div>
            <div className="mt-1 font-mono text-2xl">{npm?.latest ?? "unpublished"}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Weekly downloads</div>
            <div className="mt-1 font-heading text-2xl">{npm?.exists ? compactNumber(npm.weeklyDownloads) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Dist-tags</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {npm && Object.keys(npm.distTags).length ? (
                Object.entries(npm.distTags).map(([tag, v]) => (
                  <Badge key={tag} variant="secondary" className="font-mono">
                    {tag}: {v}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Two things must be in place before the first release.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SetupRow done={workflowCurrent} title="1. Current publish workflow on the default branch">
            {workflowCurrent ? (
              <span className="font-mono">{WORKFLOW_PATH}</span>
            ) : (
              <div className="space-y-2">
                <p>
                  {workflow
                    ? "The workflow in this repo is an older version with known bugs. "
                    : "The workflow isn't on the default branch yet. "}
                  {pr?.state === "open" ? (
                    <>
                      <a href={pr.html_url} className="underline" target="_blank" rel="noreferrer">
                        PR #{pr.number}
                      </a>{" "}
                      is ready to merge.
                    </>
                  ) : (
                    "Open a PR to add the current version."
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pr?.state === "open" && (
                    <ActionForm action={mergePackagePr.bind(null, pkg.id, "workflow")}>
                      <SubmitButton size="sm">Merge PR #{pr.number}</SubmitButton>
                    </ActionForm>
                  )}
                  {pr?.state !== "open" && (
                    <ActionForm action={openWorkflowPrAction.bind(null, pkg.id)}>
                      <SubmitButton variant="outline" size="sm">
                        {workflow ? "Open update PR" : "Open workflow PR"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>
            )}
          </SetupRow>

          <SetupRow done={secret === true} title="2. npm token saved as the NPM_TOKEN repo secret">
            <p>
              {secret === true
                ? `Set${pkg.npmTokenSetBy ? ` by @${pkg.npmTokenSetBy}` : ""}${pkg.npmTokenSetAt ? ` ${timeAgo(pkg.npmTokenSetAt)}` : ""}. Paste a new one to replace it.`
                : secret === null
                  ? "Only repo admins can check repo secrets."
                  : "Not set."}{" "}
              Create a granular access token with read and write access to this package. npxhub encrypts it straight into {pkg.repo}&apos;s
              GitHub secrets and does not keep a copy.
            </p>
            <NpmTokenLink defaultUsername={npm?.maintainers[0] ?? ""} />
            {isAdmin ? (
              <ActionForm action={setNpmToken.bind(null, pkg.id)} className="mt-3">
                <div className="flex max-w-lg gap-2">
                  <Label htmlFor="token" className="sr-only">
                    npm access token
                  </Label>
                  <Input id="token" name="token" type="password" placeholder="npm_…" autoComplete="off" className="font-mono" required />
                  <SubmitButton>Save token</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="mt-2 text-muted-foreground">Ask a package admin to set it.</p>
            )}
          </SetupRow>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Run with npx</CardTitle>
          <CardDescription>
            {hasBin
              ? "This package has a bin, so people can run it directly."
              : "This package has no bin yet. npxhub can add a launcher so npx installs the app and starts it locally."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {hasBin ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 font-mono">
              <code>npx {pkg.npmName}</code>
              <CopyButton value={`npx ${pkg.npmName}`} label="Copy command" />
            </div>
          ) : launcherPr?.state === "open" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p>
                <a href={launcherPr.html_url} className="underline" target="_blank" rel="noreferrer">
                  Launcher PR #{launcherPr.number}
                </a>{" "}
                is open. Review it, merge, then publish a new version.
              </p>
              <ActionForm action={mergePackagePr.bind(null, pkg.id, "launcher")}>
                <SubmitButton size="sm">Merge PR #{launcherPr.number}</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">
                Opens a PR adding <code className="font-mono">bin/{pkg.npmName.replace(/^@[^/]+\//, "")}.cjs</code> and the{" "}
                <code className="font-mono">bin</code>/<code className="font-mono">files</code> fields.{" "}
                {hasAi
                  ? "Your AI provider reads the repo to pick the start command, port, build output and env vars."
                  : "Settings are chosen from package.json by rules. Add an AI provider in Settings for a repo-aware setup."}
              </p>
              {launcherJobView && <JobStatus initial={launcherJobView} label="Making it runnable" />}
              {!launcherBusy && (
                <ActionForm action={makeRunnable.bind(null, pkg.id)}>
                  <SubmitButton variant="outline" size="sm">
                    {launcherJobView?.status === "failed" ? "Try again" : "Make runnable with npx"}
                  </SubmitButton>
                </ActionForm>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Collaborators</CardTitle>
            <CardDescription>People sign in with GitHub to see packages they&apos;re added to.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {Object.entries(pkg.members).map(([login, role]) => (
                <li key={login} className="flex items-center justify-between gap-2">
                  <span>@{login}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={role === "admin" ? "default" : "outline"}>{role}</Badge>
                    {isAdmin && (
                      <ActionForm action={removeMember.bind(null, pkg.id, login)}>
                        <SubmitButton variant="ghost" size="xs" aria-label={`Remove @${login}`}>
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {isAdmin && (
              <ActionForm action={addMember.bind(null, pkg.id)}>
                <div className="flex flex-wrap gap-2">
                  <Label htmlFor="login" className="sr-only">
                    GitHub username
                  </Label>
                  <Input id="login" name="login" placeholder="GitHub username" className="w-44" required />
                  <select name="role" aria-label="Role" className={selectClass} defaultValue="developer">
                    <option value="developer">developer</option>
                    <option value="admin">admin</option>
                  </select>
                  <SubmitButton variant="outline">Add</SubmitButton>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deprecate a version</CardTitle>
            <CardDescription>Run this locally while logged in to npm.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-sm">
              <code className="overflow-x-auto">{deprecate}</code>
              <CopyButton value={deprecate} label="Copy command" />
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 font-heading text-xl">Release history</h2>
      <Card className="py-0">
        <ul className="divide-y">
          {history.length === 0 && <li className="p-4 text-muted-foreground">No releases through npxhub yet.</li>}
          {history.map((r) => (
            <li key={r.id}>
              <Link href={`/releases/${r.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50">
                <span className="font-mono">{r.version}</span>
                <span className="text-muted-foreground">
                  @{r.startedBy} · {timeAgo(r.startedAt)}
                </span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin && (
        <form action={removePackage.bind(null, pkg.id)} className="mt-10 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Removing the package from npxhub keeps it on npm and GitHub, including the workflow and the NPM_TOKEN secret.
          </p>
          <SubmitButton variant="destructive" className="mt-3">
            Remove from npxhub
          </SubmitButton>
        </form>
      )}
    </>
  )
}

function SetupRow({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : TriangleAlert
  return (
    <div className="flex gap-3">
      <Icon className={`mt-0.5 size-5 shrink-0 ${done ? "text-success" : "text-warning"}`} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <div className="mb-1 font-medium">{title}</div>
        {children}
      </div>
    </div>
  )
}
