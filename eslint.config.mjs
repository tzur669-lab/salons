import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Android Capacitor build artifacts — not application code:
    "android/**",
  ]),
  {
    rules: {
      // The codebase uses `useEffect(() => { setState(false); load(); }, [dep])`
      // intentionally throughout for resetting loading/error state before fetching.
      "react-hooks/set-state-in-effect": "warn",
      // Date.now() inside useMemo / render is intentional (snapshot current time
      // for "is this appointment in the past?" logic). Accept the impurity.
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
