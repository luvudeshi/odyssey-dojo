// Tells the host's page which address a phone on the same Wi-Fi should open, so the room's QR code works.
import { baseUrl, lanAddress } from "../lib/address";
import type { Register } from "../app";

export const register: Register = (router, { config }) => {
  router.get("/api/rooms/address", (request, response) => {
    // The page says which port it was opened on: behind Vite's proxy this server cannot tell.
    const asked = typeof request.query.port === "string" && /^\d{1,5}$/.test(request.query.port) ? Number(request.query.port) : null;
    const base = baseUrl({
      publicBaseUrl: config.publicBaseUrl,
      lan: lanAddress(),
      port: asked ?? request.socket.localPort,
      protocol: request.protocol,
      host: request.get("host"),
    });
    response.json({ base });
  });
};
