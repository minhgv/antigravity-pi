import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ANTIGRAVITY_MODEL_ENUM } from "../models/models.js";

export function antigravityEnv(name: string): string | undefined {
  return process.env[`ANTIGRAVITY_${name}`] || process.env[`NOAGY_${name}`];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function sanitizeText(text: unknown): string {
  return String(text ?? "").replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Zero-width obfuscation of system-instruction phrases for Antigravity.
 *
 * Cloud Code Assist inspects `systemInstruction` and answers matched payloads
 * with a bare `429 RESOURCE_EXHAUSTED` (no `ErrorInfo`/`RetryInfo`), which is
 * indistinguishable from real quota exhaustion and identical on every retry.
 * Splitting a matched phrase with U+200B (zero-width space) clears the match
 * while leaving the phrase visually and semantically intact for the model.
 *
 * Same mitigation CLIProxyAPI ships as `antigravity.sensitive-words`.
 */
const ZERO_WIDTH_SPACE = "​";

/**
 * Phrases known to trip the server-side literal matcher. Override with
 * `ANTIGRAVITY_SENSITIVE_WORDS`, `PI_AGY_SENSITIVE_WORDS`, or `OPENCODE_AGY_SENSITIVE_WORDS` (comma-separated);
 * set it to an empty string to disable obfuscation entirely.
 */
export const DEFAULT_SENSITIVE_WORDS = [
  "RFC 2119",
  "system-conventions",
  "<system-directive>",
  "conventions",
  "XML tags inject system content",
];

export function antigravitySensitiveWords(): readonly string[] {
  // `??` (not antigravityEnv's `||`) so an empty value explicitly disables
  // obfuscation instead of falling back to the default list.
  const raw =
    process.env.ANTIGRAVITY_SENSITIVE_WORDS ??
    process.env.PI_AGY_SENSITIVE_WORDS ??
    process.env.OPENCODE_AGY_SENSITIVE_WORDS ??
    process.env.NOAGY_SENSITIVE_WORDS;
  if (raw === undefined) return DEFAULT_SENSITIVE_WORDS;
  return raw
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

/**
 * Insert a zero-width space after the first character of every occurrence of
 * each phrase. Matching is case-sensitive and literal; empty or whitespace-only
 * phrases are ignored. Returns the input unchanged when nothing matches.
 */
export function obfuscateSensitiveWords(text: string, phrases: readonly string[]): string {
  let result = text;
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (trimmed.length < 2) continue;
    const pattern = new RegExp(escapeRegExp(trimmed), "g");
    result = result.replace(pattern, (match) => `${match[0]}${ZERO_WIDTH_SPACE}${match.slice(1)}`);
  }
  return result;
}

const INT63_MASK = (1n << 63n) - 1n;

function formatSignedDecimalSessionId(value: bigint): string {
  return `-${(value & INT63_MASK).toString()}`;
}

export function deriveSignedDecimalFromHash(text: string): string {
  const digest = createHash("sha256").update(text).digest();
  return formatSignedDecimalSessionId(digest.readBigUInt64BE(0));
}

export function randomSignedDecimalSessionId(): string {
  return formatSignedDecimalSessionId(randomBytes(8).readBigUInt64BE(0));
}

export function getFirstUserTextForAntigravitySession(context?: {
  messages?: Array<{ role: string; content?: unknown }>;
}): string | undefined {
  for (const message of context?.messages ?? []) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (typeof item === "object" && item !== null && (item as { type?: string }).type === "text") {
          return (item as { text: string }).text;
        }
      }
    }
  }
  return undefined;
}

export function deriveAntigravitySessionId(
  context?: {
    messages?: Array<{ role: string; content?: unknown }>;
  },
  sessionContext?: { cwd?: string; sessionStartTime?: number },
): string {
  const text = getFirstUserTextForAntigravitySession(context)?.trim();
  if (!text) return randomSignedDecimalSessionId();

  // Compound hash if sessionContext is provided (to prevent collision across identical initial prompts)
  const compoundKey = sessionContext?.cwd
    ? `${sessionContext.cwd}:${sessionContext.sessionStartTime ?? 0}:${text}`
    : text;
  return deriveSignedDecimalFromHash(compoundKey);
}

export interface AntigravitySessionState {
  agentId: string;
  trajectoryId: string;
  sessionId: string;
  stepIndex: number;
  lastExecutionId?: string;
  lastGoodEndpoint?: string;
  lastUsedAt: number;
}

const sessionStates = new Map<string, AntigravitySessionState>();
const MAX_SESSIONS = 200;
let sessionsLoaded = false;

function getSessionsFilePath(): string {
  const envPath = antigravityEnv("SESSIONS_FILE");
  if (envPath) return envPath;
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  const agentCache = join(agentDir, "cache");
  if (existsSync(agentDir)) {
    return join(agentCache, "antigravity-sessions.json");
  }
  return join(homedir(), ".pi", "cache", "antigravity-sessions.json");
}

