import { describe, expect, it } from "vitest"
import { isImagePath } from "./is-image"

// woke2 test DV-IMG-1
describe("isImagePath", () => {
  it("returns true for known raster image extensions", () => {
    expect(isImagePath("logo.png")).toBe(true)
    expect(isImagePath("photo.jpg")).toBe(true)
    expect(isImagePath("photo.jpeg")).toBe(true)
    expect(isImagePath("anim.gif")).toBe(true)
    expect(isImagePath("pic.webp")).toBe(true)
    expect(isImagePath("pic.avif")).toBe(true)
    expect(isImagePath("old.bmp")).toBe(true)
    expect(isImagePath("favicon.ico")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(isImagePath("LOGO.PNG")).toBe(true)
    expect(isImagePath("Photo.Jpg")).toBe(true)
  })

  it("matches inside paths", () => {
    expect(isImagePath("src/assets/logo.png")).toBe(true)
    expect(isImagePath("./a/b/c.webp")).toBe(true)
  })

  it("returns false for SVG and non-image files", () => {
    expect(isImagePath("icon.svg")).toBe(false)
    expect(isImagePath("source.ts")).toBe(false)
    expect(isImagePath("README.md")).toBe(false)
    expect(isImagePath("notes")).toBe(false)
    expect(isImagePath("trailing.")).toBe(false)
  })
})
