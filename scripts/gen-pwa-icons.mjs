// Generates the PWA / Apple home-screen icons referenced by manifest.json and
// layout.tsx from the brand source assets/icon.png (Roni's pink design).
// Run: `node scripts/gen-pwa-icons.mjs`. The PNGs are committed to git so Vercel
// serves them (its build env is immutable — locally-only files would 404).
import sharp from "sharp";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "assets/icon.png");
const outDir = resolve(root, "public/icons");
const BRAND_BG = "#FCF1F3";

mkdirSync(outDir, { recursive: true });

const jobs = [
  // Maskable PWA icons (manifest.json) — keep full bleed.
  { name: "icon-192.png", size: 192, flatten: false },
  { name: "icon-512.png", size: 512, flatten: false },
  // Apple touch icon — iOS adds black behind transparency, so flatten on brand bg.
  { name: "apple-touch-icon.png", size: 180, flatten: true },
];

for (const { name, size, flatten } of jobs) {
  let img = sharp(src).resize(size, size, { fit: "cover" });
  if (flatten) img = img.flatten({ background: BRAND_BG });
  await img.png().toFile(resolve(outDir, name));
  console.log(`✓ public/icons/${name} (${size}×${size})`);
}
