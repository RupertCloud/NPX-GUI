"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { installations } from "@/lib/mock-data"

const repos = [
  { fullName: "rupertcloud/tools", pkg: { name: "@rupert/env-check", version: "0.1.0", bin: { "env-check": "./index.js" }, files: ["index.js", "lib"] } },
  { fullName: "silkcode/silk-icons", pkg: { name: "@silk/icons", version: "1.0.3", bin: null, files: ["dist"] } },
  { fullName: "ridelink/ridelink-sdk", pkg: { name: "ridelink-sdk", version: "0.3.0", bin: null, files: ["dist"] } },
]

export default function NewPackagePage() {
  const router = useRouter()
  const [repo, setRepo] = useState<string>()
  const [directory, setDirectory] = useState("")
  const found = repos.find((r) => r.fullName === repo)

  return (
    <>
      <PageHeader
        title="Add a package"
        description="Pick a repo the npxhub GitHub App is installed on. npxhub reads package.json and shows what it found before saving."
      />
      <Card>
        <CardHeader>
          <CardTitle>Repository</CardTitle>
          <CardDescription>
            Installed on {installations.map((i) => i.accountLogin).join(", ")}.{" "}
            <a href="https://github.com/apps/npxhub/installations/new" className="underline">
              Install on another account
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Repository</legend>
            {repos.map((r) => (
              <label
                key={r.fullName}
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="repo"
                  value={r.fullName}
                  checked={repo === r.fullName}
                  onChange={() => setRepo(r.fullName)}
                  className="accent-primary"
                />
                <span className="font-mono text-sm">{r.fullName}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="dir">Subdirectory (monorepos)</Label>
            <Input id="dir" placeholder="packages/cli" value={directory} onChange={(e) => setDirectory(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {found && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Found in package.json</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted-foreground">name</dt>
              <dd className="font-mono">{found.pkg.name}</dd>
              <dt className="text-muted-foreground">version</dt>
              <dd className="font-mono">{found.pkg.version}</dd>
              <dt className="text-muted-foreground">bin</dt>
              <dd className="font-mono">
                {found.pkg.bin ? JSON.stringify(found.pkg.bin) : <span className="text-warning">none — npx won&apos;t run it</span>}
              </dd>
              <dt className="text-muted-foreground">files</dt>
              <dd className="font-mono">{JSON.stringify(found.pkg.files)}</dd>
            </dl>
            <p className="mt-4 text-muted-foreground">
              Saving opens a PR adding <span className="font-mono">.github/workflows/npxhub-publish.yml</span>. Publishing
              runs on your GitHub Actions minutes.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                toast.success(`${found.pkg.name} added`, { description: "Workflow PR opened. Finish trusted publishing setup next." })
                router.push("/packages")
              }}
            >
              Save package
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
