/**
 * Tests for AiRemoteBoundary — the ErrorBoundary specialized for ai_ui
 * remote-imported children (REQ UI-10).
 */
import { render, screen } from '@testing-library/react';
import { AiRemoteBoundary } from '../AiRemoteBoundary';

// Silence the expected React error-boundary console.error during throwing-child
// tests so the test output stays focused.
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

const Boom = () => {
  throw new Error('ai_ui hook called before Phase 3.2');
};

describe('AiRemoteBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <AiRemoteBoundary>
        <div>ok</div>
      </AiRemoteBoundary>,
    );
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('renders the default fallback when a child throws', () => {
    render(
      <AiRemoteBoundary>
        <Boom />
      </AiRemoteBoundary>,
    );
    expect(screen.getByText('AI features are unavailable.')).toBeTruthy();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <AiRemoteBoundary fallback={<span data-x>custom</span>}>
        <Boom />
      </AiRemoteBoundary>,
    );
    expect(screen.getByText('custom')).toBeTruthy();
  });
});
