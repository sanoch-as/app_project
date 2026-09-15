import { useOutletContext } from "react-router-dom";
import type { ProjectRead } from "@/types/api";

export interface ProjectDetailContext {
  project: ProjectRead;
}

export function useProjectDetailContext() {
  return useOutletContext<ProjectDetailContext>();
}
