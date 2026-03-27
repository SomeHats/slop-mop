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
import type {
  NewExecuteFileRule,
  NewExecuteFlagRule,
  NewExecuteRule,
  PendingExecutePermission,
  UnmatchedCommand,
} from "@/lib/types"
import { PathSegmentSelector } from "./path-segment-selector"

type CommandRuleCreator = {
  command: UnmatchedCommand
  decision: "allow" | "deny" | "skip"
  global: boolean
  flagDecisions: Map<string, "allow" | "deny" | "skip">
  fileDecisions: Map<string, { prefix: string; decision: "allow" | "deny" | "skip" }>
}

type ExecutePermissionDialogProps = {
  pending: PendingExecutePermission | null
  projectId: string
  onAllowOnce: () => void
  onDenyOnce: () => void
  onCreateRules: (
    commandRules: NewExecuteRule[],
    flagRules: Map<number, NewExecuteFlagRule[]>,
    fileRules: Map<number, NewExecuteFileRule[]>,
  ) => void
}

function buildCreators(pending: PendingExecutePermission): CommandRuleCreator[] {
  return pending.unmatchedCommands.map((uc) => ({
    command: uc,
    decision: "skip",
    global: false,
    flagDecisions: new Map(
      [...uc.unmatchedFlags, ...uc.deniedFlags].map((f) => [f, "skip" as const]),
    ),
    fileDecisions: new Map(
      [...uc.unmatchedFiles, ...uc.deniedFiles].map((f) => [
        f,
        { prefix: f, decision: "skip" as const },
      ]),
    ),
  }))
}

