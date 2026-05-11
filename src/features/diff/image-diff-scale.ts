export const IMAGE_HEIGHT_CAP_PX = 600

export type NaturalSize = { w: number; h: number }
export type ImageDiffMode = "2-up" | "fade" | "wipe"

export type ImageDiffScale = {
  /** Uniform scale factor applied to both images. ≤ 1 (never upscale). */
  scale: number
  /** Bounding box width (px) for overlay modes — based on the larger image. */
  boxW: number
  /** Bounding box height (px) for overlay modes — based on the larger image. */
  boxH: number
}

/**
 * Compute a single scale factor that, applied uniformly to both sides, keeps
 * each side within the per-side width (half the container in 2-up, full
 * container in overlay modes) and the height cap. Never upscales.
 */
// woke2 impl DV-IMG-9
export function computeImageScale(input: {
  beforeSize: NaturalSize | null
  afterSize: NaturalSize | null
  mode: ImageDiffMode
  containerWidth: number
  heightCapPx?: number
}): ImageDiffScale {
  const heightCap = input.heightCapPx ?? IMAGE_HEIGHT_CAP_PX
  const sideWidth =
    input.mode === "2-up"
      ? Math.max(50, Math.floor(input.containerWidth / 2) - 4)
      : input.containerWidth

  const sides: NaturalSize[] = []
  if (input.beforeSize && input.beforeSize.w > 0 && input.beforeSize.h > 0) {
    sides.push(input.beforeSize)
  }
  if (input.afterSize && input.afterSize.w > 0 && input.afterSize.h > 0) {
    sides.push(input.afterSize)
  }

  let scale = 1
  for (const side of sides) {
    const sx = sideWidth / side.w
    const sy = heightCap / side.h
    scale = Math.min(scale, sx, sy)
  }

  const maxW = Math.max(input.beforeSize?.w ?? 0, input.afterSize?.w ?? 0)
  const maxH = Math.max(input.beforeSize?.h ?? 0, input.afterSize?.h ?? 0)
  return {
    scale,
    boxW: maxW > 0 ? Math.round(maxW * scale) : 0,
    boxH: maxH > 0 ? Math.round(maxH * scale) : 0,
  }
}
