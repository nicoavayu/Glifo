import { describe, expect, it } from "vitest";
import { buildCaptionSegments } from "../src/services/captionSegmentation";

describe("buildCaptionSegments", () => {
  it("devuelve lista vacia si no hay words", () => {
    expect(buildCaptionSegments([])).toEqual([]);
  });

  it("corta por maxDurationMs sin cortar palabras", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 500, word: "uno" },
      { startMs: 600, endMs: 1100, word: "dos" },
      { startMs: 1200, endMs: 1700, word: "tres" },
      { startMs: 1800, endMs: 2300, word: "cuatro" },
      { startMs: 2400, endMs: 2900, word: "cinco" },
    ], {
      maxDurationMs: 1800,
      maxCharsPerLine: 32,
      maxLines: 2,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 1700, text: "uno dos tres" },
      { startMs: 1800, endMs: 2900, text: "cuatro cinco" },
    ]);
  });

  it("corta por maxChars total", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 300, word: "palabra" },
      { startMs: 350, endMs: 650, word: "larga" },
      { startMs: 700, endMs: 1000, word: "para" },
      { startMs: 1050, endMs: 1350, word: "caption" },
    ], {
      maxCharsPerLine: 14,
      maxLines: 1,
      maxDurationMs: 3500,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 650, text: "palabra larga" },
      { startMs: 700, endMs: 1350, text: "para caption" },
    ]);
  });

  it("corta por pausa mayor a maxGapMs", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 300, word: "hola" },
      { startMs: 350, endMs: 700, word: "feli" },
      { startMs: 1500, endMs: 1900, word: "seguimos" },
      { startMs: 1950, endMs: 2300, word: "aca" },
    ], {
      maxGapMs: 600,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 700, text: "hola feli" },
      { startMs: 1500, endMs: 2300, text: "seguimos aca" },
    ]);
  });

  it("prefiere cortar despues de puntuacion", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 300, word: "Hola" },
      { startMs: 350, endMs: 700, word: "Feli," },
      { startMs: 750, endMs: 1100, word: "como" },
      { startMs: 1150, endMs: 1500, word: "estas" },
      { startMs: 1550, endMs: 1900, word: "hoy" },
    ], {
      maxCharsPerLine: 16,
      maxLines: 1,
      maxDurationMs: 3500,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 700, text: "Hola Feli," },
      { startMs: 750, endMs: 1900, text: "como estas hoy" },
    ]);
  });

  it("prioriza puntuacion fuerte para cerrar frases naturales", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 300, word: "todos" },
      { startMs: 350, endMs: 650, word: "tus" },
      { startMs: 700, endMs: 1000, word: "seres" },
      { startMs: 1050, endMs: 1400, word: "queridos." },
      { startMs: 1450, endMs: 1750, word: "Te" },
      { startMs: 1800, endMs: 2100, word: "mando" },
      { startMs: 2150, endMs: 2400, word: "un" },
      { startMs: 2450, endMs: 2800, word: "abrazo" },
      { startMs: 2850, endMs: 3300, word: "académico" },
    ]);

    expect(captions).toEqual([
      { startMs: 0, endMs: 1400, text: "todos tus seres queridos." },
      { startMs: 1450, endMs: 3300, text: "Te mando un abrazo académico" },
    ]);
  });

  it("evita cortar frases en conectores o fragmentos si puede extender un poco", () => {
    const captions = buildCaptionSegments([
      { startMs: 0, endMs: 300, word: "todos" },
      { startMs: 350, endMs: 650, word: "tus" },
      { startMs: 700, endMs: 1000, word: "seres" },
      { startMs: 1050, endMs: 1350, word: "queridos" },
      { startMs: 1400, endMs: 1700, word: "te" },
      { startMs: 1750, endMs: 2050, word: "mando" },
      { startMs: 2100, endMs: 2400, word: "un" },
      { startMs: 2450, endMs: 2800, word: "abrazo" },
      { startMs: 2850, endMs: 3300, word: "académico" },
    ], {
      maxCharsPerLine: 32,
      maxLines: 1,
      maxDurationMs: 2500,
    });

    expect(captions).toEqual([
      { startMs: 0, endMs: 1350, text: "todos tus seres queridos" },
      { startMs: 1400, endMs: 3300, text: "te mando un abrazo académico" },
    ]);
    expect(captions.map((caption) => caption.text)).not.toEqual([
      "todos tus seres queridos te un",
      "académico",
    ]);
  });
});
