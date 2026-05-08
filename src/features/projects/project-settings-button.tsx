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
import type { BranchPrefixMode, ProjectSettings } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  projectPath: string
  branchPrefixMode: BranchPrefixMode
  onUpdate: (partial: Partial<ProjectSettings>) => void
}

export function ProjectSettingsButton({
  projectPath,
  branchPrefixMode,
  onUpdate,
}: Props): React.JSX.Element {
  const [branch, setBranch] = useState<string | null>(null)

  // Refetch the current branch every time the popover opens — branches can
  // change underneath us (user does `git checkout` in their terminal).
  // woke2 impl PFE-ST1
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

  // woke2 impl PFE-ST2, PFE-ST3, PFE-ST5, PFE-ST6
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
          onValueChange={(next) => onUpdate({ branchPrefixMode: next as BranchPrefixMode })}
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
// woke2 impl PFE-ST4
function featurePart(branch: string | null): string | null {
  if (branch === null) return null
  const idx = branch.indexOf("/")
  if (idx < 0) return branch
  const after = branch.slice(idx + 1)
  return after.length > 0 ? after : branch
}
