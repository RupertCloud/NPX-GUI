import { notFound } from "next/navigation"
import { ReleaseView } from "@/components/release-view"
import { getPackage, getRelease } from "@/lib/data"
import { getJobLog, getRunJob } from "@/lib/github"
import { syncRelease } from "@/lib/release-sync"
import { requireUser } from "@/lib/session"

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const stored = await getRelease((await params).id)
  if (!stored || !(await getPackage(user, stored.packageId))) notFound()

  const release = await syncRelease(user.githubToken, stored).catch(() => stored)
  let log: string | null = null
  if (release.runId && ["succeeded", "failed", "cancelled"].includes(release.status)) {
    const job = await getRunJob(user.githubToken, release.repo, release.runId).catch(() => null)
    const text = job ? await getJobLog(user.githubToken, release.repo, job.id) : null
    log = text ? text.split("\n").slice(-300).join("\n") : null
  }
  return <ReleaseView initial={release} log={log} />
}
