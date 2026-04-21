import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef } from "react"
import type { ClaudeSession } from "@/hooks/use-claude-session"
import { palette, terminalTheme } from "@/lib/shiki"

type TerminalPanelProps = {
  session: ClaudeSession
  visible: boolean
}

const encoder = new TextEncoder()

export function TerminalPanel({ session, visible }: TerminalPanelProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { onOutput, writeInput, resize } = session

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      theme: terminalTheme,
      cursorBlink: true,
      allowProposedApi: true,
      convertEol: false,
      scrollback: 10000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    const doFit = (): void => {
      try {
        fit.fit()
        if (term.cols > 0 && term.rows > 0) {
          resize(term.cols, term.rows)
        }
      } catch {
        // container may be 0x0 during initial layout — skip
      }
    }
    doFit()

    const ro = new ResizeObserver(() => doFit())
    ro.observe(host)

    const unsubOutput = onOutput((bytes) => {
      term.write(bytes)
    })

    const dataDisposable = term.onData((data) => {
      writeInput(encoder.encode(data))
    })

    term.focus()

    return () => {
      ro.disconnect()
      dataDisposable.dispose()
      unsubOutput()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [onOutput, writeInput, resize])

  // Focus/blur + refresh on visibility changes. The terminal stays in layout
  // (real dimensions) at all times so no resize is needed — just wake xterm's
  // renderer when it comes forward.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (visible) {
      try {
        term.refresh(0, term.rows - 1)
        term.focus()
      } catch {
        // ignore
      }
    } else {
      try {
        term.blur()
      } catch {
        // ignore
      }
    }
  }, [visible])

  return (
    <div className="flex h-full w-full flex-col" style={{ background: palette.bg }}>
      <div ref={hostRef} className="h-full w-full p-2" />
    </div>
  )
}
