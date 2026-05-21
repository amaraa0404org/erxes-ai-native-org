/**
 * AiRemoteBoundary — ErrorBoundary specialized for `ai_ui` remote-imported
 * children (REQ UI-10).
 *
 * Wraps `react-error-boundary`'s `<ErrorBoundary>` so any throw during
 * render of `children` (including synthetic throws from the Phase 1.1
 * hooks stubs like `useAIChat: implementation lands in Phase 3.2`)
 * renders the fallback instead of crashing the host.
 *
 * Per CONTEXT D-12 bullet 14: lives at `frontend/libs/erxes-ui/src/ai/`
 * alongside `useAIAvailable.ts` so consumers can
 * `import { useAIAvailable, AiRemoteBoundary } from 'erxes-ui'`.
 */
import { ErrorBoundary } from 'react-error-boundary';
import type { ReactNode } from 'react';

export type AiRemoteBoundaryProps = {
  children: ReactNode;
  /**
   * Optional override. If omitted, a dimmed
   * `<div data-ai-remote-boundary-fallback>AI features are unavailable.</div>`
   * renders — the data-attribute lets devs grep for unwrapped imports.
   */
  fallback?: ReactNode;
};

const DefaultFallback = () => (
  <div data-ai-remote-boundary-fallback>AI features are unavailable.</div>
);

export function AiRemoteBoundary({
  children,
  fallback,
}: AiRemoteBoundaryProps) {
  return (
    <ErrorBoundary fallback={<>{fallback ?? <DefaultFallback />}</>}>
      {children}
    </ErrorBoundary>
  );
}
