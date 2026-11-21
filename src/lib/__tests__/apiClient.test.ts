import { describe, expect, it, vi } from "vitest";
import { ApiResponseError, parseApiJsonResponse } from "@/lib/apiClient";

describe("parseApiJsonResponse", () => {
  it("parses valid JSON responses cleanly", async () => {
    const resp = new Response(JSON.stringify({ ok: true, slots: [1, 2] }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    const data = await parseApiJsonResponse<{ ok: boolean; slots: number[] }>(
      resp,
      "/api/pluggy/status",
    );
    expect(data).toEqual({ ok: true, slots: [1, 2] });
  });

  it("rejects HTML SPA/proxy fallback responses with clear diagnostic error without crashing JSON.parse", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = "<!doctype html><html><body>SPA Fallback</body></html>";
    const resp = new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    await expect(
      parseApiJsonResponse(resp, "/api/pluggy/1/config", "POST"),
    ).rejects.toThrow(/página HTML \(HTTP 200\) em vez de JSON/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("extracts server error message from non-OK JSON responses", async () => {
    const resp = new Response(
      JSON.stringify({ error: "7 PERMISSION_DENIED: Missing or insufficient permissions" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(
      parseApiJsonResponse(resp, "/api/pluggy/1/config", "POST"),
    ).rejects.toMatchObject({
      name: "ApiResponseError",
      status: 403,
      message: "7 PERMISSION_DENIED: Missing or insufficient permissions",
    } satisfies Partial<ApiResponseError>);
  });
});
