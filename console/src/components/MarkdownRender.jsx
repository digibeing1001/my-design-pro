import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MarkdownImage({ src, alt }) {
  const [enlarged, setEnlarged] = React.useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt}
        className="rounded-lg border border-gdpro-border max-w-full my-2 cursor-zoom-in hover:border-gdpro-accent/50 transition-colors"
        onClick={() => setEnlarged(true)}
      />
      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4"
          onClick={() => setEnlarged(false)}
        >
          <img src={src} alt={alt} className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}

export default function MarkdownRender({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-bold text-gdpro-text mt-4 mb-2 pb-1 border-b border-gdpro-border">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-gdpro-text mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-gdpro-accent mt-3 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-gdpro-text-secondary leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="text-sm text-gdpro-text-secondary list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm text-gdpro-text-secondary list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, inline }) => inline
            ? <code className="px-1.5 py-0.5 bg-gdpro-bg-surface rounded text-xs font-mono text-gdpro-accent">{children}</code>
            : <pre className="bg-gdpro-bg-surface border border-gdpro-border rounded-lg p-3 overflow-x-auto mb-3"><code className="text-xs font-mono text-gdpro-text-secondary leading-relaxed">{children}</code></pre>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-gdpro-accent pl-3 py-1 my-2 bg-gdpro-accent-dim/30 rounded-r">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="text-sm text-gdpro-text-secondary border border-gdpro-border rounded-lg overflow-hidden">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-gdpro-bg-surface">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-gdpro-text border-b border-gdpro-border">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 border-b border-gdpro-border/50">{children}</td>,
          hr: () => <hr className="border-gdpro-border my-4" />,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-gdpro-accent hover:text-gdpro-accent-hover underline">{children}</a>,
          strong: ({ children }) => <strong className="text-gdpro-text font-semibold">{children}</strong>,
          img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
