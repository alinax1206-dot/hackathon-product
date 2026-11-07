import { defineConfig, loadEnv } from "vite";
import { createSoundAdvisorMiddleware } from "./server/ai-sound-advisor.js";
import { createAssistantMiddleware } from "./server/ai-assistant.js";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "AI_PROVIDER",
    "GEMINI_",
    "TINKER_",
  ]);
  return {
    plugins: [
      {
        name: "chartaloud-local-ai",
        apply: "serve",
        configureServer(server) {
          const providerOptions = {
            getProvider: () =>
              process.env.AI_PROVIDER || env.AI_PROVIDER || "gemini",
            getApiKey: () => process.env.GEMINI_API_KEY || env.GEMINI_API_KEY,
            getModel: () =>
              process.env.GEMINI_MODEL ||
              env.GEMINI_MODEL ||
              "gemini-2.5-flash-lite",
            getTinkerApiKey: () =>
              process.env.TINKER_API_KEY || env.TINKER_API_KEY,
            getTinkerModelPath: () =>
              process.env.TINKER_MODEL_PATH || env.TINKER_MODEL_PATH,
          };
          server.middlewares.use(
            "/api/sound-map",
            createSoundAdvisorMiddleware(providerOptions),
          );
          server.middlewares.use(
            "/api/assistant",
            createAssistantMiddleware(providerOptions),
          );
        },
      },
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, "index.html"),
        },
      },
    },
  };
});
