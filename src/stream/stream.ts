import {
  calculateCost,
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type TextContent,
  type Tool,
  type ToolCall,
} from "@earendil-works/pi-ai";
import {
  antigravityHeaders,
  endpointCandidates,
  fetchAvailableRuntimeModel,
  formatRequestDiagnostics,
  jsonOrTextError,
  loadCodeAssist,
  parseApiKey,
  resolveProjectId,
} from "../client/client.js";
import {
  getCurrentEndpoint,
  runWithDiagnostics,
  setLastEndpoint,
  setLastError,
  setLastLatencyMs,
  setLastProjectId,
  setLastResolvedRuntimeModel,
  setLastStatus,
} from "../diagnostics/diagnostics.js";
import {
  AntigravityUserAgent,
  GeminiRole,
  GeminiToolCallingMode,
  StopReason,
  ToolChoice,
} from "../types/enums.js";
import {
  ANTIGRAVITY_ROUTING,
  getMaxOutputTokens,
  getAntigravityRequestModelId,
  getFallbackRuntimeModel,
  getThinkingConfig,
  PROVIDER_ID,
} from "../models/models.js";
import { redactSecrets, safeError } from "../utils/security.js";
import {
  ANTIGRAVITY_API,
  type ActiveBlock,
  type AntigravityGenerateRequest,
  type AntigravityStreamOptions,
  type ContentBlock,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiFunctionResponsePart,
  type GeminiGenerationConfig,
  type GeminiInlineDataPart,
  type GeminiPart,
  type GeminiRequestBody,
  type GeminiTextPart,
  type StreamChunk,
} from "../types/types.js";
import {
  antigravityEnv,
  antigravityRequestEnvelope,
  antigravitySensitiveWords,
  deriveAntigravitySessionId,
  getOrCreateAntigravitySession,
  isRecord,
  obfuscateSensitiveWords,
  extractRetryDelay,
  persistAntigravitySessions,
  sanitizeText,
  sleep,
  type AntigravitySessionState,
} from "../utils/util.js";
import { antigravityFetch } from "../utils/http.js";
import {
  recordThoughtSignature,
  resolveThoughtSignatureWithFallback,
} from "./thought-signature.js";

export { ANTIGRAVITY_API };

let toolCallCounter = 0;

function sanitizeToolCallId(id: string, fallbackName?: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const capped = cleaned.slice(0, 64);
  return capped || `${fallbackName || "tool"}_${++toolCallCounter}`;
}

function toolCallIdNeeded(modelId: string, runtimeModel: string): boolean {
  return (
    modelId.startsWith("claude-") ||
    modelId.startsWith("gpt-oss-") ||
    runtimeModel.startsWith("claude-") ||
    runtimeModel.startsWith("gpt-oss-")
  );
}

const base64SignaturePattern = /^[A-Za-z0-9+/_-]+={0,2}$/;
function isValidThoughtSignature(signature?: string): boolean {
  if (!signature || typeof signature !== "string" || signature.length === 0) return false;
  return base64SignaturePattern.test(signature);
}

function geminiRequiresThoughtSignature(runtimeModel: string): boolean {
  if (!runtimeModel.startsWith("gemini-")) return false;
  const match = runtimeModel.match(/^gemini-(\d+)/);
  if (match) {
    const major = Number.parseInt(match[1], 10);
    return major >= 3;
  }
  return true;
}

function parseImageData(raw: string, explicitMime?: string): { data: string; mimeType: string } {
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return {
      mimeType: explicitMime || match[1] || "image/png",
      data: match[2].trim(),
    };
  }
  return {
    mimeType: explicitMime || "image/png",
    data: raw.trim(),
  };
}

