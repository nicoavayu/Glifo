import { describe, expect, it } from "vitest";
import {
  formatCaptionSegmentsText,
  formatMs,
  formatSegmentsText,
} from "../src/panel/panelController";

describe("formatMs", () => {
  it("formatea milisegundos como mm:ss.mmm", () => {
    expect(formatMs(0)).toBe("00:00.000");
    expect(formatMs(5440)).toBe("00:05.440");
    expect(formatMs(61_234)).toBe("01:01.234");
  });

  it("normaliza valores negativos o no finitos a cero", () => {
    expect(formatMs(-1)).toBe("00:00.000");
    expect(formatMs(Number.NaN)).toBe("00:00.000");
  });
});

describe("formatSegmentsText", () => {
  it("formatea cada segmento con rango temporal", () => {
    expect(
      formatSegmentsText([
        {
          startMs: 0,
          endMs: 5440,
          text: "Te quiero felicitar porque cumplis 15 anos",
        },
        {
          startMs: 5440,
          endMs: 11560,
          text: "me pongo un traje",
        },
      ]),
    ).toBe([
      "[00:00.000 - 00:05.440] Te quiero felicitar porque cumplis 15 anos",
      "[00:05.440 - 00:11.560] me pongo un traje",
    ].join("\n"));
  });

  it("muestra mensaje cuando no hay segmentos", () => {
    expect(formatSegmentsText([])).toBe("Sin segmentos disponibles");
  });
});

describe("formatCaptionSegmentsText", () => {
  it("formatea captionSegments con tiempo relativo", () => {
    expect(
      formatCaptionSegmentsText([
        {
          startMs: 0,
          endMs: 2000,
          text: "Hola Feli, como estas?",
        },
      ]),
    ).toBe("[00:00.000 - 00:02.000] Hola Feli, como estas?");
  });

  it("agrega tiempo real de timeline si hay sequenceInMs", () => {
    expect(
      formatCaptionSegmentsText([
        {
          startMs: 988,
          endMs: 2988,
          text: "Hola Feli, como estas?",
        },
      ], {
        sequenceInMs: 221000,
      }),
    ).toBe([
      "[00:00.988 - 00:02.988] Hola Feli, como estas?",
      "Timeline: [03:41.988 - 03:43.988]",
    ].join("\n"));
  });

  it("muestra mensaje cuando no hay captionSegments", () => {
    expect(formatCaptionSegmentsText([])).toBe("Sin caption segments disponibles");
  });
});
