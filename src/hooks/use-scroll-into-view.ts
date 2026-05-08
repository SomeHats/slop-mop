import { useCallback, useRef } from "react"

const PADDING = 12

/**
 * Returns a ref to attach to a collapsible root element, and a callback to
 * trigger scroll-into-view after expansion. If the element fits in the
 * ScrollArea viewport, it scrolls minimally to show the whole thing. If it
 * doesn't fit, pins the top of the element to the top of the viewport.
 * Adds a small padding so content doesn't sit flush against the edge.
 */
// woke2 impl SV-1, SV-2, SV-3, SV-4
export function useScrollIntoView(): {
  ref: React.RefObject<HTMLDivElement | null>
  scrollAfterExpand: () => void
} {
  const ref = useRef<HTMLDivElement>(null)

  const scrollAfterExpand = useCallback(() => {
    // Double rAF to ensure Radix has expanded content and layout is complete
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const viewport = el.closest<HTMLElement>("[data-slot=scroll-area-viewport]")
        if (!viewport) return
        const vr = viewport.getBoundingClientRect()
        const er = el.getBoundingClientRect()
        const fits = er.height + PADDING <= vr.height
        if (fits) {
          if (er.top < vr.top + PADDING) {
            viewport.scrollTo({
              top: viewport.scrollTop + (er.top - vr.top) - PADDING,
              behavior: "smooth",
            })
          } else if (er.bottom > vr.bottom - PADDING) {
            viewport.scrollTo({
              top: viewport.scrollTop + (er.bottom - vr.bottom) + PADDING,
              behavior: "smooth",
            })
          }
        } else {
          viewport.scrollTo({
            top: viewport.scrollTop + (er.top - vr.top) - PADDING,
            behavior: "smooth",
          })
        }
      }),
    )
  }, [])

  return { ref, scrollAfterExpand }
}