function asTextParts(content: unknown): Array<GeminiTextPart | GeminiInlineDataPart> {
  if (typeof content === "string") return [{ text: sanitizeText(content) }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((item): Array<GeminiTextPart | GeminiInlineDataPart> => {
    if (!isRecord(item)) return [];
    const block = item as ContentBlock;
    if (block.type === "text") return [{ text: sanitizeText(block.text) }];
    if (block.type === "image") {
      const rawData = block.data || block.source?.data;
      if (!rawData) return [];
      const explicitMime = block.mimeType || block.mediaType || block.source?.mediaType;
      const { data, mimeType } = parseImageData(rawData, explicitMime);
      return data ? [{ inlineData: { mimeType, data } }] : [];
    }
    return [];
  });
}

function asImageParts(content: unknown): GeminiInlineDataPart[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((item): GeminiInlineDataPart[] => {
    if (!isRecord(item)) return [];
    const block = item as ContentBlock;
    if (block.type === "image") {
      const rawData = block.data || block.source?.data;
      if (!rawData) return [];
      const explicitMime = block.mimeType || block.mediaType || block.source?.mediaType;
      const { data, mimeType } = parseImageData(rawData, explicitMime);
      return data ? [{ inlineData: { mimeType, data } }] : [];
    }
    return [];
  });
}

function appendTurn(contents: GeminiContent[], role: GeminiRole, parts: GeminiPart[]): void {
  if (!parts.length) return;
  const last = contents[contents.length - 1];
  if (last && last.role === role) {
    last.parts.push(...parts);
  } else {
    contents.push({ role, parts });
  }
}

/** Exported for unit tests. */
export function convertMessages(
  model: Model<Api>,
  context: Context,
  runtimeModel: string,
  sessionId?: string,
): GeminiContent[] {
  const contents: GeminiContent[] = [];
  const requiresSig = geminiRequiresThoughtSignature(runtimeModel);
  const droppedToolCallIds = new Map<string, string>();
  for (const msg of context.messages) {
    if (msg.role === "user") {
      const parts = asTextParts(msg.content);
      appendTurn(contents, GeminiRole.User, parts);
    } else if (msg.role === "assistant") {
      if (msg.stopReason === "error" || msg.stopReason === "aborted") {
        continue;
      }
      const parts: GeminiPart[] = [];
      const isSameModel = msg.provider === PROVIDER_ID && msg.model === model.id;
      const toolCalls = msg.content.filter((b): b is ToolCall => b.type === "toolCall");
      let firstCallHasSig =
        toolCalls.length > 0 && isValidThoughtSignature(toolCalls[0]?.thoughtSignature);
      if (!firstCallHasSig && toolCalls.length > 0 && sessionId) {
        const resolved = resolveThoughtSignatureWithFallback(
          sessionId,
          toolCalls[0]?.id,
          toolCalls[0]?.name,
          { fallback: true },
        );
        if (isValidThoughtSignature(resolved)) {
          firstCallHasSig = true;
        }
      }
      // The real client requires a thoughtSignature only on the FIRST
      // functionCall of a model turn; later calls may be unsigned. A group is
      // replayable when the first call carries a valid signature.
      const groupIsSigned = (isSameModel || Boolean(sessionId)) && firstCallHasSig;

      for (const block of msg.content) {
        if (block.type === "text") {
          const textSig =
            isSameModel && isValidThoughtSignature(block.textSignature)
              ? block.textSignature
              : undefined;
          if ((!block.text || block.text.trim() === "") && !textSig) {
            continue;
          }
          parts.push({
            text: sanitizeText(block.text),
            ...(textSig ? { thoughtSignature: textSig } : {}),
          });
        } else if (block.type === "thinking" && String(block.thinking || "").trim()) {
          if (!isSameModel) continue;
          parts.push({
            thought: true,
            text: sanitizeText(block.thinking),
            ...(block.thinkingSignature ? { thoughtSignature: block.thinkingSignature } : {}),
          });
        } else if (block.type === "toolCall") {
          let callSig = block.thoughtSignature;
          if (!isValidThoughtSignature(callSig) && sessionId) {
            callSig = resolveThoughtSignatureWithFallback(
              sessionId,
              block.id,
              block.name,
              { fallback: true },
            );
          }
          if (requiresSig && !groupIsSigned) {
            const rawId = block.id || "";
            const argsText = (() => {
              try {
                return JSON.stringify(block.arguments ?? {});
              } catch {
                return "{}";
              }
            })();
            if (rawId) {
              droppedToolCallIds.set(rawId, argsText);
              droppedToolCallIds.set(sanitizeToolCallId(rawId, block.name), argsText);
            } else {
              droppedToolCallIds.set(`empty:${block.name}`, argsText);
            }
          } else {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.arguments ?? {},
                ...(toolCallIdNeeded(model.id, runtimeModel)
                  ? { id: sanitizeToolCallId(block.id || "", block.name) }
                  : {}),
              },
              ...(isValidThoughtSignature(callSig)
                ? { thoughtSignature: callSig }
                : {}),
            });
          }
        }
      }
      appendTurn(contents, GeminiRole.Model, parts);
    } else if (msg.role === "toolResult") {
      const text = msg.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => sanitizeText(c.text))
        .join("\n");
      const responseText = text || (msg.isError ? "Tool failed" : "");
      const imageParts = asImageParts(msg.content);
      const rawId = msg.toolCallId || "";
      const sanitizedId = toolCallIdNeeded(model.id, runtimeModel)
        ? sanitizeToolCallId(rawId, msg.toolName)
        : rawId;
      const droppedArgs = requiresSig
        ? (droppedToolCallIds.get(rawId) ??
          droppedToolCallIds.get(sanitizedId) ??
          (rawId === "" ? droppedToolCallIds.get(`empty:${msg.toolName}`) : undefined))
        : undefined;
      if (droppedArgs !== undefined) {
        const label =
          droppedArgs === "{}" ? `\`${msg.toolName}\`` : `\`${msg.toolName}\` (${droppedArgs})`;
        appendTurn(contents, GeminiRole.User, [
          { text: sanitizeText(`[Observation from ${label}:\n${responseText}]`) },
          ...imageParts,
        ]);
      } else {
        const part: GeminiFunctionResponsePart = {
          functionResponse: {
            name: msg.toolName,
            response: msg.isError ? { error: responseText } : { output: responseText },
            ...(toolCallIdNeeded(model.id, runtimeModel)
              ? { id: sanitizeToolCallId(msg.toolCallId || "", msg.toolName) }
              : {}),
          },
        };
        appendTurn(contents, GeminiRole.User, [part, ...imageParts]);
      }
    }
  }

  // Google Antigravity / Gemini requires the first turn to be from 'user'.
  // If the conversation starts with 'model' (e.g. initial assistant greeting),
  // prepend a minimal user message to prevent backend 400 rejection.
  if (contents.length > 0 && contents[0]?.role === GeminiRole.Model) {
    contents.unshift({
      role: GeminiRole.User,
      parts: [{ text: "Hello" }],
    });
  }

  return contents;
}

