import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import type { NewRule, PendingPermission } from "@/lib/types"
import { PathSegmentSelector } from "./path-segment-selector"

type RuleCreator = {
  path: string
  prefix: string
  decision: "allow" | "deny" | "skip"
  global: boolean
}

type PermissionDialogProps = {
  pending: PendingPermission | null
  projectId: string
  onAllowOnce: () => void
  onDenyOnce: () => void
  onCreateRules: (rules: NewRule[]) => void
}

export function PermissionDialog({
  pending,
  projectId,
  onAllowOnce,
  onDenyOnce,
  onCreateRules,
}: PermissionDialogProps): React.JSX.Element {
  const [creators, setCreators] = useState<RuleCreator[]>([])

  // Sync creators when pending changes
  const currentPaths = pending?.unmatchedPaths.join(",") ?? ""
  const [lastPaths, setLastPaths] = useState("")
  if (currentPaths !== lastPaths) {
    setLastPaths(currentPaths)
    if (pending) {
      setCreators(
        pending.unmatchedPaths.map((p) => ({
          path: p,
          prefix: p,
          decision: "skip",
          global: false,
        })),
      )
    }
  }

  const updateCreator = (index: number, update: Partial<RuleCreator>): void => {
    setCreators((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c
        const merged = { ...c, ...update }
        // If user changed scope but hasn't touched the decision yet, default to allow
        if ("prefix" in update && c.decision === "skip" && !("decision" in update)) {
          merged.decision = "allow"
        }
        return merged
      }),
    )
  }

  const hasNonSkipRules = creators.some((c) => c.decision !== "skip")

  const handleCreateRules = (): void => {
    const rules: NewRule[] = creators
      .filter((c) => c.decision !== "skip")
      .map((c) => ({
        project_id: c.global ? null : projectId,
        path_prefix: c.prefix,
        decision: c.decision as "allow" | "deny",
        tool_kind: pending?.toolKind ?? "read",
      }))
    onCreateRules(rules)
  }

  return (
    <Dialog open={pending !== null}>
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Permission request</DialogTitle>
          <DialogDescription>
            Agent wants to {pending?.toolKind ?? "access"} files outside the workspace
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex flex-1 flex-col overflow-y-auto">
          {pending && pending.deniedPaths.length > 0 ? (
            <div className="flex flex-col gap-1 px-4 py-3">
              <p className="text-xs font-medium text-foreground">Blocked by existing rules</p>
              {pending.deniedPaths.map((p) => (
                <div key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="destructive" className="text-[10px]">
                    denied
                  </Badge>
                  <span className="truncate">{p}</span>
                </div>
              ))}
            </div>
          ) : null}

          {creators.map((creator, index) => (
            <div
              key={creator.path}
              className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {pending?.toolKind ?? "read"}
                </Badge>
                <PathSegmentSelector
                  path={creator.path}
                  selectedPrefix={creator.prefix}
                  onSelectPrefix={(prefix) => updateCreator(index, { prefix })}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    id={`global-${index.toString()}`}
                    checked={creator.global}
                    onCheckedChange={(checked) =>
                      updateCreator(index, { global: checked === true })
                    }
                  />
                  <label htmlFor={`global-${index.toString()}`}>apply globally</label>
                </span>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`decision-${index.toString()}`}
                      checked={creator.decision === "allow"}
                      onChange={() => updateCreator(index, { decision: "allow" })}
                      className="accent-primary"
                    />
                    always allow
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`decision-${index.toString()}`}
                      checked={creator.decision === "deny"}
                      onChange={() => updateCreator(index, { decision: "deny" })}
                      className="accent-primary"
                    />
                    always deny
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`decision-${index.toString()}`}
                      checked={creator.decision === "skip"}
                      onChange={() => updateCreator(index, { decision: "skip" })}
                      className="accent-primary"
                    />
                    skip
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <Button variant="outline" size="sm" onClick={onDenyOnce}>
            Deny once
          </Button>
          <Button variant="outline" size="sm" onClick={onAllowOnce}>
            Allow once
          </Button>
          <Button size="sm" disabled={!hasNonSkipRules} onClick={handleCreateRules}>
            Create rules and continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
