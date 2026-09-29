import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { decrypt } from "./crypto"
import { db } from "./firebase/admin"

// Each user brings their own AI provider. The key is stored AES-256-GCM encrypted, like the GitHub token.
export type AiProvider = "anthropic" | "openai"

export type AiSettings = { provider: AiProvider; baseUrl: string; model: string; apiKey: string }

export type StoredAiSettings = { provider: AiProvider; baseUrl: string; model: string; keyEnc: string; keyHint: string }

export const DEFAULT_MODEL: Record<AiProvider, string> = { anthropic: "claude-opus-5-5", openai: "" }
export const DEFAULT_BASE_URL: Record<AiProvider, string> = { anthropic: "", openai: "https://api.openai.com/v1" }

export class AiError extends Error {}

// The server calls the user's base URL, so only allow public https hosts (no IPs, localhost or internal names).
export function checkBaseUrl(raw: string): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "Base URL is not a valid URL"
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:") return "Base URL must use https"
  if (/^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || !host.includes(".")) return "Base URL must use a public hostname"
  if (/\.(internal|local|localhost)$/.test(host)) return "Base URL must use a public hostname"
  return null
}

export async function getAiSettings(uid: string): Promise<AiSettings | null> {
  const ai = (await db.collection("users").doc(uid).get()).data()?.ai as StoredAiSettings | undefined
  if (!ai?.keyEnc) return null
  return { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, apiKey: decrypt(ai.keyEnc) }
}

// Receives what the model writes as it streams: its reasoning summary (when available) and its answer.
export type AiLog = (kind: "thinking" | "output", text: string) => void

// Asks the model for JSON matching `schema`. Returns the validated object.
export async function generateJson<T extends z.ZodType>(
  ai: AiSettings,
  system: string,
  prompt: string,
  schema: T,
  log: AiLog = () => {}
): Promise<z.infer<T>> {
  return ai.provider === "anthropic" ? anthropicJson(ai, system, prompt, schema, log) : openAiJson(ai, system, prompt, schema, log)
}

async function anthropicJson<T extends z.ZodType>(ai: AiSettings, system: string, prompt: string, schema: T, log: AiLog): Promise<z.infer<T>> {
  const client = new Anthropic({ apiKey: ai.apiKey, baseURL: ai.baseUrl || undefined, maxRetries: 2 })
  // Without parse(), so the SDK doesn't auto-parse (and throw) before a refusal can be checked.
  const { parse, ...format } = zodOutputFormat(schema)
  void parse
  // Claude on Anthropic's API can return a readable summary of its reasoning for the console.
  const summarized = !ai.baseUrl && ai.model.startsWith("claude-")
  try {
    // Streamed so bytes keep flowing: proxies such as Cloudflare drop requests that are silent for ~100s (HTTP 524).
    const stream = client.messages.stream({
      model: ai.model,
      max_tokens: 64000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format },
      ...(summarized ? { thinking: { type: "adaptive" as const, display: "summarized" as const } } : {}),
    })
    stream.on("streamEvent", (event) => {
      if (event.type !== "content_block_delta") return
      if (event.delta.type === "thinking_delta") log("thinking", event.delta.thinking)
      else if (event.delta.type === "text_delta") log("output", event.delta.text)
    })
    const response = await stream.finalMessage()
    if (response.stop_reason === "refusal") throw new AiError("The model declined this request")
    if (response.stop_reason === "max_tokens") throw new AiError("The model's answer was cut off; try again")
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("")
    return parseJson(text, schema)
  } catch (e) {
    throw toAiError(e)
  }
}

