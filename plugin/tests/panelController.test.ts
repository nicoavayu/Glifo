import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCaptionEditorSettingsChange,
  CAPTION_STYLE_PRESETS,
  createCaptionEditorStateFromTranscript,
  formatCaptionSegmentsText,
  formatMs,
  formatSegmentsText,
  formatTimelineMs,
  getCaptionEditorPayload,
  getCaptionPreviewRows,
  getCaptionStylePreset,
  mergeCaptionSegmentWithNext,
  rebuildCaptionEditorSegments,
  resetCaptionEditorSegments,
  resolveStylePresetId,
  restoreCaptionSegment,
  splitCaptionAtCursor,
  splitCaptionSegment,
  updateCaptionEditorSegmentText,
} from "../src/panel/panelController";
import { DEFAULT_MOGRT_STYLE_SETTINGS } from "../src/services/mogrtBridge";

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

describe("formatTimelineMs", () => {
  it("formatea milisegundos como HH:MM:SS.mmm para instrucciones de timeline", () => {
    expect(formatTimelineMs(0)).toBe("00:00:00.000");
    expect(formatTimelineMs(221_000)).toBe("00:03:41.000");
    expect(formatTimelineMs(3_605_042)).toBe("01:00:05.042");
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

describe("caption editor state", () => {
  it("usa el texto editado en el payload de salida", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 0, endMs: 1000, text: "texto original" },
      ],
    });

    state = updateCaptionEditorSegmentText(state, 0, "texto editado");

    expect(getCaptionEditorPayload(state, 220_000)).toEqual({
      sequenceInMs: 220_000,
      captionSegments: [
        { startMs: 0, endMs: 1000, text: "texto editado" },
      ],
    });
  });

  it("une un caption con el siguiente manteniendo start y end", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 0, endMs: 1000, text: "hola" },
        { startMs: 1100, endMs: 2000, text: "mundo" },
      ],
    });

    state = mergeCaptionSegmentWithNext(state, 0);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 2000, text: "hola mundo" },
    ]);
  });

  it("divide un caption en el cursor y reparte el tiempo proporcionalmente", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 1000, endMs: 5000, text: "hola mundo otro mundo" },
      ],
    });

    state = splitCaptionAtCursor(state, 0, "hola mundo".length);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 1000, endMs: 3000, text: "hola mundo" },
      { startMs: 3000, endMs: 5000, text: "otro mundo" },
    ]);
    expect(getCaptionEditorPayload(state, 221_000).captionSegments).toEqual(
      state.editableCaptionSegments,
    );
  });

  it("resetea captions a los originales", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 0, endMs: 1000, text: "texto original" },
      ],
    });

    state = updateCaptionEditorSegmentText(state, 0, "texto editado");
    state = resetCaptionEditorSegments(state);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 1000, text: "texto original" },
    ]);
  });

  it("rearma captions usando words existentes y settings actuales", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "uno" },
        { startMs: 350, endMs: 650, word: "dos" },
      ],
      captionSegments: [
        { startMs: 0, endMs: 650, text: "uno dos" },
      ],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        mode: "word-by-word",
        maxCharsPerLine: 1,
        maxLines: 1,
      },
    };
    state = rebuildCaptionEditorSegments(state);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 300, text: "uno" },
      { startMs: 350, endMs: 650, text: "dos" },
    ]);
    expect(state.hasManualEdits).toBe(false);
  });

  it("bajar caracteres por linea genera mas captions y actualiza el payload visible", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feli," },
        { startMs: 700, endMs: 1000, word: "como" },
        { startMs: 1050, endMs: 1350, word: "estas" },
        { startMs: 1400, endMs: 1700, word: "hoy" },
        { startMs: 2400, endMs: 2700, word: "te" },
        { startMs: 2750, endMs: 3050, word: "mando" },
        { startMs: 3100, endMs: 3400, word: "un" },
        { startMs: 3450, endMs: 3800, word: "abrazo." },
      ],
      captionSegments: [],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        mode: "natural",
        maxLines: 2,
        maxCharsPerLine: 42,
        maxDurationMs: 4000,
      },
    };
    state = rebuildCaptionEditorSegments(state);
    const wideCaptionCount = state.editableCaptionSegments.length;

    state = {
      ...state,
      settings: {
        ...state.settings,
        maxLines: 1,
        maxCharsPerLine: 8,
      },
    };
    state = rebuildCaptionEditorSegments(state);

    expect(state.editableCaptionSegments.length).toBeGreaterThan(wideCaptionCount);
    expect(getCaptionEditorPayload(state, 220_000).captionSegments).toEqual(
      state.editableCaptionSegments,
    );
  });

  it("cambiar chars de 32 a 12 aumenta la cantidad de captions", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni." },
        { startMs: 700, endMs: 1000, word: "Te" },
        { startMs: 1050, endMs: 1350, word: "deseo" },
        { startMs: 1400, endMs: 1700, word: "muchas" },
        { startMs: 1750, endMs: 2100, word: "felicidades" },
        { startMs: 2150, endMs: 2450, word: "en" },
        { startMs: 2500, endMs: 2800, word: "estos" },
        { startMs: 2850, endMs: 3200, word: "15" },
        { startMs: 3250, endMs: 3600, word: "anos." },
      ],
      captionSegments: [],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        mode: "natural",
        maxLines: 2,
        maxCharsPerLine: 32,
        maxDurationMs: 4000,
      },
    };
    state = rebuildCaptionEditorSegments(state);
    const captionsAt32 = state.editableCaptionSegments.length;

    state = {
      ...state,
      settings: {
        ...state.settings,
        maxCharsPerLine: 12,
      },
    };
    state = rebuildCaptionEditorSegments(state);

    expect(state.editableCaptionSegments.length).toBeGreaterThan(captionsAt32);
    expect(
      Math.max(...state.editableCaptionSegments.flatMap((caption) =>
        caption.text.split("\n").map((line) => line.length)
      )),
    ).toBeLessThanOrEqual(12);
  });

  it("click en modo Corto actualiza settings.mode y recalcula", () => {
    const state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni," },
        { startMs: 700, endMs: 1000, word: "felicidades" },
        { startMs: 1050, endMs: 1350, word: "totales." },
      ],
      captionSegments: [],
    });

    const result = applyCaptionEditorSettingsChange(state, "mode", "short");

    expect(result.state.settings.mode).toBe("short");
    expect(result.oldValue).toBe("natural");
    expect(result.newValue).toBe("short");
    expect(result.captionsCountAfter).toBeGreaterThanOrEqual(result.captionsCountBefore);
  });

  it("click en Palabra por palabra actualiza settings.mode y recalcula", () => {
    const state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni," },
        { startMs: 700, endMs: 1000, word: "felicidades" },
      ],
      captionSegments: [],
    });

    const result = applyCaptionEditorSettingsChange(state, "mode", "word-by-word");

    expect(result.state.settings.mode).toBe("word-by-word");
    expect(result.state.editableCaptionSegments.map((caption) => caption.text)).toEqual([
      "Hola",
      "Feni,",
      "felicidades",
    ]);
  });

  it("click en Lines 1/2 actualiza settings.maxLines", () => {
    const state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "palabra" },
        { startMs: 350, endMs: 650, word: "larga" },
        { startMs: 700, endMs: 1000, word: "otra" },
      ],
      captionSegments: [],
    });

    const oneLine = applyCaptionEditorSettingsChange(state, "maxLines", 1).state;
    const twoLines = applyCaptionEditorSettingsChange(oneLine, "maxLines", 2).state;

    expect(oneLine.settings.maxLines).toBe(1);
    expect(twoLines.settings.maxLines).toBe(2);
  });

  it("cambiar lines de 2 a 1 recalcula captions y elimina saltos de linea", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "palabra" },
        { startMs: 350, endMs: 650, word: "larga" },
        { startMs: 700, endMs: 1000, word: "otra" },
      ],
      captionSegments: [],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        mode: "natural",
        maxLines: 2,
        maxCharsPerLine: 12,
        maxDurationMs: 4000,
      },
    };
    state = rebuildCaptionEditorSegments(state);
    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 1000, text: "palabra\nlarga otra" },
    ]);

    state = {
      ...state,
      settings: {
        ...state.settings,
        maxLines: 1,
      },
    };
    state = rebuildCaptionEditorSegments(state);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 300, text: "palabra" },
      { startMs: 350, endMs: 1000, text: "larga otra" },
    ]);
    expect(state.editableCaptionSegments.every((caption) => !caption.text.includes("\n"))).toBe(true);
  });

  it("modo palabra por palabra genera captions mas cortos", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni," },
        { startMs: 700, endMs: 1000, word: "felicidades" },
      ],
      captionSegments: [],
    });

    state = rebuildCaptionEditorSegments(state);
    const naturalMaxLength = Math.max(
      ...state.editableCaptionSegments.map((caption) => caption.text.length),
    );

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

    expect(state.editableCaptionSegments.map((caption) => caption.text)).toEqual([
      "Hola",
      "Feni,",
      "felicidades",
    ]);
    expect(
      Math.max(...state.editableCaptionSegments.map((caption) => caption.text.length)),
    ).toBeLessThan(naturalMaxLength);
  });

  it("divide un caption usando words existentes", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "uno" },
        { startMs: 350, endMs: 650, word: "dos" },
        { startMs: 700, endMs: 1000, word: "tres" },
        { startMs: 1050, endMs: 1350, word: "cuatro" },
      ],
      captionSegments: [
        { startMs: 0, endMs: 1350, text: "uno dos tres cuatro" },
      ],
    });

    state = splitCaptionSegment(state, 0);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 650, text: "uno dos" },
      { startMs: 700, endMs: 1350, text: "tres cuatro" },
    ]);
    expect(state.hasManualEdits).toBe(true);
  });

  it("restaura un caption si coincide el rango original", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 0, endMs: 1000, text: "texto original" },
      ],
    });

    state = updateCaptionEditorSegmentText(state, 0, "texto editado");
    state = restoreCaptionSegment(state, 0);

    expect(state.editableCaptionSegments).toEqual([
      { startMs: 0, endMs: 1000, text: "texto original" },
    ]);
  });

  it("cambiar Chars actualiza las filas del preview", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni." },
        { startMs: 700, endMs: 1000, word: "Te" },
        { startMs: 1050, endMs: 1350, word: "deseo" },
        { startMs: 1400, endMs: 1700, word: "muchas" },
        { startMs: 1750, endMs: 2100, word: "felicidades" },
        { startMs: 2150, endMs: 2450, word: "en" },
        { startMs: 2500, endMs: 2800, word: "estos" },
        { startMs: 2850, endMs: 3200, word: "15" },
        { startMs: 3250, endMs: 3600, word: "anos." },
      ],
      captionSegments: [],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        maxLines: 2,
        maxCharsPerLine: 32,
        maxDurationMs: 4000,
      },
    };
    state = rebuildCaptionEditorSegments(state);
    const previewAt32 = getCaptionPreviewRows(state, 221_000);

    state = applyCaptionEditorSettingsChange(state, "maxCharsPerLine", 12).state;
    const previewAt12 = getCaptionPreviewRows(state, 221_000);

    expect(previewAt12.map((row) => row.text)).not.toEqual(
      previewAt32.map((row) => row.text),
    );
    expect(
      Math.max(...previewAt12.flatMap((row) =>
        row.text.split("\n").map((line) => line.length)
      )),
    ).toBeLessThanOrEqual(12);
  });

  it("cambiar Lines actualiza las filas del preview", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "palabra" },
        { startMs: 350, endMs: 650, word: "larga" },
        { startMs: 700, endMs: 1000, word: "otra" },
      ],
      captionSegments: [],
    });

    state = {
      ...state,
      settings: {
        ...state.settings,
        maxLines: 2,
        maxCharsPerLine: 12,
        maxDurationMs: 4000,
      },
    };
    state = rebuildCaptionEditorSegments(state);
    expect(getCaptionPreviewRows(state, null).map((row) => row.text)).toEqual([
      "palabra\nlarga otra",
    ]);

    state = applyCaptionEditorSettingsChange(state, "maxLines", 1).state;
    expect(getCaptionPreviewRows(state, null).map((row) => row.text)).toEqual([
      "palabra",
      "larga otra",
    ]);
  });

  it("cambiar Mode actualiza las filas del preview", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni," },
        { startMs: 700, endMs: 1000, word: "felicidades" },
      ],
      captionSegments: [],
    });

    state = rebuildCaptionEditorSegments(state);
    const naturalPreview = getCaptionPreviewRows(state, null);

    state = applyCaptionEditorSettingsChange(state, "mode", "word-by-word").state;
    const wordPreview = getCaptionPreviewRows(state, null);

    expect(wordPreview.map((row) => row.text)).toEqual([
      "Hola",
      "Feni,",
      "felicidades",
    ]);
    expect(wordPreview.map((row) => row.text)).not.toEqual(
      naturalPreview.map((row) => row.text),
    );
  });

  it("el preview usa timecode real cuando hay sequenceInMs", () => {
    const state = createCaptionEditorStateFromTranscript({
      words: [],
      captionSegments: [
        { startMs: 1000, endMs: 2500, text: "Hola Feni." },
      ],
    });

    const rows = getCaptionPreviewRows(state, 221_000);

    expect(rows[0]?.timecode).toBe("00:03:42:00");
    expect(rows[0]?.timelineLabel).toContain("Timeline real 00:03:42.000 - 00:03:43.500");
  });

  it("Exportar SRT y Crear MOGRT usan los captions visibles del preview", () => {
    let state = createCaptionEditorStateFromTranscript({
      words: [
        { startMs: 0, endMs: 300, word: "Hola" },
        { startMs: 350, endMs: 650, word: "Feni," },
        { startMs: 700, endMs: 1000, word: "felicidades" },
      ],
      captionSegments: [],
    });

    state = applyCaptionEditorSettingsChange(state, "mode", "word-by-word").state;
    state = updateCaptionEditorSegmentText(state, 1, "Feni editado");

    const visibleCaptions = getCaptionPreviewRows(state, 221_000).map((row) => row.captionSegment);
    const payloadForSrtAndMogrt = getCaptionEditorPayload(state, 221_000);

    expect(payloadForSrtAndMogrt.captionSegments).toEqual(visibleCaptions);
    expect(payloadForSrtAndMogrt.captionSegments[1]?.text).toBe("Feni editado");
  });

  it("monta el workspace de preview antes del Debug de metadata/STT", () => {
    const source = readFileSync(
      new URL("../src/panel/panelController.ts", import.meta.url),
      "utf8",
    );
    const workspaceIndex = source.indexOf('id="captionEditorWorkspace"');
    const previewIndex = source.indexOf('id="resultCaptionsSection"');
    const debugIndex = source.indexOf('id="resultDebugDetails"');
    const metadataIndex = source.indexOf('id="resultMetadataSection"');

    expect(workspaceIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(-1);
    expect(debugIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(-1);
    expect(workspaceIndex).toBeLessThan(debugIndex);
    expect(previewIndex).toBeLessThan(metadataIndex);
  });

  it("no monta bloques visuales de debug temporal", () => {
    const source = readFileSync(
      new URL("../src/panel/panelController.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain(["GLIFO DEBUG", "PANEL OK"].join(" "));
    expect(source).not.toContain(["CAPTION EDITOR", "SMOKE TEST"].join(" "));
    expect(source).not.toContain(["Editor", "debug:"].join(" "));
  });
});

describe("caption style presets", () => {
  it("expone los 5 presets visuales esperados en orden", () => {
    expect(CAPTION_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "clean",
      "bold",
      "social",
      "karaoke",
      "minimal",
    ]);
    expect(CAPTION_STYLE_PRESETS.map((preset) => preset.label)).toEqual([
      "Clean",
      "Bold",
      "Social",
      "Karaoke",
      "Minimal",
    ]);
  });

  it("cada preset define el set completo de MogrtStyleSettings", () => {
    const expectedKeys = Object.keys(DEFAULT_MOGRT_STYLE_SETTINGS).sort();
    CAPTION_STYLE_PRESETS.forEach((preset) => {
      expect(Object.keys(preset.settings).sort()).toEqual(expectedKeys);
    });
  });

  it("cada preset modifica los settings que el usuario espera", () => {
    expect(getCaptionStylePreset("clean")?.settings).toEqual({
      fillColor: "#ffffff",
      fontSize: 82,
      strokeEnabled: false,
      strokeWidth: 0,
      shadowEnabled: true,
      positionYMode: "bottom",
    });
    expect(getCaptionStylePreset("bold")?.settings).toEqual({
      fillColor: "#ffffff",
      fontSize: 96,
      strokeEnabled: true,
      strokeWidth: 4,
      shadowEnabled: true,
      positionYMode: "bottom",
    });
    expect(getCaptionStylePreset("social")?.settings).toEqual({
      fillColor: "#ffffff",
      fontSize: 104,
      strokeEnabled: true,
      strokeWidth: 6,
      shadowEnabled: true,
      positionYMode: "center",
    });
    expect(getCaptionStylePreset("karaoke")?.settings).toEqual({
      fillColor: "#ffe14d",
      fontSize: 100,
      strokeEnabled: true,
      strokeWidth: 5,
      shadowEnabled: true,
      positionYMode: "bottom",
    });
    expect(getCaptionStylePreset("minimal")?.settings).toEqual({
      fillColor: "#ffffff",
      fontSize: 72,
      strokeEnabled: false,
      strokeWidth: 0,
      shadowEnabled: false,
      positionYMode: "bottom",
    });
  });

  it("getCaptionStylePreset devuelve null para ids desconocidos o vacíos", () => {
    expect(getCaptionStylePreset(null)).toBeNull();
    expect(getCaptionStylePreset("inexistente")).toBeNull();
  });

  it("resolveStylePresetId marca activo el preset que coincide con los settings", () => {
    CAPTION_STYLE_PRESETS.forEach((preset) => {
      expect(resolveStylePresetId({ ...preset.settings })).toBe(preset.id);
    });
  });

  it("resolveStylePresetId devuelve null (Custom) tras una edición manual", () => {
    const bold = getCaptionStylePreset("bold");
    expect(bold).not.toBeNull();
    const customized = { ...bold!.settings, fontSize: bold!.settings.fontSize + 5 };

    expect(resolveStylePresetId(customized)).toBeNull();
  });

  it("renderiza los presets dentro de Style y arriba de los sliders", () => {
    const source = readFileSync(
      new URL("../src/panel/panelController.ts", import.meta.url),
      "utf8",
    );
    const stylePanelIndex = source.indexOf('id="mogrtStylePanel"');
    const presetsIndex = source.indexOf('data-style-preset="clean"');
    const styleGridIndex = source.indexOf('class="panel__styleGrid"');

    expect(stylePanelIndex).toBeGreaterThan(-1);
    expect(presetsIndex).toBeGreaterThan(-1);
    expect(styleGridIndex).toBeGreaterThan(-1);
    expect(stylePanelIndex).toBeLessThan(presetsIndex);
    expect(presetsIndex).toBeLessThan(styleGridIndex);
  });
});
