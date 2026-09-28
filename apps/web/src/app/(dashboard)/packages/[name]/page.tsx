import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { compactNumber, timeAgo } from "@/lib/format"
import { getPackage, releases } from "@/lib/mock-data"

export default async function PackagePage({ params }: { params: Promise<{ name: string }> }) {
  const pkg = getPackage(decodeURIComponent((await params).name))
  if (!pkg) notFound()

  const [owner, repo] = pkg.repo.split("/")
  const history = releases.filter((r) => r.packageName === pkg.name)
  const trusted = [
    { label: "Organization or user", value: owner },
    { label: "Repository", value: repo },
    { label: "Workflow filename", value: "npxhub-publish.yml" },
    { label: "Environment", value: "npm" },
  ]
  const deprecate = `npm deprecate ${pkg.name}@"<version>" "<message>"`

  return (
    <>
      <PageHeader
        title={pkg.name}
        description={
          <>
            <a href={`https://github.com/${pkg.repo}`} className="hover:underline">
              {pkg.repo}
            </a>
            {pkg.directory && ` · ${pkg.directory}`} · you are {pkg.role === "admin" ? "an admin" : "a developer"}
          </>
        }
      >
        <a
          href={`https://www.npmjs.com/package/${pkg.name}`}
          className={buttonVariants({ variant: "outline" })}
          target="_blank"
          rel="noreferrer"
        >
          npm <ExternalLink />
        </a>
        <Link href={`/publish?package=${encodeURIComponent(pkg.name)}`} className={buttonVariants()}>
          Release
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Latest</div>
            <div className="mt-1 font-mono text-2xl">{pkg.latestVersion}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Weekly downloads</div>
            <div className="mt-1 font-heading text-2xl">{compactNumber(pkg.weeklyDownloads)}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-sm text-muted-foreground">Dist-tags</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(pkg.distTags).map(([tag, v]) => (
                <Badge key={tag} variant="secondary" className="font-mono">
                  {tag}: {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Trusted publishing
            {pkg.trustedPublisherVerified ? (
              <span className="inline-flex items-center gap-1 text-sm font-normal text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-normal text-warning">
                <TriangleAlert className="size-4" aria-hidden /> Not set up
              </span>
            )}
          </CardTitle>
          <CardDescription>
            On npmjs.com, open {pkg.name} → Settings → Trusted Publisher → GitHub Actions and enter these values.
            npm has no API for this, so it has to be done by hand once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y rounded-lg border">
            {trusted.map((t) => (
              <div key={t.label} className="flex items-center justify-between gap-4 px-3 py-2">
                <dt className="text-muted-foreground">{t.label}</dt>
                <dd className="flex items-center gap-1 font-mono">
                  {t.value}
                  <CopyButton value={t.value} label={`Copy ${t.label}`} />
                </dd>
              </div>
            ))}
          </dl>
          {!pkg.trustedPublisherVerified && (
            <p className="mt-3 text-muted-foreground">
              After merging the <span className="font-mono">npxhub-publish.yml</span> PR and saving these values,
              npxhub runs a dry-run publish to confirm it works.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted-foreground">Default bump</dt>
              <dd>{pkg.settings.defaultBump}</dd>
              <dt className="text-muted-foreground">Allowed dist-tags</dt>
              <dd className="font-mono">{pkg.settings.allowedDistTags.join(", ")}</dd>
              <dt className="text-muted-foreground">Required checks</dt>
              <dd className="font-mono">{pkg.settings.requiredChecks.join(", ") || "none"}</dd>
              <dt className="text-muted-foreground">Default branch</dt>
              <dd className="font-mono">{pkg.defaultBranch}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collaborators</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {pkg.collaborators.map((c) => (
                <li key={c.login} className="flex items-center justify-between">
                  @{c.login}
                  <Badge variant={c.role === "admin" ? "default" : "outline"}>{c.role}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Deprecate a version</CardTitle>
          <CardDescription>npxhub never stores an npm token, so run this locally while logged in to npm.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            <code className="overflow-x-auto">{deprecate}</code>
            <CopyButton value={deprecate} label="Copy command" />
          </div>
        </CardContent>
      </Card>

      <h2 className="mt-10 mb-3 font-heading text-xl">Release history</h2>
      <Card className="py-0">
        <ul className="divide-y">
          {history.length === 0 && <li className="p-4 text-muted-foreground">No releases through npxhub yet.</li>}
          {history.map((r) => (
            <li key={r.id}>
              <Link href={`/releases/${r.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50">
                <span className="font-mono">v{r.version}</span>
                <span className="text-muted-foreground">
                  @{r.startedBy} · {timeAgo(r.startedAt)}
                </span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
