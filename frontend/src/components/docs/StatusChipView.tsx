import { useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import { ColorSwatchPicker } from "@/components/docs/ColorSwatchPicker";
import type { StatusChipOption } from "@/lib/statusChipExtension";

export function StatusChipView({ node, updateAttributes, view }: NodeViewProps) {
  const { t } = useTranslation();
  const editable = view.editable;
  const options = (node.attrs.options ?? []) as StatusChipOption[];
  const value = node.attrs.value as string | null;
  const current = options.find((option) => option.id === value);

  const [managingOptions, setManagingOptions] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#dcdfe4");

  function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    const option: StatusChipOption = { id: crypto.randomUUID(), label, color: newColor };
    updateAttributes({ options: [...options, option] });
    setNewLabel("");
  }

  function removeOption(id: string) {
    updateAttributes({
      options: options.filter((option) => option.id !== id),
      value: value === id ? null : value,
    });
  }

  return (
    <NodeViewWrapper as="span" className="doc-status-chip-wrapper">
      <Dropdown
        trigger={({ toggle }) => (
          <button
            type="button"
            disabled={!editable}
            onClick={editable ? toggle : undefined}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 align-middle text-xs font-medium disabled:cursor-default"
            style={{ backgroundColor: current?.color ?? "#f1f2f4", color: "#172b4d" }}
          >
            {current?.label ?? t("projects.overview.docs.statusChip.placeholder")}
            {editable && <ChevronDown className="h-3 w-3" aria-hidden="true" />}
          </button>
        )}
      >
        {({ close }) => (
          <div className="w-60 py-1">
            {options.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-jira-textSub">
                {t("projects.overview.docs.statusChip.noOptions")}
              </p>
            )}
            {options.map((option) => (
              <div key={option.id} className="group flex items-center gap-1 pr-1">
                <DropdownItem
                  className="flex-1"
                  onClick={() => {
                    updateAttributes({ value: option.id });
                    close();
                  }}
                >
                  <span className="flex w-3 shrink-0 justify-center">
                    {option.id === value && <Check className="h-3 w-3" aria-hidden="true" />}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ backgroundColor: option.color }}
                  >
                    {option.label}
                  </span>
                </DropdownItem>
                <button
                  type="button"
                  className="hidden shrink-0 rounded p-1 text-jira-textSub hover:text-jira-red group-hover:block"
                  aria-label={t("projects.overview.docs.statusChip.removeOption")}
                  onClick={() => removeOption(option.id)}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}

            <div className="mt-1 border-t border-jira-borderSoft px-2 pt-2">
              {managingOptions ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    className="input py-1 text-xs"
                    placeholder={t("projects.overview.docs.statusChip.newOptionPlaceholder")}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addOption();
                    }}
                  />
                  <ColorSwatchPicker value={newColor} onSelect={setNewColor} />
                  <button
                    type="button"
                    className="btn-primary w-full py-1 text-xs"
                    disabled={!newLabel.trim()}
                    onClick={addOption}
                  >
                    {t("projects.overview.docs.statusChip.addOption")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 py-1 text-xs text-brand-600 hover:underline"
                  onClick={() => setManagingOptions(true)}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t("projects.overview.docs.statusChip.manageOptions")}
                </button>
              )}
            </div>
          </div>
        )}
      </Dropdown>
    </NodeViewWrapper>
  );
}
