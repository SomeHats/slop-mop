import { describe, expect, it } from "vitest"
import { langFromPath } from "./lang"

// woke2 test LIB-LG1, LIB-LG2, LIB-LG3, LIB-LG4
describe("langFromPath", () => {
  it("maps known extensions to languages", () => {
    expect(langFromPath("foo.ts")).toBe("typescript")
    expect(langFromPath("foo.tsx")).toBe("tsx")
    expect(langFromPath("src/lib/util.rs")).toBe("rust")
    expect(langFromPath("README.md")).toBe("markdown")
  })

  it("is case-insensitive on the extension", () => {
    expect(langFromPath("Foo.TS")).toBe("typescript")
    expect(langFromPath("Cargo.TOML")).toBe("toml")
  })

  it("uses only the trailing extension for multi-dot names", () => {
    expect(langFromPath("foo.test.ts")).toBe("typescript")
    expect(langFromPath("a.b.c.json")).toBe("json")
  })

  it("returns undefined for unknown or missing extensions", () => {
    expect(langFromPath("Makefile")).toBeUndefined()
    expect(langFromPath("foo.unknownext")).toBeUndefined()
    expect(langFromPath("")).toBeUndefined()
  })
})
