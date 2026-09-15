import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { organizationsApi } from "@/api/organizations";
import { usersApi } from "@/api/users";
import { decodeAccessToken } from "@/lib/jwt";
import { useAuthStore } from "@/store/authStore";
import type { LoginRequest, RegisterRequest } from "@/types/api";

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
    onSuccess: (data) => {
      setSession({ tokens: data.tokens, user: data.user, organization: data.organization });
    },
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (payload: LoginRequest) => {
      const tokens = await authApi.login(payload);
      // The API has no /users/me — decode the access token's `sub` claim to
      // fetch the authenticated user's own profile via GET /users/{id}.
      const { sub: userId } = decodeAccessToken(tokens.access_token);
      useAuthStore.getState().setTokens(tokens);
      const [user, organization] = await Promise.all([
        usersApi.get(userId),
        organizationsApi.me(),
      ]);
      return { tokens, user, organization };
    },
    onSuccess: ({ tokens, user, organization }) => {
      setSession({ tokens, user, organization });
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        await authApi.logout(refreshToken).catch(() => undefined);
      }
    },
    onSettled: () => logout(),
  });
}
