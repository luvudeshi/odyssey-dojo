// GET /api/health: is the server up, and which AI services have a key.
import type { Register } from "../app";

export const register: Register = (router, { ai }) => {
  router.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      gemini: ai.json !== null,
      portraits: ai.image !== null,
      speech: ai.speech !== null,
      sound: ai.sound !== null,
    });
  });
};