function toAiError(e: unknown): Error {
  if (e instanceof AiError) return e
  if (e instanceof Anthropic.AuthenticationError) return new AiError("The AI provider rejected the API key")
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("The API key isn't allowed to use this model")
  if (e instanceof Anthropic.NotFoundError) return new AiError("Model or endpoint not found; check the model name and base URL")
  if (e instanceof Anthropic.RateLimitError) return new AiError("The AI provider is rate limiting requests; try again shortly")
  if (e instanceof Anthropic.APIError && (e.status === 504 || e.status === 524)) {
    return new AiError(`The AI provider timed out (HTTP ${e.status}); try again or pick a faster model`)
  }
  if (e instanceof Anthropic.BadRequestError) return new AiError(`The AI provider rejected the request: ${e.message}`)
  if (e instanceof Anthropic.APIError) return new AiError(`AI provider error${e.status ? ` ${e.status}` : ""}: ${e.message}`)
  return new AiError(`Couldn't reach the AI provider: ${(e as Error).message}`)
}

// OpenAI-compatible Chat Completions (OpenAI, and the many providers that mirror its API).
async function openAiJson<T extends z.ZodType>(ai: AiSettings, system: string, prompt: string, schema: T, log: AiLog): Promise<z.infer<T>> {
  const schemaHint = JSON.stringify(z.toJSONSchema(schema))
  const body = {
    model: ai.model,
    messages: [
      { role: "system", content: `${system}\n\nReply with only a JSON object matching this JSON Schema:\n${schemaHint}` },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    stream: true,
  }
  let res = await chatCompletions(ai, body)
  // Some compatible servers don't support response_format; retry without it.
  if (res.status === 400) res = await chatCompletions(ai, { ...body, response_format: undefined })
  if (res.status === 401 || res.status === 403) throw new AiError("The AI provider rejected the API key")
  if (res.status === 404) throw new AiError("Model or endpoint not found; check the model name and base URL")
  if (res.status === 429) throw new AiError("The AI provider is rate limiting requests; try again shortly")
  if (res.status === 524 || res.status === 504) throw new AiError(`The AI provider timed out (HTTP ${res.status}); try again or pick a faster model`)
  if (!res.ok) throw new AiError(`AI provider error ${res.status}`)
  return parseJson(await readCompletion(res, log), schema)
}

// Collects the text of a streamed (SSE) completion, or of a plain JSON one from servers that ignore `stream`.
async function readCompletion(res: Response, log: AiLog): Promise<string> {
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ""
    log("output", content)
    return content
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let text = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    const lines = buffer.split("\n")
    buffer = done ? "" : lines.pop()!
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : ""
      if (!data || data === "[DONE]") continue
      const chunk = JSON.parse(data)
      if (chunk.error) throw new AiError(`AI provider error: ${chunk.error.message ?? "stream failed"}`)
      const delta: string = chunk.choices?.[0]?.delta?.content ?? ""
      if (delta) log("output", delta)
      text += delta
    }
    if (done) return text
  }
}

function parseJson<T extends z.ZodType>(text: string, schema: T): z.infer<T> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""))
  } catch {
    throw new AiError("The model's answer wasn't valid JSON")
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new AiError("The model's answer didn't match the expected format")
  return result.data
}

// Retries once on gateway errors (502/503/524) and network failures.
async function chatCompletions(ai: AiSettings, body: object): Promise<Response> {
  const send = () =>
    fetch(`${(ai.baseUrl || DEFAULT_BASE_URL.openai).replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(600_000),
    })
  try {
    const res = await send()
    if (![502, 503, 524].includes(res.status)) return res
    await res.body?.cancel()
  } catch {
    // fall through to the single retry
  }
  await new Promise((r) => setTimeout(r, 2000))
  return send().catch((e) => {
    throw new AiError(`Couldn't reach the AI provider: ${(e as Error).message}`)
  })
}

// A small round trip to confirm the key, model and base URL work.
export async function testAi(ai: AiSettings) {
  const result = await generateJson(ai, "You are a connectivity check.", 'Reply with {"ok": true}.', z.object({ ok: z.boolean() }))
  if (!result.ok) throw new AiError("Unexpected reply from the model")
}
