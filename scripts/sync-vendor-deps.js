/**
 * sync-vendor-deps.js
 *
 * Hoàn thiện `vendor/` thành một snapshot tự chứa (self-contained) bằng cách sao
 * chép các file phụ thuộc nội bộ còn thiếu từ bản `@earendil-works/pi-ai` đang
 * được cài đặt (hoặc `@mariozechner/pi-ai`) vào `vendor/`.
 *
 * Khi nào chạy:
 *   - Sau khi nâng cấp pi / pi-ai lên bản lớn (để re-sync snapshot vendor cho
 *     khớp API nội bộ mới).
 *   - Khi clone lại repo nhưng muốn vendor khớp với pi-ai đang cài (mặc định
 *     vendor đã commit sẵn snapshot, không cần chạy).
 *
 * Bản chất: rà soát các `import`/`require` tương đối trong vendor/*.js, với mọi
 * target chưa tồn tại thì tìm file nguồn trong `dist/` của pi-ai và copy vào.
 * Bao gồm xử lý "displacement": pi-ai >=0.83 đặt `simple-options.js` và
 * `transform-messages.js` ở `dist/api/` nhưng code expects ở `providers/`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.resolve(__dirname, "..", "vendor");

// ---- Locate pi-ai dist/ (same strategy as patch-global.js) ----
let globalNpmRoot = "";
try { globalNpmRoot = execSync("npm root -g", { encoding: "utf8" }).trim(); } catch {}
const home = process.env.HOME || "";

const candidateBases = [
  globalNpmRoot ? path.join(globalNpmRoot, "@mariozechner/pi-ai") : "",
  globalNpmRoot ? path.join(globalNpmRoot, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai") : "",
  "/opt/homebrew/lib/node_modules/@mariozechner/pi-ai",
  "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
  "/usr/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
  "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
  path.join(home, ".local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai"),
  path.join(home, ".pi/agent/npm/node_modules/@mariozechner/pi-ai"),
  path.join(home, ".openclaw/node_modules/@mariozechner/pi-ai"),
  "/Applications/AICoworker.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
  "/Applications/CrawBot.app/Contents/Resources/openclaw/node_modules/@mariozechner/pi-ai",
].filter(Boolean);

let DIST = "";
for (const base of candidateBases) {
  if (base && fs.existsSync(path.join(base, "dist/providers/google.js"))) {
    DIST = path.join(base, "dist");
    break;
  }
}
if (!DIST) {
  console.error("❌ Không tìm thấy dist/ của pi-ai. Cài/chạy pi trước rồi chạy lại script này.");
  process.exit(1);
}
console.log(`📦 pi-ai dist: ${DIST}`);

const importRe = /(?:from|import\(|require\()\s*["'](\.{1,2}\/[^"']+)["']/g;

function listJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJs(full));
    else if (e.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function resolveLocal(importerFile, rel) {
  const dir = path.dirname(importerFile);
  const base = path.resolve(dir, rel);
  for (const c of [base, base + ".js", path.join(base, "index.js")]) if (fs.existsSync(c)) return c;
  return null;
}

// Tìm nguồn trong dist cho một vendor target còn thiếu.
// Thử: cùng vị trí tương đối; nếu không có, thử dist/api/<basename> (displacement);
// cuối cùng thử dist/<basename>.
function findDistSource(vendorTarget) {
  const rel = path.relative(VENDOR, vendorTarget);
  for (const c of [path.join(DIST, rel), path.join(DIST, "api", path.basename(rel)), path.join(DIST, path.basename(rel))]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const copied = [];
for (let iter = 0; iter < 30; iter++) {
  let n = 0;
  for (const f of listJs(VENDOR)) {
    const src = fs.readFileSync(f, "utf8");
    let m; importRe.lastIndex = 0;
    while ((m = importRe.exec(src)) !== null) {
      const rel = m[1];
      if (resolveLocal(f, rel)) continue;
      const dir = path.dirname(f);
      let target = path.resolve(dir, rel);
      if (!target.endsWith(".js")) target += ".js";
      if (fs.existsSync(target)) continue;
      const source = findDistSource(target);
      if (!source) { console.log(`!! Không có nguồn trong dist: ${path.relative(VENDOR, target)}  (từ ${path.relative(VENDOR, f)})`); continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      copied.push(`${path.relative(DIST, source)}  ->  ${path.relative(VENDOR, target)}`);
      n++;
    }
  }
  if (n === 0) break;
}

console.log("\n=== Đã đồng bộ ===");
copied.forEach((c) => console.log("  " + c));
console.log(`\nTổng số file đã copy: ${copied.length}`);

let unresolved = 0;
for (const f of listJs(VENDOR)) {
  const src = fs.readFileSync(f, "utf8");
  let m; importRe.lastIndex = 0;
  while ((m = importRe.exec(src)) !== null) {
    if (!resolveLocal(f, m[1])) { console.log(`  ✗ ${path.relative(VENDOR, f)} -> ${m[1]}`); unresolved++; }
  }
}
console.log(unresolved === 0 ? "\n✅ Không còn import tương đối nào thiếu. Vendor self-contained." : `\n⚠️  Còn ${unresolved} import thiếu (xem trên).`);
