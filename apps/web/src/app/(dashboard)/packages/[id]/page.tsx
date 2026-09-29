import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { CopyButton } from "@/components/copy-button"
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
import { getFile, hasRepoSecret } from "@/lib/github"
import { getNpmInfo } from "@/lib/npm"
import { requireUser } from "@/lib/session"
import { WORKFLOW_PATH } from "@/lib/workflow"
import { addMember, openWorkflowPrAction, removeMember, removePackage, setNpmToken } from "../../actions"

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const pkg = await getPackage(user, (await params).id)
  if (!pkg) notFound()

  const isAdmin = roleOf(pkg, user) === "admin"
  const [npm, workflow, secret, history] = await Promise.all([
    getNpmInfo(pkg.npmName).catch(() => null),
    getFile(user.githubToken, pkg.repo, WORKFLOW_PATH, pkg.defaultBranch).catch(() => null),
    hasRepoSecret(user.githubToken, pkg.repo, "NPM_TOKEN").catch(() => null),
    listReleases([pkg.id]),
  ])
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
          <SetupRow done={!!workflow} title="1. Publish workflow on the default branch">
            {workflow ? (
              <span className="font-mono">{WORKFLOW_PATH}</span>
            ) : (
              <div className="space-y-2">
                {pkg.workflowPrUrl ? (
                  <p>
                    Merge{" "}
                    <a href={pkg.workflowPrUrl} className="underline" target="_blank" rel="noreferrer">
                      the npxhub workflow PR
                    </a>{" "}
                    on {pkg.repo}.
                  </p>
                ) : (
                  <p>No workflow PR yet.</p>
                )}
                <ActionForm action={openWorkflowPrAction.bind(null, pkg.id)}>
                  <SubmitButton variant="outline" size="sm">
                    {pkg.workflowPrUrl ? "Open a new PR" : "Open workflow PR"}
                  </SubmitButton>
                </ActionForm>
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
              Create a{" "}
              <a
                href="https://www.npmjs.com/settings/~/tokens/granular-access-tokens/new"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                granular access token
              </a>{" "}
              with read and write access to this package. npxhub encrypts it straight into {pkg.repo}&apos;s GitHub secrets and does not
              keep a copy.
            </p>
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
