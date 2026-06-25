import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Firestore security-rules suite — runs against the emulator via
// `npm run test:rules`. Kept separate from the default config so `npm test`
// (which globs src/**) never tries to run these without the emulator.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
