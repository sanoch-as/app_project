import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { useAuthStore } from "@/store/authStore";
import type { ApiErrorBody, TokenPair } from "@/types/api";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// A plain, un-intercepted instance used only for the refresh call itself, so
// a failing refresh never recurses back into the response interceptor below.
const refreshClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let refreshPromise: Promise<TokenPair> | null = null;

async function refreshTokens(): Promise<TokenPair> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }
  const { data } = await refreshClient.post<TokenPair>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  return data;
}

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const originalRequest = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/");

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        // Coalesce concurrent 401s into a single refresh call.
        refreshPromise ??= refreshTokens().finally(() => {
          refreshPromise = null;
        });
        const tokens = await refreshPromise;
        useAuthStore.getState().setTokens(tokens);
        originalRequest.headers = axios.AxiosHeaders.from(
          originalRequest.headers as Record<string, string> | undefined,
        ).set("Authorization", `Bearer ${tokens.access_token}`);
        return apiClient.request(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

/** Extract the uniform {detail, code} error envelope, falling back sensibly. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.detail ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export function getApiErrorCode(error: unknown): string | undefined {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.code;
  }
  return undefined;
}
