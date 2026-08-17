import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PROVIDER_ID = "google-antigravity";

export default async function (pi: ExtensionAPI) {
  try {
    let oauthModule: any;
    let providerModule: any;

    // 1. Check local vendor/ directory first (self-contained extension)
    const extensionDir = path.dirname(import.meta.url.replace("file://", ""));
    const localOAuthPath = path.join(extensionDir, "vendor/utils/oauth/google-antigravity.js");
    const localProviderPath = path.join(extensionDir, "vendor/providers/google-gemini-cli.js");

    let vendorLoaded = false;
    if (fs.existsSync(localOAuthPath) && fs.existsSync(localProviderPath)) {
      try {
        oauthModule = await import(`file://${localOAuthPath}`);
        providerModule = await import(`file://${localProviderPath}`);
        vendorLoaded = true;
      } catch {
        // The vendor snapshot declares one bare specifier (@google/genai) that
        // pi-ai itself depends on; it resolves from a pi-ai install's
        // node_modules, not from this repo. Fall through to the dist fallback
        // below instead of requiring a local `npm install`.
      }
    }
    if (!vendorLoaded) {
      // Fallback: Candidate module paths (Global Node, Homebrew, Linux, AICoworker, OpenClaw)
      const home = process.env.HOME || "";
      const candidatePaths = [
        "/opt/homebrew/lib/node_modules/@mariozechner/pi-ai",
        "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
        "/usr/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
        "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
        path.join(home, ".local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai"),
        "/Applications/AICoworker.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
        "/Applications/CrawBot.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
        path.join(home, ".openclaw/node_modules/@mariozechner/pi-ai")
      ];

      try {
        const resolvedPkg = require.resolve("@earendil-works/pi-ai/package.json");
        candidatePaths.unshift(path.dirname(resolvedPkg));
      } catch {}
      try {
        const resolvedPkg = require.resolve("@mariozechner/pi-ai/package.json");
        candidatePaths.unshift(path.dirname(resolvedPkg));
      } catch {}

      let basePath = "";
      for (const p of candidatePaths) {
        if (p && fs.existsSync(path.join(p, "dist/providers/google-gemini-cli.js"))) {
          basePath = p;
          break;
        }
      }

      // Auto-patch global pi-ai if not found
      if (!basePath) {
        try {
          const patchScript = path.join(path.dirname(import.meta.url.replace("file://", "")), "scripts/patch-global.js");
          if (fs.existsSync(patchScript)) {
            const { execSync } = await import("node:child_process");
            execSync(`node "${patchScript}"`, { stdio: "ignore" });
            for (const p of candidatePaths) {
              if (p && fs.existsSync(path.join(p, "dist/providers/google-gemini-cli.js"))) {
                basePath = p;
                break;
              }
            }
          }
        } catch (patchErr) {
          // Continue fallback
        }
      }

      if (basePath) {
        oauthModule = await import(`${basePath}/dist/utils/oauth/google-antigravity.js`);
        providerModule = await import(`${basePath}/dist/providers/google-gemini-cli.js`);
      } else {
        try {
          oauthModule = await import("@mariozechner/pi-ai/oauth");
          providerModule = await import("@mariozechner/pi-ai/providers/google-gemini-cli");
        } catch {
          try {
            oauthModule = await import("@earendil-works/pi-ai/oauth");
            providerModule = await import("@earendil-works/pi-ai/providers/google-gemini-cli");
          } catch {
            oauthModule = await import("@earendil-works/pi-ai/oauth");
            providerModule = await import("@earendil-works/pi-ai/google-gemini-cli");
          }
        }
      }
    }

    // ── 401 force-refresh mechanism (mapped from antigravity-auth plugin) ──
    // Single-flight refresh so parallel tool/stream requests don't stampede the
    // token endpoint, plus an in-memory cache: pi core keeps its credential in
    // memory and won't observe our auth.json write until it restarts.
    let refreshInFlight: Promise<{ token: string; projectId: string } | null> | null = null;
    let freshCredentials: { token: string; projectId: string; expires: number } | null = null;

    const authFilePath = () =>
      path.join(
        process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"),
        "auth.json"
      );

    function readStoredAntigravityCredential(): any {
      try {
        const data = JSON.parse(fs.readFileSync(authFilePath(), "utf8"));
        return data?.[PROVIDER_ID] ?? null;
      } catch {
        return null;
      }
    }

    // Merge-write the rotated credential back to pi's auth.json with the same
    // 0600 permission the core store uses; best-effort since the in-memory
    // cache already unblocks the running session.
    function persistAntigravityCredential(cred: any): void {
      try {
        const file = authFilePath();
        let data: any = {};
        try {
          data = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
          // start fresh
        }
        data[PROVIDER_ID] = { ...data[PROVIDER_ID], ...cred, type: "oauth" };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
      } catch {
        // best-effort
      }
    }

    async function forceRefreshCredentials(): Promise<{ token: string; projectId: string } | null> {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          try {
            const stored = readStoredAntigravityCredential();
            const refresh = stored?.refresh;
            if (!refresh) return null;
            const projectId = stored?.projectId || freshCredentials?.projectId || "summer-progress-g2w4j";
            const res = await oauthModule.refreshAntigravityToken(refresh, projectId);
            const cred = {
              type: "oauth",
              access: res.access,
              refresh: res.refresh || refresh,
              expires: res.expires,
              projectId: res.projectId || projectId
            };
            persistAntigravityCredential(cred);
            freshCredentials = {
              token: cred.access,
              projectId: cred.projectId,
              expires: cred.expires
            };
            return freshCredentials;
          } catch {
            return null;
          } finally {
            refreshInFlight = null;
          }
        })();
      }
      return refreshInFlight;
    }

    const models = [
      {
        id: "gemini-3.7-flash-high",
        name: "Gemini 3.7 Flash High (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.7-flash-medium",
        name: "Gemini 3.7 Flash Medium (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.7-flash-low",
        name: "Gemini 3.7 Flash Low (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-pro-agent",
        name: "Gemini 3.1 Pro High (Antigravity Native)",
        reasoning: true,
        default: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65535,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-pro-high",
        name: "Gemini 3.1 Pro High (Alias → gemini-pro-agent)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65535,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-pro-low",
        name: "Gemini 3.1 Pro Low (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65535,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.6-flash-high",
        name: "Gemini 3.6 Flash High (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.6-flash-medium",
        name: "Gemini 3.6 Flash Medium (Antigravity Native)",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.6-flash-low",
        name: "Gemini 3.6 Flash Low (Antigravity Native)",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.5-flash-low",
        name: "Gemini 3.5 Flash Medium (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.5-flash-extra-low",
        name: "Gemini 3.5 Flash Low (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3-flash-agent",
        name: "Gemini 3.5 Flash High (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite (Antigravity Native)",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65535,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash Lite (Antigravity Native)",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65535,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image (Antigravity Native)",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        contextWindow: 1000000,
        maxTokens: 64000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "claude-opus-4-6-thinking",
        name: "Claude Opus 4.6 Thinking (Experimental)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 200000,
        maxTokens: 128000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "claude-opus-4-5-thinking",
        name: "Claude Opus 4.5 Thinking (Experimental)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 200000,
        maxTokens: 64000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6 (Experimental)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 200000,
        maxTokens: 64000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "claude-sonnet-4-5-thinking",
        name: "Claude Sonnet 4.5 Thinking (Experimental)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 200000,
        maxTokens: 64000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5 (Experimental)",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 200000,
        maxTokens: 64000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gpt-oss-120b-medium",
        name: "GPT-OSS 120B Medium (Experimental)",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      }
    ];

    pi.registerProvider("google-antigravity", {
      name: "Google Antigravity Native",
      baseUrl: "https://daily-cloudcode-pa.sandbox.googleapis.com",
      api: "google-gemini-cli" as any,
      defaultModel: "gemini-pro-agent",
      streamSimple: (model: any, context: any, options: any) => {
        const targetModel = { ...model };
        if (targetModel.id === "gemini-3.1-pro-high") {
          targetModel.id = "gemini-pro-agent";
        }
        const wiredOptions = { ...(options ?? {}) };
        try {
          const creds = wiredOptions.apiKey ? JSON.parse(wiredOptions.apiKey) : null;
          // Prefer the freshest token this extension rotated: pi core resolved
          // apiKey from its in-memory credential, which lags behind auth.json.
          if (
            creds &&
            freshCredentials &&
            freshCredentials.expires > Date.now() &&
            creds.token &&
            creds.token !== freshCredentials.token
          ) {
            wiredOptions.apiKey = JSON.stringify({
              ...creds,
              token: freshCredentials.token,
              projectId: freshCredentials.projectId
            });
          }
        } catch {
          // apiKey not JSON — leave untouched
        }
        wiredOptions.getFreshCredentials = forceRefreshCredentials;
        // streamSimple entry: converts session reasoning effort → thinking level
        // (with catalog-id suffix defaults) and keeps the 401 refresh hook wired.
        return providerModule.streamSimpleGoogleGeminiCli(targetModel, context, wiredOptions);
      },
      models,
      oauth: {
        ...(oauthModule.antigravityOAuthProvider || oauthModule),
        async refreshToken(credentials: any) {
          const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
          const refresh = creds.refresh || creds.refresh_token;
          const projectId = creds.projectId || "summer-progress-g2w4j";
          if (!refresh) throw new Error("Antigravity credentials missing refresh token");
          const res = await oauthModule.refreshAntigravityToken(refresh, projectId);
          return {
            type: "oauth",
            refresh: res.refresh || refresh,
            access: res.access,
            expires: res.expires,
            projectId: res.projectId || projectId
          };
        },
        getApiKey(credentials: any) {
          const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
          const token = creds.access || creds.token || creds.key;
          const projectId = creds.projectId || "summer-progress-g2w4j";
          return JSON.stringify({ token, projectId });
        }
      }
    });

    if (process.env.DEBUG || process.argv.includes("--verbose")) {
      console.log(`[Antigravity Native Extension] Successfully loaded and registered full 20-model catalog!`);
    }
  } catch (err) {
    console.error("[Antigravity Native Extension] Initialization error:", err);
  }
}
