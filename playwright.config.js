import { defineConfig } from "@playwright/test";
const externalURL = process.env.FIGUREWALK_TEST_URL;
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: externalURL || "http://127.0.0.1:5191",
    ...(process.env.FIGUREWALK_CHROME_PATH
      ? {
          launchOptions: { executablePath: process.env.FIGUREWALK_CHROME_PATH },
        }
      : {}),
  },
  webServer: externalURL
    ? undefined
    : {
        command: "npm run dev -- --port 5191 --strictPort",
        url: "http://127.0.0.1:5191",
        reuseExistingServer: true,
      },
});
