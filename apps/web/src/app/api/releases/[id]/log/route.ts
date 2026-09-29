import { NextResponse } from "next/server"
import { db } from "@/lib/firebase/admin"
import { appendStepLog, checkReleaseLogToken } from "@/lib/job-utils"

// Receives live step output from a release's GitHub Actions workflow (the npxhub log helper).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!checkReleaseLogToken(id, req.headers.get("x-npxhub-log-token"))) return new NextResponse("Forbidden", { status: 403 })
  const body = (await req.json().catch(() => null)) as { step?: unknown; text?: unknown } | null
  const step = Number(body?.step)
  if (!Number.isInteger(step) || step < 1 || step > 6 || typeof body?.text !== "string" || body.text.length > 256_000) {
    return new NextResponse("Bad request", { status: 400 })
  }
  const ref = db.collection("releases").doc(id)
  const ok = await db.runTransaction(async (tx) => {
    const release = (await tx.get(ref)).data()
    // Only while the release runs; the token stops working once it finishes.
    if (!release || !["queued", "running"].includes(release.status)) return false
    tx.update(ref, { [`liveLog.${step}`]: appendStepLog(release.liveLog?.[step], body.text as string) })
    return true
  })
  return ok ? new NextResponse(null, { status: 204 }) : new NextResponse("Gone", { status: 410 })
}
