import type { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import path from "node:path"
import fs from "node:fs"

// very small evaluator for `=this.key` inline code inside the template
function substituteThisExpressions(md: string, ctx: Record<string, any>) {
  // replace inline code like `=this.age` or `= this.tags`
  return md.replace(/`=\s*this\.([a-zA-Z0-9_.-]+)\s*`/g, (_, key) => {
    // support dotted paths like stats.str if you need them
    const val = key.split(".").reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), ctx)
    if (val == null) return ""
    if (Array.isArray(val)) return val.join(", ")
    return String(val)
  })
}

// optional: convert ITS image adjustments like ![[file|portrait]] to an alt you can style
function normalizePortraitAlt(md: string) {
  // turns ![[foo.png|portrait]] into standard markdown so site CSS can target [alt~="portrait"]
  return md.replace(/!\[\[([^|\]]+)\|portrait\]\]/g, (_m, file) => `![portrait](${encodeURI(file)})`)
}

// read template note markdown from your content dir
function loadNoteMarkdown(contentDir: string, wikilink: string): string | null {
  const notePath = wikilink.endsWith(".md") ? wikilink : `${wikilink}.md`
  const full = path.join(contentDir, notePath)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full, "utf8")
}

export interface Options {
  contentDir?: string   // where your source .md live, default "content"
}

const LANG = "meta-bind-embed"

export const MetaBindContext: QuartzTransformerPlugin<Options> = (opts?: Options) => {
  const contentDir = opts?.contentDir ?? "content"

  return {
    name: "meta-bind-embed-context",
    markdownPlugins() {
      return [
        () => (tree: any, file: any) => {
          const fm = (file?.data?.frontmatter ?? {}) as Record<string, any>

          visit(tree, "code", (node: any, index: number, parent: any) => {
            if (!parent || node.lang !== LANG) return

            // Expect a single wikilink on first line like [[NPC Header]] or [[NPC Header#Section]]
            const raw = String(node.value || "").trim()
            const m = raw.match(/\[\[([^\]]+)\]\]/)
            if (!m) return

            // Strip anchor if present; you can extend to slice by section if you want
            const target = m[1].split("#")[0].trim()
            const md = loadNoteMarkdown(contentDir, target)
            if (!md) return

            // 1) evaluate `=this.*` inline code in the template using host frontmatter
            let rendered = substituteThisExpressions(md, fm)

            // 2) optional: normalize ITS portrait shorthand so your site CSS can style it
            rendered = normalizePortraitAlt(rendered)

            // Replace the code block with the rendered markdown text node.
            parent.children.splice(index, 1, {
              type: "paragraph",
              children: [{ type: "text", value: rendered }],
            })
          })
        },
      ]
    },
  }
}

export default MetaBindContext
