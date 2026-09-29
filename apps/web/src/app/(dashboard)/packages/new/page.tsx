import Link from "next/link"
import { Lock } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SubmitButton } from "@/components/submit-button"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { findPackageByName } from "@/lib/data"
import { timeAgo } from "@/lib/format"
import { getPackageJson, getRepo, listRepos } from "@/lib/github"
import { getNpmInfo } from "@/lib/npm"
import { requireUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { addPackage } from "../../actions"

export default async function NewPackagePage({ searchParams }: { searchParams: Promise<{ repo?: string; dir?: string }> }) {
  const user = await requireUser()
  const { repo: selected, dir = "" } = await searchParams
  const repos = (await listRepos(user.githubToken)).filter((r) => r.permissions?.push)

  return (
    <>
      <PageHeader
        title="Add a package"
        description="Pick one of your GitHub repos. npxhub reads its package.json and shows what it found before saving."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Repository</CardTitle>
            <CardDescription>Repos you can push to, most recently updated first.</CardDescription>
          </CardHeader>
          <CardContent>
            {repos.length === 0 ? (
              <p className="text-muted-foreground">No repos with write access were found for @{user.login}.</p>
            ) : (
              <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-lg border">
                {repos.map((r) => (
                  <li key={r.full_name}>
                    <Link
                      href={`/packages/new?repo=${encodeURIComponent(r.full_name)}`}
                      aria-current={selected === r.full_name ? "true" : undefined}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50",
                        selected === r.full_name && "bg-primary/10"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-mono text-sm">
                        <span className="truncate">{r.full_name}</span>
                        {r.private && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Private" />}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.pushed_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div>{selected ? <Preview token={user.githubToken} repoName={selected} dir={dir} /> : null}</div>
      </div>
    </>
  )
}

async function Preview({ token, repoName, dir }: { token: string; repoName: string; dir: string }) {
  const repo = await getRepo(token, repoName)
  const directory = dir.trim().replace(/^\.?\/+|\/+$/g, "") || "."
  const manifest = await getPackageJson(token, repo.full_name, directory, repo.default_branch)
  const name = typeof manifest?.name === "string" ? manifest.name : null
  const [npm, existing] = name ? await Promise.all([getNpmInfo(name), findPackageByName(name)]) : [null, null]
  const problem = !manifest
    ? `No package.json in ${directory === "." ? "the repo root" : directory} on ${repo.default_branch}.`
    : !name
      ? "package.json has no name."
      : manifest.private === true
        ? `package.json is marked "private": true.`
        : existing
          ? `${name} is already in npxhub. Ask its admin to add you as a collaborator.`
          : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">{repo.full_name}</CardTitle>
        <CardDescription>Default branch {repo.default_branch}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-1.5" action="/packages/new">
          <input type="hidden" name="repo" value={repo.full_name} />
          <Label htmlFor="dir">Package directory (monorepos)</Label>
          <div className="flex gap-2">
            <Input id="dir" name="dir" defaultValue={directory === "." ? "" : directory} placeholder="packages/cli" className="font-mono" />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Look
            </button>
          </div>
        </form>

        {manifest && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">name</dt>
            <dd className="font-mono break-all">{String(manifest.name ?? "—")}</dd>
            <dt className="text-muted-foreground">version</dt>
            <dd className="font-mono">{String(manifest.version ?? "—")}</dd>
            <dt className="text-muted-foreground">bin</dt>
            <dd className="font-mono break-all">
              {manifest.bin ? JSON.stringify(manifest.bin) : <span className="text-warning">none, npx won&apos;t run it</span>}
            </dd>
            <dt className="text-muted-foreground">files</dt>
            <dd className="font-mono break-all">{manifest.files ? JSON.stringify(manifest.files) : "—"}</dd>
            <dt className="text-muted-foreground">on npm</dt>
            <dd>{npm?.exists ? `yes, latest ${npm.latest}` : "not yet published"}</dd>
          </dl>
        )}

        {problem ? (
          <p className="text-sm text-destructive">{problem}</p>
        ) : (
          <form action={addPackage}>
            <input type="hidden" name="repo" value={repo.full_name} />
            <input type="hidden" name="directory" value={directory} />
            <p className="text-sm text-muted-foreground">
              Saving opens a PR adding <code className="font-mono">.github/workflows/npxhub-publish.yml</code>.
              Releases run on your repo&apos;s GitHub Actions minutes.
            </p>
            <SubmitButton className="mt-4 w-full">Add {name}</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
