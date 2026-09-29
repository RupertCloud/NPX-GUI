import "server-only"

const REGISTRY = "https://registry.npmjs.org"

export type NpmInfo = {
  exists: boolean
  latest?: string
  distTags: Record<string, string>
  lastPublished?: string
  provenance: boolean
  weeklyDownloads: number
  maintainers: string[]
}

const encode = (name: string) => name.replace("/", "%2F")

// Registry and downloads APIs need no credentials (NPM-1). Cached 15 minutes (PKG-5).
export async function getNpmInfo(name: string): Promise<NpmInfo> {
  const res = await fetch(`${REGISTRY}/${encode(name)}`, { next: { revalidate: 900 } })
  if (res.status === 404) return { exists: false, distTags: {}, provenance: false, weeklyDownloads: 0, maintainers: [] }
  if (!res.ok) throw new Error(`npm registry returned ${res.status} for ${name}`)
  const doc = await res.json()
  const distTags: Record<string, string> = doc["dist-tags"] ?? {}
  const latest = distTags.latest
  const manifest = latest ? doc.versions?.[latest] : undefined
  return {
    exists: true,
    latest,
    distTags,
    lastPublished: latest ? doc.time?.[latest] : undefined,
    provenance: !!manifest?.dist?.attestations?.provenance,
    weeklyDownloads: await getWeeklyDownloads(name),
    maintainers: ((doc.maintainers ?? []) as { name: string }[]).map((m) => m.name),
  }
}

async function getWeeklyDownloads(name: string) {
  const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${name}`, { next: { revalidate: 900 } })
  if (!res.ok) return 0
  return ((await res.json()).downloads as number) ?? 0
}

// Link to the provenance attestation for a published version, if npm has one.
export async function getProvenanceUrl(name: string, version: string): Promise<string | undefined> {
  const res = await fetch(`${REGISTRY}/${encode(name)}/${version}`, { cache: "no-store" })
  if (!res.ok) return undefined
  const m = await res.json()
  return m.dist?.attestations?.provenance ? `https://www.npmjs.com/package/${name}/v/${version}#provenance` : undefined
}
