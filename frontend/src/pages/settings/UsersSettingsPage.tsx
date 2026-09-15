import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInviteUser, useUpdateUser, useUsers } from "@/hooks/useUsers";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { AdminOnly } from "@/components/common/ProtectedRoute";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import type { UserRead, UserRole } from "@/types/api";

export function UsersSettingsPage() {
  return (
    <AdminOnly>
      <UsersSettingsContent />
    </AdminOnly>
  );
}

function UsersSettingsContent() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useUsers({ limit: 100 });
  const updateUser = useUpdateUser();
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<UserRead | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-jira-text">{t("usersSettings.title")}</h1>
          <p className="text-sm text-jira-textSub">{t("usersSettings.subtitle")}</p>
        </div>
        <Button variant="primary" iconLeft={UserPlus} onClick={() => setShowInvite(true)}>
          {t("usersSettings.inviteUser")}
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-jira-border text-sm">
            <thead className="bg-jira-panel">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-jira-textSub">
                <th className="px-4 py-2">{t("common.name")}</th>
                <th className="px-4 py-2">{t("usersSettings.email")}</th>
                <th className="px-4 py-2">{t("usersSettings.role")}</th>
                <th className="px-4 py-2">{t("usersSettings.costPerHour")}</th>
                <th className="px-4 py-2">{t("usersSettings.active")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-borderSoft">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-jira-hover">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <span className="font-medium text-jira-text">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-jira-textSub">{u.email}</td>
                  <td className="px-4 py-2 text-jira-text">{t(`enums.userRole.${u.role}`)}</td>
                  <td className="px-4 py-2 text-jira-text">{u.cost_per_hour ?? "—"}</td>
                  <td className="px-4 py-2 text-jira-text">
                    {u.is_active ? t("usersSettings.yes") : t("usersSettings.no")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => setEditing(u)}
                    >
                      {t("common.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}
      {editing && (
        <EditUserModal
          user={editing}
          isPending={updateUser.isPending}
          error={updateUser.error}
          onClose={() => setEditing(null)}
          onSubmit={(payload) =>
            updateUser.mutate({ id: editing.id, payload }, { onSuccess: () => setEditing(null) })
          }
        />
      )}
    </div>
  );
}

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const inviteUser = useInviteUser();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [costPerHour, setCostPerHour] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    inviteUser.mutate(
      {
        full_name: fullName,
        email,
        role,
        cost_per_hour: costPerHour === "" ? null : Number(costPerHour),
        password,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal title={t("usersSettings.inviteTitle")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-jira-textSub">{t("usersSettings.noEmailDeliveryHint")}</p>
        <div>
          <label className="label">{t("usersSettings.fullName")}</label>
          <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("usersSettings.email")}</label>
          <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("usersSettings.role")}</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">{t("enums.userRole.member")}</option>
              <option value="admin">{t("enums.userRole.admin")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("usersSettings.costPerHourOptional")}</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={costPerHour}
              onChange={(e) => setCostPerHour(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">{t("usersSettings.temporaryPassword")}</label>
          <input
            required
            minLength={8}
            type="text"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorMessage error={inviteUser.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={inviteUser.isPending}>
            {inviteUser.isPending ? t("usersSettings.creating") : t("usersSettings.createUser")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  user: UserRead;
  onClose: () => void;
  onSubmit: (payload: { full_name: string; role: UserRole; cost_per_hour: number | null; is_active: boolean }) => void;
  isPending: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [costPerHour, setCostPerHour] = useState(user.cost_per_hour?.toString() ?? "");
  const [isActive, setIsActive] = useState(user.is_active);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      full_name: fullName,
      role,
      cost_per_hour: costPerHour === "" ? null : Number(costPerHour),
      is_active: isActive,
    });
  }

  return (
    <Modal title={t("usersSettings.editTitle", { email: user.email })} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">{t("usersSettings.fullName")}</label>
          <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("usersSettings.role")}</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">{t("enums.userRole.member")}</option>
              <option value="admin">{t("enums.userRole.admin")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("usersSettings.costPerHour")}</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={costPerHour}
              onChange={(e) => setCostPerHour(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-jira-text">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t("usersSettings.active")}
        </label>
        <ErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
