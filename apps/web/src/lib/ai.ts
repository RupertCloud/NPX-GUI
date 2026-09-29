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

// Asks the model for JSON matching `schema`. Returns the validated object.
export async function generateJson<T extends z.ZodType>(ai: AiSettings, system: string, prompt: string, schema: T): Promise<z.infer<T>> {
  return ai.provider === "anthropic" ? anthropicJson(ai, system, prompt, schema) : openAiJson(ai, system, prompt, schema)
}

async function anthropicJson<T extends z.ZodType>(ai: AiSettings, system: string, prompt: string, schema: T): Promise<z.infer<T>> {
  const client = new Anthropic({ apiKey: ai.apiKey, baseURL: ai.baseUrl || undefined, maxRetries: 2 })
  try {
    // create() rather than parse(): parse() throws on a refusal before stop_reason can be checked.
    const response = await client.messages.create({
      model: ai.model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(schema) },
    })
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
  if (e instanceof Anthropic.BadRequestError) return new AiError(`The AI provider rejected the request: ${e.message}`)
  if (e instanceof Anthropic.APIError) return new AiError(`AI provider error${e.status ? ` ${e.status}` : ""}: ${e.message}`)
  return new AiError(`Couldn't reach the AI provider: ${(e as Error).message}`)
}

// OpenAI-compatible Chat Completions (OpenAI, and the many providers that mirror its API).
async function openAiJson<T extends z.ZodType>(ai: AiSettings, system: string, prompt: string, schema: T): Promise<z.infer<T>> {
  const schemaHint = JSON.stringify(z.toJSONSchema(schema))
  const body = {
    model: ai.model,
    messages: [
      { role: "system", content: `${system}\n\nReply with only a JSON object matching this JSON Schema:\n${schemaHint}` },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  }
  let res = await chatCompletions(ai, body)
  // Some compatible servers don't support response_format; retry without it.
  if (res.status === 400) res = await chatCompletions(ai, { ...body, response_format: undefined })
  if (res.status === 401 || res.status === 403) throw new AiError("The AI provider rejected the API key")
  if (res.status === 404) throw new AiError("Model or endpoint not found; check the model name and base URL")
  if (res.status === 429) throw new AiError("The AI provider is rate limiting requests; try again shortly")
  if (!res.ok) throw new AiError(`AI provider error ${res.status}`)
  const data = await res.json()
  return parseJson(data.choices?.[0]?.message?.content ?? "", schema)
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

function chatCompletions(ai: AiSettings, body: object) {
  return fetch(`${(ai.baseUrl || DEFAULT_BASE_URL.openai).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(300_000),
  }).catch((e) => {
    throw new AiError(`Couldn't reach the AI provider: ${(e as Error).message}`)
  })
}

// A small round trip to confirm the key, model and base URL work.
export async function testAi(ai: AiSettings) {
  const result = await generateJson(ai, "You are a connectivity check.", 'Reply with {"ok": true}.', z.object({ ok: z.boolean() }))
  if (!result.ok) throw new AiError("Unexpected reply from the model")
}
