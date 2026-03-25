import { ChevronDown, Loader2 } from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type {
  AutoCommitPhase,
  DiffStats,
  PromptSnapshot,
  SessionMode,
  TimelineEntry,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActivityGroup } from "../agents/activity-group"
import { groupTimeline } from "../agents/group-timeline"
import { TimelineEntryRow } from "../agents/timeline-entry"
import { AutoCommitEntry } from "../snapshots/auto-commit-entry"

type ChatSidebarProps = {
  timeline: TimelineEntry[]
  snapshots: PromptSnapshot[]
  diffStats: Map<string, DiffStats>
  selectedSnapshotId: string | null
  onSelectSnapshot: (id: string) => void
  isProcessing: boolean
  autoCommitPhase: AutoCommitPhase | null
  availableModes: SessionMode[]
  currentModeId: string | null
  onSendPrompt: (text: string, modeId?: string) => void
}

type ChatSection = {
  id: string
  header: TimelineEntry & { kind: "user_message" }
  snapshot: PromptSnapshot
  entries: TimelineEntry[]
}

function matchSnapshot(
  entry: TimelineEntry & { kind: "user_message" },
  snapshots: PromptSnapshot[],
  allUserMessages: Array<TimelineEntry & { kind: "user_message" }>,
): PromptSnapshot | null {
  // Exact ID match
  const byId = snapshots.find((s) => s.message_id === entry.id)
  if (byId) return byId

  // Fallback: match by content with ordinal dedup
  const ordinal = allUserMessages.filter((m) => m.content === entry.content).indexOf(entry)

  const candidates = snapshots.filter((s) => s.prompt_text === entry.content)
  return candidates[ordinal] ?? null
}

function buildSections(timeline: TimelineEntry[], snapshots: PromptSnapshot[]): ChatSection[] {
  const sections: ChatSection[] = []

  const allUserMessages = timeline.filter(
    (e): e is TimelineEntry & { kind: "user_message" } => e.kind === "user_message",
  )

  for (const entry of timeline) {
    if (entry.kind === "user_message") {
      const snapshot = matchSnapshot(entry, snapshots, allUserMessages)
      if (snapshot) {
        sections.push({ id: entry.id, header: entry, snapshot, entries: [] })
        continue
      }
    }
    // Everything else (non-snapshot user messages, system messages, agent output)
    // folds into the current section
    if (sections.length > 0) {
      sections[sections.length - 1]?.entries.push(entry)
    }
  }

  return sections
}

function formatTime(iso: string): string {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

function SectionBody({
  entries,
  isActive,
}: {
  entries: TimelineEntry[]
  isActive: boolean
}): React.JSX.Element | null {
  const segments = useMemo(() => groupTimeline(entries), [entries])

  if (segments.length === 0) return null

  return (
    <div className="flex flex-col gap-2 py-2">
      {segments.map((segment, i) =>
        segment.kind === "passthrough" ? (
          <TimelineEntryRow key={segment.entry.id} entry={segment.entry} />
        ) : (
          <ActivityGroup
            key={segment.id}
            entries={segment.entries}
            isLast={isActive && i === segments.length - 1}
          />
        ),
      )}
    </div>
  )
}

export function ChatSidebar({
  timeline,
  snapshots,
  diffStats,
  selectedSnapshotId,
  onSelectSnapshot,
  isProcessing,
  autoCommitPhase,
  availableModes,
  currentModeId,
  onSendPrompt,
}: ChatSidebarProps): React.JSX.Element {
  const [input, setInput] = useState("")
  const [selectedModeId, setSelectedModeId] = useState(currentModeId ?? "")
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const initialCollapseApplied = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUp = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sections = useMemo(() => buildSections(timeline, snapshots), [timeline, snapshots])

  // On first load (session resume), collapse all sections except the last and scroll to bottom
  useEffect(() => {
    if (initialCollapseApplied.current || sections.length < 2) return
    initialCollapseApplied.current = true
    setCollapsedSections(new Set(sections.slice(0, -1).map((s) => s.id)))
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [sections])

  // Sync mode selection when agent changes mode
  useEffect(() => {
    setSelectedModeId(currentModeId ?? "")
  }, [currentModeId])

  const hasModes = availableModes.length > 1

  // Auto-scroll to bottom when new content arrives while processing
  // biome-ignore lint/correctness/useExhaustiveDependencies: timeline triggers scroll on new entries
  useEffect(() => {
    if (!isProcessing || userScrolledUp.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [timeline, isProcessing])

  // Attach scroll listener to the viewport element to track user scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => {
      const threshold = 50
      userScrolledUp.current = el.scrollTop + el.clientHeight < el.scrollHeight - threshold
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  })

  // Reset scroll lock when processing starts
  useEffect(() => {
    if (isProcessing) {
      userScrolledUp.current = false
    }
  }, [isProcessing])

  const resizeTextarea = useCallback((): void => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160).toString()}px`
  }, [])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      setInput(e.target.value)
      resizeTextarea()
    },
    [resizeTextarea],
  )

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    resizeTextarea()
    const modeId =
      selectedModeId !== "" && selectedModeId !== currentModeId ? selectedModeId : undefined
    onSendPrompt(text, modeId)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const toggleSection = useCallback((sectionId: string): void => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  return (
    <div className="flex w-80 flex-col overflow-hidden border-r border-border bg-background">
      <ScrollArea
        className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block"
        ref={(node) => {
          const viewport = node?.querySelector("[data-slot=scroll-area-viewport]")
          scrollRef.current = (viewport as HTMLDivElement) ?? null
        }}
      >
        {sections.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No messages yet.</p>
        ) : (
          <div className="flex w-full flex-col">
            {sections.map((section, sectionIndex) => {
              const isSelected = section.snapshot.id === selectedSnapshotId
              const isLastSection = sectionIndex === sections.length - 1
              const isActive = isProcessing && isLastSection
              const isCollapsed = collapsedSections.has(section.id)
              const stats = diffStats.get(section.snapshot.id)

              return (
                <Collapsible
                  key={section.id}
                  open={!isCollapsed}
                  onOpenChange={() => toggleSection(section.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "sticky top-0 z-10 flex w-full flex-col gap-1 border-b border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent",
                        isSelected && "bg-accent",
                      )}
                      onClick={() => onSelectSnapshot(section.snapshot.id)}
                    >
                      <div className="flex w-full min-w-0 items-start gap-2">
                        <ChevronDown
                          className={cn(
                            "mt-0.5 size-3 shrink-0 transition-transform",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                        <span className="min-w-0 flex-1 text-xs text-foreground">
                          {section.header.content}
                        </span>
                        {isActive ? (
                          <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                          {section.snapshot.commit_hash.slice(0, 7)}
                        </Badge>
                        {stats && (stats.additions > 0 || stats.deletions > 0) ? (
                          <span className="text-[10px]">
                            <span className="text-green-400">+{stats.additions}</span>{" "}
                            <span className="text-red-400">-{stats.deletions}</span>
                          </span>
                        ) : null}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {formatTime(section.snapshot.created_at)}
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-2">
                      <SectionBody entries={section.entries} isActive={isActive} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {autoCommitPhase ? <AutoCommitEntry phase={autoCommitPhase} onViewOutput={() => {}} /> : null}

      <Separator />
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isProcessing}
          rows={1}
          className="field-sizing-content max-h-40 min-h-9 w-full resize-none border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          {hasModes ? (
            <Select
              value={selectedModeId}
              onValueChange={setSelectedModeId}
              disabled={isProcessing}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModes.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    {mode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={isProcessing || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
