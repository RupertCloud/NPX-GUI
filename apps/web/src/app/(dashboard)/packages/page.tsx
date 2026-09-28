import Link from "next/link"
import { Plus, ShieldAlert, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { compactNumber, timeAgo } from "@/lib/format"
import { packages, releases } from "@/lib/mock-data"

export default function PackagesPage() {
  const lastRelease = (name: string) => releases.find((r) => r.packageName === name)
  const weekAgo = Date.now() - 7 * 864e5
  const stats = [
    { label: "Packages", value: packages.length },
    { label: "Weekly downloads", value: compactNumber(packages.reduce((n, p) => n + p.weeklyDownloads, 0)) },
    { label: "Releases this week", value: releases.filter((r) => new Date(r.startedAt).getTime() > weekAgo).length },
    { label: "Without provenance", value: packages.filter((p) => !p.provenance).length, alert: true },
  ]

  return (
    <>
      <PageHeader title="Packages" description="Everything you can publish, straight from the registry.">
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
            {packages.map((p) => {
              const last = lastRelease(p.name)
              return (
                <TableRow key={p.name}>
                  <TableCell className="pl-4">
                    <Link href={`/packages/${encodeURIComponent(p.name)}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.repo}
                      {p.directory && `/${p.directory}`}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.latestVersion}</TableCell>
                  <TableCell className="text-right tabular-nums">{compactNumber(p.weeklyDownloads)}</TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(p.lastPublished)}</TableCell>
                  <TableCell>
                    {p.provenance ? (
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
                    <Link
                      href={`/publish?package=${encodeURIComponent(p.name)}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Release
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
