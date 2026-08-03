// One shared TanStack Query client. Defaults tuned for a mobile API client:
// a short stale time, one retry (the API client already handles 401 refresh, so
// retrying auth errors is pointless — but Query can't see the code here, so we keep
// a single retry and let screens override per-query where needed).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
