/**
 * Unit tests for `shim.ts` — the graceful-disable Proxy + AINotEnabledError.
 *
 * Tests are hermetic: `../../utils/service-discovery` is mocked so the
 * shim does not touch Redis.
 */

jest.mock('../../utils/service-discovery', () => ({
  isEnabled: jest.fn(),
}));

import { isEnabled } from '../../utils/service-discovery';
import {
  createAIClient,
  AINotEnabledError,
  __clearAiEnabledCache,
} from '../shim';

const mockedIsEnabled = isEnabled as jest.MockedFunction<typeof isEnabled>;

const EXPECTED_BASE_MESSAGE =
  "AI plugin not enabled. Add 'ai' to ENABLED_PLUGINS and restart the gateway. Docs: https://erxes.io/docs/ai-plugin-setup";

describe('shim — createAIClient + AINotEnabledError', () => {
  beforeEach(() => {
    mockedIsEnabled.mockReset();
    __clearAiEnabledCache();
  });

  it('createAIClient returns synchronously and yields a typed object proxy', () => {
    const ai = createAIClient('acme');
    expect(typeof ai).toBe('object');
    expect(ai).not.toBeNull();
    expect(typeof ai.llm.chat).toBe('function');
    expect(typeof ai.rag.search).toBe('function');
    expect(typeof ai.agent.invoke).toBe('function');
    expect(typeof ai.tools.list).toBe('function');
    expect(typeof ai.prompt.render).toBe('function');
    expect(typeof ai.audit.list).toBe('function');
  });

  it('throws AINotEnabledError with the exact message when isEnabled(ai) is false', async () => {
    mockedIsEnabled.mockResolvedValue(false);
    const ai = createAIClient('acme');

    await expect(
      ai.llm.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(AINotEnabledError);

    mockedIsEnabled.mockResolvedValue(false);
    __clearAiEnabledCache();

    try {
      await ai.llm.chat({ messages: [{ role: 'user', content: 'hi' }] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AINotEnabledError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('AINotEnabledError');
      expect((err as Error).message).toBe(EXPECTED_BASE_MESSAGE);
    }
  });

  it('throws AINotEnabledError with a "not implemented" addendum when isEnabled(ai) is true', async () => {
    // Phase 1.1 has no real routes wired; the proxy still throws when the
    // plugin is enabled, but with an addendum noting Phase 1.2 will wire
    // the first real route. The shim test specifically asserts that the
    // base "plugin not enabled" message is NOT the cause here.
    mockedIsEnabled.mockResolvedValue(true);
    const ai = createAIClient('acme');

    await expect(
      ai.llm.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(AINotEnabledError);

    mockedIsEnabled.mockResolvedValue(true);
    __clearAiEnabledCache();

    try {
      await ai.llm.chat({ messages: [{ role: 'user', content: 'hi' }] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AINotEnabledError);
      const message = (err as Error).message;
      expect(message).toContain('not yet implemented');
      expect(message).toContain('Phase 1.2');
      // Distinguishes the "enabled" branch from the "disabled" branch:
      // the bare base message would mean isEnabled was treated as false.
      expect(message).not.toBe(EXPECTED_BASE_MESSAGE);
    }
  });

  it('caches isEnabled per subdomain — back-to-back calls hit isEnabled once', async () => {
    mockedIsEnabled.mockResolvedValue(false);
    const ai = createAIClient('acme');

    await expect(ai.llm.chat({})).rejects.toThrow(AINotEnabledError);
    await expect(ai.llm.embed({})).rejects.toThrow(AINotEnabledError);
    await expect(ai.rag.search({})).rejects.toThrow(AINotEnabledError);

    expect(mockedIsEnabled).toHaveBeenCalledTimes(1);
  });

  it('AINotEnabledError extends Error and has name="AINotEnabledError"', () => {
    const err = new AINotEnabledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AINotEnabledError');
    expect(err.message).toBe(EXPECTED_BASE_MESSAGE);

    const errWithAddendum = new AINotEnabledError('extra context');
    expect(errWithAddendum.message).toBe(
      `${EXPECTED_BASE_MESSAGE} (extra context)`,
    );
  });
});
