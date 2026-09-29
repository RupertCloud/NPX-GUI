import { NextResponse } from "next/server"
import { getPackage } from "@/lib/data"
import { getJob, toJobView } from "@/lib/jobs"
import { getUser } from "@/lib/session"

// Polled by the page while a job runs.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const job = await getJob((await params).id)
  if (!job || !(await getPackage(user, job.packageId))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(toJobView(job))
}
