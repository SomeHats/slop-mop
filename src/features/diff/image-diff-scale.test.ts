import { describe, expect, it } from "vitest"
import { computeImageScale } from "./image-diff-scale"

// woke2 test DV-IMG-9
describe("computeImageScale", () => {
  it("never upscales when both sides fit comfortably", () => {
    const r = computeImageScale({
      beforeSize: { w: 100, h: 100 },
      afterSize: { w: 100, h: 100 },
      mode: "fade",
      containerWidth: 1000,
    })
    expect(r.scale).toBe(1)
  })

  it("scales both sides by the smaller (more restrictive) factor", () => {
    // before is 200 wide, after is 800 wide. Container 400 wide in overlay mode.
    // before would allow scale=2, after needs scale=0.5. Pick 0.5.
    const r = computeImageScale({
      beforeSize: { w: 200, h: 200 },
      afterSize: { w: 800, h: 200 },
      mode: "fade",
      containerWidth: 400,
    })
    expect(r.scale).toBe(0.5)
  })

  it("uses half-width per side in 2-up mode", () => {
    // 2-up half = 400/2 - 4 = 196. Image is 392 wide → scale 0.5.
    const r = computeImageScale({
      beforeSize: { w: 392, h: 100 },
      afterSize: null,
      mode: "2-up",
      containerWidth: 400,
    })
    expect(r.scale).toBeCloseTo(196 / 392, 5)
  })

  it("respects the height cap", () => {
    const r = computeImageScale({
      beforeSize: { w: 100, h: 1200 },
      afterSize: null,
      mode: "fade",
      containerWidth: 1000,
      heightCapPx: 600,
    })
    expect(r.scale).toBe(0.5)
  })

  it("ignores absent sides and works with one-sided input", () => {
    const r = computeImageScale({
      beforeSize: { w: 100, h: 100 },
      afterSize: null,
      mode: "fade",
      containerWidth: 1000,
    })
    expect(r.scale).toBe(1)
  })

  it("box dims track the larger image at the chosen scale", () => {
    const r = computeImageScale({
      beforeSize: { w: 200, h: 100 },
      afterSize: { w: 800, h: 400 },
      mode: "fade",
      containerWidth: 400,
    })
    expect(r.scale).toBe(0.5)
    expect(r.boxW).toBe(400)
    expect(r.boxH).toBe(200)
  })
})
