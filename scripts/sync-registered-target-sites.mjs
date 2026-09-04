#!/usr/bin/env node
/** repo root config → Portal 번들 (Vercel 빌드용) 동기화 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "config", "registered-target-sites.json");
const destDir = join(root, "apps", "portal", "config");
const dest = join(destDir, "registered-target-sites.json");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("synced registered-target-sites.json → apps/portal/config/");
