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
  const posts: { step: number; text: string; token: string }[] = []
  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      posts.push({ ...JSON.parse(raw), token: req.headers["x-npxhub-log-token"] as string })
      res.writeHead(204).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/log`, posts, close: () => (server.closeAllConnections(), server.close()) }
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
      NPXHUB_LOG_URL: srv.url,
      NPXHUB_LOG_TOKEN: "log-token-123456",
      NODE_AUTH_TOKEN: "npm_supersecretvalue",
    })
    assert.equal(ok.code, 0)
    assert.match(ok.stdout, /installing[\s\S]*tests passed/) // still mirrored to the GitHub log
    const text = srv.posts.map((p) => p.text).join("")
    assert.ok(srv.posts.length >= 2, "sends while the step runs, not only at the end")
    assert.ok(srv.posts.every((p) => p.step === 3 && p.token === "log-token-123456"))
    assert.match(text, /installing/)
    assert.match(text, /token is \*\*\*/)
    assert.doesNotMatch(text, /supersecret/)

    srv.posts.length = 0
    const failed = await runStep('echo "building"\nfalse\necho "not reached"\n', { NPXHUB_LOG_URL: srv.url, NPXHUB_LOG_TOKEN: "t" })
    assert.equal(failed.code, 1) // -eo pipefail, like GitHub's default bash
    assert.match(srv.posts.map((p) => p.text).join(""), /building[\s\S]*exited with code 1/)
    assert.doesNotMatch(failed.stdout, /not reached/)
  } finally {
    srv.close()
  }
})

test("log helper never fails the step when npxhub is unreachable", async () => {
  const r = await runStep('echo "hello"\n', { NPXHUB_LOG_URL: "http://127.0.0.1:9/nothing", NPXHUB_LOG_TOKEN: "t" })
  assert.equal(r.code, 0)
  const noUrl = await runStep('echo "hello"\n', { NPXHUB_LOG_URL: "" })
  assert.equal(noUrl.code, 0)
})

test("workflow v3 wraps every run step with the log helper", () => {
  for (const n of [2, 3, 4, 5, 6]) assert.ok(WORKFLOW_YAML.includes(`shell: node /tmp/npxhub-log.cjs ${n} {0}`))
  assert.ok(WORKFLOW_YAML.includes("# npxhub-workflow: v3"))
})