export function ExecutePermissionDialog({
  pending,
  projectId,
  onAllowOnce,
  onDenyOnce,
  onCreateRules,
}: ExecutePermissionDialogProps): React.JSX.Element {
  const [creators, setCreators] = useState<CommandRuleCreator[]>([])

  // Sync creators when pending changes
  const currentKey = pending
    ? pending.unmatchedCommands.map((u) => u.command.identity).join(",")
    : ""
  const [lastKey, setLastKey] = useState("")
  if (currentKey !== lastKey) {
    setLastKey(currentKey)
    if (pending && !pending.isDynamic) {
      setCreators(buildCreators(pending))
    }
  }

  const updateCreator = (index: number, update: Partial<CommandRuleCreator>): void => {
    setCreators((prev) => prev.map((c, i) => (i === index ? { ...c, ...update } : c)))
  }

  const updateFlagDecision = (
    creatorIndex: number,
    flag: string,
    decision: "allow" | "deny" | "skip",
  ): void => {
    setCreators((prev) =>
      prev.map((c, i) => {
        if (i !== creatorIndex) return c
        const flagDecisions = new Map(c.flagDecisions)
        flagDecisions.set(flag, decision)
        // Auto-set command to "allow" if still on "skip"
        const cmdDecision = c.decision === "skip" && decision !== "skip" ? "allow" : c.decision
        return { ...c, flagDecisions, decision: cmdDecision as "allow" | "deny" | "skip" }
      }),
    )
  }

  const updateFileDecision = (
    creatorIndex: number,
    file: string,
    update: { prefix?: string; decision?: "allow" | "deny" | "skip" },
  ): void => {
    setCreators((prev) =>
      prev.map((c, i) => {
        if (i !== creatorIndex) return c
        const fileDecisions = new Map(c.fileDecisions)
        const existing = fileDecisions.get(file) ?? { prefix: file, decision: "skip" as const }
        const merged = { ...existing, ...update }
        fileDecisions.set(file, merged)
        // Auto-set command to "allow" if still on "skip"
        const cmdDecision =
          c.decision === "skip" && update.decision !== "skip" && update.decision !== undefined
            ? "allow"
            : c.decision
        return { ...c, fileDecisions, decision: cmdDecision as "allow" | "deny" | "skip" }
      }),
    )
  }

  const hasNonSkipRules = creators.some((c) => c.decision !== "skip")

  const handleCreateRules = (): void => {
    const commandRules: NewExecuteRule[] = []
    const flagRulesMap = new Map<number, NewExecuteFlagRule[]>()
    const fileRulesMap = new Map<number, NewExecuteFileRule[]>()

    let ruleIndex = 0
    for (const creator of creators) {
      if (creator.decision === "skip") continue

      commandRules.push({
        project_id: creator.global ? null : projectId,
        command: creator.command.command.identity,
        decision: creator.decision,
      })

      // Collect non-skip flag rules
      const flags: NewExecuteFlagRule[] = []
      for (const [flag, decision] of creator.flagDecisions) {
        if (decision === "skip") continue
        flags.push({
          execute_rule_id: "", // Will be set by the handler after creation
          flag,
          decision,
        })
      }
      if (flags.length > 0) {
        flagRulesMap.set(ruleIndex, flags)
      }

      // Collect non-skip file rules
      const files: NewExecuteFileRule[] = []
      for (const [_file, { prefix, decision }] of creator.fileDecisions) {
        if (decision === "skip") continue
        files.push({
          execute_rule_id: "", // Will be set by the handler after creation
          path_prefix: prefix,
          decision,
        })
      }
      if (files.length > 0) {
        fileRulesMap.set(ruleIndex, files)
      }

      ruleIndex++
    }

    onCreateRules(commandRules, flagRulesMap, fileRulesMap)
  }

  // Dynamic mode: simple allow/deny
  if (pending?.isDynamic) {
    return (
      <Dialog open>
        <DialogContent
          className="max-w-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Execute permission</DialogTitle>
            <DialogDescription>
              Command contains dynamic expressions — review manually
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="px-4 py-3">
            <pre className="overflow-x-auto bg-muted p-3 text-xs leading-relaxed">
              {pending.rawCommandString}
            </pre>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-2 px-4 py-3">
            <Button variant="outline" size="sm" onClick={onDenyOnce}>
              Deny once
            </Button>
            <Button variant="outline" size="sm" onClick={onAllowOnce}>
              Allow once
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Static mode
  return (
    <Dialog open={pending !== null}>
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Execute permission</DialogTitle>
          <DialogDescription>
            Agent wants to run commands — create rules or allow/deny once
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex max-h-96 flex-1 flex-col overflow-y-auto">
          {/* Denied commands (informational) */}
          {pending && pending.deniedCommands.length > 0 ? (
            <div className="flex flex-col gap-1 px-4 py-3">
              <p className="text-xs font-medium text-foreground">Blocked by existing rules</p>
              {pending.deniedCommands.map((dc) => (
                <div
                  key={dc.command.identity}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Badge variant="destructive" className="text-[10px]">
                    denied
                  </Badge>
                  <code className="truncate">{dc.command.identity}</code>
                  {dc.deniedFlags.length > 0 ? (
                    <span className="text-muted-foreground/60">
                      (flags: {dc.deniedFlags.join(", ")})
                    </span>
                  ) : null}
                  {dc.deniedFiles.length > 0 ? (
                    <span className="text-muted-foreground/60">
                      (files: {dc.deniedFiles.join(", ")})
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Unmatched commands */}
          {creators.map((creator, creatorIdx) => (
            <div
              key={creator.command.command.identity}
              className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              {/* Command identity */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  execute
                </Badge>
                <code className="text-xs font-medium">{creator.command.command.identity}</code>
              </div>

              {/* Flags */}
              {(creator.command.unmatchedFlags.length > 0 ||
                creator.command.deniedFlags.length > 0) && (
                <div className="flex flex-col gap-1.5 pl-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Flags
                  </p>
                  {[...creator.command.unmatchedFlags, ...creator.command.deniedFlags].map(
                    (flag) => {
                      const isDenied = creator.command.deniedFlags.includes(flag)
                      const decision = creator.flagDecisions.get(flag) ?? "skip"
                      return (
                        <div key={flag} className="flex items-center justify-between">
                          <code className="text-xs">{flag}</code>
                          {isDenied ? (
                            <Badge variant="destructive" className="text-[10px]">
                              denied
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="radio"
                                  name={`flag-${creatorIdx.toString()}-${flag}`}
                                  checked={decision === "allow"}
                                  onChange={() => updateFlagDecision(creatorIdx, flag, "allow")}
                                  className="accent-primary"
                                />
                                allow
                              </label>
                              <label className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="radio"
                                  name={`flag-${creatorIdx.toString()}-${flag}`}
                                  checked={decision === "deny"}
                                  onChange={() => updateFlagDecision(creatorIdx, flag, "deny")}
                                  className="accent-primary"
                                />
                                deny
                              </label>
                              <label className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="radio"
                                  name={`flag-${creatorIdx.toString()}-${flag}`}
                                  checked={decision === "skip"}
                                  onChange={() => updateFlagDecision(creatorIdx, flag, "skip")}
                                  className="accent-primary"
                                />
                                skip
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              )}

              {/* File args */}
              {(creator.command.command.fileArgs.length > 0 ||
                creator.command.unmatchedFiles.length > 0 ||
                creator.command.deniedFiles.length > 0) && (
                <div className="flex flex-col gap-1.5 pl-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Files
                  </p>
                  {/* Workspace files (informational) */}
                  {creator.command.command.fileArgs
                    .filter(
                      (f) =>
                        !creator.command.unmatchedFiles.some((uf) => uf.endsWith(f) || f === uf) &&
                        !creator.command.deniedFiles.includes(f),
                    )
                    .map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <code>{f}</code>
                        <Badge variant="secondary" className="text-[10px]">
                          workspace
                        </Badge>
                      </div>
                    ))}
                  {/* Denied files */}
                  {creator.command.deniedFiles.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <code className="text-muted-foreground">{f}</code>
                      <Badge variant="destructive" className="text-[10px]">
                        denied
                      </Badge>
                    </div>
                  ))}
                  {/* Unmatched files (outside workspace) */}
                  {creator.command.unmatchedFiles.map((file) => {
                    const fileState = creator.fileDecisions.get(file) ?? {
                      prefix: file,
                      decision: "skip" as const,
                    }
                    return (
                      <div key={file} className="flex flex-col gap-1.5">
                        <PathSegmentSelector
                          path={file}
                          selectedPrefix={fileState.prefix}
                          onSelectPrefix={(prefix) =>
                            updateFileDecision(creatorIdx, file, {
                              prefix,
                              ...(fileState.decision === "skip" ? { decision: "allow" } : {}),
                            })
                          }
                        />
                        <div className="flex items-center gap-3 pl-2">
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="radio"
                              name={`file-${creatorIdx.toString()}-${file}`}
                              checked={fileState.decision === "allow"}
                              onChange={() =>
                                updateFileDecision(creatorIdx, file, { decision: "allow" })
                              }
                              className="accent-primary"
                            />
                            allow
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="radio"
                              name={`file-${creatorIdx.toString()}-${file}`}
                              checked={fileState.decision === "deny"}
                              onChange={() =>
                                updateFileDecision(creatorIdx, file, { decision: "deny" })
                              }
                              className="accent-primary"
                            />
                            deny
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="radio"
                              name={`file-${creatorIdx.toString()}-${file}`}
                              checked={fileState.decision === "skip"}
                              onChange={() =>
                                updateFileDecision(creatorIdx, file, { decision: "skip" })
                              }
                              className="accent-primary"
                            />
                            skip
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Command-level controls */}
              <div className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    id={`global-exec-${creatorIdx.toString()}`}
                    checked={creator.global}
                    onCheckedChange={(checked) =>
                      updateCreator(creatorIdx, { global: checked === true })
                    }
                  />
                  <label htmlFor={`global-exec-${creatorIdx.toString()}`}>apply globally</label>
                </span>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`cmd-${creatorIdx.toString()}`}
                      checked={creator.decision === "allow"}
                      onChange={() => updateCreator(creatorIdx, { decision: "allow" })}
                      className="accent-primary"
                    />
                    always allow
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`cmd-${creatorIdx.toString()}`}
                      checked={creator.decision === "deny"}
                      onChange={() => updateCreator(creatorIdx, { decision: "deny" })}
                      className="accent-primary"
                    />
                    always deny
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`cmd-${creatorIdx.toString()}`}
                      checked={creator.decision === "skip"}
                      onChange={() => updateCreator(creatorIdx, { decision: "skip" })}
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
