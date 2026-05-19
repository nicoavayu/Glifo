import { beforeEach, describe, expect, it } from "vitest";
import {
  claimNextMogrtBridgeJob,
  clearMogrtBridgeJobsForTests,
  completeMogrtBridgeJob,
  createMogrtBridgeJob,
  getMogrtBridgeJob,
} from "../src/services/mogrtJobQueue";

describe("mogrtJobQueue", () => {
  beforeEach(() => {
    clearMogrtBridgeJobsForTests();
  });

  it("crea y reclama un job MOGRT válido", () => {
    const created = createMogrtBridgeJob({
      id: "job-1",
      mogrtPath: "/tmp/template.mogrt",
      sequenceInMs: 187721,
      captionSegment: {
        startMs: 0,
        endMs: 3500,
        text: "Hola Feli te deseo muchas felicidades",
      },
      videoTrackOffset: 1,
      audioTrackOffset: 0,
    });

    expect(created.ok).toBe(true);
    expect(created.job).toMatchObject({
      id: "job-1",
      status: "queued",
      sequenceInMs: 187721,
      videoTrackOffset: 1,
      audioTrackOffset: 0,
    });

    const claimed = claimNextMogrtBridgeJob();
    expect(claimed).toMatchObject({
      id: "job-1",
      status: "claimed",
    });
    expect(claimed?.claimedAt).toEqual(expect.any(String));
  });

  it("rechaza captionSegments inválidos", () => {
    const created = createMogrtBridgeJob({
      id: "job-invalid",
      mogrtPath: "/tmp/template.mogrt",
      sequenceInMs: 187721,
      captionSegment: {
        startMs: 3500,
        endMs: 3500,
        text: "sin duración",
      },
    });

    expect(created.ok).toBe(false);
    expect(created.error?.code).toBe("caption_segment_invalid");
    expect(claimNextMogrtBridgeJob()).toBeNull();
  });

  it("guarda resultado parcial con insert ok y text failed", () => {
    createMogrtBridgeJob({
      id: "job-result",
      mogrtPath: "/tmp/template.mogrt",
      sequenceInMs: 1000,
      captionSegment: {
        startMs: 100,
        endMs: 500,
        text: "texto",
      },
    });
    claimNextMogrtBridgeJob();

    const completed = completeMogrtBridgeJob("job-result", {
      ok: true,
      inserted: true,
      text: {
        ok: false,
        error: "No se encontró Source Text",
      },
      duration: {
        ok: true,
      },
    });

    expect(completed?.status).toBe("completed");
    expect(getMogrtBridgeJob("job-result")?.result).toMatchObject({
      inserted: true,
      text: {
        ok: false,
      },
    });
  });
});
