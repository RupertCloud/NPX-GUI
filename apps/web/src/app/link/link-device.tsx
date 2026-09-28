"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Terminal } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { currentUser } from "@/lib/mock-data"

const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/

export function LinkDevice({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [linked, setLinked] = useState(false)
  const valid = CODE.test(code)

  if (linked) {
    return (
      <Card className="w-full max-w-md text-center">
        <CardContent className="py-6">
          <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
          <h1 className="mt-3 font-heading text-2xl">Machine linked</h1>
          <p className="mt-1 text-muted-foreground">You can close this tab and return to your terminal.</p>
          <Link href="/packages" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
            Open dashboard
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <span className="mb-2 grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
          <Terminal className="size-5" aria-hidden />
        </span>
        <CardTitle className="font-heading text-2xl">Link this machine</CardTitle>
        <CardDescription>
          Signed in as @{currentUser.login}. Check the code matches the one printed by{" "}
          <code className="font-mono">npx npxhub</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) setLinked(true)
          }}
          className="space-y-4"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="code">Device code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              maxLength={9}
              autoComplete="off"
              className="h-11 text-center font-mono text-lg tracking-[0.3em]"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!valid}>
            Link machine
          </Button>
          <p className="text-xs text-muted-foreground">
            Only approve a code you just requested. The machine gets a token that can start releases for your packages.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
