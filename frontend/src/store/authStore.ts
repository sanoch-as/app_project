import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrganizationRead, TokenPair, UserRead } from "@/types/api";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserRead | null;
  organization: OrganizationRead | null;
  isAuthenticated: boolean;
  setSession: (params: {
    tokens: TokenPair;
    user: UserRead;
    organization?: OrganizationRead | null;
  }) => void;
  setTokens: (tokens: TokenPair) => void;
  updateUser: (user: UserRead) => void;
  logout: () => void;
}

/**
 * ADR-018 (docs/DECISIONS.md): tokens + user/org are persisted to
 * localStorage via zustand's `persist` middleware. This is the pragmatic
 * default for an MVP SPA with no server-side rendering and no httpOnly
 * cookie infrastructure on the backend (CORS is configured for a bearer
 * header, not cookies) — see the ADR for alternatives considered.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      organization: null,
      isAuthenticated: false,
      setSession: ({ tokens, user, organization }) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
          organization: organization ?? null,
          isAuthenticated: true,
        }),
      setTokens: (tokens) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        }),
      updateUser: (user) => set({ user }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          organization: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "pmp-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        organization: state.organization,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
