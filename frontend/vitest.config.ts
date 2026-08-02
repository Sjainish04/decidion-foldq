import react from "@vitejs/plugin-react";
import { defaultExclude, defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // tests/e2e/**/*.spec.ts are Playwright specs (run via `pnpm test:e2e`), not
    // Vitest ones -- both frameworks default-glob *.spec.ts, so without this
    // exclusion Vitest tries to execute Playwright's test() and fails.
    exclude: [...defaultExclude, "tests/e2e/**"],
  },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
