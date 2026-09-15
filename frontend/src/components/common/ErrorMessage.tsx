import { getApiErrorMessage } from "@/api/client";

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-jira-red">
      {getApiErrorMessage(error)}
    </div>
  );
}
