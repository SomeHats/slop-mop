import { Fragment, useEffect, useState } from "react"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"

import { Separator } from "@/components/ui/separator"
import { highlightTokens, type ThemedToken, tokenStyle } from "@/lib/shiki"
import { cn } from "@/lib/utils"

type MarkdownProps = {
  content: string
  className?: string
}

function ShikiCode({ code, language }: { code: string; language: string }): React.JSX.Element {
  const [lines, setLines] = useState<ThemedToken[][] | null>(null)

  useEffect(() => {
    let cancelled = false
    highlightTokens(code, language).then((result) => {
      if (!cancelled) setLines(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (!lines) {
    return <code className="text-xs">{code}</code>
  }

  return (
    <code className="text-xs">
      {lines.map((line, i) => (
        <Fragment key={i.toString()}>
          {i > 0 && "\n"}
          {line.map((token, j) => (
            <span key={j.toString()} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))}
        </Fragment>
      ))}
    </code>
  )
}

const components: Components = {
  pre: ({ children, ...props }) => (
    <pre className="bg-muted p-3 text-xs overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const langMatch = className?.match(/language-(\w+)/)
    if (langMatch?.[1]) {
      const code = String(children).replace(/\n$/, "")
      return <ShikiCode code={code} language={langMatch[1]} />
    }
    return (
      <code className={cn("bg-muted px-1.5 py-0.5 text-xs")} {...props}>
        {children}
      </code>
    )
  },
  p: ({ children, ...props }) => (
    <p className="text-xs font-light leading-relaxed" {...props}>
      {children}
    </p>
  ),
  a: ({ children, ...props }) => (
    <a className="text-primary underline underline-offset-4" {...props}>
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-4 text-xs font-light" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-4 text-xs font-light" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-xs font-light" {...props}>
      {children}
    </li>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-lg font-semibold" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-semibold" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-medium" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-xs font-medium" {...props}>
      {children}
    </h4>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic" {...props}>
      {children}
    </blockquote>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-bold" {...props}>
      {children}
    </strong>
  ),
  hr: () => <Separator />,
}

export function Markdown({ content, className }: MarkdownProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
