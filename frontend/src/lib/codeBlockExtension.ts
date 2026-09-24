import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { CodeBlockView } from "@/components/docs/CodeBlockView";

export const lowlight = createLowlight(common);

/** A curated subset of lowlight's `common` grammar set (36 languages) —
 * enough for a real "insert code snippet" picker without listing every
 * niche/duplicate entry (e.g. `shell` is dropped in favor of `bash`,
 * `python-repl`/`php-template` are edge cases not worth surfacing). */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: "plaintext", label: "Texto sin formato" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash / Shell" },
  { value: "yaml", label: "YAML" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "HTML / XML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "less", label: "LESS" },
  { value: "markdown", label: "Markdown" },
  { value: "graphql", label: "GraphQL" },
  { value: "lua", label: "Lua" },
  { value: "perl", label: "Perl" },
  { value: "r", label: "R" },
  { value: "objectivec", label: "Objective-C" },
  { value: "vbnet", label: "VB.NET" },
  { value: "ini", label: "INI" },
  { value: "diff", label: "Diff" },
  { value: "makefile", label: "Makefile" },
  { value: "arduino", label: "Arduino" },
];

/** Confluence-style code snippet: syntax-highlighted (via lowlight), a
 * language picker, and line numbers — the NodeView adds the toolbar/gutter
 * that `CodeBlockLowlight` doesn't provide on its own. Registered in place
 * of StarterKit's plain `codeBlock` (`codeBlock: false` there) so there's
 * exactly one "codeBlock" node definition, not two competing ones. */
export const AppCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Pixel width, so the block doesn't have to span the full page width —
      // resized by dragging a handle on its right edge (see CodeBlockView),
      // same idea as the checklist block's own resizing.
      width: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.style.width;
          return raw ? Number.parseInt(raw, 10) : null;
        },
        renderHTML: (attributes: { width: number | null }) =>
          attributes.width ? { style: `width: ${attributes.width}px` } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight,
  defaultLanguage: "plaintext",
  enableTabIndentation: true,
  tabSize: 2,
});