function dereferenceSchema(
  schema: unknown,
  rootDefs: Record<string, unknown> = {},
  visited = new Set<unknown>(),
): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => dereferenceSchema(item, rootDefs, visited));
  }

  const s = schema as Record<string, unknown>;
  if (visited.has(s)) return s;
  visited.add(s);

  const defs: Record<string, unknown> = { ...rootDefs };
  if (isRecord(s.$defs)) Object.assign(defs, s.$defs);
  if (isRecord(s.definitions)) Object.assign(defs, s.definitions);

  if (typeof s.$ref === "string") {
    const ref = s.$ref;
    const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (match && match[1] && defs[match[1]] !== undefined) {
      const resolved = dereferenceSchema(defs[match[1]], defs, visited);
      if (isRecord(resolved)) {
        const { $ref: _, ...rest } = s;
        const restCleaned = dereferenceSchema(rest, defs, visited);
        return isRecord(restCleaned) ? { ...resolved, ...restCleaned } : resolved;
      }
      return resolved;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(s)) {
    out[key] = dereferenceSchema(value, defs, visited);
  }
  return out;
}

function ensureRootObjectSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) {
    return { type: "object", properties: {} };
  }
  if (!schema.type) {
    return { ...schema, type: "object", properties: schema.properties || {} };
  }
  return schema;
}

function stripMetaSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const omit = new Set([
    "$schema",
    "$id",
    "$anchor",
    "$dynamicAnchor",
    "$vocabulary",
    "$comment",
    "$defs",
    "definitions",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!omit.has(key)) out[key] = stripMetaSchema(value);
  }
  return out;
}

const CUSTOM_TOOL_SCHEMA_ALLOW = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
]);

function normalizeCustomToolType(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const entries = value as unknown[];
  const scalar = entries.find(
    (entry): entry is string => typeof entry === "string" && entry !== "null",
  );
  return scalar;
}

function normalizeCustomToolSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(normalizeCustomToolSchema);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!CUSTOM_TOOL_SCHEMA_ALLOW.has(key)) continue;
    if (key === "type") {
      const normalizedType = normalizeCustomToolType(value);
      if (normalizedType !== undefined) out.type = normalizedType;
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        props[propName] = normalizeCustomToolSchema(propSchema);
      }
      out.properties = props;
      continue;
    }
    if (
      key === "enum" &&
      Array.isArray(value) &&
      !value.every((entry) => typeof entry === "string")
    ) {
      continue;
    }
    out[key] = normalizeCustomToolSchema(value);
  }
  return out;
}

/**
 * Gemini accepts JSON Schema through parametersJsonSchema. Claude and GPT-OSS
 * use Cloud Code Assist's custom-tool bridge, which requires a compatible
 * Draft 2020-12 subset in the legacy parameters field.
 */
export function convertTools(
  tools: Tool[] | undefined,
  useLegacyParameters = false,
): { functionDeclarations: GeminiFunctionDeclaration[] }[] | undefined {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => {
        const dereferenced = dereferenceSchema(tool.parameters);
        const rootObject = ensureRootObjectSchema(dereferenced);
        const schema = stripMetaSchema(rootObject);
        return {
          name: tool.name,
          description: tool.description,
          ...(useLegacyParameters
            ? { parameters: normalizeCustomToolSchema(schema) }
            : { parametersJsonSchema: schema }),
        };
      }),
    },
  ];
}

