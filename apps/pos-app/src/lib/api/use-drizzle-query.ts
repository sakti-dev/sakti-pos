import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";

type Fetcher<T> = () => Promise<T>;

export function useDrizzleQuery<T>(
  queryKey: unknown[],
  buildQuery: () => Promise<T>
): {
  data: Accessor<T>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  source: Accessor<S>,
  buildQuery: () => Promise<T>
): {
  data: Accessor<T>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  keyOrSource: unknown[] | Accessor<S>,
  buildQuery: Fetcher<T>
) {
  const isSource = typeof keyOrSource === "function";

  const query = createQuery(() => {
    const queryKey = isSource ? ["drizzle", keyOrSource()] : [...keyOrSource];

    return {
      queryKey,
      queryFn: async () => await buildQuery(),
    };
  });

  return {
    data: () => query.data as T,
    loading: () => query.isPending,
    error: () => (query.error ? String(query.error) : null),
    refetch: () => {
      query.refetch();
    },
  };
}
