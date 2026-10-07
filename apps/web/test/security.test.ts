import assert from "node:assert/strict"
import { test } from "node:test"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import { isPrivateAddress } from "../src/lib/ai"
import { verifyActionsToken } from "../src/lib/oidc"
import { safeNext } from "../src/lib/safe-next"

test("safeNext keeps only paths on this site", () => {
  assert.equal(safeNext("/releases/abc?x=1"), "/releases/abc?x=1")
  for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/%0d/x\u0000", undefined, ""]) {
    assert.equal(safeNext(bad as string), "/packages", String(bad))
  }
})

test("isPrivateAddress", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.ok(isPrivateAddress(ip), ip)
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "104.18.0.1", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip)
})

test("verifyActionsToken accepts only npxhub's workflow in the release's repo and run", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }
  const keys = createLocalJWKSet({ keys: [jwk] })
  const sign = (claims: Record<string, unknown>, aud = "npxhub", iss = "https://token.actions.githubusercontent.com") =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(privateKey)
  const good = { repository: "Feyti/EvalDoc", run_id: "42", workflow_ref: "Feyti/EvalDoc/.github/workflows/npxhub-publish.yml@refs/heads/main" }

  assert.ok(await verifyActionsToken(await sign(good), "feyti/evaldoc", 42, keys))
  assert.ok(await verifyActionsToken(await sign(good), "Feyti/EvalDoc", undefined, keys)) // run not linked yet
  assert.equal(await verifyActionsToken(await sign(good), "Feyti/EvalDoc", 43, keys), null) // another run
  assert.equal(await verifyActionsToken(await sign({ ...good, repository: "attacker/repo" }), "Feyti/EvalDoc", 42, keys), null)
  assert.equal(
    await verifyActionsToken(await sign({ ...good, workflow_ref: "Feyti/EvalDoc/.github/workflows/other.yml@refs/heads/main" }), "Feyti/EvalDoc", 42, keys),
    null
  )
  assert.equal(await verifyActionsToken(await sign(good, "someone-else"), "Feyti/EvalDoc", 42, keys), null) // audience
  assert.equal(await verifyActionsToken(await sign(good, "npxhub", "https://evil.example"), "Feyti/EvalDoc", 42, keys), null) // issuer
  const other = await generateKeyPair("RS256")
  const forged = await new SignJWT(good).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://token.actions.githubusercontent.com").setAudience("npxhub").setExpirationTime("5m").sign(other.privateKey)
  assert.equal(await verifyActionsToken(forged, "Feyti/EvalDoc", 42, keys), null) // wrong signature
})