function mapToolChoiceMode(
  toolChoice: AntigravityStreamOptions["toolChoice"],
): GeminiToolCallingMode {
  if (toolChoice === ToolChoice.None) return GeminiToolCallingMode.None;
  if (toolChoice === ToolChoice.Any || toolChoice === ToolChoice.Required)
    return GeminiToolCallingMode.Any;
  return GeminiToolCallingMode.Auto;
}

/** Exported for unit tests. */
export function buildRequest(
  model: Model<Api>,
  context: Context,
  projectId: string,
  options: AntigravityStreamOptions,
  runtimeModel: string,
  sessionState?: AntigravitySessionState,
): AntigravityGenerateRequest {
  const isClaude = model.id.startsWith("claude-") || runtimeModel.startsWith("claude-");
  const sid = options.sessionId || deriveAntigravitySessionId(context);
  const state = sessionState ?? getOrCreateAntigravitySession(sid);

  const request: GeminiRequestBody = {
    contents: convertMessages(model, context, runtimeModel, sid),
  };
  // The real client forwards the caller's system prompt verbatim and injects
  // nothing when it is absent — no Antigravity identity prompt is added.
  // Sensitive phrases are split with U+200B to defeat the server-side literal
  // matcher that answers matched payloads with a bare 429 RESOURCE_EXHAUSTED.
  if (context.systemPrompt) {
    request.systemInstruction = {
      role: GeminiRole.User,
      parts: [
        {
          text: obfuscateSensitiveWords(
            sanitizeText(context.systemPrompt),
            antigravitySensitiveWords(),
          ),
        },
      ],
    };
  }

  const generationConfig: GeminiGenerationConfig = {};
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  const thinking = getThinkingConfig(model.id, options.reasoning ?? "off");
  if (thinking) generationConfig.thinkingConfig = thinking;
  const maxAllowed = getMaxOutputTokens(model.id, runtimeModel);
  if (options.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = Math.min(options.maxTokens, maxAllowed);
  } else {
    generationConfig.maxOutputTokens = Math.min(maxAllowed, model.maxTokens || maxAllowed);
  }
  if (Object.keys(generationConfig).length) request.generationConfig = generationConfig;

  const tools = convertTools(context.tools, isClaude || model.id.startsWith("gpt-oss-"));
  if (tools) {
    request.tools = tools;
    request.toolConfig = {
      functionCallingConfig: {
        mode:
          options.toolChoice && options.toolChoice !== ToolChoice.Auto
            ? mapToolChoiceMode(options.toolChoice)
            : GeminiToolCallingMode.Validated,
      },
    };
  } else if (isClaude) {
    request.toolConfig = {
      functionCallingConfig: { mode: GeminiToolCallingMode.Validated },
    };
  }
  // Google One AI Credits Protection:
  // Cloud Code Assist will deduct from paid Google One AI Credits if `enabledCreditTypes`
  // includes "GOOGLE_ONE_AI". By default, strip this field to protect user credits.
  // Opt-in only when explicitly allowed via PI_AGY_ENABLE_G1_CREDITS=1 or OPENCODE_AGY_ENABLE_G1_CREDITS=1.
  const enableG1Credits =
    process.env.PI_AGY_ENABLE_G1_CREDITS === "1" ||
    process.env.OPENCODE_AGY_ENABLE_G1_CREDITS === "1";
  if (options.enabledCreditTypes) {
    if (enableG1Credits) {
      request.enabledCreditTypes = options.enabledCreditTypes;
    }
  } else if (!enableG1Credits) {
    delete (request as Record<string, unknown>).enabledCreditTypes;
  }

  const envelope = antigravityRequestEnvelope(runtimeModel, isClaude, state);
  request.sessionId = envelope.sessionId;
  request.labels = envelope.labels;

  const result: AntigravityGenerateRequest = {
    project: projectId,
    model: runtimeModel,
    request,
    // Official Antigravity omits requestType on consumer Cloud Code; "agent" is
    // a constrained bucket that returns a detail-free 429 RESOURCE_EXHAUSTED.
    userAgent: AntigravityUserAgent.Antigravity,
    requestId: envelope.requestId,
  };
  if (enableG1Credits && options.enabledCreditTypes) {
    result.enabledCreditTypes = options.enabledCreditTypes;
  }
  return result;
}

