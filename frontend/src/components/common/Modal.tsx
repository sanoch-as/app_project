import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

export function Modal({ title, onClose, children, widthClassName = "max-w-lg" }: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-jira-text/40 p-4 pt-16">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${widthClassName} rounded-lg bg-white shadow-jira-md`}
      >
        <div className="flex items-center justify-between border-b border-jira-border px-5 py-3">
          <h2 className="text-base font-semibold text-jira-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-jira-textSub hover:bg-jira-hover hover:text-jira-text"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
