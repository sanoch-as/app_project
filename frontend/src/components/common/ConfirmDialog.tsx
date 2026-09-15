import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal title={title} onClose={onCancel} widthClassName="max-w-sm">
      <p className="text-sm text-jira-textSub">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className={danger ? "btn-danger" : "btn-primary"}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? t("common.working") : (confirmLabel ?? t("common.confirm"))}
        </button>
      </div>
    </Modal>
  );
}
