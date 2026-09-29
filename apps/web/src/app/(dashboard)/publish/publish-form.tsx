"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, OctagonX, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Check } from "@/lib/preflight"
import { type Bump, bump, compare, isValidDistTag, isValidVersion } from "@/lib/release"
import { startRelease } from "../actions"

const bumps: (Bump | "custom")[] = ["patch", "minor", "major", "prerelease", "custom"]

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

type Props = {
  packages: { id: string; name: string }[]
  packageId: string
  packageName: string
  branches: string[]
  branch: string
  published: boolean
  distTags: Record<string, string>
  manifestVersion: string
  checks: Check[]
  notes: string
}

export function PublishForm(props: Props) {
  const { packages, packageId, packageName, branches, branch, published, distTags, manifestVersion, checks } = props
  const router = useRouter()
  const [state, formAction, pending] = useActionState(startRelease, undefined)
  // First publish defaults to the version already in package.json.
  const [kind, setKind] = useState<Bump | "custom">(published ? "patch" : "custom")
  const [custom, setCustom] = useState(published ? "" : manifestVersion)
  const [tag, setTag] = useState("latest")
  const [notes, setNotes] = useState(props.notes)
  const [acceptWarnings, setAcceptWarnings] = useState(false)

  const go = (pkg: string, br?: string) => router.push(`/publish?package=${pkg}${br ? `&branch=${encodeURIComponent(br)}` : ""}`)

  const base = distTags[tag] ?? distTags.latest ?? manifestVersion
  const version = kind === "custom" ? custom.trim() : bump(base, kind)
  const versionError = !version
    ? "Enter a version"
    : !isValidVersion(version)
      ? "Not a valid semver version"
      : !isValidDistTag(tag)
        ? "Dist-tag: lowercase letters, digits and dashes"
        : published && compare(version, base) <= 0
          ? `Must be greater than ${base} on ${distTags[tag] ? tag : "latest"}`
          : tag === "latest" && version.includes("-")
            ? "Prereleases go to a non-latest dist-tag"
            : null

  const blockers = checks.filter((c) => c.level === "blocker" && !c.passed)
  const warnings = checks.filter((c) => c.level === "warning" && !c.passed)
  const canPublish = !versionError && blockers.length === 0 && (warnings.length === 0 || acceptWarnings) && !pending

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="branch" value={branch} />
      <input type="hidden" name="version" value={version} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Version</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pkg">Package</Label>
                <select id="pkg" className={selectClass} value={packageId} onChange={(e) => go(e.target.value)}>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="branch">Branch</Label>
                <select id="branch" className={selectClass} value={branch} onChange={(e) => go(packageId, e.target.value)}>
                  {branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Bump</legend>
              <div className="flex flex-wrap gap-2">
                {bumps.map((b) => (
                  <label
                    key={b}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      kind === b && "border-primary bg-primary/10 font-medium"
                    )}
                  >
                    <input type="radio" name="bump" value={b} checked={kind === b} onChange={() => setKind(b)} className="sr-only" />
                    {b}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="version-input">New version</Label>
                {kind === "custom" ? (
                  <Input
                    id="version-input"
                    placeholder={bump(base, "patch")}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-invalid={!!versionError}
                    aria-describedby="version-hint"
                    className="font-mono"
                  />
                ) : (
                  <output id="version-input" className="flex h-8 items-center font-mono">
                    {base} → <span className="ml-1 font-semibold">{version}</span>
                  </output>
                )}
                <p id="version-hint" className={cn("text-xs", versionError ? "text-destructive" : "text-muted-foreground")}>
                  {versionError ?? (published ? `Current ${distTags[tag] ? tag : "latest"}: ${base}` : `First publish; package.json has ${manifestVersion}`)}
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="tag">Dist-tag</Label>
                <Input id="tag" name="tag" list="dist-tags" value={tag} onChange={(e) => setTag(e.target.value.trim())} className="font-mono" />
                <datalist id="dist-tags">
                  {[...new Set(["latest", "next", "beta", ...Object.keys(distTags)])].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Release notes</CardTitle>
            <CardDescription>Drafted from commits since the last release. They go on the GitHub release.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              aria-label="Release notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-10 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Pre-flight</CardTitle>
            <CardDescription>
              {blockers.length ? `${blockers.length} blocker${blockers.length > 1 ? "s" : ""}` : "No blockers"}
              {warnings.length ? ` · ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""} on {branch}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {checks.map((c) => {
                const Icon = c.passed ? CheckCircle2 : c.level === "blocker" ? OctagonX : TriangleAlert
                const tone = c.passed ? "text-success" : c.level === "blocker" ? "text-destructive" : "text-warning"
                return (
                  <li key={c.label} className="flex gap-2">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
                    <div>
                      <div>
                        {c.label}
                        <span className="sr-only">{c.passed ? " — passed" : c.level === "blocker" ? " — blocker" : " — warning"}</span>
                      </div>
                      {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
            {warnings.length > 0 && blockers.length === 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptWarnings}
                  onChange={(e) => setAcceptWarnings(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                Publish anyway with these warnings
              </label>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={!canPublish}>
              {pending ? "Starting…" : `Publish ${packageName}@${version || "…"}`}
            </Button>
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
