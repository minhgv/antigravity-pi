import { createHash } from "node:crypto";
import { Platform } from "../types/enums.js";
import {
  getCurrentAvailableModels,
  getCurrentEndpoint,
  getCurrentMatchedModelDebug,
  setLastAvailableModels,
  setLastEndpoint,
  setLastError,
  setLastMatchedModelDebug,
  setLastStatus,
} from "../diagnostics/diagnostics.js";
import { assertSafeApiBaseUrl, safeError } from "../utils/security.js";
import type { AntigravityApiKey, DynamicModelInfo } from "../types/types.js";
import { antigravityEnv, asString, escapeRegExp, isRecord } from "../utils/util.js";
import { antigravityFetch } from "../utils/http.js";

export const DEFAULT_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com";
export const ENDPOINT_FALLBACKS = [
  DEFAULT_ENDPOINT,
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
];

const PROJECT_CACHE_TTL_MS = 30 * 60 * 1000;
const projectCache = new Map<string, { projectId: string | undefined; expiresAt: number }>();

const MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
const modelCache = new Map<string, { result: DynamicModelInfo | undefined; expiresAt: number }>();

/** Metadata lookups (project/model discovery) must be fast; a stalled endpoint should
 * fall through to the next candidate instead of hanging the whole request. */
const DISCOVERY_TIMEOUT_MS = 8000;

/** In-flight de-dupe: concurrent requests for the same (token, project, model) share one probe. */
const inFlightModelLookups = new Map<string, Promise<DynamicModelInfo | undefined>>();

