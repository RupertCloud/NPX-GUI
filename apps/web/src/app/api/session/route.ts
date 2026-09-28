import { NextResponse } from "next/server"
import { adminAuth, db } from "@/lib/firebase/admin"
import { encrypt } from "@/lib/crypto"
import { SESSION_COOKIE } from "@/lib/session"

// Called by the client after sign-in (with the GitHub token) and on every ID-token refresh (without it).
export async function POST(req: Request) {
  const { idToken, githubToken } = (await req.json()) as { idToken?: string; githubToken?: string }
  if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 })

  let decoded
  try {
    decoded = await adminAuth.verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid ID token" }, { status: 401 })
  }

  const userRef = db.collection("users").doc(decoded.uid)
  if (githubToken) {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    })
    if (!res.ok) return NextResponse.json({ error: "GitHub rejected the access token" }, { status: 401 })
    const gh = await res.json()
    await userRef.set(
      {
        login: gh.login,
        githubId: gh.id,
        name: gh.name ?? gh.login,
        avatarUrl: gh.avatar_url,
        email: decoded.email ?? null,
        githubTokenEnc: encrypt(githubToken),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )
  } else if (!(await userRef.get()).data()?.githubTokenEnc) {
    return NextResponse.json({ error: "Sign in with GitHub again" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)),
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