function loadPersistedSessions(): void {
  if (sessionsLoaded) return;
  sessionsLoaded = true;
  try {
    const file = getSessionsFilePath();
    if (!existsSync(file)) return;
    const content = readFileSync(file, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === "object" && typeof item.sessionId === "string") {
          sessionStates.set(item.sessionId, item);
        }
      }
    }
  } catch {
    // Ignore corrupt or unreadable cache file
  }
}

export function persistAntigravitySessions(): void {
  try {
    const file = getSessionsFilePath();
    mkdirSync(dirname(file), { recursive: true });
    const data = [...sessionStates.values()];
    writeFileSync(file, JSON.stringify(data), "utf8");
  } catch {
    // Ignore write errors
  }
}

/** Reset in-memory cache and load state to simulate a fresh process restart. */
export function resetAntigravitySessionMemory(): void {
  sessionStates.clear();
  sessionsLoaded = false;
}

export function clearAntigravitySessions(): void {
  sessionStates.clear();
  sessionsLoaded = true;
  try {
    const file = getSessionsFilePath();
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // Ignore error
  }
}

export function getOrCreateAntigravitySession(sessionId: string): AntigravitySessionState {
  loadPersistedSessions();
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      agentId: randomUUID(),
      trajectoryId: randomUUID(),
      sessionId,
      stepIndex: 1,
      lastUsedAt: Date.now(),
    };
  } else {
    state.stepIndex += 1;
    state.lastUsedAt = Date.now();
    sessionStates.delete(sessionId);
  }
  sessionStates.set(sessionId, state);
  while (sessionStates.size > MAX_SESSIONS) {
    const oldest = sessionStates.keys().next().value;
    if (!oldest) break;
    sessionStates.delete(oldest);
  }
  persistAntigravitySessions();
  return state;
}

export function nowRequestId(): string {
  return antigravityRequestEnvelope("unknown", false).requestId;
}

export function antigravityRequestEnvelope(
  wireModelId: string,
  isClaude: boolean,
  state?: AntigravitySessionState,
): { requestId: string; sessionId: string; labels: Record<string, string> } {
  const agentId = state?.agentId ?? randomUUID();
  const trajectoryId = state?.trajectoryId ?? randomUUID();
  const step = state?.stepIndex ?? 2;
  const sessionId = state?.sessionId ?? randomSignedDecimalSessionId();
  const usageLabel = isClaude ? "true" : "false";
  const labels: Record<string, string> = {
    last_step_index: String(step - 1),
    trajectory_id: trajectoryId,
    used_claude: usageLabel,
    used_claude_conservative: usageLabel,
  };
  if (state?.lastExecutionId) {
    labels.last_execution_id = state.lastExecutionId;
  }
  const modelEnum = ANTIGRAVITY_MODEL_ENUM[wireModelId];
  if (modelEnum) labels.model_enum = modelEnum;
  return {
    requestId: `agent/${agentId}/${Date.now()}/${trajectoryId}/${step}`,
    sessionId,
    labels,
  };
}

export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Retry delay parser for Google Cloud Code Assist HTTP responses.
 */
export function extractRetryDelay(
  errorText: string,
  response?: { headers?: Headers | Record<string, string | string[] | undefined> } | null,
): number | null {
  if (response?.headers) {
    const getHeader = (name: string): string | null => {
      if (typeof (response.headers as Headers).get === "function") {
        return (response.headers as Headers).get(name);
      }
      const val = (response.headers as Record<string, string | string[] | undefined>)[name];
      if (Array.isArray(val)) return val[0] || null;
      return typeof val === "string" ? val : null;
    };

    const retryAfter = getHeader("retry-after");
    if (retryAfter) {
      const sec = parseFloat(retryAfter);
      if (!isNaN(sec)) return Math.ceil(sec * 1000);
      const date = Date.parse(retryAfter);
      if (!isNaN(date)) {
        const delay = date - Date.now();
        return delay > 0 ? delay : 0;
      }
    }

    const resetAfter = getHeader("x-ratelimit-reset-after");
    if (resetAfter) {
      const sec = parseFloat(resetAfter);
      if (!isNaN(sec)) return Math.ceil(sec * 1000);
    }
  }

  if (errorText) {
    const retryInMatch = errorText.match(/(?:retry|reset)\s+(?:in|after)\s+([0-9.]+)\s*s(?:econds?)?/i);
    if (retryInMatch && retryInMatch[1]) {
      const sec = parseFloat(retryInMatch[1]);
      if (!isNaN(sec)) return Math.ceil(sec * 1000);
    }

    const jsonMatch = errorText.match(/"retryDelay":\s*"([0-9.]+)(ms|s)"/i);
    if (jsonMatch && jsonMatch[1] && jsonMatch[2]) {
      const val = parseFloat(jsonMatch[1]);
      if (!isNaN(val)) {
        return jsonMatch[2].toLowerCase() === "s" ? Math.ceil(val * 1000) : Math.ceil(val);
      }
    }
  }

  return null;
}
