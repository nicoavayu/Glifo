import { describe, expect, it } from "vitest";
import {
  buildOpenAITranscriptionRequest,
  normalizeOpenAITranscription,
  normalizeSttSegments,
  normalizeSttWords,
} from "../src/services/sttProvider";

describe("normalizeOpenAITranscription", () => {
  it("normaliza segmentos verbose_json de OpenAI a milisegundos ordenados", () => {
    const result = normalizeOpenAITranscription({
      text: "hola mundo",
      segments: [
        { start: 2.3, end: 3.1, text: "segundo" },
        { start: 0, end: 2.2, text: " primero ", speaker: "SPEAKER_1" },
      ],
    });

    expect(result.fullText).toBe("hola mundo");
    expect(result.segments).toEqual([
      {
        startMs: 0,
        endMs: 2200,
        text: "primero",
        speaker: "SPEAKER_1",
      },
      {
        startMs: 2300,
        endMs: 3100,
        text: "segundo",
      },
    ]);
  });

  it("descarta segmentos sin texto o con timestamps invalidos", () => {
    const result = normalizeOpenAITranscription({
      text: "texto valido",
      segments: [
        { start: -0.1, end: 1, text: "negativo" },
        { start: 1, end: 1, text: "sin duracion" },
        { start: 1, end: 2, text: "   " },
        { start: "0", end: 1, text: "tipo invalido" },
        { start: 0.5, end: 1.25, text: "valido" },
      ],
    });

    expect(result.segments).toEqual([
      {
        startMs: 500,
        endMs: 1250,
        text: "valido",
      },
    ]);
  });

  it("mantiene compatibilidad con respuestas json sin segmentos", () => {
    const result = normalizeOpenAITranscription({
      text: "solo full text",
    });

    expect(result).toEqual({
      fullText: "solo full text",
      segments: [],
      words: [],
      captionSegments: [],
    });
  });

  it("normaliza words y construye captionSegments", () => {
    const result = normalizeOpenAITranscription({
      text: "Hola Feli, como estas?",
      words: [
        { word: "Hola", start: 0, end: 0.3 },
        { word: "Feli,", start: 0.32, end: 0.7 },
        { word: "como", start: 0.8, end: 1 },
        { word: "estas?", start: 1.05, end: 1.35 },
      ],
    });

    expect(result.words).toEqual([
      { startMs: 0, endMs: 300, word: "Hola" },
      { startMs: 320, endMs: 700, word: "Feli," },
      { startMs: 800, endMs: 1000, word: "como" },
      { startMs: 1050, endMs: 1350, word: "estas?" },
    ]);
    expect(result.captionSegments.length).toBeGreaterThan(0);
    expect(result.captionSegments[0]).toMatchObject({
      startMs: 0,
      endMs: 1350,
      text: "Hola Feli, como estas?",
    });
  });
});

describe("normalizeSttSegments", () => {
  it("acepta segmentos ya normalizados en milisegundos", () => {
    expect(
      normalizeSttSegments([
        { startMs: 1000, endMs: 1800, text: "en ms" },
      ]),
    ).toEqual([
      {
        startMs: 1000,
        endMs: 1800,
        text: "en ms",
      },
    ]);
  });
});

describe("normalizeSttWords", () => {
  it("descarta words sin texto o timestamps invalidos", () => {
    expect(
      normalizeSttWords([
        { word: "valida", start: 0, end: 0.5 },
        { word: "   ", start: 0.6, end: 0.8 },
        { word: "negativa", start: -1, end: 0.5 },
        { word: "invertida", start: 1, end: 0.9 },
      ]),
    ).toEqual([
      {
        startMs: 0,
        endMs: 500,
        word: "valida",
      },
    ]);
  });
});

describe("buildOpenAITranscriptionRequest", () => {
  it("incluye verbose_json y granularidad segment para whisper-1", () => {
    const request = buildOpenAITranscriptionRequest({
      model: "whisper-1",
      mediaPath: "package.json",
      responseFormat: "verbose_json",
      timestampGranularities: ["segment"],
    });

    expect(request.model).toBe("whisper-1");
    expect(request.response_format).toBe("verbose_json");
    expect(request.timestamp_granularities).toEqual(["segment"]);
    destroyRequestFile(request);
  });

  it("incluye word y segment cuando se piden ambas granularidades", () => {
    const request = buildOpenAITranscriptionRequest({
      model: "whisper-1",
      mediaPath: "package.json",
      responseFormat: "verbose_json",
      timestampGranularities: ["word", "segment"],
    });

    expect(request.model).toBe("whisper-1");
    expect(request.response_format).toBe("verbose_json");
    expect(request.timestamp_granularities).toEqual(["word", "segment"]);
    destroyRequestFile(request);
  });

  it("mantiene gpt-4o-transcribe como json sin granularidades por defecto", () => {
    const request = buildOpenAITranscriptionRequest({
      model: "gpt-4o-transcribe",
      mediaPath: "package.json",
      responseFormat: "json",
      timestampGranularities: [],
    });

    expect(request.model).toBe("gpt-4o-transcribe");
    expect(request.response_format).toBe("json");
    expect(request).not.toHaveProperty("timestamp_granularities");
    destroyRequestFile(request);
  });
});

function destroyRequestFile(request: Record<string, unknown>): void {
  const file = request.file;
  if (
    typeof file === "object" &&
    file !== null &&
    "destroy" in file &&
    typeof file.destroy === "function"
  ) {
    file.destroy();
  }
}
