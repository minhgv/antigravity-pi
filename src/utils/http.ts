import { Agent } from "undici";
import { antigravityEnv } from "./util.js";
/**
 * Node's built-in fetch keeps an idle socket for only 4 seconds unless the server
 * advertises a longer `Keep-Alive: timeout=`. The Cloud Code Assist endpoint sends no
 * such header, and interactive coding turns are almost always more than 4 seconds
 * apart, so without a dedicated pool every message pays a fresh DNS + TCP + TLS
 * handshake. A long-lived dispatcher removes that per-turn setup cost.
 */
const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const KEEP_ALIVE_MAX_TIMEOUT_MS = 5 * 60_000;
const CONNECT_TIMEOUT_MS = 10_000;
const PREWARM_TIMEOUT_MS = 3_000;
type DispatcherInit = RequestInit & { dispatcher?: unknown };

let activeAgent: Agent | undefined;
let dispatcherPromise: Promise<Agent | undefined> | undefined;

function hasProxyConfiguration(): boolean {
  return ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some(
    (name) => Boolean(process.env[name]?.trim()),
  );
}
async function getDispatcher(): Promise<Agent | undefined> {
  dispatcherPromise ??= (async () => {
    if (antigravityEnv("NO_KEEPALIVE") === "1" || hasProxyConfiguration()) {
      return undefined;
    }
    const nodeMajor = Number(process.versions.node?.split(".")[0]);
    if (!Number.isNaN(nodeMajor) && nodeMajor >= 22) {
      return undefined;
    }
    try {
      activeAgent = new Agent({
        keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
        keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
        connections: 8,
        connect: { timeout: CONNECT_TIMEOUT_MS },
        allowH2: antigravityEnv("HTTP2") === "1",
      });
      return activeAgent;
    } catch {
      return undefined;
    }
  })();
  return dispatcherPromise;
}
/** Close dispatcher on process exit or explicit cleanup so tests/CLI don't hang */
export async function closeDispatcher(): Promise<void> {
  if (activeAgent) {
    try {
      await activeAgent.destroy();
    } catch {
      // ignore
    }
    activeAgent = undefined;
    dispatcherPromise = undefined;
  }
}

if (typeof process !== "undefined" && process.on) {
  process.on("exit", () => {
    if (activeAgent) {
      try {
        activeAgent.destroy();
      } catch {}
    }
  });
}

/** fetch() bound to this provider's keep-alive connection pool when available. */
export async function antigravityFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const dispatcher = await getDispatcher();
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as DispatcherInit);
}

/**
 * Open the TLS connection when the extension loads so the first message of a session
 * does not pay the handshake. Best-effort: unauthenticated bounded HEAD request.
 */
export function prewarmConnection(url: string): void {
  if (antigravityEnv("NO_PREWARM") === "1") return;
  void (async () => {
    try {
      const res = await antigravityFetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
      });
      await res.arrayBuffer();
    } catch {
      // Warm-up only; real request connects on demand
    }
  })();
}
