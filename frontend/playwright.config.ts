import { defineConfig } from "@playwright/test";

// Port 8010, not 8000: 8000 is occupied by an unrelated server on the
// machines this suite runs on. The frontend's API client already falls back
// to localhost:8010 by default (see src/lib/api/client.ts), so this only
// needs to start the backend on the matching port.
const API_PORT = 8010;
const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Serial on purpose. These specs are not independent: they share one backend
  // process and one browser profile, and the fold journey depends on state it
  // wrote to sessionStorage a step earlier. Run four-wide they contend on the
  // dev server's on-demand compilation and on live RCSB calls, and fail on a
  // different assertion each time - flakiness that reads as a product bug and
  // is not one. The whole suite takes under 30s serially.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm dev --port 3000",
      url: "http://localhost:3000/dashboard",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
    {
      command: `cd .. && .venv/bin/uvicorn foldq.api.app:app --port ${API_PORT}`,
      url: `${API_URL}/api/v1/meta`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
