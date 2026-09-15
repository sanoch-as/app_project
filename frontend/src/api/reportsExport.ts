import { apiClient } from "@/api/client";
import type { ExportType } from "@/types/api";

/**
 * GET /projects/{id}/reports/export returns a raw CSV or PDF file body (not
 * JSON) with a Content-Disposition header. We fetch it as a blob and trigger
 * a browser download client-side, extracting the filename from the header
 * when present and falling back to a sensible default otherwise.
 */
export async function downloadProjectExport(
  projectId: string,
  type: ExportType,
  fallbackFilename: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(`/projects/${projectId}/reports/export`, {
    params: { type },
    responseType: "blob",
  });

  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;

  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
