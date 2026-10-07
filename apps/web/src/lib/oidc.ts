import "server-only"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"
import { WORKFLOW_PATH } from "./workflow"

// GitHub Actions OIDC tokens identify the repository, workflow and run that requested them.
const ISSUER = "https://token.actions.githubusercontent.com"
export const AUDIENCE = "npxhub"
const githubKeys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))

export type ActionsClaims = { repository: string; run_id: string; workflow_ref: string }

// Verifies the token and that it comes from npxhub's publish workflow in `repo` (and from `runId`, when known).
export async function verifyActionsToken(
  token: string,
  repo: string,
  runId: number | undefined,
  keys: JWTVerifyGetKey = githubKeys
): Promise<ActionsClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: ISSUER, audience: AUDIENCE })
    const claims = payload as unknown as ActionsClaims
    if (claims.repository?.toLowerCase() !== repo.toLowerCase()) return null
    if (!claims.workflow_ref?.toLowerCase().startsWith(`${repo.toLowerCase()}/${WORKFLOW_PATH}@`)) return null
    if (runId && String(claims.run_id) !== String(runId)) return null
    return claims
  } catch {
    return null
  }
}
