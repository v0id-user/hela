import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

/**
 * Render a markdown string into the prose column. Hooks the standard
 * markdown elements through to our `.prose` CSS so we get tables,
 * code blocks, and links with the same dark+gold palette.
 *
 * Internal links that point at another `.md` file in the docs tree
 * get rewritten so they navigate inside the SPA instead of doing a
 * full page reload through nginx. External links (anything with a
 * scheme) are left alone and open in a new tab.
 */
export function Markdown({ content, slug }: { content: string; slug: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a({ href, children, ...rest }) {
          const url = href ?? "";
          const isExternal = /^([a-z]+:|\/\/)/i.test(url);
          const isAnchor = url.startsWith("#");
          if (isExternal) {
            return (
              <a href={url} target="_blank" rel="noreferrer noopener" {...rest}>
                {children}
              </a>
            );
          }
          if (isAnchor) {
            return (
              <a href={url} {...rest}>
                {children}
              </a>
            );
          }
          // Resolve relative `.md` links against the current page's slug.
          const rewritten = rewriteDocLink(url, slug);
          return (
            <a href={rewritten} {...rest}>
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function rewriteDocLink(href: string, currentSlug: string): string {
  // Drop the .md extension, normalise relative paths.
  const cleaned = href.replace(/\.md(?=$|[#?])/, "").replace(/\.md$/, "");
  if (cleaned.startsWith("/")) return cleaned;

  const here = currentSlug.split("/");
  here.pop(); // drop the file part
  const target = cleaned.split("/");
  for (const part of target) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      here.pop();
      continue;
    }
    here.push(part);
  }
  return "/" + here.join("/");
}
