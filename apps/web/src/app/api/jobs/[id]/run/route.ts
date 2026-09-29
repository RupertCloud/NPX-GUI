import { checkRunnerToken } from "@/lib/job-utils"
import { runJob } from "@/lib/jobs"

// Background runner. Called only by the npxhub server (kickOff), authenticated with a per-job HMAC.
// It answers immediately with one line and keeps the response open until the job finishes, so the
// platform keeps this request (and its CPU) alive independently of the user's browser.
export const maxDuration = 900

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!checkRunnerToken(id, req.headers.get("x-npxhub-job-token"))) return new Response("Forbidden", { status: 403 })
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("started\n"))
      await runJob(id)
      controller.enqueue(encoder.encode("done\n"))
      controller.close()
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } })
}
