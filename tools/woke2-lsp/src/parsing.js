// @ts-check

/**
 * @typedef {{
 *   id: string,
 *   file: string,
 *   line: number,
 *   text: string,
 *   isHeading: boolean,
 * }} BehaviorDef
 */

/**
 * @typedef {{
 *   id: string,
 *   file: string,
 *   line: number,
 *   kind: "impl" | "test",
 *   col: number,
 *   endCol: number,
 * }} PragmaRef
 */

const HEADING_DEF_RE = /^#{2,6}\s+!([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/
const LIST_DEF_RE = /^\s*[-*]\s+!([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/
const PRAGMA_RE = /^[ \t]*(?:\/\/|#|\/\*)\s*woke2\s+(impl|test)\s+(.+?)(?:\s*\*\/)?$/

// woke2 impl LSP-IX4
/**
 * @param {string} content
 * @param {string} file
 * @returns {BehaviorDef[]}
 */
function extractDefinitions(content, file) {
  /** @type {BehaviorDef[]} */
  const defs = []
  const lines = content.split("\n")
  let inFencedBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith("```")) {
      inFencedBlock = !inFencedBlock
      continue
    }
    if (inFencedBlock) continue

    const headingMatch = line.match(HEADING_DEF_RE)
    if (headingMatch) {
      defs.push({ id: headingMatch[1], file, line: i, text: line.trim(), isHeading: true })
      continue
    }

    const listMatch = line.match(LIST_DEF_RE)
    if (listMatch) {
      defs.push({ id: listMatch[1], file, line: i, text: line.trim(), isHeading: false })
    }
  }
  return defs
}

// woke2 impl LSP-IX5
/**
 * @param {string} content
 * @param {string} file
 * @returns {PragmaRef[]}
 */
function extractPragmas(content, file) {
  /** @type {PragmaRef[]} */
  const refs = []
  const lines = content.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(PRAGMA_RE)
    if (!match) continue

    const kind = /** @type {"impl" | "test"} */ (match[1])
    const idsString = match[2]
    const idsStartInLine = lines[i].indexOf(
      idsString,
      /** @type {number} */ (match.index) + match[0].indexOf(idsString),
    )

    const idMatches = idsString.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)
    for (const idMatch of idMatches) {
      const col = idsStartInLine + /** @type {number} */ (idMatch.index)
      refs.push({
        id: idMatch[0],
        file,
        line: i,
        kind,
        col,
        endCol: col + idMatch[0].length,
      })
    }
  }
  return refs
}

/**
 * @param {string} lineText
 * @param {number} character
 * @returns {{ id: string, col: number, endCol: number } | undefined}
 */
function idAtPosition(lineText, character) {
  const pragmaMatch = lineText.match(PRAGMA_RE)
  if (pragmaMatch) {
    const idsStr = pragmaMatch[2]
    const idsOffset = lineText.indexOf(idsStr, pragmaMatch[1].length)
    for (const m of idsStr.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)) {
      const col = idsOffset + /** @type {number} */ (m.index)
      const endCol = col + m[0].length
      if (character >= col && character <= endCol) {
        return { id: m[0], col, endCol }
      }
    }
    return undefined
  }

  for (const m of lineText.matchAll(/(?<=!)([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g)) {
    const col = /** @type {number} */ (m.index)
    const endCol = col + m[1].length
    if (character >= col - 1 && character <= endCol) {
      return { id: m[1], col, endCol }
    }
  }
  return undefined
}

module.exports = {
  HEADING_DEF_RE,
  LIST_DEF_RE,
  PRAGMA_RE,
  extractDefinitions,
  extractPragmas,
  idAtPosition,
}
