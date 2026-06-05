import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useEffect, useRef } from "react"
import dingUrl from "@/assets/ding.mp3"
import type { PromptFinishedNotification } from "@/lib/types"

const NAG_INTERVAL_MS = 5000

type Args = {
  isBusy: boolean
  mode: PromptFinishedNotification
  playWhenFocused: boolean
}

// woke2 impl PFE-NT3, PFE-NT4, PFE-NT5, PFE-NT6
export function usePromptFinishedNotification({ isBusy, mode, playWhenFocused }: Args): void {
  const prevBusyRef = useRef(false)
  const modeRef = useRef(mode)
  const playWhenFocusedRef = useRef(playWhenFocused)
  const nagTimerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    playWhenFocusedRef.current = playWhenFocused
  }, [playWhenFocused])

  const stopNag = useCallback((): void => {
    if (nagTimerRef.current !== null) {
      window.clearInterval(nagTimerRef.current)
      nagTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mode !== "nag") stopNag()
  }, [mode, stopNag])

  useEffect(() => {
    const win = getCurrentWindow()
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (focused) stopNag()
    })
    return () => {
      void unlistenPromise.then((fn) => fn())
    }
  }, [stopNag])

  useEffect(() => {
    return () => {
      stopNag()
    }
  }, [stopNag])

  useEffect(() => {
    const wasBusy = prevBusyRef.current
    prevBusyRef.current = isBusy
    if (!(wasBusy && !isBusy)) return
    if (modeRef.current === "none") return

    void (async () => {
      const win = getCurrentWindow()
      const focused = await win.isFocused().catch(() => false)
      if (focused && !playWhenFocusedRef.current) return

      if (audioRef.current === null) {
        audioRef.current = new Audio(dingUrl)
      }
      const audio = audioRef.current
      audio.currentTime = 0
      void audio.play().catch((e) => console.error("[slop-mop] ding play failed", e))

      if (modeRef.current === "nag" && !focused) {
        stopNag()
        nagTimerRef.current = window.setInterval(() => {
          if (audioRef.current === null) return
          audioRef.current.currentTime = 0
          void audioRef.current.play().catch((e) => console.error("[slop-mop] ding play failed", e))
        }, NAG_INTERVAL_MS)
      }
    })()
  }, [isBusy, stopNag])
}
