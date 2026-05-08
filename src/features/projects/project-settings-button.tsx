import { Settings } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { getHeadBranch } from "@/lib/tauri"
import type { BranchPrefixMode } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useProjectSettings } from "./use-project-settings"

type Props = {
  projectId: string
  projectPath: string
}

export function ProjectSettingsButton({ projectId, projectPath }: Props): React.JSX.Element {
  const { branchPrefixMode, update } = useProjectSettings(projectId)
  const [branch, setBranch] = useState<string | null>(null)

  // Refetch the current branch every time the popover opens — branches can
  // change underneath us (user does `git checkout` in their terminal).
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getHeadBranch(projectPath).then(
      (b) => {
        if (!cancelled) setBranch(b)
      },
      () => {
        if (!cancelled) setBranch(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [open, projectPath])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Project settings"
          data-tauri-no-drag-region=""
        >
          <Settings className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Commit prefix</PopoverTitle>
          <PopoverDescription>
            Prepend the branch name to each auto-generated commit subject. The clean subject is
            preserved and shown in the sidebar.
          </PopoverDescription>
        </PopoverHeader>
        <RadioGroup
          value={branchPrefixMode}
          onValueChange={(next) => update({ branchPrefixMode: next as BranchPrefixMode })}
          className="gap-1.5"
        >
          <PrefixOption value="none" current={branchPrefixMode} label="None" sample="subject" />
          <PrefixOption
            value="full"
            current={branchPrefixMode}
            label="Full"
            sample={`${branch ?? "branch"}: subject`}
            unavailable={branch === null}
          />
          <PrefixOption
            value="feature"
            current={branchPrefixMode}
            label="Feature only"
            sample={`${featurePart(branch) ?? "feature"}: subject`}
            unavailable={branch === null}
          />
        </RadioGroup>
      </PopoverContent>
    </Popover>
  )
}

type OptionProps = {
  value: BranchPrefixMode
  current: BranchPrefixMode
  label: string
  sample: string
  unavailable?: boolean
}

function PrefixOption({ value, current, label, sample, unavailable }: OptionProps) {
  const id = `prefix-mode-${value}`
  const selected = current === value
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 px-1.5 py-1.5",
        unavailable && "opacity-60",
      )}
    >
      <RadioGroupItem id={id} value={value} />
      <div className="flex flex-1 items-baseline justify-between gap-2 text-xs">
        <span className={cn("font-medium", selected && "text-foreground")}>{label}</span>
        <span className="truncate font-mono text-muted-foreground">{sample}</span>
      </div>
    </label>
  )
}

/** Mirror the backend's `feature` mode: strip everything up to and including
 *  the first `/`. Branches with no `/` return their own name. */
function featurePart(branch: string | null): string | null {
  if (branch === null) return null
  const idx = branch.indexOf("/")
  if (idx < 0) return branch
  const after = branch.slice(idx + 1)
  return after.length > 0 ? after : branch
}
