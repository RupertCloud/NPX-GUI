import { NextResponse } from "next/server"
import { getPackage, getRelease } from "@/lib/data"
import { syncRelease } from "@/lib/release-sync"
import { getUser } from "@/lib/session"

// Polled by the release page while a release runs (REL-5).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const release = await getRelease((await params).id)
  if (!release || !(await getPackage(user, release.packageId))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    return NextResponse.json(await syncRelease(user.githubToken, release))
  } catch (e) {
    return NextResponse.json({ ...release, syncError: (e as Error).message })
  }
}
