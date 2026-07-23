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

const targetCandidateDirs = [
  "/opt/homebrew/lib/node_modules/@mariozechner/pi-ai",
  "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai",
  globalNpmRoot ? path.join(globalNpmRoot, "@mariozechner/pi-ai") : "",
  globalNpmRoot ? path.join(globalNpmRoot, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai") : "",
  path.join(process.env.HOME || "", ".pi/agent/npm/node_modules/@mariozechner/pi-ai"),
  path.join(process.env.HOME || "", ".openclaw/node_modules/@mariozechner/pi-ai")
].filter(Boolean);

let patchedCount = 0;

for (const targetDir of targetCandidateDirs) {
  if (fs.existsSync(targetDir)) {
    const distProviders = path.join(targetDir, "dist/providers");
    const distOauth = path.join(targetDir, "dist/utils/oauth");

    if (fs.existsSync(distProviders) && fs.existsSync(distOauth)) {
      console.log(`📦 Patching pi-ai module at: ${targetDir}`);
      
      // Copy provider files
      const vendorProviders = path.join(vendorDir, "providers");
      if (fs.existsSync(vendorProviders)) {
        for (const file of fs.readdirSync(vendorProviders)) {
          fs.copyFileSync(path.join(vendorProviders, file), path.join(distProviders, file));
        }
      }

      // Copy oauth files
      const vendorOauth = path.join(vendorDir, "utils/oauth");
      if (fs.existsSync(vendorOauth)) {
        for (const file of fs.readdirSync(vendorOauth)) {
          fs.copyFileSync(path.join(vendorOauth, file), path.join(distOauth, file));
        }
      }

      patchedCount++;
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
