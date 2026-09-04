#!/usr/bin/env node
/** repo root config → Portal·API 번들 동기화 (Vercel/Render 빌드용) */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "config", "registered-target-sites.json");

for (const destDir of [
  join(root, "apps", "portal", "config"),
  join(root, "apps", "api", "config"),
]) {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "registered-target-sites.json");
  copyFileSync(src, dest);
  console.log(`synced registered-target-sites.json → ${dest}`);
}
