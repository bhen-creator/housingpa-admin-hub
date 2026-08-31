import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  enabled?: boolean;
};

export function useAuth({ enabled = true }: UseAuthOptions = {}) {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const localLoginMutation = trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      )
        return;
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading:
        meQuery.isLoading ||
        logoutMutation.isPending ||
        localLoginMutation.isPending,
      error:
        meQuery.error ??
        logoutMutation.error ??
        localLoginMutation.error ??
        null,
      isAuthenticated: Boolean(meQuery.data),
    }),
    [
      meQuery.data,
      meQuery.error,
      meQuery.isLoading,
      localLoginMutation.error,
      localLoginMutation.isPending,
      logoutMutation.error,
      logoutMutation.isPending,
    ]
  );

  return {
    ...state,
    loginWithCredentials: (credentials: {
      username: string;
      password: string;
    }) => localLoginMutation.mutateAsync(credentials),
    isCredentialLoginPending: localLoginMutation.isPending,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
