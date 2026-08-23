import assert from "node:assert/strict";
import initProvider from "../index.ts";
import {
  isGemini3FlashModel,
  isGemini3ProModel,
  isGemini3Model,
  isMinimalThinkingSupported,
  getDefaultThinkingLevel,
  getGeminiCliThinkingLevel,
} from "../vendor/providers/google-gemini-cli.js";

console.log("🧪 Running Antigravity Native Core 16 Active Models Verification Tests...\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────
// Part A: Model Catalog Registration in index.ts
// ─────────────────────────────────────────────────────────────
console.log("📋 Part A: Model Catalog Registration in index.ts");

let registeredProvider = null;
const mockPi = {
  registerProvider: (id, provider) => {
    registeredProvider = { id, provider };
  },
};

await runAsyncTest("Provider 'google-antigravity' registers properly with model list", async () => {
  await initProvider(mockPi);
  assert.ok(registeredProvider, "Provider should be registered");
  assert.equal(registeredProvider.id, "google-antigravity");
  assert.ok(Array.isArray(registeredProvider.provider.models), "models should be an array");
  assert.equal(registeredProvider.provider.defaultModel, "gemini-pro-agent");
});

const models = registeredProvider?.provider?.models || [];
const findModel = (id) => models.find((m) => m.id === id);

test("Model catalog contains EXACTLY 16 core active models", () => {
  assert.equal(models.length, 16, `model catalog should contain 16 models, got ${models.length}`);
});

const expectedCore16Models = [
  {
    id: "gemini-3.7-flash-high",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.7-flash-medium",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.7-flash-low",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-pro-agent",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    default: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.1-pro-high",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.1-pro-low",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.6-flash-high",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.6-flash-medium",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: false,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.6-flash-low",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: false,
    input: ["text", "image"],
  },
  {
    id: "gemini-3-flash-agent",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.5-flash-low",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.5-flash-extra-low",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.5-flash-lite",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: false,
    input: ["text"],
  },
  {
    id: "gemini-3-flash",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: "gemini-3.1-flash-lite",
    contextWindow: 1048576,
    maxTokens: 65535,
    reasoning: false,
    input: ["text"],
  },
  {
    id: "gemini-3.1-flash-image",
    contextWindow: 1000000,
    maxTokens: 64000,
    reasoning: false,
    input: ["text"],
  },
];

for (const expected of expectedCore16Models) {
  test(`Model '${expected.id}' is present with correct specs`, () => {
    const model = findModel(expected.id);
    assert.ok(model, `Model '${expected.id}' must exist in catalog`);
    assert.equal(model.contextWindow, expected.contextWindow, `contextWindow mismatch for ${expected.id}`);
    assert.equal(model.maxTokens, expected.maxTokens, `maxTokens mismatch for ${expected.id}`);
    assert.equal(model.reasoning, expected.reasoning, `reasoning mismatch for ${expected.id}`);
    assert.deepEqual(model.input, expected.input, `input mismatch for ${expected.id}`);
    if (expected.default) {
      assert.equal(model.default, true, `${expected.id} must have default: true`);
    }
  });
}

test("Obsolete, legacy, and experimental models are completely removed", () => {
  const removedModelIds = [
    "gemini-3.7-flash",
    "gemini-pro",
    "gemini-2.5-pro",
    "claude-opus-4-6-thinking",
    "claude-opus-4-5-thinking",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-thinking",
    "claude-sonnet-4-5",
    "gpt-oss-120b-medium",
  ];

  for (const removedId of removedModelIds) {
    assert.equal(findModel(removedId), undefined, `Model '${removedId}' should NOT exist in catalog`);
  }
});

// ─────────────────────────────────────────────────────────────
// Part B: Provider Thinking Helpers in google-gemini-cli.js
// ─────────────────────────────────────────────────────────────
console.log("\n🧠 Part B: Provider Thinking Helpers in google-gemini-cli.js");

test("isGemini3FlashModel identifies Gemini 3.7 Flash variants", () => {
  assert.equal(isGemini3FlashModel("gemini-3.7-flash"), true);
  assert.equal(isGemini3FlashModel("gemini-3.7-flash-high"), true);
  assert.equal(isGemini3FlashModel("gemini-3.7-flash-medium"), true);
  assert.equal(isGemini3FlashModel("gemini-3.7-flash-low"), true);
  assert.equal(isGemini3FlashModel("gemini-3-flash"), true);
  assert.equal(isGemini3FlashModel("gemini-3-flash-agent"), true);
  assert.equal(isGemini3FlashModel("gemini-pro-agent"), false);
});

test("isMinimalThinkingSupported correctly rejects Gemini 3.7+ and allows Gemini <= 3.6", () => {
  assert.equal(isMinimalThinkingSupported("gemini-3.7-flash"), false);
  assert.equal(isMinimalThinkingSupported("gemini-3.7-flash-high"), false);
  assert.equal(isMinimalThinkingSupported("gemini-3.7-flash-medium"), false);
  assert.equal(isMinimalThinkingSupported("gemini-3.7-flash-low"), false);
  assert.equal(isMinimalThinkingSupported("gemini-3.8-flash"), false);
  assert.equal(isMinimalThinkingSupported("gemini-4.0-flash"), false);

  // Gemini <= 3.6 and Gemini 2.x support MINIMAL
  assert.equal(isMinimalThinkingSupported("gemini-3.6-flash"), true);
  assert.equal(isMinimalThinkingSupported("gemini-3.5-flash"), true);
  assert.equal(isMinimalThinkingSupported("gemini-3.0"), true);
  assert.equal(isMinimalThinkingSupported("gemini-2.5"), true);
  assert.equal(isMinimalThinkingSupported("gemini-2.5-flash"), true);
});

test("getDefaultThinkingLevel resolves expected thinking level for all variants", () => {
  assert.equal(getDefaultThinkingLevel("gemini-3.7-flash-high"), "HIGH");
  assert.equal(getDefaultThinkingLevel("gemini-3.7-flash-medium"), "MEDIUM");
  assert.equal(getDefaultThinkingLevel("gemini-3.7-flash-low"), "LOW");
  assert.equal(getDefaultThinkingLevel("gemini-3.7-flash"), "HIGH");
  assert.equal(getDefaultThinkingLevel("gemini-pro-agent"), "HIGH");
  assert.equal(getDefaultThinkingLevel("gemini-3.5-flash-low"), "LOW");
  assert.equal(getDefaultThinkingLevel("gemini-3.5-flash-extra-low"), "LOW");
});

test("getGeminiCliThinkingLevel clamps MINIMAL to LOW on Gemini 3.7+ to avoid backend HTTP 400", () => {
  assert.equal(getGeminiCliThinkingLevel("minimal", "gemini-3.7-flash"), "LOW");
  assert.equal(getGeminiCliThinkingLevel("minimal", "gemini-3.7-flash-high"), "LOW");
  assert.equal(getGeminiCliThinkingLevel("minimal", "gemini-3.7-flash-low"), "LOW");
  assert.equal(getGeminiCliThinkingLevel("high", "gemini-3.7-flash"), "HIGH");
  assert.equal(getGeminiCliThinkingLevel("medium", "gemini-3.7-flash"), "MEDIUM");
  assert.equal(getGeminiCliThinkingLevel("low", "gemini-3.7-flash"), "LOW");

  // Gemini 3.6 still passes MINIMAL through
  assert.equal(getGeminiCliThinkingLevel("minimal", "gemini-3.6-flash"), "MINIMAL");
});

console.log(`\n========================================`);
console.log(`Summary: ${passed}/${total} tests passed.`);
console.log(`========================================\n`);

if (passed === total) {
  console.log("🎉 All Core 16 Model tests passed successfully!");
} else {
  console.error("❌ Some tests failed!");
  process.exit(1);
}
