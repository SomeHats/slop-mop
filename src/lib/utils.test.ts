import { describe, expect, it } from "vitest"
import { cn } from "./utils"

// woke2 test LIB-CN1, LIB-CN2, LIB-CN3
describe("cn", () => {
  it("joins truthy class names and skips falsy ones", () => {
    expect(cn("a", "b", false && "c", null, undefined, "d")).toBe("a b d")
  })

  it("merges conflicting Tailwind utilities, last one wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
    expect(cn("text-sm text-foreground", "text-base")).toBe("text-foreground text-base")
  })

  it("supports clsx-style object and array inputs", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d")
  })
})
