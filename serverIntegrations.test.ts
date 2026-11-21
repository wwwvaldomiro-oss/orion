import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import financeIntegrationRouter, {
  parseExternalPluggyJson,
  validatePluggyCredentialsFormat,
} from "./serverIntegrations";

describe("Pluggy Express API routing and JSON error hardening", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use("/api", financeIntegrationRouter);
    app.use(
      "/api",
      (
        err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const status =
          typeof (err as { status?: unknown })?.status === "number"
            ? Number((err as { status?: number }).status)
            : 400;
        res.status(status).json({ error: err instanceof Error ? err.message : "Erro JSON" });
      },
    );
    app.use("/api", (req, res) => {
      res.status(404).json({ error: `Rota de API não encontrada (${req.method} /api${req.path}).` });
    });
    app.get("/{*path}", (_req, res) => {
      res.status(200).type("text/html").send("<!doctype html><html><body>SPA</body></html>");
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("exposes /api/pluggy/health as JSON with encryptionConfigured ready", async () => {
    const resp = await fetch(`${baseUrl}/api/pluggy/health`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("application/json");
    const json = (await resp.json()) as {
      ok: boolean;
      routesRegistered: boolean;
      encryptionConfigured: boolean;
    };
    expect(json.ok).toBe(true);
    expect(json.routesRegistered).toBe(true);
    expect(json.encryptionConfigured).toBe(true);
  });

  it("returns 401 JSON for unauthenticated /api/pluggy/status and /api/pluggy/1/config", async () => {
    const statusResp = await fetch(`${baseUrl}/api/pluggy/status`);
    expect(statusResp.status).toBe(401);
    expect(statusResp.headers.get("content-type")).toContain("application/json");

    const cfgResp = await fetch(`${baseUrl}/api/pluggy/1/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "x", clientSecret: "y" }),
    });
    expect(cfgResp.status).toBe(401);
    expect(cfgResp.headers.get("content-type")).toContain("application/json");
  });

  it("never falls back to SPA HTML for unknown /api routes or malformed JSON bodies", async () => {
    const missing = await fetch(`${baseUrl}/api/inexistente`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    const missingBody = (await missing.json()) as { error: string };
    expect(missingBody.error).toContain("Rota de API não encontrada");

    const badJson = await fetch(`${baseUrl}/api/pluggy/1/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad-json",
    });
    expect(badJson.status).toBe(400);
    expect(badJson.headers.get("content-type")).toContain("application/json");
  });

  it("rejects HTML upstream payloads from Pluggy cleanly without SyntaxError", async () => {
    const htmlResp = new Response("<!doctype html><html><body>Cloudflare 502</body></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    await expect(parseExternalPluggyJson(htmlResp, "/auth")).rejects.toThrow(
      /Pluggy retornou HTML \(HTTP 502\)/,
    );
  });

  it("validates UUID format for Pluggy Client ID and detects swapped credentials", () => {
    const valid = validatePluggyCredentialsFormat(
      ' "123e4567-e89b-12d3-a456-426614174000" ',
      "my-secret-value-123",
    );
    expect(valid).toEqual({
      ok: true,
      clientId: "123e4567-e89b-12d3-a456-426614174000",
      clientSecret: "my-secret-value-123",
    });

    const swapped = validatePluggyCredentialsFormat(
      "my-secret-value-123",
      "123e4567-e89b-12d3-a456-426614174000",
    );
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) expect(swapped.error).toContain("invertido");

    const invalid = validatePluggyCredentialsFormat("not-a-uuid", "not-a-uuid-either");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain("UUID");
  });
});
