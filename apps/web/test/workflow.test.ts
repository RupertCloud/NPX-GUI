import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { LOG_HELPER_JS, WORKFLOW_YAML } from "../src/lib/workflow"

async function logServer() {
  const posts: { step: number; text: string; auth: string }[] = []
  let tokenRequests = 0
  const server = http.createServer((req, res) => {
    // Stands in for GitHub's OIDC token endpoint (ACTIONS_ID_TOKEN_REQUEST_URL) and npxhub's log endpoint.
    if (req.url!.startsWith("/oidc")) {
      tokenRequests++
      assert.equal(req.headers.authorization, "bearer request-token-xyz")
      assert.match(req.url!, /audience=npxhub/)
      return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ value: "jwt-from-github" }))
    }
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      posts.push({ ...JSON.parse(raw), auth: req.headers.authorization as string })
      res.writeHead(204).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    env: { NPXHUB_LOG_URL: `${base}/log`, ACTIONS_ID_TOKEN_REQUEST_URL: `${base}/oidc?api-version=2.0`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token-xyz" },
    posts,
    tokenRequests: () => tokenRequests,
    close: () => (server.closeAllConnections(), server.close()),
  }
}

function runStep(script: string, env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npxhub-log-"))
  fs.writeFileSync(path.join(dir, "helper.cjs"), LOG_HELPER_JS)
  fs.writeFileSync(path.join(dir, "step.sh"), script)
  return new Promise<{ code: number | null; stdout: string }>((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, "helper.cjs"), "3", path.join(dir, "step.sh")], { env: { ...process.env, ...env } })
    let stdout = ""
    child.stdout.on("data", (d) => (stdout += d))
    child.on("close", (code) => resolve({ code, stdout }))
  })
}

test("log helper streams step output, redacts secrets and keeps the exit code", async () => {
  const srv = await logServer()
  try {
    const ok = await runStep('echo "installing"\necho "token is $NODE_AUTH_TOKEN" >&2\nsleep 2.5\necho "tests passed"\n', {
      ...srv.env,
      NODE_AUTH_TOKEN: "npm_supersecretvalue",
    })
    assert.equal(ok.code, 0)
    assert.match(ok.stdout, /installing[\s\S]*tests passed/) // still mirrored to the GitHub log
    const text = srv.posts.map((p) => p.text).join("")
    assert.ok(srv.posts.length >= 2, "sends while the step runs, not only at the end")
    assert.ok(srv.posts.every((p) => p.step === 3 && p.auth === "Bearer jwt-from-github"))
    assert.equal(srv.tokenRequests(), 1) // the OIDC token is reused between sends
    assert.match(text, /installing/)
    assert.match(text, /token is \*\*\*/)
    assert.doesNotMatch(text, /supersecret/)

    srv.posts.length = 0
    const failed = await runStep('echo "building"\nfalse\necho "not reached"\n', srv.env)
    assert.equal(failed.code, 1) // -eo pipefail, like GitHub's default bash
    assert.match(srv.posts.map((p) => p.text).join(""), /building[\s\S]*exited with code 1/)
    assert.doesNotMatch(failed.stdout, /not reached/)
  } finally {
    srv.close()
  }
})

test("log helper never fails the step when npxhub is unreachable", async () => {
  const r = await runStep('echo "hello"\n', {
    NPXHUB_LOG_URL: "http://127.0.0.1:9/nothing",
    ACTIONS_ID_TOKEN_REQUEST_URL: "http://127.0.0.1:9/oidc?x=1",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "t",
  })
  assert.equal(r.code, 0)
  const noUrl = await runStep('echo "hello"\n', { NPXHUB_LOG_URL: "" })
  assert.equal(noUrl.code, 0)
})

test("log helper keeps multi-byte characters intact across chunks", async () => {
  const srv = await logServer()
  try {
    // Enough output that the pipe delivers it in several chunks; ✓ is 3 bytes in UTF-8.
    await runStep('for i in $(seq 1 4000); do printf "✓ test %s passed\\n" "$i"; done\n', srv.env)
    const text = srv.posts.map((p) => p.text).join("")
    assert.ok(text.includes("✓ test 4000 passed"))
    assert.ok(!text.includes("\uFFFD"), "no replacement characters")
  } finally {
    srv.close()
  }
})

test("workflow v4 wraps every run step and passes no log secret", () => {
  for (const n of [2, 3, 4, 5, 6]) assert.ok(WORKFLOW_YAML.includes(`shell: node /tmp/npxhub-log.cjs ${n} {0}`))
  assert.ok(WORKFLOW_YAML.includes("# npxhub-workflow: v4"))
  assert.ok(!/log_token|NPXHUB_LOG_TOKEN/.test(WORKFLOW_YAML))
  assert.ok(WORKFLOW_YAML.includes("id-token: write"))
})
