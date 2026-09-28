import { PageHeader } from "@/components/page-header"
import { PublishForm } from "./publish-form"

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ package?: string }> }) {
  const { package: initial } = await searchParams
  return (
    <>
      <PageHeader title="Publish" description="Pick a version, review the notes, clear pre-flight, ship." />
      <PublishForm initialPackage={initial} />
    </>
  )
}
