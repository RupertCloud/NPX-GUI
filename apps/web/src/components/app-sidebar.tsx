"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { History, KeyRound, Moon, Package, Rocket, Sun, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { currentUser } from "@/lib/mock-data"

const nav = [
  { href: "/packages", label: "Packages", icon: Package },
  { href: "/publish", label: "Publish", icon: Rocket },
  { href: "/releases", label: "Releases", icon: History },
  { href: "/tokens", label: "Tokens & orgs", icon: KeyRound },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <aside className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Link href="/packages" className="flex items-center gap-2 font-heading text-xl font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Terminal className="size-4" aria-hidden />
          </span>
          npxhub
        </Link>
      </div>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active && "bg-sidebar-accent font-medium"
              )}
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto hidden items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3 md:flex">
        <div className="flex items-center gap-2 text-sm">
          <span className="grid size-7 place-items-center rounded-full bg-accent font-medium">
            {currentUser.name[0]}
          </span>
          @{currentUser.login}
        </div>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Toggle dark mode"
        >
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </button>
      </div>
    </aside>
  )
}
