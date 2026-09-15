import { apiClient } from "@/api/client";
import type { OrganizationRead } from "@/types/api";

export const organizationsApi = {
  me: () => apiClient.get<OrganizationRead>("/organizations/me").then((r) => r.data),
};
