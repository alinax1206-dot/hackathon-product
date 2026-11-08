import { defineConfig, loadEnv } from "vite";
import { createSoundAdvisorMiddleware } from "./server/ai-sound-advisor.js";
import { createAssistantMiddleware } from "./server/ai-assistant.js";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "TINKER_",
  ]);
  return {
    plugins: [
      {
        name: "chartaloud-local-ai",
        apply: "serve",
        configureServer(server) {
          const providerOptions = {
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
