import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = "http://127.0.0.1:5188";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/studio.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "tmp/e2e-results",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js --dev",
    url: `${baseURL}/api/session`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: "5188",
      ADMIN_PASSWORD: "",
      APP_ORIGIN: baseURL,
      DATA_DIR: path.resolve("tmp", `e2e-run-${Date.now()}`),
    },
  },
});
