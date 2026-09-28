"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, OctagonX, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { packages, releases } from "@/lib/mock-data"
import { type Bump, bump, compare, isValidVersion, preflight } from "@/lib/release"

const bumps: (Bump | "custom")[] = ["patch", "minor", "major", "prerelease", "custom"]

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

function draftNotes(name: string) {
  const last = releases.find((r) => r.packageName === name)
  return `### Features\n- \n\n### Fixes\n- \n\n_Commits since ${last ? `v${last.version}` : "the first commit"}._`
}

export function PublishForm({ initialPackage }: { initialPackage?: string }) {
  const router = useRouter()
  const [name, setName] = useState(packages.some((p) => p.name === initialPackage) ? initialPackage! : packages[0].name)
  const pkg = packages.find((p) => p.name === name)!
  const [kind, setKind] = useState<Bump | "custom">(pkg.settings.defaultBump)
  const [custom, setCustom] = useState("")
  const [tag, setTag] = useState(pkg.settings.allowedDistTags[0])
  const [branch, setBranch] = useState(pkg.defaultBranch)
  const [notes, setNotes] = useState(() => draftNotes(name))
  const [acceptWarnings, setAcceptWarnings] = useState(false)

  function selectPackage(next: string) {
    const p = packages.find((x) => x.name === next)!
    setName(next)
    setKind(p.settings.defaultBump)
    setTag(p.settings.allowedDistTags[0])
    setBranch(p.defaultBranch)
    setNotes(draftNotes(next))
    setAcceptWarnings(false)
  }

  const base = pkg.distTags[tag] ?? pkg.latestVersion
  const version = kind === "custom" ? custom.trim() : bump(base, kind)
  const versionError =
    !version
      ? "Enter a version"
      : !isValidVersion(version)
        ? "Not a valid semver version"
        : compare(version, base) <= 0
          ? `Must be greater than ${base} on ${tag}`
          : tag === "latest" && version.includes("-")
            ? "Prereleases go to a non-latest dist-tag"
            : null

  const checks = useMemo(() => preflight(pkg), [pkg])
  const blockers = checks.filter((c) => c.level === "blocker" && !c.passed)
  const warnings = checks.filter((c) => c.level === "warning" && !c.passed)
  const canPublish = !versionError && blockers.length === 0 && (warnings.length === 0 || acceptWarnings)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Version</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pkg">Package</Label>
                <select id="pkg" className={selectClass} value={name} onChange={(e) => selectPackage(e.target.value)}>
                  {packages.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono" />
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
                    <input
                      type="radio"
                      name="bump"
                      value={b}
                      checked={kind === b}
                      onChange={() => setKind(b)}
                      className="sr-only"
                    />
                    {b}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="version">New version</Label>
                {kind === "custom" ? (
                  <Input
                    id="version"
                    placeholder={bump(base, "patch")}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-invalid={!!versionError}
                    aria-describedby="version-hint"
                    className="font-mono"
                  />
                ) : (
                  <output id="version" className="flex h-8 items-center font-mono">
                    {base} → <span className="ml-1 font-semibold">{version}</span>
                  </output>
                )}
                <p id="version-hint" className={cn("text-xs", versionError ? "text-destructive" : "text-muted-foreground")}>
                  {versionError ?? `Current ${tag}: ${base}`}
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="tag">Dist-tag</Label>
                <select id="tag" className={selectClass} value={tag} onChange={(e) => setTag(e.target.value)}>
                  {pkg.settings.allowedDistTags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Release notes</CardTitle>
            <CardDescription>Generated from conventional commits. Edit freely; they go on the GitHub release.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              aria-label="Release notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={9}
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
              {warnings.length ? ` · ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""}
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
                        <span className="sr-only">
                          {c.passed ? " — passed" : c.level === "blocker" ? " — blocker" : " — warning"}
                        </span>
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
            <Button
              size="lg"
              className="w-full"
              disabled={!canPublish}
              onClick={() => {
                const q = new URLSearchParams({ package: name, version, tag })
                router.push(`/releases/run?${q}`)
              }}
            >
              Publish {name}@{version || "…"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
