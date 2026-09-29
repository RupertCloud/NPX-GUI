import Link from "next/link"
import { Plus, ShieldAlert, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listPackages, listReleases } from "@/lib/data"
import { compactNumber, timeAgo } from "@/lib/format"
import { getNpmInfo, type NpmInfo } from "@/lib/npm"
import { requireUser } from "@/lib/session"

export default async function PackagesPage() {
  const user = await requireUser()
  const packages = await listPackages(user)
  const [npm, releases] = await Promise.all([
    Promise.all(packages.map((p) => getNpmInfo(p.npmName).catch((): NpmInfo | null => null))),
    listReleases(packages.map((p) => p.id)),
  ])
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const published = npm.filter((n) => n?.exists)
  const stats = [
    { label: "Packages", value: packages.length },
    { label: "Weekly downloads", value: compactNumber(published.reduce((n, p) => n + (p?.weeklyDownloads ?? 0), 0)) },
    { label: "Releases this week", value: releases.filter((r) => r.startedAt > weekAgo).length },
    { label: "Without provenance", value: published.filter((p) => !p?.provenance).length, alert: true },
  ]

  return (
    <>
      <PageHeader title="Packages" description="Your packages, with live data from the npm registry.">
        <Link href="/packages/new" className={buttonVariants()}>
          <Plus /> Add package
        </Link>
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardContent>
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className={`mt-1 font-heading text-3xl ${s.alert && s.value ? "text-primary" : ""}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-heading text-xl">No packages yet</p>
            <p className="mt-1 text-muted-foreground">Add a GitHub repo that contains a package.json to start publishing it.</p>
            <Link href="/packages/new" className={buttonVariants({ className: "mt-5" })}>
              <Plus /> Add package
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Package</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead className="text-right">Weekly</TableHead>
                <TableHead>Last published</TableHead>
                <TableHead>Provenance</TableHead>
                <TableHead>Last release</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((p, i) => {
                const info = npm[i]
                const last = releases.find((r) => r.packageId === p.id)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4">
                      <Link href={`/packages/${p.id}`} className="font-medium hover:underline">
                        {p.npmName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {p.repo}
                        {p.directory !== "." && `/${p.directory}`}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{info?.latest ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{info?.exists ? compactNumber(info.weeklyDownloads) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {info === null ? "npm unreachable" : info.lastPublished ? timeAgo(info.lastPublished) : "Never"}
                    </TableCell>
                    <TableCell>
                      {!info?.exists ? (
                        "—"
                      ) : info.provenance ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-success">
                          <ShieldCheck className="size-4" aria-hidden /> Signed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-warning">
                          <ShieldAlert className="size-4" aria-hidden /> None
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{last ? <StatusBadge status={last.status} /> : "—"}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Link href={`/publish?package=${p.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Release
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
