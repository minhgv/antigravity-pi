import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fetchAvailableRuntimeModel,
	loadCodeAssist,
	clearModelCache,
	clearProjectCache,
} from "../src/client/client.js";
import {
	getOrCreateAntigravitySession,
	clearAntigravitySessions,
	resetAntigravitySessionMemory,
	persistAntigravitySessions,
} from "../src/utils/util.js";

test("modelCache: hit cache, TTL expiration, eviction > 64 items, deduplication in-flight, clearModelCache", async () => {
	clearModelCache();

	const originalFetch = globalThis.fetch;
	const originalDateNow = Date.now;

	let currentTime = 1_000_000;
	Date.now = () => currentTime;

	let fetchCallCount = 0;
	let fetchDelayMs = 0;

	// Mock globalThis.fetch to intercept fetchAvailableModels
	globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
		fetchCallCount++;
		if (fetchDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
		}
		const mockResponse = {
			models: {
				"gemini-3.8-flash": { displayName: "Gemini 3.8 Flash" },
				"claude-opus-4-6": { displayName: "Claude Opus 4.6" },
			},
		};
		return new Response(JSON.stringify(mockResponse), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof globalThis.fetch;

	try {
		// 1. Initial fetch (cache miss)
		const model1 = await fetchAvailableRuntimeModel("token1", "proj1", "gemini-3.8-flash");
		assert.ok(model1);
		assert.equal(model1?.id, "gemini-3.8-flash");
		assert.equal(fetchCallCount, 1);

		// 2. Cache hit (no additional network call)
		const model2 = await fetchAvailableRuntimeModel("token1", "proj1", "gemini-3.8-flash");
		assert.deepEqual(model2, model1);
		assert.equal(fetchCallCount, 1);

		// 3. In-flight request deduplication
		fetchDelayMs = 50;
		fetchCallCount = 0;
		const [resA, resB] = await Promise.all([
			fetchAvailableRuntimeModel("token-dedupe", "proj1", "claude-opus-4-6"),
			fetchAvailableRuntimeModel("token-dedupe", "proj1", "claude-opus-4-6"),
		]);
		assert.equal(fetchCallCount, 1, "In-flight calls for identical key must be deduplicated to 1 fetch");
		assert.equal(resA?.id, "claude-opus-4-6");
		assert.equal(resB?.id, "claude-opus-4-6");
		fetchDelayMs = 0;

		// 4. TTL expiration (MODEL_CACHE_TTL_MS = 30 minutes = 1_800_000 ms)
		fetchCallCount = 0;
		// Advance time past TTL (30 mins + 1ms)
		currentTime += 30 * 60 * 1000 + 1;
		const modelExpired = await fetchAvailableRuntimeModel("token1", "proj1", "gemini-3.8-flash");
		assert.equal(fetchCallCount, 1, "Expired cache entry must trigger a new fetch");
		assert.equal(modelExpired?.id, "gemini-3.8-flash");

		// 5. Eviction when exceeding > 64 items
		clearModelCache();
		fetchCallCount = 0;

		// Populate 65 entries at currentTime. Expire the first 10 by timestamp.
		for (let i = 1; i <= 65; i++) {
			if (i <= 10) {
				currentTime = 2_000_000; // will expire later
			} else {
				currentTime = 10_000_000; // fresh
			}
			await fetchAvailableRuntimeModel(`token-${i}`, "proj", "gemini-3.8-flash");
		}
		assert.equal(fetchCallCount, 65);

		// At this point, size is 65. Advance time so first 10 are expired (> 2_000_000 + 30 mins)
		// but remaining (11..65) are still valid (< 10_000_000 + 30 mins)
		currentTime = 2_000_000 + 30 * 60 * 1000 + 10;

		// Trigger one more fetch to hit the `if (modelCache.size > 64)` eviction sweep
		await fetchAvailableRuntimeModel("token-trigger", "proj", "gemini-3.8-flash");

		// Now token-1 should have been evicted during the cleanup loop
		fetchCallCount = 0;
		await fetchAvailableRuntimeModel("token-1", "proj", "gemini-3.8-flash");
		assert.equal(fetchCallCount, 1, "token-1 was evicted and should trigger new fetch");

		// 6. clearModelCache()
		fetchCallCount = 0;
		clearModelCache();
		await fetchAvailableRuntimeModel("token-trigger", "proj", "gemini-3.8-flash");
		assert.equal(fetchCallCount, 1, "clearModelCache cleared entries, re-fetch triggered");
	} finally {
		globalThis.fetch = originalFetch;
		Date.now = originalDateNow;
		clearModelCache();
	}
});

test("projectCache: hit cache, LRU ordering, eviction > 32 items, TTL expiration, clearProjectCache", async () => {
	clearProjectCache();

	const originalFetch = globalThis.fetch;
	const originalDateNow = Date.now;

	let currentTime = 5_000_000;
	Date.now = () => currentTime;

	let fetchCallCount = 0;

	// Mock globalThis.fetch to intercept loadCodeAssist
	globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
		fetchCallCount++;
		// Extract token from Authorization header to return mock project id
		const authHeader = (init?.headers as Record<string, string>)?.Authorization || "";
		const token = authHeader.replace("Bearer ", "");
		return new Response(
			JSON.stringify({
				cloudaicompanionProject: { id: `project-for-${token}` },
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	}) as typeof globalThis.fetch;

	try {
		// 1. Initial fetch & cache hit
		const proj1 = await loadCodeAssist("user-token-1");
		assert.equal(proj1, "project-for-user-token-1");
		assert.equal(fetchCallCount, 1);

		const proj1Cached = await loadCodeAssist("user-token-1");
		assert.equal(proj1Cached, "project-for-user-token-1");
		assert.equal(fetchCallCount, 1, "Should be cached, no fetch");

		// 2. TTL expiration (PROJECT_CACHE_TTL_MS = 30 minutes)
		currentTime += 30 * 60 * 1000 + 1;
		const proj1AfterTtl = await loadCodeAssist("user-token-1");
		assert.equal(proj1AfterTtl, "project-for-user-token-1");
		assert.equal(fetchCallCount, 2, "Expired entry must trigger new fetch");

		// 3. LRU ordering & eviction > 32 entries
		clearProjectCache();
		fetchCallCount = 0;

		// Fill 32 entries (token-1 to token-32)
		for (let i = 1; i <= 32; i++) {
			await loadCodeAssist(`lru-token-${i}`);
		}
		assert.equal(fetchCallCount, 32);

		// Access token-1 to promote it to the end of LRU
		await loadCodeAssist("lru-token-1");
		assert.equal(fetchCallCount, 32, "Hit token-1, promoted in LRU, no new fetch");

		// Now add 33rd entry -> triggers eviction of the oldest key (which should now be token-2, not token-1)
		await loadCodeAssist("lru-token-33");
		assert.equal(fetchCallCount, 33);

		// token-1 was refreshed/promoted, so it should still be in cache (hit)
		await loadCodeAssist("lru-token-1");
		assert.equal(fetchCallCount, 33, "token-1 was refreshed so it was not evicted");

		// token-2 was the oldest untouched, so it was evicted (miss -> triggers fetch)
		await loadCodeAssist("lru-token-2");
		assert.equal(fetchCallCount, 34, "token-2 was evicted by LRU and triggers a re-fetch");

		// 4. clearProjectCache()
		clearProjectCache();
		await loadCodeAssist("lru-token-1");
		assert.equal(fetchCallCount, 35, "clearProjectCache cleared everything");
	} finally {
		globalThis.fetch = originalFetch;
		Date.now = originalDateNow;
		clearProjectCache();
	}
});

test("AntigravitySessionState disk persistence: write, read, and LRU eviction > 200 sessions", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "agy-session-cache-test-"));
	const sessionsFile = join(tempDir, "sessions.json");
	process.env.ANTIGRAVITY_SESSIONS_FILE = sessionsFile;

	try {
		clearAntigravitySessions();
		resetAntigravitySessionMemory();

		// 1. Ghi cache & đọc cache
		const session1 = getOrCreateAntigravitySession("sess-1");
		assert.equal(session1.sessionId, "sess-1");
		assert.equal(session1.stepIndex, 1);
		session1.lastExecutionId = "exec-step-1";
		session1.lastGoodEndpoint = "https://cloudcode-pa.googleapis.com";
		persistAntigravitySessions();

		assert.ok(existsSync(sessionsFile), "Session cache file must exist on disk");

		// Đọc trực tiếp file disk để verify cấu trúc json
		const fileData = JSON.parse(readFileSync(sessionsFile, "utf8"));
		assert.ok(Array.isArray(fileData));
		assert.equal(fileData.length, 1);
		assert.equal(fileData[0].sessionId, "sess-1");
		assert.equal(fileData[0].lastExecutionId, "exec-step-1");

		// Simulate restart
		resetAntigravitySessionMemory();
		const restored1 = getOrCreateAntigravitySession("sess-1");
		assert.equal(restored1.sessionId, "sess-1");
		assert.equal(restored1.stepIndex, 2); // stepIndex increments on next turn
		assert.equal(restored1.lastExecutionId, "exec-step-1");
		assert.equal(restored1.agentId, session1.agentId);
		assert.equal(restored1.trajectoryId, session1.trajectoryId);

		// 2. Vượt ngưỡng 200 sessions LRU eviction (MAX_SESSIONS = 200)
		clearAntigravitySessions();
		resetAntigravitySessionMemory();

		// Create sessions 1 to 200
		for (let i = 1; i <= 200; i++) {
			getOrCreateAntigravitySession(`sess-${i}`);
		}

		// Touch sess-1 so it gets promoted to most recently used
		getOrCreateAntigravitySession("sess-1");

		// Now add sess-201 -> exceeds 200 -> oldest untouched (sess-2) must be evicted
		getOrCreateAntigravitySession("sess-201");

		// Read disk file to verify count is capped at 200
		const diskSessions: Array<{ sessionId: string }> = JSON.parse(
			readFileSync(sessionsFile, "utf8"),
		);
		assert.equal(diskSessions.length, 200, "Disk sessions must be capped at MAX_SESSIONS = 200");

		const sessionIdsOnDisk = new Set(diskSessions.map((s) => s.sessionId));
		assert.ok(sessionIdsOnDisk.has("sess-1"), "sess-1 was promoted and must NOT be evicted");
		assert.ok(sessionIdsOnDisk.has("sess-201"), "sess-201 was newly added and must be present");
		assert.ok(!sessionIdsOnDisk.has("sess-2"), "sess-2 was oldest and must have been evicted");

		// Simulate restart and verify evicted session gets treated as a completely fresh session
		resetAntigravitySessionMemory();
		const freshSess2 = getOrCreateAntigravitySession("sess-2");
		assert.equal(freshSess2.stepIndex, 1, "Evicted session should restart with stepIndex = 1");

		const existingSess1 = getOrCreateAntigravitySession("sess-1");
		assert.equal(existingSess1.stepIndex, 3, "Retained session should increment stepIndex (turn 3)");
	} finally {
		delete process.env.ANTIGRAVITY_SESSIONS_FILE;
		clearAntigravitySessions();
		rmSync(tempDir, { recursive: true, force: true });
	}
});
