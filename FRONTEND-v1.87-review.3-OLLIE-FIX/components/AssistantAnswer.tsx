import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render model text as markup, never executable HTML or remote media. */
export default function AssistantAnswer({ content }: { content: string }) {
  return <div className="assistant-answer">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      disallowedElements={["img"]}
      urlTransform={(url) => {
        if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u0020]/.test(url)) return url;
        try {
          const parsed = new URL(url);
          return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
        } catch { return ""; }
      }}
      components={{
        a: ({ href, children }) => href
          ? <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>
          : <span>{children}</span>,
        table: ({ children }) => <div className="assistant-answer-table" tabIndex={0} role="region" aria-label="Answer table"><table>{children}</table></div>,
      }}
    >{content}</ReactMarkdown>
  </div>;
}
