/**
 * Unit tests for the OpenAI-family adapters: OpenAI, Anthropic, Azure (Phase 1.2 Plan 03).
 *
 * Test inventory (9 tests; P1 acceptance gate at tests 3 + 8):
 *   1. OpenAI happy path  — testConnection returns ok with model count
 *   2. OpenAI listModels  — capability heuristic for gpt-4o + text-embedding-3-*
 *   3. OpenAI auth failure sanitization — P1 ACCEPTANCE GATE (no sk- substring escapes)
 *   4. OpenAI chat stub  — throws NotYetImplementedError('Phase 1.3')
 *   5. Azure missing config — constructor throws with 'deploymentName' in message
 *   6. Azure testConnection happy — chat probe succeeds → ok:true
 *   7. Anthropic listModels — real client.models.list() shape returned
 *   8. Anthropic auth failure sanitization — P1 ACCEPTANCE GATE (no sk-ant- substring escapes)
 *   9. PROVIDER_REGISTRY — populated with openai/anthropic/azure; google/ollama/custom undefined
 *
 * SDKs are mocked via `jest.mock(...)` so the tests run hermetically (no
 * real HTTPS). The mock factory is set inside each `jest.mock` callback to
 * allow per-test override via `(SDKMock as jest.Mock).mockImplementation(...)`.
 */

// ---------------------------------------------------------------------------
// SDK mocks — install BEFORE the adapter imports so the mocked modules win.
// ---------------------------------------------------------------------------

const mockOpenAIList = jest.fn();
const mockOpenAICreate = jest.fn();
const MockOpenAIConstructor = jest.fn().mockImplementation(() => ({
  models: { list: mockOpenAIList },
  chat: { completions: { create: mockOpenAICreate } },
}));
const mockAzureCreate = jest.fn();
const MockAzureOpenAIConstructor = jest.fn().mockImplementation(() => ({
  chat: { completions: { create: mockAzureCreate } },
}));

jest.mock('openai', () => {
  // The provider module imports both `OpenAI` (default and named) and
  // `AzureOpenAI` (named). Expose both shapes from the mock.
  const O = MockOpenAIConstructor as unknown as new (...args: any[]) => any;
  const A = MockAzureOpenAIConstructor as unknown as new (...args: any[]) => any;
  return {
    __esModule: true,
    default: O,
    OpenAI: O,
    AzureOpenAI: A,
  };
});

const mockAnthropicList = jest.fn();
const mockAnthropicCreate = jest.fn();
const MockAnthropicConstructor = jest.fn().mockImplementation(() => ({
  models: { list: mockAnthropicList },
  messages: { create: mockAnthropicCreate },
}));

jest.mock('@anthropic-ai/sdk', () => {
  const A = MockAnthropicConstructor as unknown as new (...args: any[]) => any;
  return {
    __esModule: true,
    default: A,
    Anthropic: A,
  };
});

// ---------------------------------------------------------------------------
// Imports under test (after the mocks).
// ---------------------------------------------------------------------------
import { createOpenAIProvider, OpenAIProvider } from '../providers/openai';
import { createAzureProvider, AzureProvider } from '../providers/azure';
import {
  createAnthropicProvider,
  AnthropicProvider,
} from '../providers/anthropic';
import { PROVIDER_REGISTRY } from '../providers/index';
import { NotYetImplementedError } from '../errors';

const KEY_PATTERN = /(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,}|\b[a-f0-9]{32}\b)/i;

beforeEach(() => {
  mockOpenAIList.mockReset();
  mockOpenAICreate.mockReset();
  MockOpenAIConstructor.mockClear();
  mockAzureCreate.mockReset();
  MockAzureOpenAIConstructor.mockClear();
  mockAnthropicList.mockReset();
  mockAnthropicCreate.mockReset();
  MockAnthropicConstructor.mockClear();
});

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

