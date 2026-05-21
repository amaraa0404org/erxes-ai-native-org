/**
 * Tests for useAIAvailable — the MF-load probe hook.
 *
 * Strategy: `ai_ui/config` is an MF-served module that does not exist at
 * jest-time. We register a virtual module with `jest.mock(..., { virtual: true })`
 * so the hook's `import('ai_ui/config')` resolves predictably. Each test
 * resets modules to clear the module-scope probe cache between cases.
 */

import { act, renderHook, waitFor } from '@testing-library/react';

describe('useAIAvailable', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('resolves to available=true when ai_ui/config import succeeds', async () => {
    jest.doMock('ai_ui/config', () => ({ default: { name: 'ai' } }), {
      virtual: true,
    });

    const { useAIAvailable } = require('../useAIAvailable');
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
    jest.doMock(
      'ai_ui/config',
      () => {
        throw new Error('Module not found: ai_ui/config (remote unreachable)');
      },
      { virtual: true },
    );

    const { useAIAvailable } = require('../useAIAvailable');
    const { result } = renderHook(() => useAIAvailable());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.available).toBe(false);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('refetch() clears the cache and re-probes', async () => {
    // First probe: rejection
    jest.doMock(
      'ai_ui/config',
      () => {
        throw new Error('initial failure');
      },
      { virtual: true },
    );

    const { useAIAvailable } = require('../useAIAvailable');
    const { result } = renderHook(() => useAIAvailable());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.available).toBe(false);

    // Second probe (after refetch): success
    jest.resetModules();
    jest.doMock('ai_ui/config', () => ({ default: { name: 'ai' } }), {
      virtual: true,
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      // After refetch the hook re-enters the loading state once before
      // the new probe resolves; we await loading=false again
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.available).toBe(true);
  });
});
