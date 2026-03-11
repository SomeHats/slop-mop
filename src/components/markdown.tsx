import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type MarkdownProps = {
  content: string
  className?: string
}

const components: Components = {
  pre: ({ children, ...props }) => (
    <pre className="bg-muted p-3 text-xs overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.startsWith("language-") || className?.startsWith("hljs")
    return (
      <code className={cn(isBlock ? className : "bg-muted px-1.5 py-0.5 text-xs")} {...props}>
        {children}
      </code>
    )
  },
  p: ({ children, ...props }) => (
    <p className="text-sm leading-relaxed" {...props}>
      {children}
    </p>
  ),
  a: ({ children, ...props }) => (
    <a className="text-primary underline underline-offset-4" {...props}>
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-4 text-sm" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-4 text-sm" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm" {...props}>
      {children}
    </li>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-medium" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-medium" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-medium" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-base font-medium" {...props}>
      {children}
    </h4>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic" {...props}>
      {children}
    </blockquote>
  ),
  hr: () => <Separator />,
}

export function Markdown({ content, className }: MarkdownProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
