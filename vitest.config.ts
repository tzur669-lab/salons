import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolves the `@/` alias the same way tsconfig/Next do, so tests can import
// app modules directly. Pure logic only (no DOM) → the fast `node` environment.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
