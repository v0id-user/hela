// Build-time loader for every Markdown file under the repo's
// top-level `docs/` directory.
//
// Vite's `import.meta.glob` (see below) returns a record of path
// to string-importer. We resolve them all eagerly so search and
// routing have everything in memory at first paint — the docs are
// small (~30 files, well under 1MB combined gzipped), so a single
// bundle beats a code-split per page.
//
// The path is relative to *this file*, not absolute. The leading
// `/` form would resolve against Vite's project root (apps/docs/)
// which contains no `docs/` directory; the actual markdown lives
// at the monorepo root, two levels up.

const sources = import.meta.glob("../../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface DocPage {
  /** Slug used in the URL: e.g. `quickstart`, `sdk/typescript`. */
  slug: string;
  /** Top-level category, derived from the first path segment under
   *  `docs/`. Plain root files get the `"general"` category. */
  category: string;
  /** Human-friendly title — first `#` heading or the filename. */
  title: string;
  /** Raw markdown body. */
  content: string;
  /** Source path relative to the repo root. */
  path: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "Overview",
  api: "API",
  dev: "Development",
  "hosted-plans": "Hosted plans",
  sdk: "SDKs",
};

const CATEGORY_ORDER = ["general", "api", "sdk", "hosted-plans", "dev"];

const SLUG_ORDER: Record<string, string[]> = {
  general: ["index", "quickstart", "architecture", "runbook"],
  api: ["websocket", "rest"],
  sdk: ["typescript", "python", "go", "rust", "adding-a-language"],
  "hosted-plans": ["README", "free", "starter", "growth", "scale", "enterprise"],
  dev: [
    "README",
    "development-cycle",
    "environment",
    "testing",
    "code-quality",
    "naming-conventions",
    "pitfalls",
    "mistakes",
    "dev-env-integration",
  ],
};

function deriveTitle(content: string, slug: string): string {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  if (m) return m[1];
  const last = slug.split("/").pop() || slug;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pathToPage(path: string, content: string): DocPage {
  // Path can come in three shapes depending on how Vite resolves
  // the glob:
  //   "/docs/sdk/typescript.md"            (absolute, from project root)
  //   "../../../../docs/sdk/typescript.md" (relative, from this file)
  //   "/abs/path/docs/sdk/typescript.md"   (filesystem absolute)
  //
  // Strip everything up to and including the last `/docs/` segment
  // and drop the .md extension, then everything works the same way.
  const after = path.replace(/^.*?\/docs\//, "").replace(/\.md$/, "");
  const parts = after.split("/");
  const isCategorised = parts.length > 1;
  const category = isCategorised ? parts[0] : "general";
  const slug = after; // e.g. "sdk/typescript" or "quickstart"
  const title = deriveTitle(content, slug);
  // Surface a clean repo-relative path (docs/...) for the
  // "view source on GitHub" footer link.
  const cleanPath = "docs/" + after + ".md";
  return { slug, category, title, content, path: cleanPath };
}

const PAGES: DocPage[] = Object.entries(sources)
  .map(([path, content]) => pathToPage(path, content))
  .sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) {
      return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
    }
    const order = SLUG_ORDER[a.category];
    if (order) {
      const sa = order.indexOf(a.slug.split("/").pop() || "");
      const sb = order.indexOf(b.slug.split("/").pop() || "");
      if (sa !== -1 || sb !== -1) {
        return (sa === -1 ? 99 : sa) - (sb === -1 ? 99 : sb);
      }
    }
    return a.title.localeCompare(b.title);
  });

export function allPages(): DocPage[] {
  return PAGES;
}

export function pageBySlug(slug: string): DocPage | undefined {
  return PAGES.find((p) => p.slug === slug);
}

export interface CategoryGroup {
  key: string;
  label: string;
  pages: DocPage[];
}

export function groupedPages(): CategoryGroup[] {
  const groups = new Map<string, DocPage[]>();
  for (const p of PAGES) {
    const arr = groups.get(p.category) ?? [];
    arr.push(p);
    groups.set(p.category, arr);
  }

  const out: CategoryGroup[] = [];
  for (const key of CATEGORY_ORDER) {
    const pages = groups.get(key);
    if (pages && pages.length) {
      out.push({ key, label: CATEGORY_LABELS[key] ?? key, pages });
      groups.delete(key);
    }
  }
  for (const [key, pages] of groups) {
    out.push({ key, label: CATEGORY_LABELS[key] ?? key, pages });
  }
  return out;
}

/** Lightweight substring search over title + body. Token-anywhere,
 *  case-insensitive. Returns hits ranked by where the match landed. */
export interface SearchHit {
  page: DocPage;
  excerpt: string;
}

export function search(query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: { hit: SearchHit; score: number }[] = [];
  for (const page of PAGES) {
    const titleLower = page.title.toLowerCase();
    const titleIdx = titleLower.indexOf(q);
    const bodyIdx = page.content.toLowerCase().indexOf(q);

    if (titleIdx === -1 && bodyIdx === -1) continue;

    let excerpt = "";
    if (bodyIdx !== -1) {
      const start = Math.max(0, bodyIdx - 40);
      const end = Math.min(page.content.length, bodyIdx + 80);
      excerpt = (start > 0 ? "…" : "") + page.content.slice(start, end).replace(/\s+/g, " ");
      if (end < page.content.length) excerpt += "…";
    }

    const score = titleIdx !== -1 ? titleIdx : 1000 + bodyIdx;
    hits.push({ hit: { page, excerpt }, score });
  }

  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit).map((h) => h.hit);
}
