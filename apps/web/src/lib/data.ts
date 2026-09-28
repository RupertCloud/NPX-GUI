import "server-only"
import { FieldValue } from "firebase-admin/firestore"
import { db } from "./firebase/admin"
import type { User } from "./session"

export type Role = "developer" | "admin"
export type ReleaseStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped"

export type Package = {
  id: string
  npmName: string
  repo: string
  directory: string
  defaultBranch: string
  private: boolean
  members: Record<string, Role> // GitHub login → role
  workflowPrUrl?: string
  npmTokenSetAt?: string
  npmTokenSetBy?: string
  createdAt: string
}

export type Release = {
  id: string
  packageId: string
  npmName: string
  repo: string
  version: string
  distTag: string
  gitTag: string
  branch: string
  notes: string
  status: ReleaseStatus
  startedBy: string
  startedAt: string
  finishedAt?: string
  runId?: number
  runUrl?: string
  steps?: StepStatus[]
  provenanceUrl?: string
  error?: string
}

const packages = db.collection("packages")
const releases = db.collection("releases")

const toPackage = (id: string, d: FirebaseFirestore.DocumentData) => ({ ...d, id }) as Package
const toRelease = (id: string, d: FirebaseFirestore.DocumentData) => ({ ...d, id }) as Release

export async function listPackages(user: User): Promise<Package[]> {
  const snap = await packages.where("memberLogins", "array-contains", user.login.toLowerCase()).get()
  return snap.docs.map((d) => toPackage(d.id, d.data())).sort((a, b) => a.npmName.localeCompare(b.npmName))
}

// Returns the package only if the user is a member of it.
export async function getPackage(user: User, id: string): Promise<Package | null> {
  const snap = await packages.doc(id).get()
  if (!snap.exists) return null
  const pkg = toPackage(snap.id, snap.data()!)
  return roleOf(pkg, user) ? pkg : null
}

export const roleOf = (pkg: Package, user: User): Role | undefined => pkg.members[user.login.toLowerCase()]

export async function findPackageByName(npmName: string) {
  const snap = await packages.where("npmName", "==", npmName).limit(1).get()
  return snap.empty ? null : toPackage(snap.docs[0].id, snap.docs[0].data())
}

export async function createPackage(user: User, data: Omit<Package, "id" | "members" | "createdAt">) {
  const login = user.login.toLowerCase()
  const ref = await packages.add({
    ...data,
    members: { [login]: "admin" },
    memberLogins: [login],
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updatePackage(id: string, data: Partial<Package>) {
  await packages.doc(id).update(data)
}

export async function setMember(id: string, login: string, role: Role | null) {
  const l = login.toLowerCase()
  await packages.doc(id).update(
    role
      ? { [`members.${l}`]: role, memberLogins: FieldValue.arrayUnion(l) }
      : { [`members.${l}`]: FieldValue.delete(), memberLogins: FieldValue.arrayRemove(l) }
  )
}

export async function deletePackage(id: string) {
  await packages.doc(id).delete()
}

export async function listReleases(packageIds: string[], limit = 50): Promise<Release[]> {
  const out: Release[] = []
  // Firestore "in" takes at most 30 values.
  for (let i = 0; i < packageIds.length; i += 30) {
    const snap = await releases.where("packageId", "in", packageIds.slice(i, i + 30)).get()
    out.push(...snap.docs.map((d) => toRelease(d.id, d.data())))
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
}

export async function getRelease(id: string): Promise<Release | null> {
  const snap = await releases.doc(id).get()
  return snap.exists ? toRelease(snap.id, snap.data()!) : null
}

// One active release per package (REL-8), enforced in a transaction.
export async function createRelease(data: Omit<Release, "id">): Promise<{ id: string } | { active: Release }> {
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(releases.where("packageId", "==", data.packageId))
    const active = existing.docs.map((d) => toRelease(d.id, d.data())).find((r) => r.status === "queued" || r.status === "running")
    if (active) return { active }
    const ref = releases.doc()
    tx.set(ref, data)
    return { id: ref.id }
  })
}

export async function updateRelease(id: string, data: Partial<Release>) {
  await releases.doc(id).update(data)
}