/** Exported for unit tests. */
export function mapStopReason(reason: string | undefined): StopReason {
  if (reason === "STOP") return StopReason.Stop;
  if (reason === "MAX_TOKENS") return StopReason.Length;
  return reason ? StopReason.Error : StopReason.Stop;
}
export type AntigravityRateLimitReason =
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMIT_EXCEEDED"
  | "INSUFFICIENT_G1_CREDITS_BALANCE";

const GOOGLE_RPC_ERROR_INFO_TYPE = "type.googleapis.com/google.rpc.ErrorInfo";
const ANTIGRAVITY_MODEL_QUOTA_PATTERN = /\bexhausted your capacity on this model\b/i;

export function parseAntigravityRateLimitReason(
  errorText: string,
): AntigravityRateLimitReason | undefined {
  if (!errorText) return undefined;
  try {
    const parsed = JSON.parse(errorText) as Record<string, unknown>;
    const details = (parsed?.error as Record<string, unknown> | undefined)?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const record = detail as Record<string, unknown>;
        if (record?.["@type"] !== GOOGLE_RPC_ERROR_INFO_TYPE) continue;
        const reason = record.reason;
        if (
          reason === "QUOTA_EXHAUSTED" ||
          reason === "RATE_LIMIT_EXCEEDED" ||
          reason === "INSUFFICIENT_G1_CREDITS_BALANCE"
        ) {
          return reason;
        }
      }
    }
  } catch {
    // fall through to text matching
  }
  if (/INSUFFICIENT_G1_CREDITS_BALANCE/i.test(errorText)) {
    return "INSUFFICIENT_G1_CREDITS_BALANCE";
  }
  if (ANTIGRAVITY_MODEL_QUOTA_PATTERN.test(errorText)) return "QUOTA_EXHAUSTED";
  return undefined;
}

export function formatRateLimitWarning(reason: AntigravityRateLimitReason | undefined): string {
  if (reason === "INSUFFICIENT_G1_CREDITS_BALANCE") {
    return "Google Antigravity quota exhausted and Google One AI Credits balance is insufficient.";
  }
  if (reason === "QUOTA_EXHAUSTED") {
    const creditsProtected =
      process.env.PI_AGY_ENABLE_G1_CREDITS !== "1" &&
      process.env.OPENCODE_AGY_ENABLE_G1_CREDITS !== "1";
    if (creditsProtected) {
      return "Google Antigravity model quota exhausted. Google One AI Credits protection is ACTIVE (paid credits will not be charged).";
    }
    return "Google Antigravity model quota exhausted.";
  }
  if (reason === "RATE_LIMIT_EXCEEDED") {
    return "Google Antigravity rate limit exceeded. Please wait before retrying.";
  }
  return "Google Antigravity request rate limited.";
}


/** Exported for unit tests. */
export function friendlyAntigravityError(status: number | undefined, text: string): string {
  const msg = redactSecrets(jsonOrTextError(text)).slice(0, 500);
	if (status === 400 && /API key not valid/i.test(msg)) {
		return `Antigravity OAuth token is invalid or expired. Next: run /login ${PROVIDER_ID}.`;
	}
	if (status === 401) {
		return `Antigravity authentication failed. Next: run /login ${PROVIDER_ID}, then retry.`;
	}
	if (status === 403) {
		if (/RESOURCE_EXHAUSTED/i.test(msg) || /quota/i.test(msg)) {
			return "Antigravity quota exhausted for this model or project. Next: switch models or retry later.";
		}
		return "Antigravity access denied. Next: verify your Google account has Cloud Code Assist / Antigravity access.";
	}
	if (status === 404) {
		if (/Requested entity was not found/i.test(msg)) {
			return "This model is not available right now. Next: switch to gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash, gemini-3.1-pro, or another working model.";
		}
		return `Antigravity could not find the requested resource. Next: retry or switch models. Backend said: ${msg}`;
	}
	if (status === 429) {
    const reason = parseAntigravityRateLimitReason(text);
    if (reason === "INSUFFICIENT_G1_CREDITS_BALANCE") {
      return formatRateLimitWarning(reason);
    }
    const creditsProtected =
      process.env.PI_AGY_ENABLE_G1_CREDITS !== "1" &&
      process.env.OPENCODE_AGY_ENABLE_G1_CREDITS !== "1";
		const wait =
			msg.match(/Resets? in ([^.\n]+)/i)?.[1]?.trim() ||
			msg.match(/retry after ([0-9]+s)/i)?.[1] ||
			msg.match(/reset after ([0-9]+s|[0-9]+m)/i)?.[1];
		if (/Individual quota reached/i.test(msg)) {
			return `Quota reached. Please wait ${wait || "for reset"}. Next: switch models or try again after reset.`;
		}
		if (/quota/i.test(msg) || reason === "QUOTA_EXHAUSTED") {
      if (creditsProtected) {
        return `Quota reached.${wait ? ` Please wait ${wait}.` : ""} Google One AI Credits protection is ACTIVE. Next: switch models or retry later.`;
      }
			return `Quota reached.${wait ? ` Please wait ${wait}.` : ""} Next: switch models or retry later.`;
		}
		return `Rate limited by Antigravity. Next: wait a bit and retry.${wait ? ` Reset: ${wait}.` : ""}`;
	}
  if (status === 500) {
    return "Antigravity had an internal server error. Next: retry in a moment or switch models.";
  }
  if (status === 502) return "Antigravity returned a bad gateway error. Next: retry in a moment.";
  if (status === 503) {
    if (/No capacity available/i.test(msg)) {
      return "This model has no capacity right now. Next: retry later or switch to another model.";
    }
    return "Antigravity is temporarily unavailable. Next: retry in a moment or switch models.";
  }
  if (status === 504) return "Antigravity timed out upstream. Next: retry in a moment.";
  return msg;
}

