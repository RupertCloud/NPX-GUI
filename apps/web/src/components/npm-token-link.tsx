"use client"

import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const KEY = "npxhub:npm-username"

// npm's token page needs the npm account name in the URL, which can differ from the GitHub login.
export function NpmTokenLink({ defaultUsername }: { defaultUsername: string }) {
  const [username, setUsername] = useState(defaultUsername)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved) setUsername(saved)
    } catch {}
  }, [])

  const name = username.trim()
  const valid = /^[a-z0-9][a-z0-9._-]*$/i.test(name)

  return (
    <div className="mt-3 flex max-w-lg flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="npm-username">npm username</Label>
        <Input
          id="npm-username"
          value={username}
          placeholder="your npm account"
          autoComplete="off"
          className="w-52 font-mono"
          onChange={(e) => {
            setUsername(e.target.value)
            try {
              localStorage.setItem(KEY, e.target.value.trim())
            } catch {}
          }}
        />
      </div>
      <a
        href={valid ? `https://www.npmjs.com/settings/${encodeURIComponent(name)}/tokens/granular-access-tokens/new` : undefined}
        aria-disabled={!valid}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline", className: valid ? "" : "pointer-events-none opacity-50" })}
      >
        Create token on npm <ExternalLink />
      </a>
    </div>
  )
}
