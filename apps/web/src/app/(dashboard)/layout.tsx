import { AppSidebar } from "@/components/app-sidebar"
import { AuthSync } from "@/components/auth-sync"
import { requireUser } from "@/lib/session"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AuthSync />
      <AppSidebar login={user.login} avatarUrl={user.avatarUrl} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
