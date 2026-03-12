import type { BundledLanguage, ThemedToken, ThemeRegistration } from "shiki"
import { createHighlighter } from "shiki"

export type { ThemedToken }

const theme: ThemeRegistration = {
  name: "claude-creche",
  type: "dark",
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": "#e7e5e4",
  },
  tokenColors: [
    {
      scope: ["keyword", "storage", "constant.language"],
      settings: { foreground: "#c084fc", fontStyle: "bold" },
    },
    {
      scope: ["string", "string.template"],
      settings: { foreground: "#7dd3fc" },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#a8a29e", fontStyle: "italic" },
    },
    {
      scope: ["constant.numeric"],
      settings: { foreground: "#fda4af" },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: "#e879f9" },
    },
    {
      scope: ["entity.name.type", "support.type", "entity.name.class", "support.class"],
      settings: { foreground: "#f472b6" },
    },
    {
      scope: ["support.variable.dom", "variable.language"],
      settings: { foreground: "#fbbf24" },
    },
    {
      scope: ["entity.other.attribute-name", "meta.object-literal.key"],
      settings: { foreground: "#fb7185" },
    },
    {
      scope: ["variable", "variable.other"],
      settings: { foreground: "#e7e5e4" },
    },
    {
      scope: ["variable.parameter"],
      settings: { foreground: "#d6d3d1" },
    },
    {
      scope: ["string.regexp"],
      settings: { foreground: "#f0abfc" },
    },
    {
      scope: ["keyword.operator"],
      settings: { foreground: "#d6d3d1" },
    },
    {
      scope: ["punctuation"],
      settings: { foreground: "#d6d3d1" },
    },
    {
      scope: ["keyword.other", "meta.preprocessor"],
      settings: { foreground: "#a78bfa" },
    },
    {
      scope: ["entity.name.tag"],
      settings: { foreground: "#f472b6" },
    },
    {
      scope: ["support.class.component"],
      settings: { foreground: "#f472b6" },
    },
    {
      scope: ["entity.other.attribute-name.class"],
      settings: { foreground: "#e879f9" },
    },
    {
      scope: ["entity.name.tag.css"],
      settings: { foreground: "#f472b6" },
    },
    {
      scope: ["entity.other.attribute-name.id"],
      settings: { foreground: "#7dd3fc" },
    },
    {
      scope: ["punctuation.definition.template-expression", "punctuation.section.embedded"],
      settings: { foreground: "#c084fc" },
    },
  ],
}

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
    return h.codeToTokens(code, { lang: language as BundledLanguage, theme: "claude-creche" })
      .tokens
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
