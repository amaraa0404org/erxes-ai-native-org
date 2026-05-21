/**
 * Typed graceful-disable shim for the AI plugin.
 *
 * Consumers call `createAIClient(subdomain)` and the returned Proxy implements
 * the full `trpc.ai.*` surface (`llm`, `rag`, `agent`, `tools`, `prompt`,
 * `audit`). At every LEAF method invocation the proxy awaits
 * `isEnabled('ai')` from `service-discovery` (60s TTL cache per subdomain).
 * If `ai` is not in the runtime plugin list it throws `AINotEnabledError`
 * with an actionable message. If `ai` IS enabled the shim still throws
 * `AINotEnabledError` with a "method not implemented" addendum — Phase 1.2
 * wires the first real route (`llm.chat`/`llm.embed`).
 *
 * Decisions: D-03 (sync factory + lazy proxy), D-04 (`isEnabled('ai')`),
 * D-05 (full TypeScript surface).
 */
import { isEnabled } from '../utils/service-discovery';

/* ------------------------------------------------------------------ */
/* Error class                                                         */
/* ------------------------------------------------------------------ */

const AI_NOT_ENABLED_MESSAGE =
  "AI plugin not enabled. Add 'ai' to ENABLED_PLUGINS and restart the gateway. Docs: https://erxes.io/docs/ai-plugin-setup";

export class AINotEnabledError extends Error {
  constructor(addendum?: string) {
    super(addendum ? `${AI_NOT_ENABLED_MESSAGE} (${addendum})` : AI_NOT_ENABLED_MESSAGE);
    this.name = 'AINotEnabledError';
  }
}

/* ------------------------------------------------------------------ */
/* 60s TTL cache for `isEnabled('ai')` keyed by subdomain              */
/* ------------------------------------------------------------------ */

const ENABLED_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const enabledCache = new Map<string, CacheEntry>();

const checkAiEnabled = async (subdomain: string): Promise<boolean> => {
  const now = Date.now();
  const cached = enabledCache.get(subdomain);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await isEnabled('ai');
  enabledCache.set(subdomain, {
    value,
    expiresAt: now + ENABLED_CACHE_TTL_MS,
  });

  return value;
};

/**
 * Test-only: clear the enabled cache. Not exported from the public index.
 */
export const __clearAiEnabledCache = (): void => {
  enabledCache.clear();
};

/* ------------------------------------------------------------------ */
/* Typed client surface — full Phase 1+ shape per D-05                 */
/* ------------------------------------------------------------------ */

export interface AILlmNamespace {
  chat: (req: unknown) => Promise<unknown>;
  embed: (req: unknown) => Promise<unknown>;
  draft: (req: unknown) => Promise<unknown>;
  classify: (req: unknown) => Promise<unknown>;
  extract: (req: unknown) => Promise<unknown>;
  summarize: (req: unknown) => Promise<unknown>;
  decide: (req: unknown) => Promise<unknown>;
}

export interface AIRagNamespace {
  search: (req: unknown) => Promise<unknown>;
  upsert: (req: unknown) => Promise<unknown>;
  delete: (req: unknown) => Promise<unknown>;
}

export interface AIAgentNamespace {
  invoke: (req: unknown) => Promise<unknown>;
  list: (req: unknown) => Promise<unknown>;
}

export interface AIToolsNamespace {
  list: (req: unknown) => Promise<unknown>;
  execute: (req: unknown) => Promise<unknown>;
}

export interface AIPromptNamespace {
  render: (req: unknown) => Promise<unknown>;
  list: (req: unknown) => Promise<unknown>;
}

export interface AIAuditNamespace {
  list: (req: unknown) => Promise<unknown>;
}

export interface AIClient {
  llm: AILlmNamespace;
  rag: AIRagNamespace;
  agent: AIAgentNamespace;
  tools: AIToolsNamespace;
  prompt: AIPromptNamespace;
  audit: AIAuditNamespace;
}

const NAMESPACE_METHODS: Record<keyof AIClient, string[]> = {
  llm: ['chat', 'embed', 'draft', 'classify', 'extract', 'summarize', 'decide'],
  rag: ['search', 'upsert', 'delete'],
  agent: ['invoke', 'list'],
  tools: ['list', 'execute'],
  prompt: ['render', 'list'],
  audit: ['list'],
};

/* ------------------------------------------------------------------ */
/* Proxy factory                                                       */
/* ------------------------------------------------------------------ */

const buildNamespaceProxy = (
  subdomain: string,
  namespace: keyof AIClient,
): unknown => {
  const allowedMethods = new Set(NAMESPACE_METHODS[namespace]);

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') {
          return undefined;
        }
        if (!allowedMethods.has(prop)) {
          return undefined;
        }
        // Return an async function so consumers can `await ai.llm.chat(...)`.
        // Behavior in Phase 1.1: always throws AINotEnabledError. When `ai`
        // is enabled, throw with "method not implemented" addendum so the
        // shim test can distinguish the two code paths without yet wiring
        // a real route (Phase 1.2 replaces this branch with real RPC calls).
        return async (..._args: unknown[]): Promise<never> => {
          const enabled = await checkAiEnabled(subdomain);
          if (!enabled) {
            throw new AINotEnabledError();
          }
          throw new AINotEnabledError(
            `method '${namespace}.${prop}' not yet implemented — Phase 1.2 wires the first real route`,
          );
        };
      },
    },
  );
};

/**
 * Create a typed AI client for a given subdomain. Returns synchronously.
 *
 * Per D-03 this is a JS Proxy: no real client work happens until a leaf
 * method is invoked. At first invocation the proxy checks
 * `isEnabled('ai')` (cached 60s) and either throws `AINotEnabledError`
 * (plugin disabled) or, in Phase 1.1, still throws with a "not implemented"
 * addendum because no real routes are wired yet.
 */
export const createAIClient = (subdomain: string): AIClient => {
  return {
    llm: buildNamespaceProxy(subdomain, 'llm') as AILlmNamespace,
    rag: buildNamespaceProxy(subdomain, 'rag') as AIRagNamespace,
    agent: buildNamespaceProxy(subdomain, 'agent') as AIAgentNamespace,
    tools: buildNamespaceProxy(subdomain, 'tools') as AIToolsNamespace,
    prompt: buildNamespaceProxy(subdomain, 'prompt') as AIPromptNamespace,
    audit: buildNamespaceProxy(subdomain, 'audit') as AIAuditNamespace,
  };
};
