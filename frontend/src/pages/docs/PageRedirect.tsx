import { useParams, Navigate } from "react-router-dom";
import { usePage } from "@/hooks/usePages";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";

/** A page mention only carries the target page's id, not its space — this
 * route resolves `space_id` and redirects to the real
 * `/docs/:spaceId/pages/:pageId` path. */
export function PageRedirect() {
  const { pageId } = useParams<{ pageId: string }>();
  const { data: page, isLoading, error } = usePage(pageId);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!page) return null;

  return <Navigate to={`/docs/${page.space_id}/pages/${page.id}`} replace />;
}
