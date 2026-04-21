import { ChevronRight, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  deleteExecuteFileRule,
  deleteExecuteFlagRule,
  deleteExecuteRule,
  deletePermissionRule,
  getExecuteFileRules,
  getExecuteFlagRules,
  getExecuteRules,
  getPermissionRules,
} from "@/lib/tauri"
import type { ExecuteFileRule, ExecuteFlagRule, ExecuteRule, PermissionRule } from "@/lib/types"

type ExecuteRuleWithSubs = {
  rule: ExecuteRule
  flagRules: ExecuteFlagRule[]
  fileRules: ExecuteFileRule[]
}

type PermissionsEditorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function PermissionsEditor({
  open,
  onOpenChange,
  projectId,
}: PermissionsEditorProps): React.JSX.Element {
  const [readRules, setReadRules] = useState<PermissionRule[]>([])
  const [editRules, setEditRules] = useState<PermissionRule[]>([])
  const [executeRules, setExecuteRules] = useState<ExecuteRuleWithSubs[]>([])

  const fetchAll = useCallback(async () => {
    const [read, edit, exec] = await Promise.all([
      getPermissionRules(projectId, "read"),
      getPermissionRules(projectId, "edit"),
      getExecuteRules(projectId),
    ])
    setReadRules(read)
    setEditRules(edit)

    const withSubs = await Promise.all(
      exec.map(async (rule) => {
        const [flagRules, fileRules] = await Promise.all([
          getExecuteFlagRules(rule.id),
          getExecuteFileRules(rule.id),
        ])
        return { rule, flagRules, fileRules }
      }),
    )
    setExecuteRules(withSubs)
  }, [projectId])

  useEffect(() => {
    if (open) {
      void fetchAll()
    }
  }, [open, fetchAll])

  const handleDeletePermissionRule = async (id: string): Promise<void> => {
    await deletePermissionRule(id)
    void fetchAll()
  }

  const handleDeleteExecuteRule = async (id: string): Promise<void> => {
    await deleteExecuteRule(id)
    void fetchAll()
  }

  const handleDeleteFlagRule = async (id: string): Promise<void> => {
    await deleteExecuteFlagRule(id)
    void fetchAll()
  }

  const handleDeleteFileRule = async (id: string): Promise<void> => {
    await deleteExecuteFileRule(id)
    void fetchAll()
  }

  const hasFileRules = readRules.length > 0 || editRules.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permission rules</DialogTitle>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[60vh]">
          {/* File access section */}
          <div className="flex flex-col">
            <p className="px-4 py-2 text-xs font-medium text-muted-foreground">File access</p>

            {hasFileRules ? (
              <>
                {readRules.length > 0 ? (
                  <div className="flex flex-col">
                    <p className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Read
                    </p>
                    {readRules.map((rule) => (
                      <FileRuleRow
                        key={rule.id}
                        pathPrefix={rule.path_prefix}
                        decision={rule.decision}
                        isGlobal={rule.project_id === null}
                        onDelete={() => void handleDeletePermissionRule(rule.id)}
                      />
                    ))}
                  </div>
                ) : null}

                {editRules.length > 0 ? (
                  <div className="flex flex-col">
                    <p className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Edit
                    </p>
                    {editRules.map((rule) => (
                      <FileRuleRow
                        key={rule.id}
                        pathPrefix={rule.path_prefix}
                        decision={rule.decision}
                        isGlobal={rule.project_id === null}
                        onDelete={() => void handleDeletePermissionRule(rule.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="px-4 py-2 text-xs text-muted-foreground">No rules</p>
            )}
          </div>

          <Separator />

          {/* Commands section */}
          <div className="flex flex-col">
            <p className="px-4 py-2 text-xs font-medium text-muted-foreground">Commands</p>

            {executeRules.length > 0 ? (
              executeRules.map((entry) => (
                <ExecuteRuleRow
                  key={entry.rule.id}
                  entry={entry}
                  onDeleteRule={() => void handleDeleteExecuteRule(entry.rule.id)}
                  onDeleteFlagRule={(id) => void handleDeleteFlagRule(id)}
                  onDeleteFileRule={(id) => void handleDeleteFileRule(id)}
                />
              ))
            ) : (
              <p className="px-4 py-2 text-xs text-muted-foreground">No rules</p>
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-end px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DecisionBadge({ decision }: { decision: string }): React.JSX.Element {
  return (
    <Badge variant={decision === "allow" ? "default" : "destructive"} className="text-[10px]">
      {decision}
    </Badge>
  )
}

function ScopeBadge({ isGlobal }: { isGlobal: boolean }): React.JSX.Element | null {
  if (!isGlobal) return null
  return (
    <Badge variant="secondary" className="text-[10px]">
      global
    </Badge>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="icon-xs" onClick={onClick}>
      <X />
    </Button>
  )
}

function FileRuleRow({
  pathPrefix,
  decision,
  isGlobal,
  onDelete,
}: {
  pathPrefix: string
  decision: string
  isGlobal: boolean
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <code className="flex-1 truncate text-xs">{pathPrefix}</code>
      <DecisionBadge decision={decision} />
      <ScopeBadge isGlobal={isGlobal} />
      <DeleteButton onClick={onDelete} />
    </div>
  )
}

function ExecuteRuleRow({
  entry,
  onDeleteRule,
  onDeleteFlagRule,
  onDeleteFileRule,
}: {
  entry: ExecuteRuleWithSubs
  onDeleteRule: () => void
  onDeleteFlagRule: (id: string) => void
  onDeleteFileRule: (id: string) => void
}): React.JSX.Element {
  const { rule, flagRules, fileRules } = entry
  const hasSubs = flagRules.length > 0 || fileRules.length > 0

  return (
    <Collapsible>
      <div className="flex items-center gap-2 px-4 py-1.5">
        {hasSubs ? (
          <CollapsibleTrigger className="flex items-center">
            <ChevronRight className="size-3 transition-transform [[data-state=open]_&]:rotate-90" />
          </CollapsibleTrigger>
        ) : (
          <span className="size-3" />
        )}
        <code className="flex-1 truncate text-xs">{rule.command}</code>
        <DecisionBadge decision={rule.decision} />
        <ScopeBadge isGlobal={rule.project_id === null} />
        <DeleteButton onClick={onDeleteRule} />
      </div>

      {hasSubs ? (
        <CollapsibleContent>
          <div className="flex flex-col border-l border-border ml-6">
            {flagRules.map((fr) => (
              <div key={fr.id} className="flex items-center gap-2 px-4 py-1">
                <code className="flex-1 truncate text-xs text-muted-foreground">{fr.flag}</code>
                <DecisionBadge decision={fr.decision} />
                <DeleteButton onClick={() => onDeleteFlagRule(fr.id)} />
              </div>
            ))}
            {fileRules.map((fr) => (
              <div key={fr.id} className="flex items-center gap-2 px-4 py-1">
                <code className="flex-1 truncate text-xs text-muted-foreground">
                  {fr.path_prefix}
                </code>
                <DecisionBadge decision={fr.decision} />
                <DeleteButton onClick={() => onDeleteFileRule(fr.id)} />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}
