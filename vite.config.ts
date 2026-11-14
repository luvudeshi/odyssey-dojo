import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const API = "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  // The AI server (npm run dev:server) is optional: without it these fail fast and the game uses its offline fallbacks.
  // Agents keep their worktrees under .claude/; a build in one of them must not reload this page.
  server: { proxy: { "/api": API, "/replays": API }, watch: { ignored: ["**/.claude/**"] } },
  // Many agents share this machine; the default 5 s cuts off honest tests when every core is busy.
  test: { include: ["tests/**/*.test.ts", "server/**/*.test.ts"], testTimeout: 30_000 },
});
