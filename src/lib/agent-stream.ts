import type { Stream } from "@agentclientprotocol/sdk"
import { ndJsonStream } from "@agentclientprotocol/sdk"
import { listen } from "@tauri-apps/api/event"
import { writeAgentStdin } from "./tauri"

type StdoutPayload = {
  agent_id: string
  line: string
}

type ExitPayload = {
  agent_id: string
}

type AgentStream = {
  stream: Stream
  cleanup: () => void
}

export function createAgentStream(agentId: string): AgentStream {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let stdoutController: ReadableStreamDefaultController<Uint8Array> | undefined
  let unlistenStdout: (() => void) | undefined
  let unlistenExit: (() => void) | undefined

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller

      void listen<StdoutPayload>("agent-stdout", (event) => {
        if (event.payload.agent_id === agentId) {
          controller.enqueue(encoder.encode(`${event.payload.line}\n`))
        }
      }).then((unlisten) => {
        unlistenStdout = unlisten
      })

      void listen<ExitPayload>("agent-exit", (event) => {
        if (event.payload.agent_id === agentId) {
          controller.close()
        }
      }).then((unlisten) => {
        unlistenExit = unlisten
      })
    },
    cancel() {
      unlistenStdout?.()
      unlistenExit?.()
    },
  })

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      const data = decoder.decode(chunk)
      await writeAgentStdin(agentId, data)
    },
  })

  const stream = ndJsonStream(writable, readable)

  const cleanup = (): void => {
    unlistenStdout?.()
    unlistenExit?.()
    try {
      stdoutController?.close()
    } catch {
      // already closed
    }
  }

  return { stream, cleanup }
}
