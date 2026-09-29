"use client"

import { useState } from "react"
import { ActionForm } from "@/components/action-form"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { removeAiSettings, saveAiSettings, testAiSettings } from "@/app/(dashboard)/actions"

type Current = { provider: "anthropic" | "openai"; baseUrl: string; model: string; keyHint: string } | null

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export function AiSettingsForm({ current }: { current: Current }) {
  const [provider, setProvider] = useState(current?.provider ?? "anthropic")
  // Controlled, because React resets uncontrolled fields after every form action, including rejected ones.
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "")
  const [model, setModel] = useState(current?.model ?? "")
  const [apiKey, setApiKey] = useState("")
  const anthropic = provider === "anthropic"

  return (
    <div className="space-y-4">
      <ActionForm action={saveAiSettings} className="grid max-w-xl gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="provider">API type</Label>
          <select
            id="provider"
            name="provider"
            className={selectClass}
            value={provider}
            onChange={(e) => setProvider(e.target.value as "anthropic" | "openai")}
          >
            <option value="anthropic">Anthropic (or Anthropic-compatible)</option>
            <option value="openai">OpenAI-compatible (Chat Completions)</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="baseUrl">Base URL {anthropic && <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
          <Input
            id="baseUrl"
            name="baseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={anthropic ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
            className="font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={anthropic ? "claude-opus-5-5" : "your provider's model name"}
            className="font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="apiKey">API key</Label>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={current ? `Saved (…${current.keyHint}). Leave blank to keep it.` : anthropic ? "sk-ant-…" : "sk-…"}
            className="font-mono"
          />
        </div>
        <div>
          <SubmitButton>Save</SubmitButton>
        </div>
      </ActionForm>

      {current && (
        <div className="flex flex-wrap gap-2">
          <ActionForm action={testAiSettings}>
            <SubmitButton variant="outline" size="sm">
              Test connection
            </SubmitButton>
          </ActionForm>
          <ActionForm action={removeAiSettings}>
            <SubmitButton variant="destructive" size="sm">
              Remove
            </SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  )
}
