import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"
import { z } from "zod"
import { generateJson, testAi, type AiSettings } from "../src/lib/ai"

type Handler = (path: string, body: Record<string, unknown>) => { status: number; json: unknown }

async function mock(handler: Handler) {
  const seen: { path: string; body: Record<string, unknown>; auth: string | undefined }[] = []
  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const body = JSON.parse(raw || "{}")
      seen.push({ path: req.url!, body, auth: (req.headers["x-api-key"] ?? req.headers.authorization) as string })
      const { status, json } = handler(req.url!, body)
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json))
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, seen, close: () => (server.closeAllConnections(), server.close()) }
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text }], stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
})

const Schema = z.object({ cause: z.string(), files: z.array(z.string()) })

test("anthropic: structured output with a Zod schema", async () => {
  const m = await mock(() => ({ status: 200, json: message('{"cause":"missing dep","files":["package.json"]}') }))
  const ai: AiSettings = { provider: "anthropic", baseUrl: m.url, model: "claude-opus-5-5", apiKey: "sk-ant-test" }
  try {
    const out = await generateJson(ai, "sys", "prompt", Schema)
    assert.deepEqual(out, { cause: "missing dep", files: ["package.json"] })
    const req = m.seen[0]
    assert.equal(req.path, "/v1/messages")
    assert.equal(req.auth, "sk-ant-test")
    assert.equal(req.body.model, "claude-opus-5-5")
    assert.equal((req.body.output_config as { format: { type: string } }).format.type, "json_schema")
  } finally {
    m.close()
  }
})

test("anthropic: refusal and auth errors become readable errors", async () => {
  const refuse = await mock(() => ({ status: 200, json: message("", "refusal") }))
  const denied = await mock(() => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "bad key" } } }))
  try {
    await assert.rejects(generateJson({ provider: "anthropic", baseUrl: refuse.url, model: "m", apiKey: "k" }, "s", "p", Schema), /declined/)
    await assert.rejects(testAi({ provider: "anthropic", baseUrl: denied.url, model: "m", apiKey: "k" }), /rejected the API key/)
  } finally {
    refuse.close()
    denied.close()
  }
})

test("openai-compatible: json_object, fenced JSON, and retry without response_format", async () => {
  let calls = 0
  const m = await mock((_path, body) => {
    calls++
    if (body.response_format) return { status: 400, json: { error: "response_format unsupported" } }
    return { status: 200, json: { choices: [{ message: { content: '```json\n{"cause":"x","files":[]}\n```' } }] } }
  })
  try {
    const out = await generateJson({ provider: "openai", baseUrl: `${m.url}/v1`, model: "gpt-x", apiKey: "sk-test" }, "s", "p", Schema)
    assert.deepEqual(out, { cause: "x", files: [] })
    assert.equal(calls, 2)
    assert.equal(m.seen[0].path, "/v1/chat/completions")
    assert.equal(m.seen[0].auth, "Bearer sk-test")
  } finally {
    m.close()
  }
})

test("openai-compatible: schema mismatch is an error", async () => {
  const m = await mock(() => ({ status: 200, json: { choices: [{ message: { content: '{"cause": 5}' } }] } }))
  try {
    await assert.rejects(generateJson({ provider: "openai", baseUrl: m.url, model: "g", apiKey: "k" }, "s", "p", Schema), /expected format/)
  } finally {
    m.close()
  }
})