/** UUID-shaped stable id from a seed (account email preferred over cwd). */
export function stableProjectId(seed: string): string {
  const bytes = createHash("sha1").update(`antigravity:${seed}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fallback project id when discovery fails.
 * Prefer ANTIGRAVITY_PROJECT_ID, then a stable seed (email), never process.cwd().
 */
export function defaultProjectId(seed = "antigravity-default"): string {
  return antigravityEnv("PROJECT_ID")?.trim() || stableProjectId(seed);
}

export function endpointCandidates(preferredEndpoint?: string): string[] {
  const explicit = antigravityEnv("BASE_URL")?.trim();
  if (explicit) return [assertSafeApiBaseUrl(explicit)];
  if (preferredEndpoint && ENDPOINT_FALLBACKS.includes(preferredEndpoint)) {
    return [preferredEndpoint, ...ENDPOINT_FALLBACKS.filter((e) => e !== preferredEndpoint)];
  }
  return ENDPOINT_FALLBACKS;
}

const DEFAULT_ANTIGRAVITY_VERSION = "2.8.0";
const DEFAULT_ANTIGRAVITY_CL = "963137146";

const ANTIGRAVITY_VERSION_MANIFEST_URL =
  "https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml";
const ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS = 5_000;

let discoveredAntigravityVersion: string | null = null;
let antigravityVersionFetch: Promise<void> | null = null;

/** Current Antigravity client version: env override -> manifest-discovered -> pinned fallback. */
export function getAntigravityVersion(): string {
  return antigravityEnv("HUB_VERSION") || discoveredAntigravityVersion || DEFAULT_ANTIGRAVITY_VERSION;
}

/**
 * Extracts the client version from an electron-builder update manifest.
 * Returns null when no well-formed `version:` line is present.
 */
export function parseAntigravityManifestVersion(yamlText: string): string | null {
  for (const line of yamlText.split(/\r?\n/)) {
    const match = /^\s*version\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const version = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
  }
  return null;
}

/**
 * Resolves the latest Antigravity release from the official update manifest.
 * Success is cached for the process lifetime; failures are silent (the pinned
 * fallback stays valid) and clear the in-flight cache so a later call retries.
 * Skipped entirely when ANTIGRAVITY_HUB_VERSION is set.
 */
export function ensureAntigravityVersion(signal?: AbortSignal): Promise<void> {
  if (antigravityEnv("HUB_VERSION") || discoveredAntigravityVersion) return Promise.resolve();
  if (antigravityVersionFetch) return antigravityVersionFetch;

  antigravityVersionFetch = (async () => {
    try {
      const timeoutSignal = AbortSignal.timeout(ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS);
      const response = await antigravityFetch(ANTIGRAVITY_VERSION_MANIFEST_URL, {
        headers: { "Cache-Control": "no-cache", "User-Agent": "electron-builder" },
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      });
      if (response.ok) {
        discoveredAntigravityVersion = parseAntigravityManifestVersion(await response.text());
      }
    } catch {
      // Silent: the pinned fallback remains valid when version discovery fails.
    } finally {
      if (!discoveredAntigravityVersion) antigravityVersionFetch = null;
    }
  })();
  return antigravityVersionFetch;
}

function defaultUserAgent(): string {
  const version = getAntigravityVersion();
  // The backend does not validate `cl` (verified live: stale, zero, and absent
  // cl all pass model gating on daily-cloudcode-pa; only the version gates).
  // The update manifest carries no changelist, so the captured value stays.
  const cl = antigravityEnv("HUB_CL") || DEFAULT_ANTIGRAVITY_CL;
  const os = antigravityEnv("HUB_OS") || "darwin";
  const arch = antigravityEnv("HUB_ARCH") || "arm64";
  return `antigravity/hub/${version} (aidev_client; os_type=${os}; arch=${arch}; cl=${cl})`;
}

/**
 * `X-Goog-Api-Client` / `Client-Metadata` are sent on provisioning and discovery
 * calls (loadCodeAssist, quota, model list) but NOT on chat stream requests —
 * captured `antigravity/hub` traffic carries only Authorization + User-Agent.
 */
export function antigravityHeaders(
  token: string,
  opts?: { chat?: boolean },
): Record<string, string> {
  const platform =
    process.platform === "darwin"
      ? Platform.Macos
      : process.platform === "win32"
        ? Platform.Windows
        : Platform.Linux;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": antigravityEnv("USER_AGENT") || defaultUserAgent(),
    "x-request-source": "local",
    "Client-Metadata": JSON.stringify({
      ideType: "ANTIGRAVITY",
      platform,
      pluginType: "GEMINI",
    }),
  };
  if (!opts?.chat) {
    headers["X-Goog-Api-Client"] = "google-cloud-sdk vscode_cloudshelleditor/0.1";
  }
  return headers;
}

export function jsonOrTextError(text: string): string {
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string; status?: string; code?: number };
    };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // not JSON
  }
  return text;
}

export function parseApiKey(apiKeyRaw: string | undefined): AntigravityApiKey {
  if (!apiKeyRaw) {
    throw new Error("No Antigravity OAuth credentials. Run /login google-antigravity.");
  }
  try {
    const parsed = JSON.parse(apiKeyRaw) as Partial<AntigravityApiKey>;
    if (!parsed.token || !parsed.projectId) throw new Error("missing token or projectId");
    return { token: parsed.token, projectId: parsed.projectId };
  } catch (error) {
    throw new Error(
      `Invalid Antigravity credentials. Run /login google-antigravity. (${safeError(error)})`,
      { cause: error },
    );
  }
}

export function extractProjectId(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  const direct =
    data.antigravityProjectId ??
    data.projectId ??
    data.backendProjectId ??
    data.userDefinedCloudaicompanionProject ??
    data.cloudaicompanionProject ??
    data.project;
  const directId = asString(direct);
  if (directId) return directId;
  if (isRecord(direct)) {
    const nestedId = asString(direct.id);
    if (nestedId) return nestedId;
  }
  for (const key of ["projects", "projectIds", "cloudaicompanionProjects"]) {
    const value = data[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = extractProjectId(item);
        if (nested) return nested;
        const itemId = asString(item);
        if (itemId) return itemId;
      }
    }
  }
  return undefined;
}

async function listCloudAICompanionProjects(token: string): Promise<string | undefined> {
  for (const endpoint of endpointCandidates()) {
    try {
      const res = await antigravityFetch(`${endpoint}/v1internal:listCloudAICompanionProjects`, {
        method: "POST",
        headers: antigravityHeaders(token),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      setLastStatus(res.status);
      setLastEndpoint(endpoint);
      if (!res.ok) continue;
      return extractProjectId(await res.json());
    } catch (error) {
      setLastError(safeError(error));
    }
  }
  return undefined;
}

function collectModelLabels(value: unknown, out: string[] = []): string[] {
  if (!value || out.length > 50) return out;
  if (typeof value === "string") {
    if (/gemini|claude|gpt-oss/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectModelLabels(item, out);
    return out;
  }
  if (isRecord(value)) {
    for (const key of ["id", "name", "label", "displayName", "model", "modelId"]) {
      collectModelLabels(value[key], out);
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") collectModelLabels(nested, out);
    }
  }
  return out;
}

function summarizeModelCandidate(value: unknown): string {
  if (!isRecord(value)) return String(value ?? "none");
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/token|auth|credential|secret|email/i.test(key)) continue;
    if (raw === null || ["string", "number", "boolean"].includes(typeof raw)) out[key] = raw;
    else if (Array.isArray(raw)) out[key] = `[array:${String(raw.length)}]`;
    else if (isRecord(raw)) {
      out[key] = `{${Object.keys(raw).slice(0, 12).join(",")}}`;
    }
  }
  return JSON.stringify(out).slice(0, 1200);
}

/** Runtime ids look like gemini-*, claude-*, gpt-oss-*, never MODEL_PLACEHOLDER_* enums. */
export function isUsableRuntimeModelId(id: string): boolean {
  return /^(gemini-|claude-|gpt-oss-)/i.test(id) && !/\s/.test(id) && !/^MODEL_/i.test(id);
}

function buildModelMatchRegex(requestedId: string): RegExp {
  const req = requestedId.toLowerCase();
  if (req === "gemini-3.8-flash-low") return /gemini[- ]3\.8[- ]flash \(low\)/i;
  if (req === "gemini-3.8-flash-medium") return /gemini[- ]3\.8[- ]flash \(medium\)/i;
  if (req === "gemini-3.8-flash-high") return /gemini[- ]3\.8[- ]flash \(high\)/i;
  if (req === "gemini-3.7-flash-low") return /gemini[- ]3\.7[- ]flash \(low\)/i;
  if (req === "gemini-3.7-flash-medium") return /gemini[- ]3\.7[- ]flash \(medium\)/i;
  if (req === "gemini-3.7-flash-high") return /gemini[- ]3\.7[- ]flash \(high\)/i;
  if (req === "gemini-3.6-flash-low") return /gemini[- ]3\.6[- ]flash \(low\)/i;
  if (req === "gemini-3.6-flash-medium") return /gemini[- ]3\.6[- ]flash \(medium\)/i;
  if (req === "gemini-3.6-flash-high") return /gemini[- ]3\.6[- ]flash \(high\)/i;
  if (req === "gemini-3.5-flash-extra-low") return /gemini[- ]3\.5[- ]flash \(low\)/i;
  if (req === "gemini-3.5-flash-low" || req === "gemini-3.5-flash-medium")
    return /gemini[- ]3\.5[- ]flash \(medium\)/i;
  if (req === "gemini-3.5-flash-high" || req === "gemini-3-flash-agent")
    return /gemini[- ]3\.5[- ]flash \(high\)/i;
  if (req.includes("claude-opus-4-6")) return /claude.*opus.*4\.6/i;
  if (req.includes("claude-sonnet-4-6")) return /claude.*sonnet.*4\.6/i;
  if (req.includes("gpt-oss-120b")) return /gpt.*oss.*120b/i;
  if (req === "gemini-3.1-pro-low") return /gemini[- ]3\.1[- ]pro \(low\)/i;
  if (req === "gemini-3.1-pro-high" || req === "gemini-pro-agent")
    return /gemini[- ]3\.1[- ]pro \(high\)/i;
  const escaped = escapeRegExp(req).replace(/\\-/g, "[- ]");
  return new RegExp(escaped, "i");
}

function dynamicModelFromInfo(modelId: string, info: unknown): DynamicModelInfo {
  if (!isRecord(info)) return { id: modelId };
  setLastMatchedModelDebug(summarizeModelCandidate({ modelId, ...info }));
  const experiments = Array.isArray(info.modelExperiments)
    ? info.modelExperiments.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    id: modelId,
    experiments,
    apiProvider: asString(info.apiProvider),
    modelProvider: asString(info.modelProvider),
  };
}

/**
 * Resolve a requested runtime model against fetchAvailableModels payload.
 * The real runtime ids are the keys of `data.models`; the nested `model` field is often
 * a MODEL_PLACEHOLDER_* enum that 404s on streamGenerateContent.
 */
function findDynamicModel(value: unknown, requestedId: string): DynamicModelInfo | undefined {
  if (!value) return undefined;

  if (isRecord(value) && isRecord(value.models)) {
    const modelsMap = value.models;
    if (isUsableRuntimeModelId(requestedId) && requestedId in modelsMap) {
      return dynamicModelFromInfo(requestedId, modelsMap[requestedId]);
    }

    const targetRegex = buildModelMatchRegex(requestedId);
    for (const [modelId, info] of Object.entries(modelsMap)) {
      if (!isUsableRuntimeModelId(modelId)) continue;
      if (targetRegex.test(modelId)) return dynamicModelFromInfo(modelId, info);
      if (isRecord(info)) {
        const label = info.label ?? info.displayName ?? info.name;
        if (typeof label === "string" && targetRegex.test(label)) {
          return dynamicModelFromInfo(modelId, info);
        }
      }
    }
    return undefined;
  }

  const targetRegex = buildModelMatchRegex(requestedId);

  if (typeof value === "string") {
    return targetRegex.test(value) && isUsableRuntimeModelId(value) ? { id: value } : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDynamicModel(item, requestedId);
      if (found) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") {
        const found = findDynamicModel(nested, requestedId);
        if (found) return found;
      }
    }
  }
  return undefined;
}

async function fetchAvailableRuntimeModelUncached(
  token: string,
  projectId: string,
  requestedRuntimeModel: string,
): Promise<DynamicModelInfo | undefined> {
  const body = JSON.stringify({ project: projectId });
  const endpoints = endpointCandidates();
  let lastLabels = "";

  for (const endpoint of endpoints) {
    try {
      const res = await antigravityFetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: antigravityHeaders(token),
        body,
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      setLastStatus(res.status);
      if (!res.ok) continue;
      setLastEndpoint(endpoint);
      const data: unknown = await res.json();
      const labels = [...new Set(collectModelLabels(data))].slice(0, 16);
      if (labels.length) lastLabels = labels.join(",");
      const found = findDynamicModel(data, requestedRuntimeModel);
      if (found) {
        if (lastLabels) setLastAvailableModels(lastLabels);
        return found;
      }
    } catch (error) {
      setLastError(safeError(error));
    }
  }

  if (lastLabels) setLastAvailableModels(lastLabels);
  return undefined;
}

export async function fetchAvailableRuntimeModel(
  token: string,
  projectId: string,
  requestedRuntimeModel: string,
): Promise<DynamicModelInfo | undefined> {
  const cacheKey = `${token}::${projectId}::${requestedRuntimeModel}`;
  const cached = modelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const inFlight = inFlightModelLookups.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchAvailableRuntimeModelUncached(token, projectId, requestedRuntimeModel).then(
    (result) => {
      modelCache.set(cacheKey, { result, expiresAt: Date.now() + MODEL_CACHE_TTL_MS });
      return result;
    },
  );
  inFlightModelLookups.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightModelLookups.delete(cacheKey);
    if (modelCache.size > 64) {
      const now = Date.now();
      for (const [key, entry] of modelCache) {
        if (entry.expiresAt <= now) modelCache.delete(key);
      }
    }
  }
}

export function clearModelCache(): void {
  modelCache.clear();
}

async function loadCodeAssistUncached(token: string): Promise<string | undefined> {
  const body = JSON.stringify({
    metadata: {
      ideType: "ANTIGRAVITY",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });

  for (const endpoint of endpointCandidates()) {
    try {
      const res = await antigravityFetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: antigravityHeaders(token),
        body,
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      setLastStatus(res.status);
      setLastEndpoint(endpoint);
      if (!res.ok) continue;
      const project = extractProjectId(await res.json());
      if (project) return project;
      return await listCloudAICompanionProjects(token);
    } catch (error) {
      setLastError(safeError(error));
    }
  }
  return undefined;
}

/** Discover project id with a short in-memory LRU cache keyed by access token. */
export async function loadCodeAssist(token: string): Promise<string | undefined> {
  const cached = projectCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    projectCache.delete(token);
    projectCache.set(token, cached);
    return cached.projectId;
  }

  const projectId = await loadCodeAssistUncached(token);
  projectCache.set(token, { projectId, expiresAt: Date.now() + PROJECT_CACHE_TTL_MS });

  if (projectCache.size > 32) {
    const oldestKey = projectCache.keys().next().value;
    if (oldestKey !== undefined) projectCache.delete(oldestKey);
  }
  return projectId;
}

export function clearProjectCache(): void {
  projectCache.clear();
}

export function resolveProjectId(opts: {
  token: string;
  credentialProjectId?: string;
  email?: string;
  warmedProject?: string | null;
}): string {
  return (
    antigravityEnv("PROJECT_ID")?.trim() ||
    opts.warmedProject ||
    opts.credentialProjectId ||
    defaultProjectId(opts.email || "antigravity-default")
  );
}

/** Build a diagnostic suffix using the active request bag. */
export function formatRequestDiagnostics(extra: {
  projectId: string;
  runtimeModel: string;
}): string {
  return `endpoint=${getCurrentEndpoint() || "unknown"}, project=${extra.projectId}, runtimeModel=${extra.runtimeModel}, matched=${getCurrentMatchedModelDebug() || "none"}, available=${getCurrentAvailableModels() || "unknown"}`;
}