describe('OpenAIProvider', () => {
  it('Test 1: testConnection happy path returns ok with model count', async () => {
    mockOpenAIList.mockResolvedValueOnce({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4' },
        { id: 'text-embedding-3-small' },
      ],
    });

    const provider = createOpenAIProvider({
      apiKey: 'sk-testkey-abcdef0123456789',
      subdomain: 'tenantA',
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);

    const result = await (provider as OpenAIProvider).testConnection();
    expect(result.ok).toBe(true);
    expect(result.modelsAvailable).toBe(3);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.errorCode).toBeUndefined();
  });

  it('Test 2: listModels applies capability heuristic per model prefix', async () => {
    mockOpenAIList.mockResolvedValueOnce({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4' },
        { id: 'gpt-3.5-turbo' },
        { id: 'text-embedding-3-small' },
        { id: 'o1-preview' },
        { id: 'some-unknown-model-xyz' },
      ],
    });

    const provider = createOpenAIProvider({
      apiKey: 'sk-test',
      subdomain: 'tenantA',
    }) as OpenAIProvider;
    const models = await provider.listModels();

    const byId = Object.fromEntries(models.map((m) => [m.id, m]));
    expect(byId['gpt-4o'].capabilities).toEqual(
      expect.arrayContaining(['chat', 'vision', 'tools']),
    );
    expect(byId['gpt-4o'].contextWindow).toBe(128000);
    expect(byId['gpt-4o'].providerKind).toBe('openai');

    expect(byId['gpt-4'].contextWindow).toBe(128000);
    expect(byId['gpt-4'].capabilities).toEqual(
      expect.arrayContaining(['chat', 'tools']),
    );

    expect(byId['gpt-3.5-turbo'].contextWindow).toBe(16385);

    expect(byId['text-embedding-3-small'].capabilities).toEqual(['embed']);
    expect(byId['text-embedding-3-small'].contextWindow).toBe(8191);

    expect(byId['o1-preview'].contextWindow).toBe(128000);
    expect(byId['o1-preview'].capabilities).toContain('chat');

    expect(byId['some-unknown-model-xyz'].contextWindow).toBe(4096);
    expect(byId['some-unknown-model-xyz'].capabilities).toContain('chat');
  });

  it('Test 3: P1 GATE — auth failure does NOT leak sk- key substring in any field', async () => {
    const leakyKey = 'sk-test123abcdef0123456789';
    const sdkError: any = new Error(`Bearer ${leakyKey} AuthError`);
    sdkError.status = 401;
    sdkError.error = { code: 'invalid_api_key' };
    mockOpenAIList.mockRejectedValueOnce(sdkError);

    const provider = createOpenAIProvider({
      apiKey: leakyKey,
      subdomain: 'tenantA',
    }) as OpenAIProvider;
    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.modelsAvailable).toBe(0);
    expect(result.errorCode).toBeDefined();

    // Whole-object sanitization assertion: serialize the entire result and
    // verify no recognized key pattern appears anywhere in it.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(leakyKey);
    expect(serialized).not.toContain('sk-test');
    expect(KEY_PATTERN.test(serialized)).toBe(false);
  });

  it('Test 4: chat()/embed() throw NotYetImplementedError with Phase 1.3 in message', async () => {
    const provider = createOpenAIProvider({
      apiKey: 'sk-test',
      subdomain: 'tenantA',
    });

    await expect(
      provider.chat({ model: 'gpt-4o', messages: [] }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);

    await expect(
      provider.chat({ model: 'gpt-4o', messages: [] }),
    ).rejects.toThrow(/Phase 1\.3/);

    await expect(
      provider.embed({ model: 'text-embedding-3-small', input: 'x' }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);
  });

  it('does NOT retain apiKey on `this` after construction (P1 hardening)', () => {
    const apiKey = 'sk-test-retention-check-1234567890';
    const provider = createOpenAIProvider({
      apiKey,
      subdomain: 'tenantA',
    }) as OpenAIProvider;
    // Walk every enumerable property of the instance and assert no value
    // equals the apiKey string. The SDK retains the key in its own private
    // state; the adapter shell does not.
    const serialized = JSON.stringify(
      provider,
      (_k, v) => (typeof v === 'function' ? '[fn]' : v),
    );
    expect(serialized).not.toContain(apiKey);
  });
});

// ---------------------------------------------------------------------------
// Azure
// ---------------------------------------------------------------------------

