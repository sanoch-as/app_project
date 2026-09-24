import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CODE_LANGUAGES } from "@/lib/codeBlockExtension";

const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 280;

export function CodeBlockView({ node, updateAttributes, view }: NodeViewProps) {
  const { t } = useTranslation();
  const editable = view.editable;
  const language = (node.attrs.language as string | null) ?? "plaintext";
  const lineCount = Math.max(1, node.textContent.split("\n").length);
  const [copied, setCopied] = useState(false);
  const width = (node.attrs.width as number | null) ?? DEFAULT_WIDTH;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function resolveWidth(clientX: number) {
      return Math.max(MIN_WIDTH, startWidth + (clientX - startX));
    }
    function onMove(moveEvent: PointerEvent) {
      setLiveWidth(resolveWidth(moveEvent.clientX));
    }
    function onUp(upEvent: PointerEvent) {
      updateAttributes({ width: resolveWidth(upEvent.clientX) });
      setLiveWidth(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable or permission denied — no fallback needed,
      // the user can still select-and-copy the code text manually.
    }
  }

  return (
    <NodeViewWrapper
      className="doc-code-block"
      style={{ width: `${liveWidth ?? width}px`, maxWidth: "100%" }}
    >
      <div className="doc-code-block-toolbar" contentEditable={false}>
        <select
          className="doc-code-block-language"
          value={CODE_LANGUAGES.some((lang) => lang.value === language) ? language : "plaintext"}
          disabled={!editable}
          onChange={(e) => updateAttributes({ language: e.target.value })}
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <button type="button" className="doc-code-block-copy" onClick={() => void copyCode()}>
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied
            ? t("projects.overview.docs.codeBlock.copied")
            : t("projects.overview.docs.codeBlock.copy")}
        </button>
      </div>
      <div className="doc-code-block-body">
        <div className="doc-code-block-gutter" contentEditable={false} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <NodeViewContent<"pre"> as="pre" className="doc-code-block-content" />
      </div>
      {editable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("projects.overview.docs.codeBlock.resizeHandle")}
          className="doc-code-block-resize-handle"
          onPointerDown={startResize}
        />
      )}
    </NodeViewWrapper>
  );
}
