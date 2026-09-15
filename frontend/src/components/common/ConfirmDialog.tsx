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
  confirmLabel = "Confirm",
  danger = true,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} widthClassName="max-w-sm">
      <p className="text-sm text-jira-textSub">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? "btn-danger" : "btn-primary"}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
