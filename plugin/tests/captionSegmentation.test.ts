import { describe, expect, it } from "vitest";
import {
  buildCaptionSegmentsFromWords,
  resolveCaptionEditorSettings,
} from "../src/services/captionSegmentation";
import type { SttWord } from "../src/types/transcribe";

const sampleWords: SttWord[] = [
  { startMs: 0, endMs: 300, word: "Hola" },
  { startMs: 350, endMs: 650, word: "Feli," },
  { startMs: 700, endMs: 1000, word: "como" },
  { startMs: 1050, endMs: 1350, word: "estas" },
  { startMs: 1400, endMs: 1700, word: "hoy" },
  { startMs: 2400, endMs: 2700, word: "te" },
  { startMs: 2750, endMs: 3050, word: "mando" },
  { startMs: 3100, endMs: 3400, word: "un" },
  { startMs: 3450, endMs: 3800, word: "abrazo." },
];

describe("buildCaptionSegmentsFromWords", () => {
  it("arma captions naturales con maxCharsPerLine 32", () => {
    const captions = buildCaptionSegmentsFromWords(sampleWords, {
      mode: "natural",
      maxCharsPerLine: 32,
      maxLines: 2,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 1700, text: "Hola Feli, como estas hoy" },
      { startMs: 2400, endMs: 3800, text: "te mando un abrazo." },
    ]);
  });

  it("arma captions cortos con maxCharsPerLine 8", () => {
    const naturalCaptions = buildCaptionSegmentsFromWords(sampleWords, {
      mode: "natural",
      maxCharsPerLine: 32,
      maxLines: 2,
    });
    const shortCaptions = buildCaptionSegmentsFromWords(sampleWords, {
      mode: "short",
      maxCharsPerLine: 8,
      maxLines: 1,
      maxDurationMs: 1800,
    });

    expect(shortCaptions.length).toBeGreaterThan(naturalCaptions.length);
    expect(shortCaptions.map((caption) => caption.text)).toEqual([
      "Hola",
      "Feli,",
      "como",
      "estas",
      "hoy",
      "te mando",
      "un abrazo.",
    ]);
  });

  it("permite maxCharsPerLine 1 en palabra por palabra sin cortar palabras", () => {
    const captions = buildCaptionSegmentsFromWords(sampleWords, {
      mode: "word-by-word",
      maxCharsPerLine: 1,
      maxLines: 1,
    });

    expect(captions.map((caption) => caption.text)).toEqual(
      sampleWords.map((word) => word.word),
    );
  });

  it("respeta maxLines 1 y maxLines 2 al segmentar y envolver texto", () => {
    const words: SttWord[] = [
      { startMs: 0, endMs: 300, word: "palabra" },
      { startMs: 350, endMs: 650, word: "larga" },
      { startMs: 700, endMs: 1000, word: "otra" },
    ];

    const oneLineCaptions = buildCaptionSegmentsFromWords(words, {
      mode: "natural",
      maxCharsPerLine: 12,
      maxLines: 1,
      maxDurationMs: 4000,
    });
    const twoLineCaptions = buildCaptionSegmentsFromWords(words, {
      mode: "natural",
      maxCharsPerLine: 12,
      maxLines: 2,
      maxDurationMs: 4000,
    });

    expect(oneLineCaptions.map((caption) => caption.text)).toEqual([
      "palabra",
      "larga otra",
    ]);
    expect(twoLineCaptions).toEqual([
      { startMs: 0, endMs: 1000, text: "palabra\nlarga otra" },
    ]);
  });
});

describe("resolveCaptionEditorSettings", () => {
  it("mantiene minimo 1 para maxCharsPerLine y limita duraciones", () => {
    expect(resolveCaptionEditorSettings({
      maxCharsPerLine: -20,
      maxDurationMs: 20,
      minPauseMs: 2000,
    })).toMatchObject({
      maxCharsPerLine: 1,
      maxDurationMs: 500,
      minPauseMs: 1000,
    });
  });
});
