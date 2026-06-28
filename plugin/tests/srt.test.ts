import { describe, expect, it } from "vitest";
import {
  buildSrtFromCaptionSegments,
  buildSuggestedSrtFilename,
  formatSrtTimestamp,
  isSrtExportError,
} from "../src/services/srt";
import {
  createCaptionEditorStateFromTranscript,
  getCaptionEditorPayload,
  rebuildCaptionEditorSegments,
} from "../src/panel/panelController";

describe("buildSrtFromCaptionSegments", () => {
  it("genera SRT desde captionSegments con tiempos relativos", () => {
    expect(
      buildSrtFromCaptionSegments([
        {
          startMs: 0,
          endMs: 3500,
          text: "Hola Feni te deseo muchas felicidades en",
        },
        {
          startMs: 3500,
          endMs: 6380,
          text: "estos 15 años que vas a cumplir",
        },
      ]),
    ).toBe([
      "1",
      "00:00:00,000 --> 00:00:03,500",
      "Hola Feni te deseo muchas felicidades en",
      "",
      "2",
      "00:00:03,500 --> 00:00:06,380",
      "estos 15 años que vas a cumplir",
      "",
    ].join("\n"));
  });

  it("exporta el estado visible recalculado del editor", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni." },
        { startMs: 700, endMs: 1000, word: "Te" },
        { startMs: 1050, endMs: 1350, word: "deseo" },
        { startMs: 1400, endMs: 1700, word: "felicidades." },
      ],
      captionSegments: [
        { startMs: 0, endMs: 1700, text: "caption viejo sin reformatear" },
      ],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        mode: "word-by-word",
        maxLines: 1,
        maxCharsPerLine: 1,
      },
    };
    state = rebuildCaptionEditorSegments(state);

    const srt = buildSrtFromCaptionSegments(
      getCaptionEditorPayload(state, null).captionSegments,
    );

    expect(srt).toContain("Hola");
    expect(srt).toContain("felicidades.");
    expect(srt).not.toContain("caption viejo sin reformatear");
  });

  it("ordena, sanitiza texto y evita overlaps", () => {
    expect(
      buildSrtFromCaptionSegments([
        {
          startMs: 1800,
          endMs: 3000,
          text: "segunda\n\n linea   con   espacios",
        },
        {
          startMs: -20,
          endMs: 2000,
          text: " primera linea ",
        },
      ]),
    ).toBe([
      "1",
      "00:00:00,000 --> 00:00:02,000",
      "primera linea",
      "",
      "2",
      "00:00:02,000 --> 00:00:03,000",
      "segunda\nlinea con espacios",
      "",
    ].join("\n"));
  });

  it("descarta segmentos inválidos y falla si no queda ningún cue", () => {
    expect(() => {
      buildSrtFromCaptionSegments([
        {
          startMs: 1000,
          endMs: 1000,
          text: "sin duracion",
        },
        {
          startMs: 2000,
          endMs: 3000,
          text: "   ",
        },
      ]);
    }).toThrow("No hay captionSegments válidos");
  });

  it("falla claramente cuando no hay captionSegments", () => {
    try {
      buildSrtFromCaptionSegments([]);
      throw new Error("expected SRT export to fail");
    } catch (error) {
      expect(isSrtExportError(error)).toBe(true);
      if (isSrtExportError(error)) {
        expect(error.code).toBe("caption_segments_missing");
      }
    }
  });
});

describe("formatSrtTimestamp", () => {
  it("formatea timestamps SRT con horas y coma decimal", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(3_605_042)).toBe("01:00:05,042");
  });
});

describe("buildSuggestedSrtFilename", () => {
  it("usa el nombre glifo-captions-YYYYMMDD-HHMMSS.srt", () => {
    expect(buildSuggestedSrtFilename(new Date(2026, 4, 19, 3, 4, 5))).toBe(
      "glifo-captions-20260519-030405.srt",
    );
  });
});
