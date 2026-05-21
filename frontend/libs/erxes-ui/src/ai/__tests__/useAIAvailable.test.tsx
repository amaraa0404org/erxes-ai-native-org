/**
 * Tests for useAIAvailable — the MF-load probe hook.
 *
 * The hook is fronted by an injectable probe (`aiAvailableProbe.impl`)
 * so tests can swap success/failure behavior without resetting modules
 * (which would break React's dispatcher state across the
 * @testing-library/react boundary).
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  aiAvailableProbe,
  resetAIAvailableCache,
  useAIAvailable,
} from '../useAIAvailable';

const originalProbe = aiAvailableProbe.impl;

afterEach(() => {
  aiAvailableProbe.impl = originalProbe;
  resetAIAvailableCache();
});

describe('useAIAvailable', () => {
  it('resolves to available=true when ai_ui/config import succeeds', async () => {
    aiAvailableProbe.impl = () => Promise.resolve({ default: { name: 'ai' } });

    const { result } = renderHook(() => useAIAvailable());

    // Initial state: loading, unknown
    expect(result.current.loading).toBe(true);
    expect(result.current.available).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.available).toBe(true);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('resolves to available=false when ai_ui/config import rejects', async () => {
    aiAvailableProbe.impl = () =>
      Promise.reject(
        new Error('Module not found: ai_ui/config (remote unreachable)'),
      );

    const { result } = renderHook(() => useAIAvailable());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.available).toBe(false);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('refetch() clears the cache and re-probes', async () => {
    // First probe state: rejection
    aiAvailableProbe.impl = () => Promise.reject(new Error('initial failure'));

    const { result } = renderHook(() => useAIAvailable());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.available).toBe(false);

    // Swap to success and refetch
    aiAvailableProbe.impl = () => Promise.resolve({ default: { name: 'ai' } });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.available).toBe(true);
    });
  });
});
