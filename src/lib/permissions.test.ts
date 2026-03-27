import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import { describe, expect, it } from "vitest"
import { evaluatePath, findAllowOnceOption, pathMatchesPrefix } from "./permissions"
import type { PermissionRule } from "./types"

describe("pathMatchesPrefix", () => {
  it("matches exact path", () => {
    expect(pathMatchesPrefix("/foo/bar", "/foo/bar")).toBe(true)
  })

  it("matches path under prefix", () => {
    expect(pathMatchesPrefix("/foo/bar/baz", "/foo/bar")).toBe(true)
  })

  it("rejects partial segment match", () => {
    // "/foo/barbaz" should NOT match "/foo/bar" — segment-aware
    expect(pathMatchesPrefix("/foo/barbaz", "/foo/bar")).toBe(false)
  })

  it("rejects unrelated path", () => {
    expect(pathMatchesPrefix("/etc/passwd", "/foo/bar")).toBe(false)
  })

  it("matches root prefix", () => {
    expect(pathMatchesPrefix("/anything", "/")).toBe(true)
  })
})

describe("evaluatePath", () => {
  const workspacePath = "/home/user/project"

  it("allows workspace paths", () => {
    expect(evaluatePath("/home/user/project/src/foo.ts", workspacePath, [], "proj-1")).toBe(
      "allowed",
    )
  })

  it("returns unmatched for outside-workspace paths with no rules", () => {
    expect(evaluatePath("/etc/passwd", workspacePath, [], "proj-1")).toBe("unmatched")
  })

  it("applies allow rule", () => {
    const rules: PermissionRule[] = [
      {
        id: "r1",
        project_id: "proj-1",
        path_prefix: "/etc",
        decision: "allow",
        tool_kind: "read",
        created_at: "",
      },
    ]
    expect(evaluatePath("/etc/passwd", workspacePath, rules, "proj-1")).toBe("allowed")
  })

  it("applies deny rule", () => {
    const rules: PermissionRule[] = [
      {
        id: "r1",
        project_id: "proj-1",
        path_prefix: "/etc",
        decision: "deny",
        tool_kind: "read",
        created_at: "",
      },
    ]
    expect(evaluatePath("/etc/passwd", workspacePath, rules, "proj-1")).toBe("denied")
  })

  it("project-specific rule beats global rule", () => {
    const rules: PermissionRule[] = [
      {
        id: "r1",
        project_id: null,
        path_prefix: "/etc",
        decision: "deny",
        tool_kind: "read",
        created_at: "",
      },
      {
        id: "r2",
        project_id: "proj-1",
        path_prefix: "/etc",
        decision: "allow",
        tool_kind: "read",
        created_at: "",
      },
    ]
    expect(evaluatePath("/etc/passwd", workspacePath, rules, "proj-1")).toBe("allowed")
  })

  it("longest prefix wins among same-scope rules", () => {
    const rules: PermissionRule[] = [
      {
        id: "r1",
        project_id: "proj-1",
        path_prefix: "/etc",
        decision: "allow",
        tool_kind: "read",
        created_at: "",
      },
      {
        id: "r2",
        project_id: "proj-1",
        path_prefix: "/etc/ssh",
        decision: "deny",
        tool_kind: "read",
        created_at: "",
      },
    ]
    expect(evaluatePath("/etc/ssh/config", workspacePath, rules, "proj-1")).toBe("denied")
    expect(evaluatePath("/etc/hosts", workspacePath, rules, "proj-1")).toBe("allowed")
  })
})

describe("findAllowOnceOption", () => {
  it("finds allow_once option", () => {
    const params = {
      options: [
        { optionId: "cancel", kind: "cancel" },
        { optionId: "allow", kind: "allow_once" },
      ],
    } as unknown as RequestPermissionRequest
    expect(findAllowOnceOption(params)).toEqual({ outcome: "selected", optionId: "allow" })
  })

  it("falls back to first option when no allow_once", () => {
    const params = {
      options: [{ optionId: "first", kind: "something" }],
    } as unknown as RequestPermissionRequest
    expect(findAllowOnceOption(params)).toEqual({ outcome: "selected", optionId: "first" })
  })

  it("returns cancelled when no options", () => {
    const params = {
      options: [],
    } as unknown as RequestPermissionRequest
    expect(findAllowOnceOption(params)).toEqual({ outcome: "cancelled" })
  })
})
