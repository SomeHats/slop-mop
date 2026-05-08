import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

// woke2 impl FS-1, FS-2
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()

    void win.isFullscreen().then(setFullscreen)

    const unlisten = win.onResized(async () => {
      const fs = await win.isFullscreen()
      setFullscreen(fs)
    })

    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  return fullscreen
}
