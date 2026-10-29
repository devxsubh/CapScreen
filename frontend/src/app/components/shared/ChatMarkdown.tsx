"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMarkdownProps {
  text: string;
  className?: string;
}

export function ChatMarkdown({ text, className = "" }: ChatMarkdownProps) {
  if (!text.trim()) return null;

  return (
    <div
      className={`text-gray-900 text-base prose prose-sm max-w-none font-serif leading-relaxed ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table
                className="min-w-full divide-y divide-gray-300 border border-gray-200 rounded-lg overflow-hidden text-sm"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-50" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-gray-200 bg-white" {...props} />
          ),
          tr: ({ node, ...props }) => <tr {...props} />,
          th: ({ node, ...props }) => (
            <th
              className="px-3 py-2.5 text-left text-sm font-semibold text-gray-900"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="whitespace-normal px-3 py-2.5 text-sm text-gray-800"
              {...props}
            />
          ),
          h1: ({ node, ...props }) => (
            <h1
              className="mt-5 mb-3 text-xl font-serif font-semibold text-gray-900"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="mt-5 mb-2 text-lg font-serif font-semibold text-gray-900"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="mt-4 mb-2 text-base font-semibold text-gray-900"
              {...props}
            />
          ),
          h4: ({ node, ...props }) => (
            <h4
              className="mt-3 mb-1.5 text-sm font-semibold text-gray-900"
              {...props}
            />
          ),
          p: ({ node, ...props }) => {
            const parent = (node as { parent?: { type?: string } })?.parent;
            if (parent?.type === "listItem") {
              return <p className="inline leading-7 m-0" {...props} />;
            }
            return <p className="mb-3 leading-7 last:mb-0" {...props} />;
          },
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-outside mb-3 pl-5 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal list-outside mb-3 pl-5 space-y-1"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-7 pl-0.5" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-gray-900" {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          code: ({ node, children, ...props }) => (
            <code
              className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-serif"
              {...props}
            >
              {children}
            </code>
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-gray-300 pl-4 italic my-3 text-gray-700"
              {...props}
            />
          ),
          a: ({ node, href, children, ...props }) => (
            <a
              href={href}
              className="text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-4 border-gray-200" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
