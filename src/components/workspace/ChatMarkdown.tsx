"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders AI chat messages with proper markdown formatting.
 * Handles: headings, bold, lists, inline code, code blocks, links.
 */
export default function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <div className="text-base font-bold text-gray-900 mt-2 mb-1">{children}</div>,
        h2: ({ children }) => <div className="text-sm font-bold text-gray-900 mt-2 mb-1">{children}</div>,
        h3: ({ children }) => <div className="text-[13px] font-semibold text-gray-800 mt-1.5 mb-0.5">{children}</div>,
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-gray-100 rounded-lg px-3 py-2 my-1.5 overflow-x-auto text-[11px] leading-relaxed border border-gray-200">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-100 text-orange-600 px-1 py-0.5 rounded text-[11px] font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
