import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export default async function (pi: ExtensionAPI) {
  try {
    let oauthModule: any;
    let providerModule: any;

    // 1. Candidate module paths (Global Node, Homebrew, AICoworker, OpenClaw)
    const candidatePaths = [
      "/opt/homebrew/lib/node_modules/@mariozechner/pi-ai",
      "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
      "/Applications/AICoworker.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
      "/Applications/CrawBot.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
      (process.env.HOME || "") + "/.openclaw/node_modules/@mariozechner/pi-ai"
    ];

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
        providerModule = await import("@mariozechner/pi-ai/google-gemini-cli");
      } catch {
        oauthModule = await import("@earendil-works/pi-ai/oauth");
        providerModule = await import("@earendil-works/pi-ai/google-gemini-cli");
      }
    }

    const models = [
      {
        id: "gemini-pro-agent",
        name: "Gemini 3.1 Pro High (Antigravity Native)",
        reasoning: true,
        default: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-pro-high",
        name: "Gemini 3.1 Pro High (Alias → gemini-pro-agent)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-pro-low",
        name: "Gemini 3.1 Pro Low (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
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
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash Lite (Antigravity Native)",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image (Antigravity Native)",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro (Antigravity Native)",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        contextWindow: 1048576,
        maxTokens: 65536,
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
        return providerModule.streamGoogleGeminiCli(targetModel, context, options);
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