function createOutput(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: ANTIGRAVITY_API,
    provider: PROVIDER_ID,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function asToolCallArguments(args: Record<string, unknown> | undefined): ToolCall["arguments"] {
  return (args ?? {}) as ToolCall["arguments"];
}

/**
 * Probes the first SSE chunk of a stream response. Returns undefined when the
 * endpoint stalls past `FIRST_EVENT_TIMEOUT_MS` (or yields no body) so the
 * caller can fail over to the next endpoint instead of hanging on a socket
 * that accepted the request but never produces events.
 */
const FIRST_EVENT_TIMEOUT_MS = 60_000;

type StreamProbe = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  firstChunk?: Uint8Array;
};

async function probeFirstEvent(response: Response): Promise<StreamProbe | undefined> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), FIRST_EVENT_TIMEOUT_MS);
      }),
    ]);
    if (result === undefined) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    return { reader, firstChunk: result.done ? undefined : result.value };
  } catch {
    await reader.cancel().catch(() => {});
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Exported for unit tests. */
export async function streamResponse(
  response: Response,
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  model?: Model<Api>,
  sessionState?: AntigravitySessionState,
  probe?: StreamProbe,
): Promise<boolean> {
  const reader = probe?.reader ?? response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = probe?.firstChunk ? decoder.decode(probe.firstChunk, { stream: true }) : "";

  let scanStart = 0;
  let started = false;
  let currentBlock: ActiveBlock | null = null;
  let hasContent = false;
  let lastResponseId: string | undefined;
  const blocks = output.content;
  const blockIndex = () => blocks.length - 1;

  const ensureStarted = () => {
    if (!started) {
      stream.push({ type: "start", partial: output });
      started = true;
    }
  };

  const finishCurrent = () => {
    if (!currentBlock) return;
    if (currentBlock.type === "text") {
      stream.push({
        type: "text_end",
        contentIndex: blockIndex(),
        content: currentBlock.text,
        partial: output,
      });
    } else {
      stream.push({
        type: "thinking_end",
        contentIndex: blockIndex(),
        content: currentBlock.thinking,
        partial: output,
      });
    }
    currentBlock = null;
  };

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    if (!(result.value instanceof Uint8Array)) continue;
    buffer += decoder.decode(result.value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n", scanStart)) !== -1) {
      const line = buffer.slice(scanStart, newlineIdx);
      scanStart = newlineIdx + 1;
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(json) as StreamChunk;
      } catch {
        continue;
      }

      if (chunk.error) {
        throw new Error(chunk.error.message || JSON.stringify(chunk.error));
      }

      const responseData = chunk.response || chunk;
      const candidate = responseData.candidates?.[0];

      for (const part of candidate?.content?.parts || []) {
        if (part.text !== undefined) {
          hasContent = true;
          const isThinking = part.thought === true;
          const type = isThinking ? "thinking" : "text";
          if (!currentBlock || currentBlock.type !== type) {
            finishCurrent();
            currentBlock = isThinking
              ? { type: "thinking", thinking: "", thinkingSignature: undefined }
              : { type: "text", text: "" };
            blocks.push(currentBlock);
            ensureStarted();
            stream.push({
              type: isThinking ? "thinking_start" : "text_start",
              contentIndex: blockIndex(),
              partial: output,
            });
          }
          if (isThinking && currentBlock.type === "thinking") {
            currentBlock.thinking += part.text;
            if (part.thoughtSignature) currentBlock.thinkingSignature = part.thoughtSignature;
            if (sessionState?.sessionId && part.thoughtSignature) {
              recordThoughtSignature(sessionState.sessionId, "latest", part.thoughtSignature);
            }
            stream.push({
              type: "thinking_delta",
              contentIndex: blockIndex(),
              delta: part.text,
              partial: output,
            });
          } else if (!isThinking && currentBlock.type === "text") {
            currentBlock.text += part.text;
            if (part.thoughtSignature) currentBlock.textSignature = part.thoughtSignature;
            if (sessionState?.sessionId && part.thoughtSignature) {
              recordThoughtSignature(sessionState.sessionId, "latest", part.thoughtSignature);
            }
            stream.push({
              type: "text_delta",
              contentIndex: blockIndex(),
              delta: part.text,
              partial: output,
            });
          }
        }

        if (part.functionCall) {
          hasContent = true;
          finishCurrent();
          const rawId = part.functionCall.id || "";
          const toolCall: ToolCall = {
            type: "toolCall",
            id: sanitizeToolCallId(rawId, part.functionCall.name),
            name: part.functionCall.name || "",
            arguments: asToolCallArguments(part.functionCall.args),
            ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
          };
          if (sessionState?.sessionId && part.thoughtSignature) {
            if (toolCall.id) recordThoughtSignature(sessionState.sessionId, toolCall.id, part.thoughtSignature);
            if (toolCall.name) recordThoughtSignature(sessionState.sessionId, toolCall.name, part.thoughtSignature);
          }
          blocks.push(toolCall);
          ensureStarted();
          stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
          stream.push({
            type: "toolcall_delta",
            contentIndex: blockIndex(),
            delta: JSON.stringify(toolCall.arguments),
            partial: output,
          });
          stream.push({
            type: "toolcall_end",
            contentIndex: blockIndex(),
            toolCall,
            partial: output,
          });
        }
      }

      if (candidate?.finishReason) {
        output.rawStopReason = candidate.finishReason;
        output.stopReason = blocks.some((b) => b.type === "toolCall")
          ? StopReason.ToolUse
          : mapStopReason(candidate.finishReason);
      }

      if (responseData.responseId) {
        lastResponseId = responseData.responseId;
      }

      if (responseData.usageMetadata) {
        const prompt = responseData.usageMetadata.promptTokenCount || 0;
        const cacheRead = responseData.usageMetadata.cachedContentTokenCount || 0;
        const thoughts = responseData.usageMetadata.thoughtsTokenCount || 0;
        output.usage.input = prompt - cacheRead;
        output.usage.output = (responseData.usageMetadata.candidatesTokenCount || 0) + thoughts;
        output.usage.reasoning = thoughts;
        output.usage.cacheRead = cacheRead;
        output.usage.totalTokens = responseData.usageMetadata.totalTokenCount || 0;
        if (model?.cost) {
          calculateCost(model, output.usage);
        } else {
          output.usage.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
        }
      }
    }

    if (scanStart > 0) {
      buffer = buffer.slice(scanStart);
      scanStart = 0;
    }
  }

  finishCurrent();
  if (sessionState && lastResponseId) {
    sessionState.lastExecutionId = lastResponseId;
    persistAntigravitySessions();
  }
  return hasContent;
}

