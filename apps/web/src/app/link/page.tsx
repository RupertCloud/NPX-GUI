import { LinkDevice } from "./link-device"

export default async function LinkPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <LinkDevice initialCode={code} />
    </main>
  )
}
