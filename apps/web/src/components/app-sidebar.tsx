"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { signOut } from "firebase/auth"
import { History, LogOut, Moon, Package, Rocket, Settings, Sun, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/firebase/client"

const nav = [
  { href: "/packages", label: "Packages", icon: Package },
  { href: "/publish", label: "Publish", icon: Rocket },
  { href: "/releases", label: "Releases", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppSidebar({ login, avatarUrl }: { login: string; avatarUrl: string }) {
  const pathname = usePathname()
  const router = useRouter()
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt="" className="size-7 rounded-full" />
          @{login}
        </div>
        <div className="flex">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Toggle dark mode"
          >
            <Sun className="hidden size-4 dark:block" />
            <Moon className="size-4 dark:hidden" />
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut(auth)
              await fetch("/api/session", { method: "DELETE" })
              router.replace("/login")
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
