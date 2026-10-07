import { safeNext } from "@/lib/safe-next"
import { LoginButton } from "./login-button"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-heading text-4xl font-medium">npxhub</h1>
        <p className="mt-2 text-muted-foreground">
          Publish your GitHub packages to npm, with pre-flight checks and a verified install.
        </p>
        <LoginButton next={safeNext(next)} />
        <p className="mt-6 text-xs text-muted-foreground">
          npxhub asks for GitHub <code>repo</code> and <code>workflow</code> access to read package.json, open the
          publish-workflow PR, set your NPM_TOKEN secret and start releases.
        </p>
      </div>
    </main>
  )
}
