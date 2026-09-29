import assert from "node:assert/strict"
import { test } from "node:test"
import sodium from "libsodium-wrappers"
import { bump, compare, draftNotes, gitTagFor, isValidDistTag, isValidVersion } from "../src/lib/release"

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")

test("version helpers", () => {
  assert.equal(bump("1.2.3", "patch"), "1.2.4")
  assert.equal(bump("1.2.3", "minor"), "1.3.0")
  assert.equal(bump("1.2.3", "prerelease"), "1.2.4-beta.0")
  assert.equal(bump("1.2.4-beta.0", "prerelease"), "1.2.4-beta.1")
  assert.ok(compare("1.2.4", "1.2.4-beta.1") > 0)
  assert.ok(compare("0.10.0", "0.9.9") > 0)
  assert.ok(!isValidVersion("1.2.3; rm -rf /"))
  assert.ok(!isValidVersion("$(whoami)"))
  assert.ok(isValidDistTag("next") && !isValidDistTag("1.2.3") && !isValidDistTag("x;y") && !isValidDistTag("Latest"))
})

test("git tags and notes", () => {
  assert.equal(gitTagFor("npxhub", ".", "1.0.0"), "v1.0.0")
  assert.equal(gitTagFor("@a/b", "packages/b", "1.0.0"), "@a/b@1.0.0")
  const n = draftNotes(["feat(cli): add status", "fix: crash on empty", "docs: readme", "chore(release): v1.0.0", "Merge pull request #3 from x"])
  assert.equal(n, "### Features\n- add status\n\n### Fixes\n- crash on empty\n\n### Other\n- readme")
  assert.equal(draftNotes([]), "- No changes listed")
})

test("token encryption round-trip", async () => {
  const { encrypt, decrypt } = await import("../src/lib/crypto")
  const sealed = encrypt("gho_secret")
  assert.notEqual(sealed, encrypt("gho_secret")) // random IV
  assert.equal(decrypt(sealed), "gho_secret")
  const [iv, tag, data] = sealed.split(".")
  assert.throws(() => decrypt([iv, tag, Buffer.from("tampered").toString("base64")].join(".")))
  void data
})

test("sealed box is decryptable with the repo key (as GitHub does)", async () => {
  await sodium.ready
  const kp = sodium.crypto_box_keypair()
  const sealed = sodium.crypto_box_seal(sodium.from_string("npm_abc"), kp.publicKey)
  assert.equal(sodium.to_string(sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey)), "npm_abc")
})

test("workflow version and PR number helpers", async () => {
  const { isCurrentWorkflow, WORKFLOW_YAML } = await import("../src/lib/workflow")
  assert.ok(isCurrentWorkflow(WORKFLOW_YAML))
  assert.ok(!isCurrentWorkflow("# Added by npxhub.\nname: npxhub publish\n"))
  assert.ok(!isCurrentWorkflow(null))
  const { pullNumber } = await import("../src/lib/github")
  assert.equal(pullNumber("https://github.com/Feyti/EvalDoc/pull/12", "Feyti/EvalDoc"), 12)
  assert.equal(pullNumber("https://github.com/feyti/evaldoc/pull/3", "Feyti/EvalDoc"), 3)
  assert.equal(pullNumber("https://github.com/Other/EvalDoc/pull/12", "Feyti/EvalDoc"), null)
  assert.equal(pullNumber("https://github.com/a/b.c/pull/1", "a/bxc"), null) // dots are escaped
})
