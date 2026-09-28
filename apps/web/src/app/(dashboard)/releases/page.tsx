import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listPackages, listReleases } from "@/lib/data"
import { duration, timeAgo } from "@/lib/format"
import { requireUser } from "@/lib/session"

export default async function ReleasesPage() {
  const user = await requireUser()
  const releases = await listReleases((await listPackages(user)).map((p) => p.id))

  return (
    <>
      <PageHeader title="Releases" description="Every publish across your packages, and who ran it." />
      {releases.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No releases yet.</CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Release</TableHead>
                <TableHead>Dist-tag</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="pr-4 text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
                      {r.npmName}
                      <span className="font-mono font-normal">@{r.version}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.distTag}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>@{r.startedBy}</TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(r.startedAt)}</TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
                    {r.finishedAt
                      ? duration(Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000))
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
