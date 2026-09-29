"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Release } from "@/lib/data"
import { RELEASE_STEPS } from "@/lib/workflow"
import { mergeFixPr, retryRelease, suggestReleaseFix } from "@/app/(dashboard)/actions"
import { ActionForm } from "@/components/action-form"
import { SubmitButton } from "@/components/submit-button"

const TERMINAL = ["succeeded", "failed", "cancelled"]

export function ReleaseView({ initial, log }: { initial: Release; log: string | null }) {
  const router = useRouter()
  const [release, setRelease] = useState(initial)
  const [syncError, setSyncError] = useState<string>()
  const done = TERMINAL.includes(release.status)

  // Poll the API, which syncs from GitHub Actions, until the release finishes (REL-5).
  useEffect(() => {
    if (done) return
    const t = setInterval(async () => {
      const res = await fetch(`/api/releases/${release.id}`, { cache: "no-store" })
      if (!res.ok) return
      const next = await res.json()
      setSyncError(next.syncError)
      setRelease(next)
      if (TERMINAL.includes(next.status)) router.refresh() // re-render server-side to fetch the job log
    }, 3000)
    return () => clearInterval(t)
  }, [done, release.id, router])

  const steps = release.steps ?? RELEASE_STEPS.map(() => (release.status === "failed" ? "skipped" : "pending"))

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
          <h1 className="font-heading text-3xl font-medium tracking-tight break-all">
            <Link href={`/packages/${release.packageId}`} className="hover:underline">
              {release.npmName}
            </Link>
            <span className="font-mono text-2xl">@{release.version}</span>
          </h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={release.status} />
            {(release.status === "failed" || release.status === "cancelled") && (
              <ActionForm action={retryRelease.bind(null, release.id)}>
                <SubmitButton size="sm" variant="outline">
                  Retry release
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-muted-foreground">
          <span className="font-mono">{release.distTag}</span> · branch <span className="font-mono">{release.branch}</span> ·
          tag <span className="font-mono">{release.gitTag}</span> · started by @{release.startedBy}
          {release.runUrl && (
            <>
              {" · "}
              <a href={release.runUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                GitHub run <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </>
          )}
        </p>
      </div>

      {release.error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {release.error}
        </p>
      )}
      {release.status === "failed" && (
        <p className="mb-4 text-sm text-muted-foreground">
          Fix the cause shown in the job log below (in your repo, or on the package page for setup problems), then retry. A retry reuses the
          same version, tag and notes.
        </p>
      )}
      {release.status === "failed" && release.runId && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>AI diagnosis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {initial.fix ? (
              <>
                <p>
                  <span className="font-medium">Cause:</span> {initial.fix.cause}
                </p>
                <p className="text-muted-foreground">{initial.fix.summary}</p>
                {initial.fix.prUrl ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a href={initial.fix.prUrl} className="underline" target="_blank" rel="noreferrer">
                      Fix PR ({initial.fix.files.join(", ")})
                    </a>
                    <ActionForm action={mergeFixPr.bind(null, release.id)}>
                      <SubmitButton size="sm">Merge fix PR</SubmitButton>
                    </ActionForm>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No file changes proposed; follow the advice above, then retry.</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Your AI provider reads the job log and the files it mentions, explains the failure and opens a fix PR for you to
                review. Set a provider in Settings first.
              </p>
            )}
            <ActionForm action={suggestReleaseFix.bind(null, release.id)}>
              <SubmitButton variant="outline" size="sm">
                {initial.fix ? "Ask again" : "Suggest a fix with AI"}
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {syncError && <p className="mb-4 text-sm text-warning">Couldn&apos;t reach GitHub: {syncError}</p>}
      {release.status === "running" && !release.runId && (
        <p className="mb-4 text-sm text-muted-foreground">Waiting for GitHub Actions to pick up the run…</p>
      )}

      <Card className="py-0">
        <ol aria-label="Release steps" aria-live="polite" className="divide-y">
          {RELEASE_STEPS.map((name, i) => (
            <li
              key={name}
              className={cn("flex items-center gap-3 px-4 py-3", steps[i] === "skipped" && "text-muted-foreground")}
            >
              <StatusBadge status={steps[i]} iconOnly />
              <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex-1 font-medium">{name}</span>
              <span className="text-sm text-muted-foreground">{steps[i]}</span>
            </li>
          ))}
        </ol>
      </Card>

      {log && (
        <details className="mt-4" open={release.status === "failed"}>
          <summary className="cursor-pointer text-sm font-medium">Job log (last 300 lines)</summary>
          <pre className="mt-2 max-h-[32rem] overflow-auto rounded-lg bg-[#1f1e1d] p-3 font-mono text-xs leading-relaxed text-[#e8e6dc]">
            {log}
          </pre>
        </details>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Release notes</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="font-mono text-sm whitespace-pre-wrap">{release.notes || "—"}</pre>
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
              <p className="text-warning">Published without provenance.</p>
            ) : (
              <p className="text-muted-foreground">Checked when the publish step succeeds.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
