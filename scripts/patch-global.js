import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vendorDir = path.join(repoRoot, "vendor");

console.log("🚀 Starting Google Antigravity Native Installer/Patcher...");

// Find npm global root
let globalNpmRoot = "";
try {
  globalNpmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
} catch (e) {
  // fallback
}

const rawCandidateDirs = [
  "/opt/homebrew/lib/node_modules/@mariozechner/pi-ai",
  "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
  globalNpmRoot ? path.join(globalNpmRoot, "@mariozechner/pi-ai") : "",
  globalNpmRoot ? path.join(globalNpmRoot, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai") : "",
  path.join(process.env.HOME || "", ".pi/agent/npm/node_modules/@mariozechner/pi-ai"),
  path.join(process.env.HOME || "", ".openclaw/node_modules/@mariozechner/pi-ai"),
  path.join(process.env.HOME || "", ".openclaw/node_modules/@earendil-works/pi-ai"),
  "/Applications/AICoworker.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
  "/Applications/AICoworker.app/Contents/Resources/openclaw/node_modules/@earendil-works/pi-ai"
].filter(Boolean);

// Deduplicate targets by real path
const targetCandidateDirs = [];
const seenRealPaths = new Set();

for (const dir of rawCandidateDirs) {
  if (fs.existsSync(dir)) {
    try {
      const real = fs.realpathSync(dir);
      if (!seenRealPaths.has(real)) {
        seenRealPaths.add(real);
        targetCandidateDirs.push(dir);
      }
    } catch {
      targetCandidateDirs.push(dir);
    }
  }
}

let patchedCount = 0;

function repairPiAiPackageGaps(targetDir) {
  const distDir = path.join(targetDir, "dist");
  if (!fs.existsSync(distDir)) return;

  // 1. Fix missing api-registry.js
  const apiRegistryJs = path.join(distDir, "api-registry.js");
  const apiRegistryDts = path.join(distDir, "api-registry.d.ts");
  if (!fs.existsSync(apiRegistryJs)) {
    fs.writeFileSync(apiRegistryJs, 'export * from "./compat.js";\n');
    console.log(`  🔧 Re-created missing api-registry.js in ${targetDir}`);
  }
  if (!fs.existsSync(apiRegistryDts)) {
    fs.writeFileSync(apiRegistryDts, 'export * from "./compat.js";\n');
  }

  // 2. Fix missing supportsXhigh in models.js
  const modelsJs = path.join(distDir, "models.js");
  const modelsDts = path.join(distDir, "models.d.ts");
  if (fs.existsSync(modelsJs)) {
    const code = fs.readFileSync(modelsJs, "utf8");
    if (!code.includes("supportsXhigh")) {
      const patch = `
export function supportsXhigh(model) {
    if (!model || !model.id) return false;
    if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3") || model.id.includes("gpt-5.4") || model.id.includes("gpt-5.5")) {
        return true;
    }
    if (model.id.includes("opus-4-6") || model.id.includes("opus-4.6") || model.id.includes("opus-4-7") || model.id.includes("opus-4.7")) {
        return true;
    }
    return false;
}
`;
      fs.appendFileSync(modelsJs, patch);
      console.log(`  🔧 Added missing supportsXhigh export to models.js in ${targetDir}`);
    }
  }
  if (fs.existsSync(modelsDts)) {
    const dtsCode = fs.readFileSync(modelsDts, "utf8");
    if (!dtsCode.includes("supportsXhigh")) {
      fs.appendFileSync(modelsDts, "\nexport declare function supportsXhigh(model: any): boolean;\n");
    }
  }

  // 3. Fix missing createFauxCore in providers/faux.js
  const fauxJs = path.join(distDir, "providers/faux.js");
  if (fs.existsSync(fauxJs)) {
    const fauxCode = fs.readFileSync(fauxJs, "utf8");
    if (!fauxCode.includes("createFauxCore")) {
      const fauxPatch = `
export function createFauxCore(options = {}) {
    const api = options.api ?? randomId(DEFAULT_API);
    const provider = options.provider ?? DEFAULT_PROVIDER;
    const minTokenSize = Math.max(1, Math.min(options.tokenSize?.min ?? DEFAULT_MIN_TOKEN_SIZE, options.tokenSize?.max ?? DEFAULT_MAX_TOKEN_SIZE));
    const maxTokenSize = Math.max(minTokenSize, options.tokenSize?.max ?? DEFAULT_MAX_TOKEN_SIZE);
    let pendingResponses = [];
    const tokensPerSecond = options.tokensPerSecond;
    const state = { callCount: 0 };
    const promptCache = new Map();
    const modelDefinitions = options.models?.length
        ? options.models
        : [
            {
                id: DEFAULT_MODEL_ID,
                name: DEFAULT_MODEL_NAME,
                reasoning: false,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128000,
                maxTokens: 16384,
            },
        ];
    const models = modelDefinitions.map((definition) => ({
        id: definition.id,
        name: definition.name ?? definition.id,
        api,
        provider,
        baseUrl: DEFAULT_BASE_URL,
        reasoning: definition.reasoning ?? false,
        input: definition.input ?? ["text", "image"],
        cost: definition.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: definition.contextWindow ?? 128000,
        maxTokens: definition.maxTokens ?? 16384,
    }));
    const stream = (requestModel, context, streamOptions) => {
        const outer = createAssistantMessageEventStream();
        const step = pendingResponses.shift();
        state.callCount++;
        queueMicrotask(async () => {
            try {
                await streamOptions?.onResponse?.({ status: 200, headers: {} }, requestModel);
                if (!step) {
                    let message = createErrorMessage(new Error("No more faux responses queued"), api, provider, requestModel.id);
                    message = withUsageEstimate(message, context, streamOptions, promptCache);
                    outer.push({ type: "error", reason: "error", error: message });
                    outer.end(message);
                    return;
                }
                const resolved = typeof step === "function" ? await step(context, streamOptions, state, requestModel) : step;
                let message = cloneMessage(resolved, api, provider, requestModel.id);
                message = withUsageEstimate(message, context, streamOptions, promptCache);
                await streamWithDeltas(outer, message, minTokenSize, maxTokenSize, tokensPerSecond, streamOptions?.signal);
            }
            catch (error) {
                const message = createErrorMessage(error, api, provider, requestModel.id);
                outer.push({ type: "error", reason: "error", error: message });
                outer.end(message);
            }
        });
        return outer;
    };
    const streamSimple = (streamModel, context, streamOptions) => stream(streamModel, context, streamOptions);
    function getModel(requestedModelId) {
        if (!requestedModelId) {
            return models[0];
        }
        return models.find((candidate) => candidate.id === requestedModelId);
    }
    return {
        api,
        provider,
        models,
        stream,
        streamSimple,
        getModel,
        state,
        setResponses(responses) {
            pendingResponses = [...responses];
        },
        appendResponses(responses) {
            pendingResponses.push(...responses);
        },
        getPendingResponseCount() {
            return pendingResponses.length;
        },
    };
}
`;
      fs.appendFileSync(fauxJs, fauxPatch);
      console.log(`  🔧 Added missing createFauxCore export to providers/faux.js in ${targetDir}`);
    }
  }

  // 4. Fix missing Provider Factory functions in dist/providers/
  const providerPatches = [
    {
      file: "amazon-bedrock.js",
      name: "amazonBedrockProvider",
      code: `
import { bedrockConverseStreamApi } from "../api/bedrock-converse-stream.lazy.js";
import { createProvider } from "../models.js";
import { AMAZON_BEDROCK_MODELS } from "./amazon-bedrock.models.js";

const bedrockAuth = {
	name: "AWS credentials or bearer token",
	login: async (interaction) => {
		const method = await interaction.prompt({
			type: "select",
			message: "Select Amazon Bedrock authentication method:",
			options: [
				{ id: "bearer-token", label: "Bearer token" },
				{ id: "aws-profile", label: "AWS profile" },
				{ id: "credential-chain", label: "Existing AWS credential chain" },
			],
		});
		if (method === "bearer-token") {
			return {
				type: "api_key",
				key: await interaction.prompt({ type: "secret", message: "Enter Amazon Bedrock bearer token" }),
			};
		}
		interaction.notify({
			type: "info",
			message: "Amazon Bedrock supports AWS profiles, IAM credentials, and role-based credentials.",
			links: [{ label: "AWS credential provider chain", url: "https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html" }],
		});
		if (method === "aws-profile") {
			return {
				type: "api_key",
				env: { AWS_PROFILE: await interaction.prompt({ type: "text", message: "Enter AWS profile name" }) },
			};
		}
		if (method !== "credential-chain") throw new Error(\`Unknown Amazon Bedrock auth method: \${method}\`);
		await interaction.prompt({ type: "text", message: "Configure AWS credentials, then press Enter to continue" });
		return { type: "api_key" };
	},
	resolve: async ({ ctx, credential }) => {
		if (credential?.key) return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
		if (await ctx.env("AWS_BEARER_TOKEN_BEDROCK")) return { auth: {}, source: "AWS_BEARER_TOKEN_BEDROCK" };
		if (credential?.env?.AWS_PROFILE ?? (await ctx.env("AWS_PROFILE"))) {
			return { auth: {}, env: credential?.env, source: credential?.env?.AWS_PROFILE ? "stored credential" : "AWS_PROFILE" };
		}
		if ((await ctx.env("AWS_ACCESS_KEY_ID")) && (await ctx.env("AWS_SECRET_ACCESS_KEY"))) return { auth: {}, source: "AWS access keys" };
		if (await ctx.env("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")) return { auth: {}, source: "ECS task role" };
		if (await ctx.env("AWS_CONTAINER_CREDENTIALS_FULL_URI")) return { auth: {}, source: "ECS task role" };
		if (await ctx.env("AWS_WEB_IDENTITY_TOKEN_FILE")) return { auth: {}, source: "web identity token" };
		return undefined;
	},
};

export function amazonBedrockProvider() {
	return createProvider({
		id: "amazon-bedrock",
		name: "Amazon Bedrock",
		auth: { apiKey: bedrockAuth },
		models: Object.values(AMAZON_BEDROCK_MODELS),
		api: bedrockConverseStreamApi(),
	});
}
`
    },
    {
      file: "anthropic.js",
      name: "anthropicProvider",
      code: `
import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.js";
import { envApiKeyAuth, lazyOAuth } from "../auth/helpers.js";
import { loadAnthropicOAuth } from "../auth/oauth/load.js";
import { createProvider } from "../models.js";
import { ANTHROPIC_MODELS } from "./anthropic.models.js";

export function anthropicProvider() {
	return createProvider({
		id: "anthropic",
		name: "Anthropic",
		baseUrl: "https://api.anthropic.com",
		auth: {
			apiKey: envApiKeyAuth("Anthropic API key", ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]),
			oauth: lazyOAuth({ name: "Anthropic (Claude Pro/Max)", load: loadAnthropicOAuth }),
		},
		models: Object.values(ANTHROPIC_MODELS),
		api: anthropicMessagesApi(),
	});
}
`
    },
    {
      file: "azure-openai-responses.js",
      name: "azureOpenAIResponsesProvider",
      code: `
import { azureOpenAIResponsesApi } from "../api/azure-openai-responses.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { AZURE_OPENAI_RESPONSES_MODELS } from "./azure-openai-responses.models.js";

export function azureOpenAIResponsesProvider() {
	return createProvider({
		id: "azure-openai-responses",
		name: "Azure OpenAI",
		auth: { apiKey: envApiKeyAuth("Azure OpenAI API key", ["AZURE_OPENAI_API_KEY"]) },
		models: Object.values(AZURE_OPENAI_RESPONSES_MODELS),
		api: azureOpenAIResponsesApi(),
	});
}
`
    },
    {
      file: "google.js",
      name: "googleProvider",
      code: `
import { googleGenerativeAIApi } from "../api/google-generative-ai.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { GOOGLE_MODELS } from "./google.models.js";

export function googleProvider() {
	return createProvider({
		id: "google",
		name: "Google",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		auth: { apiKey: envApiKeyAuth("Gemini API key", ["GEMINI_API_KEY"]) },
		models: Object.values(GOOGLE_MODELS),
		api: googleGenerativeAIApi(),
	});
}
`
    },
    {
      file: "google-vertex.js",
      name: "googleVertexProvider",
      code: `
import { googleVertexApi } from "../api/google-vertex.lazy.js";
import { createProvider } from "../models.js";
import { GOOGLE_VERTEX_MODELS } from "./google-vertex.models.js";

const VERTEX_ADC_PATH = "~/.config/gcloud/application_default_credentials.json";

const vertexAuth = {
	name: "Google Cloud credentials",
	login: async (interaction) => {
		const method = await interaction.prompt({
			type: "select",
			message: "Select Google Vertex AI authentication method:",
			options: [
				{ id: "api-key", label: "Google Cloud API key" },
				{ id: "adc", label: "Application Default Credentials" },
				{ id: "service-account", label: "Service account credentials file" },
			],
		});
		if (method === "api-key") {
			return {
				type: "api_key",
				key: await interaction.prompt({ type: "secret", message: "Enter Google Cloud API key" }),
			};
		}
		if (method !== "adc" && method !== "service-account") {
			throw new Error(\`Unknown Google Vertex AI auth method: \${method}\`);
		}
		interaction.notify({
			type: "info",
			message:
				method === "adc"
					? "Run \`gcloud auth application-default login\`, then provide the project and location."
					: "Provide a service account credentials file, project, and location.",
			links: [{ label: "Application Default Credentials", url: "https://cloud.google.com/docs/authentication/provide-credentials-adc" }],
		});
		const project = await interaction.prompt({ type: "text", message: "Enter Google Cloud project ID" });
		const location = await interaction.prompt({ type: "text", message: "Enter Google Cloud location" });
		const credentialsPath =
			method === "service-account"
				? await interaction.prompt({ type: "text", message: "Enter service account credentials file path" })
				: undefined;
		return {
			type: "api_key",
			env: {
				GOOGLE_CLOUD_PROJECT: project,
				GOOGLE_CLOUD_LOCATION: location,
				...(credentialsPath ? { GOOGLE_APPLICATION_CREDENTIALS: credentialsPath } : {}),
			},
		};
	},
	resolve: async ({ ctx, credential }) => {
		const key = credential?.key ?? (await ctx.env("GOOGLE_CLOUD_API_KEY"));
		if (key) return { auth: { apiKey: key }, source: credential?.key ? "stored credential" : "GOOGLE_CLOUD_API_KEY" };

		const adcPath = credential?.env?.GOOGLE_APPLICATION_CREDENTIALS ?? (await ctx.env("GOOGLE_APPLICATION_CREDENTIALS"));
		const hasCredentials = await ctx.fileExists(adcPath ?? VERTEX_ADC_PATH);
		const project = credential?.env?.GOOGLE_CLOUD_PROJECT ?? (await ctx.env("GOOGLE_CLOUD_PROJECT")) ?? (await ctx.env("GCLOUD_PROJECT"));
		const location = credential?.env?.GOOGLE_CLOUD_LOCATION ?? (await ctx.env("GOOGLE_CLOUD_LOCATION"));
		if (hasCredentials && project && location) {
			return { auth: {}, env: credential?.env, source: credential ? "stored credential" : "gcloud application default credentials" };
		}
		return undefined;
	},
};

export function googleVertexProvider() {
	return createProvider({
		id: "google-vertex",
		name: "Google Vertex AI",
		auth: { apiKey: vertexAuth },
		models: Object.values(GOOGLE_VERTEX_MODELS),
		api: googleVertexApi(),
	});
}
`
    },
    {
      file: "mistral.js",
      name: "mistralProvider",
      code: `
import { mistralConversationsApi } from "../api/mistral-conversations.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { MISTRAL_MODELS } from "./mistral.models.js";

export function mistralProvider() {
	return createProvider({
		id: "mistral",
		name: "Mistral",
		baseUrl: "https://api.mistral.ai",
		auth: { apiKey: envApiKeyAuth("Mistral API key", ["MISTRAL_API_KEY"]) },
		models: Object.values(MISTRAL_MODELS),
		api: mistralConversationsApi(),
	});
}
`
    },
    {
      file: "openai-codex.js",
      name: "openaiCodexProvider",
      code: `
import { openAICodexResponsesApi } from "../api/openai-codex-responses.lazy.js";
import { lazyOAuth } from "../auth/helpers.js";
import { loadOpenAICodexOAuth } from "../auth/oauth/load.js";
import { createProvider } from "../models.js";
import { OPENAI_CODEX_MODELS } from "./openai-codex.models.js";

export function openaiCodexProvider() {
	return createProvider({
		id: "openai-codex",
		name: "OpenAI Codex",
		baseUrl: "https://chatgpt.com/backend-api",
		auth: {
			oauth: lazyOAuth({ name: "OpenAI (ChatGPT Plus/Pro)", load: loadOpenAICodexOAuth }),
		},
		models: Object.values(OPENAI_CODEX_MODELS),
		api: openAICodexResponsesApi(),
	});
}
`
    },
    {
      file: "openai.js",
      name: "openaiProvider",
      code: `
import { openAIResponsesApi } from "../api/openai-responses.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { OPENAI_MODELS } from "./openai.models.js";

export function openaiProvider() {
	return createProvider({
		id: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		auth: { apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]) },
		models: Object.values(OPENAI_MODELS),
		api: openAIResponsesApi(),
	});
}
`
    }
  ];

  for (const patchItem of providerPatches) {
    const pPath = path.join(distDir, "providers", patchItem.file);
    if (fs.existsSync(pPath)) {
      const pCode = fs.readFileSync(pPath, "utf8");
      if (!pCode.includes(patchItem.name)) {
        fs.appendFileSync(pPath, patchItem.code);
        console.log(`  🔧 Added missing provider factory ${patchItem.name} to providers/${patchItem.file} in ${targetDir}`);
      }
    }
  }
}

for (const targetDir of targetCandidateDirs) {
  if (fs.existsSync(targetDir)) {
    const distProviders = path.join(targetDir, "dist/providers");
    const distOauth = path.join(targetDir, "dist/utils/oauth");

    if (fs.existsSync(distProviders)) {
      try {
        // Newer pi-ai layouts (0.83.x) ship oauth under dist/auth; recreate the
        // legacy dist/utils/oauth location the vendored modules import from.
        if (!fs.existsSync(distOauth)) {
          fs.mkdirSync(distOauth, { recursive: true });
        }
        console.log(`📦 Patching pi-ai module at: ${targetDir}`);

        // 1. Repair package gaps if pi-ai upstream has missing exports/files
        repairPiAiPackageGaps(targetDir);

        // 2. Copy provider files
        const vendorProviders = path.join(vendorDir, "providers");
        if (fs.existsSync(vendorProviders)) {
          for (const file of fs.readdirSync(vendorProviders)) {
            fs.copyFileSync(path.join(vendorProviders, file), path.join(distProviders, file));
          }
        }

        // 2.5. Restore displaced helper modules.
        // pi-ai >=0.83 moved simple-options.js and transform-messages.js from
        // dist/providers/ to dist/api/, but the patched google-gemini-cli.js and
        // google-shared.js import them as siblings ("./simple-options.js",
        // "./transform-messages.js") from dist/providers/. Without these, loading
        // the provider fails with: Cannot find module './simple-options.js'.
        const distApi = path.join(targetDir, "dist/api");
        if (fs.existsSync(distApi)) {
          for (const file of ["simple-options.js", "transform-messages.js"]) {
            const src = path.join(distApi, file);
            const dst = path.join(distProviders, file);
            if (fs.existsSync(src) && !fs.existsSync(dst)) {
              fs.copyFileSync(src, dst);
              console.log(`  🔧 Restored displaced ${file} (api/ -> providers/) in ${targetDir}`);
            }
          }
        }

        // 3. Copy oauth files

        // 3. Copy oauth files
        const vendorOauth = path.join(vendorDir, "utils/oauth");
        if (fs.existsSync(vendorOauth)) {
          for (const file of fs.readdirSync(vendorOauth)) {
            fs.copyFileSync(path.join(vendorOauth, file), path.join(distOauth, file));
          }
        }

        patchedCount++;
      } catch (err) {
        // Read-only installs (e.g. app bundles) must not abort patching others
        console.warn(`⚠️ Skipped ${targetDir}: ${err.code || err.message}`);
      }
    }
  }
}

// Check / Create symlink for @mariozechner/pi-ai if missing in global npm root
if (globalNpmRoot) {
  const targetLink = path.join(globalNpmRoot, "@mariozechner/pi-ai");
  const sourcePkg = path.join(globalNpmRoot, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai");
  
  if (!fs.existsSync(targetLink) && fs.existsSync(sourcePkg)) {
    try {
      const parentDir = path.dirname(targetLink);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.symlinkSync(sourcePkg, targetLink, "junction");
      console.log(`🔗 Created symlink: ${targetLink} -> ${sourcePkg}`);
    } catch (err) {
      // ignore
    }
  }
}

if (patchedCount > 0) {
  console.log(`✅ Successfully patched ${patchedCount} pi-ai installation(s)!`);
} else {
  console.warn("⚠️ No global pi-ai module installation found to patch. Extension will rely on fallback paths.");
}
