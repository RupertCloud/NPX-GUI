import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { duration } from "@/lib/format"
import { RELEASE_STEPS, type Release } from "@/lib/mock-data"

export function ReleaseView({ release }: { release: Release }) {
  return (
    <>
      <div className="mb-8">
        <div className="text-sm text-muted-foreground">
          <Link href="/releases" className="hover:underline">
            Releases
          </Link>{" "}
          / {release.id}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-medium tracking-tight">
            <Link href={`/packages/${encodeURIComponent(release.packageName)}`} className="hover:underline">
              {release.packageName}
            </Link>
            <span className="font-mono text-2xl">@{release.version}</span>
          </h1>
          <StatusBadge status={release.status} />
        </div>
        <p className="mt-1.5 text-muted-foreground">
          <span className="font-mono">{release.distTag}</span> · commit{" "}
          <span className="font-mono">{release.commitSha}</span> · started by @{release.startedBy}
        </p>
      </div>

      <Card className="py-0">
        <ol aria-label="Release steps" className="divide-y">
          {release.steps.map((step, i) => (
            <li key={i}>
              <details open={step.status === "running" || step.status === "failed"} className="group">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/50",
                    step.status === "skipped" && "text-muted-foreground"
                  )}
                >
                  <StatusBadge status={step.status} iconOnly />
                  <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="flex-1 font-medium">{RELEASE_STEPS[i]}</span>
                  {step.durationSec !== undefined && (
                    <span className="text-sm text-muted-foreground tabular-nums">{duration(step.durationSec)}</span>
                  )}
                </summary>
                {step.log.length > 0 && (
                  <pre
                    aria-live={step.status === "running" ? "polite" : undefined}
                    className="mx-4 mb-4 overflow-x-auto rounded-lg bg-[#1f1e1d] p-3 font-mono text-xs leading-relaxed text-[#e8e6dc]"
                  >
                    {step.log.join("\n")}
                  </pre>
                )}
              </details>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Release notes</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="font-mono text-sm whitespace-pre-wrap">{release.notes}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provenance</CardTitle>
          </CardHeader>
          <CardContent>
            {release.provenanceUrl ? (
              <a href={release.provenanceUrl} className="inline-flex items-center gap-2 text-success hover:underline">
                <ShieldCheck className="size-4" aria-hidden /> Signed attestation on npmjs.com
              </a>
            ) : release.status === "succeeded" ? (
              <p className="text-warning">Published without provenance (token publish).</p>
            ) : (
              <p className="text-muted-foreground">Attached when the publish step succeeds.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