describe('AzureProvider', () => {
  it('Test 5: constructor throws when config.deploymentName is missing', () => {
    expect(() =>
      createAzureProvider({
        apiKey: 'k',
        subdomain: 's',
        config: { apiVersion: '2024-02-15-preview' },
      }),
    ).toThrow(/deploymentName/);

    expect(() =>
      createAzureProvider({
        apiKey: 'k',
        subdomain: 's',
        config: { deploymentName: 'my-deploy' },
      }),
    ).toThrow(/apiVersion/);

    expect(() =>
      createAzureProvider({ apiKey: 'k', subdomain: 's', config: {} }),
    ).toThrow(/deploymentName/);

    expect(() => createAzureProvider({ apiKey: 'k', subdomain: 's' })).toThrow(
      /deploymentName/,
    );
  });

  it('Test 6: testConnection performs a 1-token chat probe and returns ok', async () => {
    mockAzureCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'pong' } }],
    });

    const provider = createAzureProvider({
      apiKey: 'azure-32-hex-key',
      baseUrl: 'https://example-resource.azure.openai.com/',
      subdomain: 'tenantA',
      config: {
        deploymentName: 'gpt-4o-deploy',
        apiVersion: '2024-02-15-preview',
      },
    }) as AzureProvider;

    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.modelsAvailable).toBe(1);

    // Verify the chat probe was made with max_tokens:1 against the deployment.
    expect(mockAzureCreate).toHaveBeenCalledTimes(1);
    const call = mockAzureCreate.mock.calls[0][0];
    expect(call.model).toBe('gpt-4o-deploy');
    expect(call.max_tokens).toBe(1);
    expect(call.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('Azure listModels returns the single configured deployment as a model', async () => {
    const provider = createAzureProvider({
      apiKey: 'k',
      baseUrl: 'https://example.azure.openai.com/',
      subdomain: 'tenantA',
      config: {
        deploymentName: 'my-deploy',
        apiVersion: '2024-02-15-preview',
      },
    }) as AzureProvider;

    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('my-deploy');
    expect(models[0].providerKind).toBe('azure');
    expect(models[0].capabilities).toEqual(
      expect.arrayContaining(['chat', 'tools']),
    );
  });

  it('Azure testConnection auth-failure path sanitizes the error (P1)', async () => {
    const leakyKey = 'a'.repeat(32); // 32-hex Azure key pattern
    const sdkError: any = new Error(`Auth failed using key ${leakyKey}`);
    sdkError.status = 401;
    sdkError.error = { code: 'invalid_api_key' };
    mockAzureCreate.mockRejectedValueOnce(sdkError);

    const provider = createAzureProvider({
      apiKey: leakyKey,
      baseUrl: 'https://example.azure.openai.com/',
      subdomain: 'tenantA',
      config: {
        deploymentName: 'my-deploy',
        apiVersion: '2024-02-15-preview',
      },
    }) as AzureProvider;

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.modelsAvailable).toBe(0);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(leakyKey);
    expect(KEY_PATTERN.test(serialized)).toBe(false);
  });

  it('Azure chat/embed throw NotYetImplementedError', async () => {
    const provider = createAzureProvider({
      apiKey: 'k',
      baseUrl: 'https://x.azure.openai.com/',
      subdomain: 'tenantA',
      config: {
        deploymentName: 'd',
        apiVersion: '2024-02-15-preview',
      },
    });

    await expect(
      provider.chat({ model: 'd', messages: [] }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);
    await expect(
      provider.embed({ model: 'd', input: 'x' }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);
  });
});

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

