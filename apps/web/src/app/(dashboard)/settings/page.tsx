import { PageHeader } from "@/components/page-header"
import { SignOutButton } from "@/components/sign-out-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/session"

export default async function SettingsPage() {
  const user = await requireUser()
  return (
    <>
      <PageHeader title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in with GitHub through Firebase Authentication.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatarUrl} alt="" className="size-10 rounded-full" />
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm text-muted-foreground">@{user.login}</div>
            </div>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>What npxhub stores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your GitHub login, name, avatar and email, and your GitHub access token encrypted with AES-256-GCM. The token is
            used only for your own actions: listing repos, opening the workflow PR, setting the NPM_TOKEN secret and starting
            releases.
          </p>
          <p>
            npm tokens are never stored by npxhub. They are encrypted straight into the repo&apos;s GitHub Actions secrets.
          </p>
          <p>
            To revoke access, remove the OAuth app under GitHub → Settings → Applications → Authorized OAuth Apps. Signing in
            again reconnects it.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
