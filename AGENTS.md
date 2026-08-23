# Agent Rules & Protocols

## SOT-Graph Knowledge Reuse Protocol (SSOT)

### 1. Single Source of Truth
The physical filesystem is the absolute ground truth. The SOT knowledge graph (`.sot/sot.db`) is an authoritative projection of codebase reality.

### 2. Pre-Implementation Verification (Mandatory)
Before creating new helpers, utilities, or provider implementations:
1. Search verified code across the project:
   `sot search "<what you are looking for>" --scope <optional-dir>` (or tool `sot_search`)
2. Adhere to Trust Verdicts:
   - `[STRONG]`: 100% physically verified on disk — reuse directly.
   - `[WEAK]`: Semantic match only — inspect range (`file:line-line`) before use.
   - `[REBUILT]`: File moved/renamed — use the new reported path.

### 3. Safe Refactoring & Impact Tracing
Before modifying or deleting core symbols, classes, or routes:
1. Inspect 2-way call graph: `sot explore "<symbol>"` (or tool `sot_explore`)
2. Inspect exact call sites: `sot usages "<symbol>"` (or tool `sot_usages`)
3. For interfaces/adapters: `sot implementations "<symbol>"` (or tool `sot_implementations`)

### 4. Context Isolation & Subgraph Packaging
When delegating context to subagents or prompt registers:
- Extract compact k-hop ContextBundle: `sot pack "<symbol>" --depth 2` (or tool `sot_pack`)

### 5. Drift Reconciliation & Knowledge Recording
- After adding, modifying, or removing files, reconcile the graph:
  `sot reconcile` (or tool `sot_reconcile`)
- After solving non-obvious bugs or making architectural decisions, persist knowledge:
  `sot insert --title "<topic>" --body "<details>" --keywords "k1,k2"` (or tool `sot_insert`)

## Advisor Consultation Protocol
When the user asks to "tham vấn Advisor" or consult the advisor:
1. Synthesize the current problem statement, proposed plan/code, and relevant context.
2. Delegate to the `advisor` subagent:
   `Agent(subagent_type: "advisor", prompt: "<Synthesized context, problem details, and specific areas requesting critique>")`
3. Await Advisor's feedback, risk analysis, and strategic direction (Advisor will automatically delegate codebase lookups to `scout` if needed).
4. Review and execute according to Advisor's recommendations.

