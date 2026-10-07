import { NextResponse } from "next/server"
import { db } from "@/lib/firebase/admin"
import { appendStepLog } from "@/lib/job-utils"
import { verifyActionsToken } from "@/lib/oidc"

// Receives live step output from a release's GitHub Actions workflow (the npxhub log helper),
// authenticated with the run's GitHub OIDC token.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const body = (await req.json().catch(() => null)) as { step?: unknown; text?: unknown } | null
  const step = Number(body?.step)
  if (!token || !Number.isInteger(step) || step < 1 || step > 6 || typeof body?.text !== "string" || body.text.length > 64_000) {
    return new NextResponse("Bad request", { status: 400 })
  }
  const ref = db.collection("releases").doc(id)
  const release = (await ref.get()).data()
  if (!release) return new NextResponse("Not found", { status: 404 })
  const claims = await verifyActionsToken(token, release.repo, release.runId)
  if (!claims) return new NextResponse("Forbidden", { status: 403 })

  const ok = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data()
    // Only while the release runs.
    if (!current || !["queued", "running"].includes(current.status)) return false
    tx.update(ref, { [`liveLog.${step}`]: appendStepLog(current.liveLog?.[step], body.text as string) })
    return true
  })
  return ok ? new NextResponse(null, { status: 204 }) : new NextResponse("Gone", { status: 410 })
}
