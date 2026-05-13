import { describe, expect, it } from "vitest";
import {
  isValidTranscriptSegment,
  mapTranscriptResultToTextSegments,
} from "../src/premiere/transcript";
import type { Segment, TranscriptResult } from "../src/types/transcript";

describe("mapTranscriptResultToTextSegments", () => {
  it("mapea segmentos válidos a TextSegments", () => {
    const transcript: TranscriptResult = {
      clipId: "clip-1",
      language: "es-AR",
      createdAt: "2026-03-18T00:00:00.000Z",
      segments: [
        {
          id: "seg-1",
          speaker: "SPEAKER_1",
          startMs: 0,
          endMs: 1000,
          text: "hola mundo",
          words: [
            { text: "hola", startMs: 0, endMs: 500, confidence: 0.99 },
            { text: "mundo", startMs: 501, endMs: 1000, confidence: 0.98 },
          ],
        },
      ],
    };

    const mapped = mapTranscriptResultToTextSegments(transcript);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.id).toBe("seg-1");
    expect(mapped[0]?.text).toBe("hola mundo");
    expect(mapped[0]?.words).toHaveLength(2);
  });

  it("filtra segmentos inválidos", () => {
    const validSegment: Segment = {
      id: "seg-valid",
      speaker: null,
      startMs: 0,
      endMs: 800,
      text: "ok",
      words: [{ text: "ok", startMs: 0, endMs: 800, confidence: 1 }],
    };

    const invalidSegments: Segment[] = [
      {
        id: "",
        speaker: null,
        startMs: 0,
        endMs: 500,
        text: "sin id",
        words: [],
      },
      {
        id: "seg-bad-time",
        speaker: null,
        startMs: 600,
        endMs: 100,
        text: "time invertido",
        words: [],
      },
      {
        id: "seg-no-words",
        speaker: null,
        startMs: 0,
        endMs: 100,
        text: "sin words",
        words: null as unknown as Segment["words"],
      },
    ];

    const transcript: TranscriptResult = {
      clipId: "clip-2",
      language: "es-AR",
      createdAt: "2026-03-18T00:00:00.000Z",
      segments: [validSegment, ...invalidSegments],
    };

    const mapped = mapTranscriptResultToTextSegments(transcript);

    expect(isValidTranscriptSegment(validSegment)).toBe(true);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.id).toBe("seg-valid");
  });
});