describe('AnthropicProvider', () => {
  it('Test 7: listModels delegates to client.models.list() and maps to ModelInfo[]', async () => {
    mockAnthropicList.mockResolvedValueOnce({
      data: [
        {
          id: 'claude-3-5-sonnet-latest',
          max_input_tokens: 200000,
          capabilities: { image_input: { supported: true } },
        },
        {
          id: 'claude-3-5-haiku-latest',
          max_input_tokens: 200000,
          capabilities: { image_input: { supported: false } },
        },
        {
          id: 'claude-3-opus-latest',
          max_input_tokens: 200000,
          capabilities: null,
        },
      ],
    });

    const provider = createAnthropicProvider({
      apiKey: 'sk-ant-test',
      subdomain: 'tenantA',
    }) as AnthropicProvider;

    const models = await provider.listModels();
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-opus-latest',
      ]),
    );

    const sonnet = models.find((m) => m.id === 'claude-3-5-sonnet-latest')!;
    expect(sonnet.providerKind).toBe('anthropic');
    expect(sonnet.contextWindow).toBe(200000);
    expect(sonnet.capabilities).toEqual(
      expect.arrayContaining(['chat', 'tools', 'vision']),
    );

    const haiku = models.find((m) => m.id === 'claude-3-5-haiku-latest')!;
    expect(haiku.capabilities).toEqual(
      expect.arrayContaining(['chat', 'tools']),
    );
    expect(haiku.capabilities).not.toContain('vision');
  });

  it('falls back to a static table when client.models.list() is unavailable', async () => {
    // Simulate an SDK without models.list (older 0.x) by making list throw
    // with TypeError "is not a function". Adapter should swallow and return
    // the static table.
    mockAnthropicList.mockImplementationOnce(() => {
      throw new TypeError('this.client.models.list is not a function');
    });

    const provider = createAnthropicProvider({
      apiKey: 'k',
      subdomain: 'tenantA',
    }) as AnthropicProvider;

    const models = await provider.listModels();
    expect(models.length).toBeGreaterThanOrEqual(3);
    expect(models.map((m) => m.id)).toEqual(
      expect.arrayContaining(['claude-3-5-sonnet-latest']),
    );
    for (const m of models) {
      expect(m.providerKind).toBe('anthropic');
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it('Test 8: P1 GATE — auth failure does NOT leak sk-ant- key substring', async () => {
    const leakyKey = 'sk-ant-test-0123456789abcdefghij';
    const sdkError: any = new Error(`Authentication failed using ${leakyKey}`);
    sdkError.status = 401;
    sdkError.headers = { 'x-api-key': leakyKey };
    mockAnthropicList.mockRejectedValueOnce(sdkError);

    const provider = createAnthropicProvider({
      apiKey: leakyKey,
      subdomain: 'tenantA',
    }) as AnthropicProvider;

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.modelsAvailable).toBe(0);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(leakyKey);
    expect(serialized).not.toContain('sk-ant-');
    expect(KEY_PATTERN.test(serialized)).toBe(false);
  });

  it('Anthropic chat/embed throw NotYetImplementedError', async () => {
    const provider = createAnthropicProvider({
      apiKey: 'sk-ant-x',
      subdomain: 'tenantA',
    });

    await expect(
      provider.chat({ model: 'claude-3-5-sonnet-latest', messages: [] }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);
    await expect(
      provider.embed({ model: 'claude-3-5-sonnet-latest', input: 'x' }),
    ).rejects.toBeInstanceOf(NotYetImplementedError);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('PROVIDER_REGISTRY contents (Plan 03 — 3 entries)', () => {
  it('Test 9: openai, anthropic, azure are populated; google/ollama/custom remain undefined', () => {
    expect(typeof PROVIDER_REGISTRY.openai).toBe('function');
    expect(typeof PROVIDER_REGISTRY.anthropic).toBe('function');
    expect(typeof PROVIDER_REGISTRY.azure).toBe('function');

    // Plan 04 will populate these — they MUST still be undefined after Plan 03.
    expect(PROVIDER_REGISTRY.google).toBeUndefined();
    expect(PROVIDER_REGISTRY.ollama).toBeUndefined();
    expect(PROVIDER_REGISTRY.custom).toBeUndefined();
  });

  it('registry factories accept ProviderConstructorArgs and return ILLMProvider instances', () => {
    const openai = PROVIDER_REGISTRY.openai!({
      apiKey: 'sk',
      subdomain: 'tenantA',
    });
    expect(openai).toBeInstanceOf(OpenAIProvider);

    const anthropic = PROVIDER_REGISTRY.anthropic!({
      apiKey: 'sk-ant',
      subdomain: 'tenantA',
    });
    expect(anthropic).toBeInstanceOf(AnthropicProvider);

    const azure = PROVIDER_REGISTRY.azure!({
      apiKey: 'k',
      baseUrl: 'https://x.azure.openai.com/',
      subdomain: 'tenantA',
      config: { deploymentName: 'd', apiVersion: '2024-02-15-preview' },
    });
    expect(azure).toBeInstanceOf(AzureProvider);
  });
});
