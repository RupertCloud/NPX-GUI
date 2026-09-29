import assert from "node:assert/strict"
import { test } from "node:test"

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")

test("jobs: stale detection and runner token", async () => {
  const { checkRunnerToken, effectiveStatus, runnerToken } = await import("../src/lib/job-utils")
  const base = { id: "j1", kind: "launcher", target: "p", packageId: "p", uid: "u", login: "l" } as const
  const now = Date.parse("2026-09-29T12:00:00Z")
  assert.equal(effectiveStatus({ ...base, status: "running", createdAt: "2026-09-29T11:55:00Z", startedAt: "2026-09-29T11:56:00Z" }, now), "running")
  assert.equal(effectiveStatus({ ...base, status: "running", createdAt: "2026-09-29T11:00:00Z", startedAt: "2026-09-29T11:30:00Z" }, now), "failed")
  assert.equal(effectiveStatus({ ...base, status: "queued", createdAt: "2026-09-29T11:00:00Z" }, now), "failed")
  assert.equal(effectiveStatus({ ...base, status: "succeeded", createdAt: "2026-09-29T01:00:00Z" }, now), "succeeded")
  assert.ok(checkRunnerToken("j1", runnerToken("j1")))
  assert.ok(!checkRunnerToken("j2", runnerToken("j1")))
  assert.ok(!checkRunnerToken("j1", null))
  assert.ok(!checkRunnerToken("j1", "x".repeat(64)))
})

test("jobs: appendLog merges streamed chunks and caps size", async () => {
  const { appendLog } = await import("../src/lib/job-utils")
  const lines = appendLog([], "step", "Reading repo")
  appendLog(lines, "output", '{"cau')
  appendLog(lines, "output", 'se": "x"}')
  appendLog(lines, "step", "Opening PR")
  appendLog(lines, "step", "Done")
  assert.deepEqual(lines.map((l) => [l.kind, l.text]), [
    ["step", "Reading repo"],
    ["output", '{"cause": "x"}'],
    ["step", "Opening PR"],
    ["step", "Done"],
  ])
  const big = appendLog([], "output", "a".repeat(100_000))
  appendLog(big, "step", "b".repeat(50_000))
  assert.ok(big.reduce((n, l) => n + l.text.length, 0) <= 120_000)
  assert.equal(big[big.length - 1].kind, "step")
})
