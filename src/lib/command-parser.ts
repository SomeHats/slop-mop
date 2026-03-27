import type {
  AstNode,
  AstNodeCommand,
  AstNodeCompoundList,
  AstNodeScript,
  AstNodeWord,
} from "@ein/bash-parser"
import { parse } from "@ein/bash-parser"
import type { ParsedCommand } from "./types"

/**
 * Heuristic: does this argument look like a file path?
 * Starts with `/`, `./`, `../`, `~`, or contains `/`, or is `.` or `..`.
 */
export function looksLikePath(arg: string): boolean {
  if (arg === "." || arg === "..") return true
  if (arg.startsWith("/") || arg.startsWith("./") || arg.startsWith("../") || arg.startsWith("~"))
    return true
  if (arg.includes("://")) return false
  if (arg.includes("/")) return true
  return false
}

function isFlag(arg: string): boolean {
  return arg.startsWith("-")
}

function looksLikeUrl(arg: string): boolean {
  return arg.includes("://")
}

function wordHasCommandExpansion(word: AstNodeWord): boolean {
  if (!word.expansion) return false
  return word.expansion.some((e) => e.type === "CommandExpansion")
}

/**
 * Extract command identity, flags, file args, and dynamic status from a Command node.
 *
 * Sub-command extraction: consume leading positional suffix args that aren't flags
 * and don't look like paths. Stop on first flag or path-like arg.
 */
function extractFromCommand(node: AstNodeCommand): ParsedCommand | null {
  if (!node.name) return null

  const nameText = node.name.text
  let isDynamic = wordHasCommandExpansion(node.name)

  const suffixWords: AstNodeWord[] = []
  if (node.suffix) {
    for (const s of node.suffix) {
      if (s.type === "Word") {
        suffixWords.push(s)
      }
    }
  }

  // Check prefix for dynamic expansions too (e.g. VAR=$(cmd) git ...)
  if (node.prefix) {
    for (const p of node.prefix) {
      if (p.type === "AssignmentWord" && p.expansion?.some((e) => e.type === "CommandExpansion")) {
        isDynamic = true
      }
    }
  }

  // Consume leading sub-command words
  const identityParts = [nameText]
  let i = 0
  while (i < suffixWords.length) {
    const w = suffixWords[i]
    if (!w) break
    const text = w.text
    if (isFlag(text) || looksLikePath(text) || looksLikeUrl(text)) break
    identityParts.push(text)
    if (wordHasCommandExpansion(w)) isDynamic = true
    i++
  }

  const flags: string[] = []
  const fileArgs: string[] = []

  while (i < suffixWords.length) {
    const w = suffixWords[i]
    if (!w) break
    if (wordHasCommandExpansion(w)) isDynamic = true

    const text = w.text
    if (isFlag(text)) {
      flags.push(text)
    } else if (looksLikePath(text)) {
      fileArgs.push(text)
    }
    // Non-flag, non-path args after the identity portion are ignored
    // (e.g. string arguments like commit messages)
    i++
  }

  return {
    identity: identityParts.join(" "),
    flags,
    fileArgs,
    isDynamic,
  }
}

/**
 * Recursively walk the AST and collect all Command nodes.
 * Uses `node.type` string matching and explicit casts per branch.
 */
function walkAst(node: AstNode, results: ParsedCommand[]): void {
  switch (node.type) {
    case "Script":
    case "CompoundList": {
      const compound = node as AstNodeScript | AstNodeCompoundList
      for (const cmd of compound.commands) {
        walkAst(cmd as AstNode, results)
      }
      break
    }
    case "Pipeline": {
      const pipeline = node as AstNode & { commands: AstNode[] }
      for (const cmd of pipeline.commands) {
        walkAst(cmd, results)
      }
      break
    }
    case "LogicalExpression": {
      const logical = node as AstNode & { left: AstNode; right: AstNode }
      walkAst(logical.left, results)
      walkAst(logical.right, results)
      break
    }
    case "Command": {
      const parsed = extractFromCommand(node as AstNodeCommand)
      if (parsed) results.push(parsed)
      break
    }
    case "Subshell": {
      const subshell = node as AstNode & { list: AstNodeCompoundList }
      walkAst(subshell.list, results)
      break
    }
    case "For": {
      const forNode = node as AstNode & { do: AstNodeCompoundList }
      walkAst(forNode.do, results)
      break
    }
    case "While":
    case "Until": {
      const loop = node as AstNode & {
        clause: AstNodeCompoundList
        do: AstNodeCompoundList
      }
      walkAst(loop.clause, results)
      walkAst(loop.do, results)
      break
    }
    case "If": {
      const ifNode = node as AstNode & {
        clause: AstNodeCompoundList
        then: AstNodeCompoundList
        else?: AstNodeCompoundList
      }
      walkAst(ifNode.clause, results)
      walkAst(ifNode.then, results)
      if (ifNode.else) walkAst(ifNode.else, results)
      break
    }
    case "Case": {
      const caseNode = node as AstNode & {
        cases?: Array<{ body: AstNodeCompoundList }>
      }
      if (caseNode.cases) {
        for (const item of caseNode.cases) {
          walkAst(item.body, results)
        }
      }
      break
    }
    case "Function": {
      const funcNode = node as AstNode & { body: AstNodeCompoundList }
      walkAst(funcNode.body, results)
      break
    }
    default:
      // ArithmeticCommand, ConditionalCommand, etc. — no commands to extract
      break
  }
}

/**
 * Parse a bash command string into structured commands.
 * Returns `null` on parse failure (triggers dynamic fallback).
 *
 * Dynamic detection (CommandExpansion) is handled per-word inside
 * extractFromCommand — the isDynamic flag is set on each ParsedCommand
 * that contains $(...) or backtick expansions.
 */
export async function parseCommandString(input: string): Promise<ParsedCommand[] | null> {
  let ast: AstNodeScript
  try {
    ast = await parse(input)
  } catch {
    return null
  }

  const results: ParsedCommand[] = []
  walkAst(ast, results)
  return results
}
