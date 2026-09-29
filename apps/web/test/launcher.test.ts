import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { detectLaunchConfig, launcherScript, validateLaunchConfig, type LaunchConfig } from "../src/lib/launcher"
import { checkBaseUrl } from "../src/lib/ai"

test("detectLaunchConfig picks a mode per framework", () => {
  const next = detectLaunchConfig({ name: "a", scripts: { start: "next start" }, devDependencies: { next: "15" } })
  assert.equal(next.mode, "script")
  assert.ok(next.files.includes(".next"))
  assert.ok(next.notes.some((n) => n.includes("dependencies")))
  const vite = detectLaunchConfig({ name: "b", devDependencies: { vite: "7" } })
  assert.deepEqual([vite.mode, vite.staticDir], ["static", "dist"])
  const server = detectLaunchConfig({ name: "c", scripts: { start: "node server.js" } })
  assert.deepEqual([server.mode, server.startScript, server.files], ["script", "start", []])
})

test("validateLaunchConfig rejects unsafe values", () => {
  const base: LaunchConfig = { mode: "script", startScript: "start", staticDir: "", port: 3000, files: [], env: [], notes: [] }
  const m = { name: "x", scripts: { start: "node ." } }
  assert.equal(validateLaunchConfig({ ...base }, m), null)
  assert.ok(validateLaunchConfig({ ...base, files: ["../secrets"] }, m))
  assert.ok(validateLaunchConfig({ ...base, files: ["/etc"] }, m))
  assert.ok(validateLaunchConfig({ ...base, startScript: "start; rm -rf /" }, m))
  assert.ok(validateLaunchConfig({ ...base, env: [{ name: "bad-name", description: "", required: true }] }, m))
  assert.ok(validateLaunchConfig({ ...base, mode: "static", staticDir: "../x" }, m))
})

test("checkBaseUrl allows only public https hosts", () => {
  assert.equal(checkBaseUrl(""), null)
  assert.equal(checkBaseUrl("https://api.openai.com/v1"), null)
  assert.ok(checkBaseUrl("http://api.openai.com/v1"))
  assert.ok(checkBaseUrl("https://169.254.169.254/"))
  assert.ok(checkBaseUrl("https://metadata.google.internal/"))
  assert.ok(checkBaseUrl("https://localhost:8080"))
  assert.ok(checkBaseUrl("https://[::1]/"))
})

function makePkg(config: LaunchConfig, extra: object = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npxhub-launcher-"))
  fs.mkdirSync(path.join(dir, "bin"))
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo-app", version: "1.2.3", ...extra }))
  fs.writeFileSync(path.join(dir, "bin/demo-app.cjs"), launcherScript("demo-app", config))
  return dir
}

const run = (dir: string, args: string[], env: object = {}) =>
  execFileSync(process.execPath, [path.join(dir, "bin/demo-app.cjs"), ...args], { env: { ...process.env, ...env }, encoding: "utf8" })

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(url)
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`nothing listening on ${url}`)
}

test("launcher: --version, --help and required env vars", () => {
  const config: LaunchConfig = {
    mode: "script", startScript: "start", staticDir: "", port: 3000, files: [], notes: [],
    env: [{ name: "OPENAI_API_KEY", description: "Key for chat", required: true }],
  }
  const dir = makePkg(config)
  assert.equal(run(dir, ["--version"]).trim(), "1.2.3")
  assert.match(run(dir, ["--help"]), /OPENAI_API_KEY \(required\)/)
  assert.throws(() => run(dir, ["--no-open"]), (e: { status: number; stderr: string }) => e.status === 1 && /OPENAI_API_KEY/.test(e.stderr))
})

test("launcher: static mode serves files with SPA fallback and blocks traversal", async () => {
  const dir = makePkg({ mode: "static", startScript: "", staticDir: "dist", port: 0, files: ["dist"], env: [], notes: [] })
  fs.mkdirSync(path.join(dir, "dist"))
  fs.writeFileSync(path.join(dir, "dist/index.html"), "<h1>home</h1>")
  fs.writeFileSync(path.join(dir, "dist/app.js"), "console.log(1)")
  fs.writeFileSync(path.join(dir, "secret.txt"), "top secret")
  const child = spawn(process.execPath, [path.join(dir, "bin/demo-app.cjs"), "--port", "47311", "--no-open"])
  try {
    const home = await waitFor("http://localhost:47311/")
    assert.equal(await home.text(), "<h1>home</h1>")
    const js = await fetch("http://localhost:47311/app.js")
    assert.equal(js.headers.get("content-type"), "text/javascript")
    assert.equal(await (await fetch("http://localhost:47311/some/route")).text(), "<h1>home</h1>")
    assert.equal(await (await fetch("http://localhost:47311/..%2Fsecret.txt")).text(), "<h1>home</h1>")
  } finally {
    child.kill()
  }
})

test("launcher: script mode runs the npm script with PORT", async () => {
  const dir = makePkg(
    { mode: "script", startScript: "start", staticDir: "", port: 47312, files: [], env: [], notes: [] },
    { scripts: { start: "node server.js" } }
  )
  fs.writeFileSync(
    path.join(dir, "server.js"),
    'require("http").createServer((q, r) => r.end("port " + process.env.PORT)).listen(process.env.PORT)'
  )
  const child = spawn(process.execPath, [path.join(dir, "bin/demo-app.cjs"), "--no-open"], { detached: true })
  try {
    const res = await waitFor("http://localhost:47312/")
    assert.equal(await res.text(), "port 47312")
  } finally {
    process.kill(-child.pid!, "SIGTERM")
  }
})
