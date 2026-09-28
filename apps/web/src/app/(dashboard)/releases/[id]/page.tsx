import { notFound } from "next/navigation"
import { ReleaseView } from "@/components/release-view"
import { getRelease } from "@/lib/mock-data"

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const release = getRelease((await params).id)
  if (!release) notFound()
  return <ReleaseView release={release} />
}
