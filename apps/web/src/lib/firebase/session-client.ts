"use client"

export async function postSession(idToken: string, githubToken?: string) {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, githubToken }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sign-in failed")
}
