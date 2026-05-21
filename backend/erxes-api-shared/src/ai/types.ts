/**
 * Shared AI types for the `erxes-api-shared/ai` subpath.
 *
 * Every Zod object schema uses `.strict()` per D-12 — unknown fields raise
 * an error so provider/payload drift surfaces at the boundary, not deep in
 * the agent loop.
 */
import { z } from 'zod';

export { AINotEnabledError } from './shim';

/* ------------------------------------------------------------------ */
/* Provider kinds                                                      */
/* ------------------------------------------------------------------ */

export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'custom';

export const PROVIDER_KINDS: ProviderKind[] = [
  'openai',
  'anthropic',
  'google',
  'azure',
  'ollama',
  'custom',
];

/* ------------------------------------------------------------------ */
/* Chat messages                                                       */
/* ------------------------------------------------------------------ */

export const chatMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    name: z.string().optional(),
    toolCallId: z.string().optional(),
  })
  .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageType = ChatMessage;

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Side-effect classification for tool execution. Used by the agent loop to
 * gate write-scoped tools behind explicit agent scopes (Phase 2.2).
 */
export type ToolSideEffects = 'read' | 'write' | 'external';

/**
 * In-process tool definition. The `inputSchema` is a Zod schema and is the
 * source of truth for runtime validation. The registry-side serialized form
 * is `AiToolDef` which carries the equivalent JSON Schema.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  sideEffects?: ToolSideEffects;
}

export const toolDefSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.any(),
    sideEffects: z.enum(['read', 'write', 'external']).optional(),
  })
  .strict();

export type ToolDefType = z.infer<typeof toolDefSchema>;

/**
 * Registry-side serialized tool definition. Stored in `ai_tool_registry`
 * (Phase 2.1). `inputJsonSchema` is the JSON-Schema rendering of the Zod
 * schema (via `zod-to-json-schema`).
 */
export interface AiToolDef {
  name: string;
  description: string;
  inputJsonSchema: object;
  scopes: string[];
  pluginName: string;
  sideEffects?: ToolSideEffects;
  lastSeenAt: Date;
}

export const aiToolDefSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    inputJsonSchema: z.record(z.unknown()),
    scopes: z.array(z.string()),
    pluginName: z.string(),
    sideEffects: z.enum(['read', 'write', 'external']).optional(),
    lastSeenAt: z.date(),
  })
  .strict();

export type AiToolDefType = z.infer<typeof aiToolDefSchema>;

/* ------------------------------------------------------------------ */
/* Usage / cost accounting                                             */
/* ------------------------------------------------------------------ */

export const usageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();

export type Usage = z.infer<typeof usageSchema>;
export type UsageType = Usage;

/* ------------------------------------------------------------------ */
/* Provider errors                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sanitized provider error. Adapters MUST wrap raw SDK errors in this class
 * before letting them propagate — see PITFALLS §P1. The shape is deliberately
 * narrow: `providerKind`, `model`, optional `statusCode`/`code`, and a
 * redacted `message`. No headers, no request config, no `cause`.
 */
export class ProviderError extends Error {
  public readonly providerKind: ProviderKind;
  public readonly model: string;
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(args: {
    providerKind: ProviderKind;
    model: string;
    statusCode?: number;
    code?: string;
    message: string;
  }) {
    super(args.message);
    this.name = 'ProviderError';
    this.providerKind = args.providerKind;
    this.model = args.model;
    this.statusCode = args.statusCode;
    this.code = args.code;
  }
}

/* ------------------------------------------------------------------ */
/* Chat / embed request + response shapes (consumed by ILLMProvider)   */
/* ------------------------------------------------------------------ */

export const chatRequestSchema = z
  .object({
    model: z.string(),
    messages: z.array(chatMessageSchema),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
    tools: z.array(toolDefSchema).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z
  .object({
    content: z.string(),
    finishReason: z
      .enum(['stop', 'length', 'tool_calls', 'content_filter', 'error'])
      .optional(),
    usage: usageSchema,
    toolCalls: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const embedRequestSchema = z
  .object({
    model: z.string(),
    input: z.union([z.string(), z.array(z.string())]),
  })
  .strict();

export type EmbedRequest = z.infer<typeof embedRequestSchema>;

export const embedResponseSchema = z
  .object({
    embeddings: z.array(z.array(z.number())),
    usage: usageSchema,
  })
  .strict();

export type EmbedResponse = z.infer<typeof embedResponseSchema>;

/* ------------------------------------------------------------------ */
/* Model info                                                          */
/* ------------------------------------------------------------------ */

export type ModelCapability = 'chat' | 'embed' | 'vision' | 'tools';

export interface ModelInfo {
  id: string;
  providerKind: ProviderKind;
  contextWindow: number;
  capabilities: ModelCapability[];
}

export const modelInfoSchema = z
  .object({
    id: z.string(),
    providerKind: z.enum([
      'openai',
      'anthropic',
      'google',
      'azure',
      'ollama',
      'custom',
    ]),
    contextWindow: z.number().int().positive(),
    capabilities: z.array(z.enum(['chat', 'embed', 'vision', 'tools'])),
  })
  .strict();

export type ModelInfoType = z.infer<typeof modelInfoSchema>;
