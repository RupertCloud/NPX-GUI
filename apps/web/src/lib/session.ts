import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { adminAuth, db } from "./firebase/admin"
import { decrypt } from "./crypto"

// Firebase ID token kept in an httpOnly cookie. The client refreshes it hourly via /api/session.
export const SESSION_COOKIE = "__session"

export type User = {
  uid: string
  login: string
  name: string
  avatarUrl: string
  githubToken: string
}

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { uid } = await adminAuth.verifyIdToken(token)
    const snap = await db.collection("users").doc(uid).get()
    const u = snap.data()
    if (!u?.githubTokenEnc) return null
    return { uid, login: u.login, name: u.name, avatarUrl: u.avatarUrl, githubToken: decrypt(u.githubTokenEnc) }
  } catch {
    return null
  }
})

export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}
