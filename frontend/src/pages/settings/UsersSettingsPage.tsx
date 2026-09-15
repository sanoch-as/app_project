import { useState, type FormEvent } from "react";
import { useInviteUser, useUpdateUser, useUsers } from "@/hooks/useUsers";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { AdminOnly } from "@/components/common/ProtectedRoute";
import type { UserRead, UserRole } from "@/types/api";

export function UsersSettingsPage() {
  return (
    <AdminOnly>
      <UsersSettingsContent />
    </AdminOnly>
  );
}

function UsersSettingsContent() {
  const { data, isLoading, error } = useUsers({ limit: 100 });
  const updateUser = useUpdateUser();
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<UserRead | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Organization users</h1>
          <p className="text-sm text-slate-500">Manage users, roles and hourly cost rates.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowInvite(true)}>
          + Invite user
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Cost / hour</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">{u.full_name}</td>
                  <td className="px-4 py-2 text-slate-500">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.role}</td>
                  <td className="px-4 py-2">{u.cost_per_hour ?? "—"}</td>
                  <td className="px-4 py-2">{u.is_active ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => setEditing(u)}
                    >
                      Edit
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
    <Modal title="Invite user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-slate-400">
          There is no email delivery in v1 — this creates the account directly with the password
          you set here; share it with the person out of band.
        </p>
        <div>
          <label className="label">Full name</label>
          <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <label className="label">Cost / hour (optional)</label>
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
          <label className="label">Temporary password</label>
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
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={inviteUser.isPending}>
            {inviteUser.isPending ? "Creating…" : "Create user"}
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
    <Modal title={`Edit ${user.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <label className="label">Cost / hour</label>
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <ErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
