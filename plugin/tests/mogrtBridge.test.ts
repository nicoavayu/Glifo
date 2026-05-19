import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCaptionSegmentsMogrtBridgeFlow } from "../src/services/mogrtBridge";

describe("runCaptionSegmentsMogrtBridgeFlow", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("crea un job por captionSegment y espera cada resultado antes del siguiente", async () => {
    const calls: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === "POST" && href.endsWith("/bridge/mogrt-jobs")) {
        const body = JSON.parse(String(init.body)) as {
          id: string;
          captionSegment: { text: string };
        };
        calls.push(`post:${body.captionSegment.text}`);
        return jsonResponse({
          job: {
            id: body.id,
            createdAt: "2026-05-19T14:00:00.000Z",
            videoTrackOffset: 0,
            audioTrackOffset: 0,
          },
        }, 202);
      }

      if (href.includes("/bridge/mogrt-jobs/") && href.endsWith("/result")) {
        calls.push("result");
        return jsonResponse({
          result: createBridgeResult({ textOk: true, durationOk: true }),
        });
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    }));

    const report = await runCaptionSegmentsMogrtBridgeFlow({
      mogrtPath: "/tmp/template.mogrt",
      sequenceInMs: 1000,
      captionSegments: [
        { startMs: 0, endMs: 500, text: "uno" },
        { startMs: 700, endMs: 1200, text: "dos" },
      ],
    });

    expect(calls).toEqual(["post:uno", "result", "post:dos", "result"]);
    expect(report.status).toBe("ok");
    expect(report.totals).toMatchObject({
      total: 2,
      processed: 2,
      successful: 2,
      failed: 0,
      insertOk: 2,
      textOk: 2,
      durationOk: 2,
    });
    expect(report.items[0].target).toMatchObject({
      timelineStartMs: 1000,
      durationMs: 500,
      text: "uno",
    });
    expect(report.items[1].target).toMatchObject({
      timelineStartMs: 1700,
      durationMs: 500,
      text: "dos",
    });
  });

  it("continúa con el siguiente caption cuando un item tiene error parcial", async () => {
    let resultCount = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === "POST" && href.endsWith("/bridge/mogrt-jobs")) {
        const body = JSON.parse(String(init.body)) as { id: string };
        return jsonResponse({
          job: {
            id: body.id,
            createdAt: "2026-05-19T14:00:00.000Z",
            videoTrackOffset: 0,
            audioTrackOffset: 0,
          },
        }, 202);
      }

      if (href.includes("/bridge/mogrt-jobs/") && href.endsWith("/result")) {
        resultCount += 1;
        return jsonResponse({
          result: createBridgeResult({
            textOk: resultCount !== 1,
            durationOk: true,
          }),
        });
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    }));

    const report = await runCaptionSegmentsMogrtBridgeFlow({
      mogrtPath: "/tmp/template.mogrt",
      sequenceInMs: 2000,
      captionSegments: [
        { startMs: 0, endMs: 400, text: "fallo texto" },
        { startMs: 500, endMs: 900, text: "sigue" },
      ],
    });

    expect(report.status).toBe("partial");
    expect(report.totals).toMatchObject({
      total: 2,
      processed: 2,
      successful: 1,
      failed: 1,
      insertOk: 2,
      textOk: 1,
      durationOk: 2,
    });
    expect(report.items[0].text).toMatchObject({
      ok: false,
      error: "No se pudo setear texto.",
    });
    expect(report.items[1].text.ok).toBe(true);
  });
});

function createBridgeResult(input: {
  textOk: boolean;
  durationOk: boolean;
}): unknown {
  return {
    ok: true,
    inserted: true,
    text: input.textOk
      ? { ok: true }
      : { ok: false, error: "No se pudo setear texto." },
    duration: input.durationOk
      ? { ok: true }
      : { ok: false, error: "No se pudo ajustar duración." },
    itemName: "GLIFO subtitle",
    startTicks: "1",
    endTicks: "2",
    errors: [],
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
