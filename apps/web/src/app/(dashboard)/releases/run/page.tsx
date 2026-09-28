import { notFound } from "next/navigation"
import { getPackage } from "@/lib/mock-data"
import { isValidDistTag, isValidVersion } from "@/lib/release"
import { LiveRelease } from "./live-release"

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string; version?: string; tag?: string }>
}) {
  const { package: name = "", version = "", tag = "" } = await searchParams
  const pkg = getPackage(name)
  // Same grammar the API checks before dispatching the workflow (SEC-3).
  if (!pkg || !isValidVersion(version) || !isValidDistTag(tag)) notFound()
  return <LiveRelease pkg={pkg} version={version} tag={tag} />
}
