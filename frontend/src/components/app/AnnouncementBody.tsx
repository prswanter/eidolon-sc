import Markdown, { type Components } from "react-markdown";

import { AppLink } from "@/components/app/AppLink";

/** 正文里留下的写法；别的写法不成为对应的元素，字照样留下（见 `DEGRADED`、`plainHtmlAndCode`）。 */
const ALLOWED = ["p", "br", "strong", "em", "a", "ul", "ol", "li", "code"];

/** 不开放、但有字的写法：标题退成一段，引用拆掉外壳只留里面的字，图片只留说明文字。 */
const DEGRADED = ["h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "img"];

const COMPONENTS: Components = {
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  h1: ({ children }) => <p>{children}</p>,
  h2: ({ children }) => <p>{children}</p>,
  h3: ({ children }) => <p>{children}</p>,
  h4: ({ children }) => <p>{children}</p>,
  h5: ({ children }) => <p>{children}</p>,
  h6: ({ children }) => <p>{children}</p>,
  blockquote: ({ children }) => <>{children}</>,
  img: ({ alt }) => <>{alt}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <AppLink href={href ?? ""} target="_blank" rel="noopener noreferrer">
      {children}
    </AppLink>
  ),
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="whitespace-pre-line">{children}</li>,
  code: ({ children }) => <code className="rounded-sm bg-muted px-1 font-mono">{children}</code>,
};

/** Markdown 语法树（mdast）里这里用得到的部分。 */
type MdNode = { type: string; value?: string; children?: MdNode[] };

/** 能直接放一段的地方：在这些节点下，单独成块的 HTML 换成一段，而不是散落的字。 */
const FLOW = new Set(["root", "blockquote", "listItem"]);

/**
 * remark 插件：原始 HTML 去掉标签、只留下字（整块的成一段，行内的照旧在行内），代码块（缩进或 ``` 围起来的）
 * 成一段纯文字。这样既不解析 HTML，也不丢字。
 */
function plainHtmlAndCode() {
  return (tree: MdNode) => plain(tree);
}

function plain(parent: MdNode): void {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((node): MdNode[] => {
    if (node.type === "html") {
      const value = (node.value ?? "").replace(/<[^>]*>/g, "");
      if (!value.trim()) return [];
      const text = { type: "text", value };
      return FLOW.has(parent.type) ? [{ type: "paragraph", children: [text] }] : [text];
    }
    if (node.type === "code") return [{ type: "paragraph", children: [{ type: "text", value: node.value ?? "" }] }];
    plain(node);
    return [node];
  });
}

/**
 * 一条公告的正文（GLOSSARY.md「公告」），Markdown 写的。后台的预览和用户看到的都用它，两边一模一样。
 * 只开段落、换行、加粗、斜体、链接、列表和行内代码；标题、引用、代码块、图片、原始 HTML 退成纯文字，
 * 分隔线去掉。段内的换行照原样换行（不必行尾加两个空格）。链接都在新标签页打开，不打断进行中的通话。
 * 字号是 Body（15px）。
 */
export function AnnouncementBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-3 text-body break-words">
      <Markdown
        remarkPlugins={[plainHtmlAndCode]}
        allowedElements={[...ALLOWED, ...DEGRADED]}
        unwrapDisallowed
        skipHtml
        components={COMPONENTS}
      >
        {body}
      </Markdown>
    </div>
  );
}