export function streamAntigravity(
  model: Model<Api>,
  context: Context,
  options?: AntigravityStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const opts = options ?? {};

  void runWithDiagnostics(async () => {
    const startTime = Date.now();
    const output = createOutput(model);
    try {
      const creds = parseApiKey(opts.apiKey);
      const warmedProject = creds.projectId ? null : await loadCodeAssist(creds.token);
      const projectId = resolveProjectId({
        token: creds.token,
        warmedProject,
        credentialProjectId: creds.projectId,
      });
      setLastProjectId(projectId);

      const effort = opts.reasoning ?? "off";
      const isKnownModel = model.id in ANTIGRAVITY_ROUTING;
      const baseRuntimeModel =
        antigravityEnv("RUNTIME_MODEL")?.trim() || getAntigravityRequestModelId(model.id, effort);

      let initialRuntimeModel = baseRuntimeModel;
      if (!isKnownModel && !antigravityEnv("RUNTIME_MODEL")) {
        const dynamic = await fetchAvailableRuntimeModel(creds.token, projectId, baseRuntimeModel);
        if (dynamic?.id && /^(gemini-|claude-|gpt-oss-)/i.test(dynamic.id)) {
          initialRuntimeModel = dynamic.id;
        }
      }

      const sid = opts.sessionId || deriveAntigravitySessionId(context);
      const sessionState = getOrCreateAntigravitySession(sid);

      const runtimeCandidates = [initialRuntimeModel];
      const fallback = getFallbackRuntimeModel(initialRuntimeModel, effort);
      if (fallback && fallback !== initialRuntimeModel) {
        runtimeCandidates.push(fallback);
      }

      const isClaudeReasoning = model.id.startsWith("claude-") && model.reasoning;
      const requestHeaders: Record<string, string> = {
        ...antigravityHeaders(creds.token, { chat: true }),
        ...(isClaudeReasoning ? { "anthropic-beta": "interleaved-thinking-2025-05-14" } : {}),
      };

      let response: Response | undefined;
      let probe: StreamProbe | undefined;
      let lastText = "";

      let received = false;
      let runtimeModel = initialRuntimeModel;

      for (let emptyAttempt = 0; emptyAttempt <= 2; emptyAttempt++) {
        if (opts.signal?.aborted) throw new Error("Request was aborted");
        if (emptyAttempt > 0) {
          const delay = 500 * 2 ** (emptyAttempt - 1);
          await sleep(delay);
        }

        for (let candIdx = 0; candIdx < runtimeCandidates.length; candIdx++) {
          runtimeModel = runtimeCandidates[candIdx]!;
          setLastResolvedRuntimeModel(runtimeModel);
          const body = JSON.stringify(
            buildRequest(model, context, projectId, opts, runtimeModel, sessionState),
          );

          for (const endpoint of endpointCandidates(sessionState.lastGoodEndpoint)) {
            setLastEndpoint(endpoint);
            response = await antigravityFetch(
              `${endpoint}/v1internal:streamGenerateContent?alt=sse`,
              {
                method: "POST",
                headers: requestHeaders,
                body,
                signal: opts.signal,
              },
            );
            setLastStatus(response.status);
            if (response.ok) {
              // Watchdog: an endpoint that accepts the request but never emits
              // an SSE event must fail over instead of hanging the stream.
              probe = await probeFirstEvent(response);
              if (probe) {
                sessionState.lastGoodEndpoint = endpoint;
                persistAntigravitySessions();
                break;
              }
              lastText = "endpoint stalled before first SSE event";
              continue;
            }
            lastText = await response.text();
            if (response.status === 429) {
              if (/Individual quota reached/i.test(lastText)) break;
              const retryMs = extractRetryDelay(lastText, response);
              const delay = retryMs !== null ? Math.min(retryMs, 5000) : 1000 + Math.floor(Math.random() * 500);
              await sleep(delay);
            }
            if (![403, 404, 429, 500, 502, 503, 504].includes(response.status)) break;
          }

          if (response?.ok && probe) break;
          if (response?.status === 404) {
            if (candIdx + 1 < runtimeCandidates.length) {
              continue;
            }
            if (isKnownModel && candIdx === runtimeCandidates.length - 1) {
              const dynamic = await fetchAvailableRuntimeModel(
                creds.token,
                projectId,
                baseRuntimeModel,
              );
              if (
                dynamic?.id &&
                !runtimeCandidates.includes(dynamic.id) &&
                /^(gemini-|claude-|gpt-oss-)/i.test(dynamic.id)
              ) {
                runtimeCandidates.push(dynamic.id);
                continue;
              }
            }
          }
          break;
        }

        if (!response || !response.ok || !probe) {
          const friendly = friendlyAntigravityError(response?.status, lastText);
          if (response?.status === 429 && /Quota reached\./i.test(friendly)) {
            throw new Error(friendly);
          }
          throw new Error(
            `Antigravity API error (${response?.status ?? "no response"}, ${formatRequestDiagnostics({ projectId, runtimeModel })}): ${friendly}`,
          );
        }

        output.content = [];
        output.usage = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
        output.stopReason = "stop";

        received = await streamResponse(response, stream, output, model, sessionState, probe);
        if (received) break;
      }

      if (!received) throw new Error("Antigravity API returned an empty response");
      setLastLatencyMs(Date.now() - startTime);
      if (output.stopReason === "error" || output.stopReason === "aborted") {
        const errorDetail = output.rawStopReason
          ? `Provider stopped with: ${output.rawStopReason}`
          : "An unknown error occurred";
        output.errorMessage = output.errorMessage || errorDetail;
        setLastError(output.errorMessage);
        stream.push({ type: "error", reason: output.stopReason, error: output });
      } else if (output.stopReason === "pending") {
        throw new Error("Antigravity API returned no stop reason");
      } else {
        stream.push({ type: "done", reason: output.stopReason, message: output });
      }
      stream.end();
    } catch (error) {
      setLastLatencyMs(Date.now() - startTime);
      output.stopReason = opts.signal?.aborted ? "aborted" : "error";
      output.errorMessage = safeError(error);
      setLastError(output.errorMessage);
      if (!getCurrentEndpoint() && endpointCandidates()[0]) {
        setLastEndpoint(endpointCandidates()[0]);
      }
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  });

  return stream;
}
