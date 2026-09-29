import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { listPackages } from "@/lib/data"
import { commitSubjects, getPackageJson, listBranches } from "@/lib/github"
import { getNpmInfo } from "@/lib/npm"
import { preflight } from "@/lib/preflight"
import { draftNotes, gitTagFor } from "@/lib/release"
import { requireUser } from "@/lib/session"
import { PublishForm } from "./publish-form"

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ package?: string; branch?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const packages = await listPackages(user)

  if (packages.length === 0) {
    return (
      <>
        <PageHeader title="Publish" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Add a package before publishing.</p>
            <Link href="/packages/new" className={buttonVariants({ className: "mt-4" })}>
              Add package
            </Link>
          </CardContent>
        </Card>
      </>
    )
  }

  const pkg = packages.find((p) => p.id === params.package) ?? packages[0]
  const branches = await listBranches(user.githubToken, pkg.repo)
  const branch = params.branch && branches.includes(params.branch) ? params.branch : pkg.defaultBranch
  const npm = await getNpmInfo(pkg.npmName)
  const [manifest, checks, subjects] = await Promise.all([
    getPackageJson(user.githubToken, pkg.repo, pkg.directory, branch),
    preflight(user.githubToken, pkg, branch, npm),
    commitSubjects(user.githubToken, pkg.repo, npm.latest ? gitTagFor(pkg.npmName, pkg.directory, npm.latest) : null, branch).catch(() => []),
  ])

  return (
    <>
      <PageHeader title="Publish" description="Pick a version, review the notes, clear pre-flight, ship." />
      <PublishForm
        key={`${pkg.id}:${branch}`}
        packages={packages.map((p) => ({ id: p.id, name: p.npmName }))}
        packageId={pkg.id}
        packageName={pkg.npmName}
        branches={branches}
        branch={branch}
        published={npm.exists}
        distTags={npm.distTags}
        manifestVersion={typeof manifest?.version === "string" ? manifest.version : "0.0.0"}
        checks={checks}
        notes={draftNotes(subjects)}
      />
    </>
  )
}
