// Starts the AI server: npm run server (or npm run dev:server to restart on changes).
import { log } from "../src/core/log";
import { createElevenLabs } from "./ai/elevenlabs";
import { createGemini } from "./ai/gemini";
import { NO_AI } from "./ai/types";
import { createApp } from "./app";
import { loadConfig } from "./env";

const config = loadConfig();
const ai = {
  ...NO_AI,
  ...(config.geminiKey === null ? {} : createGemini(config.geminiKey)),
  ...(config.elevenLabsKey === null ? {} : createElevenLabs(config.elevenLabsKey)),
};
const app = await createApp({ config, ai });
app.listen(config.port, () => {
  log("info", "server_listening", {
    port: config.port,
    gemini: config.geminiKey !== null,
    elevenlabs: config.elevenLabsKey !== null,
  });
});
