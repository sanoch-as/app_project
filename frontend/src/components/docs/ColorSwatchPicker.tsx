import { useTranslation } from "react-i18next";
import { COLOR_SWATCHES } from "@/lib/colorSwatches";

interface ColorSwatchPickerProps {
  swatches?: { label: string; value: string }[];
  value?: string | null;
  onSelect: (color: string) => void;
  onClear?: () => void;
}

export function ColorSwatchPicker({
  swatches = COLOR_SWATCHES,
  value,
  onSelect,
  onClear,
}: ColorSwatchPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="w-56 p-2">
      <div className="grid grid-cols-5 gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            aria-label={swatch.label}
            className={`h-6 w-6 rounded-full border ${
              value === swatch.value ? "ring-2 ring-brand-600 ring-offset-1" : "border-jira-border"
            }`}
            style={{ backgroundColor: swatch.value }}
            onClick={() => onSelect(swatch.value)}
          />
        ))}
      </div>
      {onClear && (
        <button
          type="button"
          className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-jira-textSub hover:bg-jira-hover"
          onClick={onClear}
        >
          {t("projects.overview.docs.toolbar.clearColor")}
        </button>
      )}
    </div>
  );
}
