/**
 * useAIAvailable — MF-load probe hook for the `ai_ui` remote (REQ UI-10).
 *
 * Strategy:
 *   - On first call, dynamically `import('ai_ui/config')` (a stable expose
 *     declared by `frontend/plugins/ai_ui/module-federation.config.ts`).
 *   - If the import resolves, the remote is reachable → `available=true`.
 *   - If it rejects (404, build missing, network error, etc.), the remote
 *     is NOT available → `available=false`. The hook never throws.
 *   - Result is cached in module scope for the lifetime of the host page,
 *     so multiple consumers share the same probe.
 *   - `refetch()` clears the cache and forces a re-probe — useful for the
 *     Settings "Test connection" flow (Phase 1.4).
 *
 * Per CONTEXT D-12 bullet 14: lives at `frontend/libs/erxes-ui/src/ai/`
 * (existing home for cross-plugin shared hooks, alongside `IUIConfig`).
 *
 * Test injection: the dynamic import indirected through `aiAvailableProbe`,
 * a mutable holder so tests can swap the probe function without resorting
 * to `jest.resetModules()` (which fights React's cross-instance dispatcher
 * state in @testing-library/react). Production code never reassigns it.
 */
import { useEffect, useState } from 'react';

export type AIAvailability = {
  available: boolean | null;
  loading: boolean;
  refetch: () => void;
};

/** Internal: the production probe — a dynamic import of the MF expose. */
const defaultProbe = (): Promise<unknown> => import('ai_ui/config' as string);

/**
 * Mutable holder for the probe function. Tests can do
 * `aiAvailableProbe.impl = () => Promise.resolve({})` to simulate success
 * or `() => Promise.reject(new Error(...))` to simulate failure. Production
 * code does not touch this.
 */
export const aiAvailableProbe: { impl: () => Promise<unknown> } = {
  impl: defaultProbe,
};

let probeCache: Promise<boolean> | null = null;

const probe = (): Promise<boolean> => {
  if (probeCache) {
    return probeCache;
  }
  // The remote is an MF-served module; we tolerate any failure mode and
  // resolve to `false`. The hook never throws.
  probeCache = aiAvailableProbe
    .impl()
    .then(() => true)
    .catch(() => false);
  return probeCache;
};

/**
 * Public reset helper — exported for tests + the Settings "Test connection"
 * flow. Clears the module-scope probe cache so the next consumer triggers
 * a fresh probe.
 */
export const resetAIAvailableCache = (): void => {
  probeCache = null;
};

export function useAIAvailable(): AIAvailability {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // `tick` is incremented by refetch() to retrigger the effect.
  const [tick, setTick] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAvailable(null);

    probe()
      .then((result) => {
        if (!cancelled) {
          setAvailable(result);
          setLoading(false);
        }
      })
      .catch(() => {
        // probe() itself never rejects, but be defensive.
        if (!cancelled) {
          setAvailable(false);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refetch = (): void => {
    resetAIAvailableCache();
    setTick((n) => n + 1);
  };

  return { available, loading, refetch };
}
