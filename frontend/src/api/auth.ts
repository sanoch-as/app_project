import { apiClient } from "@/api/client";
import type {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  TokenPair,
} from "@/types/api";

export const authApi = {
  register: (payload: RegisterRequest) =>
    apiClient.post<RegisterResponse>("/auth/register", payload).then((r) => r.data),

  login: (payload: LoginRequest) =>
    apiClient.post<TokenPair>("/auth/login", payload).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient
      .post<TokenPair>("/auth/refresh", { refresh_token: refreshToken })
      .then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post<void>("/auth/logout", { refresh_token: refreshToken }).then((r) => r.data),
};
