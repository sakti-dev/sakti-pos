import { createQuery } from "@tanstack/solid-query";
import { createSignal, type Accessor } from "solid-js";

const [syncDataVersion, setSyncDataVersion] = createSignal(0);
export { setSyncDataVersion };

type Fetcher<T> = () => Promise<T>;

export function useDrizzleQuery<T>(
  key: unknown[],
  fetcher: Fetcher<T>
): {
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  source: Accessor<S>,
  fetcher: Fetcher<T>
): {
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  keyOrSource: unknown[] | Accessor<S>,
  fetcher: Fetcher<T>
) {
  const isSource = typeof keyOrSource === "function";

  const query = createQuery(() => {
    const version = syncDataVersion();
    const queryKey = isSource
      ? ["drizzle", keyOrSource(), version]
      : [...keyOrSource, version];

    return {
      queryKey,
      queryFn: async () => await fetcher(),
    };
  });

  return {
    data: () => query.data,
    loading: () => query.isPending,
    error: () => (query.error ? String(query.error) : null),
    refetch: () => {
      query.refetch();
    },
  };
}
