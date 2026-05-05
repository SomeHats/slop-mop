import type { BundledLanguage, ThemedToken, ThemeRegistration } from "shiki"
import { createHighlighter } from "shiki"

export type { ThemedToken }

/** Shared palette — xterm and shiki both pull from here so the terminal feels
 *  like the same product as the diff view. */
export const palette = {
  fg: "#e7e5e4",
  fgMuted: "#d6d3d1",
  fgFaint: "#a8a29e",
  bg: "#0a0a0a",
  bgMuted: "#262626",
  cursor: "#a78bfa",
  selection: "rgba(167, 139, 250, 0.35)",
  // ANSI slots (also used as shiki scope colors)
  purple: "#c084fc",
  violet: "#a78bfa",
  fuchsia: "#e879f9",
  pink: "#f472b6",
  rose: "#fb7185",
  roseLight: "#fda4af",
  amber: "#fbbf24",
  amberLight: "#fde68a",
  sky: "#7dd3fc",
  skyLight: "#bae6fd",
  green: "#86efac",
  greenLight: "#bbf7d0",
  plum: "#f0abfc",
  neutral: "#525252",
  stone: "#fafaf9",
} as const

const theme: ThemeRegistration = {
  name: "slop-mop",
  type: "dark",
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": palette.fg,
  },
  tokenColors: [
    {
      scope: ["keyword", "storage", "constant.language"],
      settings: { foreground: palette.purple, fontStyle: "bold" },
    },
    {
      scope: ["string", "string.template"],
      settings: { foreground: palette.sky },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: palette.fgFaint, fontStyle: "italic" },
    },
    {
      scope: ["constant.numeric"],
      settings: { foreground: palette.roseLight },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: palette.fuchsia },
    },
    {
      scope: ["entity.name.type", "support.type", "entity.name.class", "support.class"],
      settings: { foreground: palette.pink },
    },
    {
      scope: ["support.variable.dom", "variable.language"],
      settings: { foreground: palette.amber },
    },
    {
      scope: ["entity.other.attribute-name", "meta.object-literal.key"],
      settings: { foreground: palette.rose },
    },
    {
      scope: ["variable", "variable.other"],
      settings: { foreground: palette.fg },
    },
    {
      scope: ["variable.parameter"],
      settings: { foreground: palette.fgMuted },
    },
    {
      scope: ["string.regexp"],
      settings: { foreground: palette.plum },
    },
    {
      scope: ["keyword.operator"],
      settings: { foreground: palette.fgMuted },
    },
    {
      scope: ["punctuation"],
      settings: { foreground: palette.fgMuted },
    },
    {
      scope: ["keyword.other", "meta.preprocessor"],
      settings: { foreground: palette.violet },
    },
    {
      scope: ["entity.name.tag"],
      settings: { foreground: palette.pink },
    },
    {
      scope: ["support.class.component"],
      settings: { foreground: palette.pink },
    },
    {
      scope: ["entity.other.attribute-name.class"],
      settings: { foreground: palette.fuchsia },
    },
    {
      scope: ["entity.name.tag.css"],
      settings: { foreground: palette.pink },
    },
    {
      scope: ["entity.other.attribute-name.id"],
      settings: { foreground: palette.sky },
    },
    {
      scope: ["punctuation.definition.template-expression", "punctuation.section.embedded"],
      settings: { foreground: palette.purple },
    },
  ],
}

/** xterm.js theme built from the shared palette. ANSI color slots are mapped
 *  to the closest semantic equivalent in our shiki theme:
 *  - red (errors/rm)          → rose
 *  - green (strings/ok/add)   → green
 *  - yellow (warn/vars)       → amber
 *  - blue (headers/keywords)  → violet   (our accent is purple, not blue)
 *  - magenta (literals)       → purple
 *  - cyan (paths/links)       → sky
 */
export const terminalTheme = {
  background: palette.bg,
  foreground: palette.fg,
  cursor: palette.cursor,
  cursorAccent: palette.bg,
  selectionBackground: palette.selection,

  black: palette.bgMuted,
  red: palette.rose,
  green: palette.green,
  yellow: palette.amber,
  blue: palette.violet,
  magenta: palette.purple,
  cyan: palette.sky,
  white: palette.fg,

  brightBlack: palette.neutral,
  brightRed: palette.roseLight,
  brightGreen: palette.greenLight,
  brightYellow: palette.amberLight,
  brightBlue: palette.fuchsia,
  brightMagenta: palette.plum,
  brightCyan: palette.skyLight,
  brightWhite: palette.stone,
} as const

const LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "rust",
  "python",
  "css",
  "html",
  "json",
  "markdown",
  "toml",
  "yaml",
  "bash",
  "sql",
  "go",
] as const

let instance: ReturnType<typeof createHighlighter> | null = null

export function getHighlighter(): ReturnType<typeof createHighlighter> {
  if (!instance) {
    instance = createHighlighter({ themes: [theme], langs: [...LANGS] })
  }
  return instance
}

export async function highlightTokens(
  code: string,
  language: string,
): Promise<ThemedToken[][] | null> {
  const h = await getHighlighter()
  try {
    return h.codeToTokens(code, { lang: language as BundledLanguage, theme: "slop-mop" }).tokens
  } catch {
    return null
  }
}

export function tokenStyle(token: ThemedToken): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (token.color) style.color = token.color
  if (token.fontStyle) {
    if (token.fontStyle & 1) style.fontStyle = "italic"
    if (token.fontStyle & 2) style.fontWeight = "bold"
    if (token.fontStyle & 4) style.textDecoration = "underline"
  }
  return style
}
