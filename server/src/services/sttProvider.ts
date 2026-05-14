import { createReadStream } from "node:fs";
import OpenAI from "openai";
import {
  buildCaptionSegments,
  type CaptionSegment,
  type CaptionWord,
} from "./captionSegmentation";

export interface SttRequest {
  mediaPath: string;
  filename: string;
  durationMs: number | null;
}

export interface SttSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
}

export type SttWord = CaptionWord;
export type SttCaptionSegment = CaptionSegment;

export interface SttSuccessResult {
  status: "ok";
  provider: string;
  model: string;
  fullText: string;
  segments: SttSegment[];
  words: SttWord[];
  captionSegments: SttCaptionSegment[];
}

export interface SttErrorResult {
  status: "error";
  provider: string;
  model: string;
  code:
    | "stt_provider_unconfigured"
    | "stt_provider_failed"
    | "transcript_empty";
  message: string;
  details?: Record<string, unknown>;
}

export type SttProviderResult = SttSuccessResult | SttErrorResult;

export interface SttProvider {
  readonly name: string;
  readonly model: string;
  transcribe(input: SttRequest): Promise<SttProviderResult>;
}

interface SttProviderConfig {
  providerName: string;
  model: string;
  responseFormat: string;
  timestampGranularities: OpenAITimestampGranularity[];
  openAiApiKey: string | null;
}

type UnknownRecord = Record<string, unknown>;
export type OpenAITimestampGranularity = "segment" | "word";

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-transcribe";

class UnconfiguredSttProvider implements SttProvider {
  readonly name: string;
  readonly model: string;
  private readonly message: string;

  constructor(input: { name: string; model: string; message: string }) {
    this.name = input.name;
    this.model = input.model;
    this.message = input.message;
  }

  async transcribe(): Promise<SttProviderResult> {
    return {
      status: "error",
      provider: this.name,
      model: this.model,
      code: "stt_provider_unconfigured",
      message: this.message,
    };
  }
}

class OpenAISttProvider implements SttProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly responseFormat: string;
  private readonly timestampGranularities: OpenAITimestampGranularity[];
  private readonly client: OpenAI;

  constructor(input: {
    apiKey: string;
    model: string;
    responseFormat: string;
    timestampGranularities: OpenAITimestampGranularity[];
  }) {
    this.model = input.model;
    this.responseFormat = input.responseFormat;
    this.timestampGranularities = input.timestampGranularities;
    this.client = new OpenAI({
      apiKey: input.apiKey,
    });
  }

  async transcribe(input: SttRequest): Promise<SttProviderResult> {
    try {
      const request = buildOpenAITranscriptionRequest({
        model: this.model,
        mediaPath: input.mediaPath,
        responseFormat: this.responseFormat,
        timestampGranularities: this.timestampGranularities,
      });
      const response = await this.client.audio.transcriptions.create(request as any);
      const normalized = normalizeOpenAITranscription(response);

      if (!normalized.fullText.trim()) {
        return {
          status: "error",
          provider: this.name,
          model: this.model,
          code: "transcript_empty",
          message: "El proveedor STT devolvió un transcript vacío",
          details: {
            filename: input.filename,
          },
        };
      }

      return {
        status: "ok",
        provider: this.name,
        model: this.model,
        fullText: normalized.fullText,
        segments: normalized.segments,
        words: normalized.words,
        captionSegments: normalized.captionSegments,
      };
    } catch (error) {
      return {
        status: "error",
        provider: this.name,
        model: this.model,
        code: "stt_provider_failed",
        message: error instanceof Error ? error.message : "Error desconocido del proveedor STT",
        details: {
          filename: input.filename,
        },
      };
    }
  }
}

export function createSttProvider(env: NodeJS.ProcessEnv = process.env): SttProvider {
  const config = readConfig(env);

  if (config.providerName !== "openai") {
    return new UnconfiguredSttProvider({
      name: config.providerName,
      model: config.model,
      message: `STT_PROVIDER no soportado: ${config.providerName}`,
    });
  }

  if (!config.openAiApiKey) {
    return new UnconfiguredSttProvider({
      name: "openai",
      model: config.model,
      message: "OPENAI_API_KEY no está configurada para el provider OpenAI",
    });
  }

  return new OpenAISttProvider({
    apiKey: config.openAiApiKey,
    model: config.model,
    responseFormat: config.responseFormat,
    timestampGranularities: config.timestampGranularities,
  });
}

function readConfig(env: NodeJS.ProcessEnv): SttProviderConfig {
  const providerName = normalizeEnvValue(env.STT_PROVIDER) ?? DEFAULT_PROVIDER;
  const model = normalizeEnvValue(env.STT_MODEL) ?? DEFAULT_MODEL;
  const responseFormat =
    normalizeEnvValue(env.STT_RESPONSE_FORMAT)?.toLowerCase() ??
    defaultResponseFormatForModel(model);
  const timestampGranularities =
    parseTimestampGranularities(env.STT_TIMESTAMP_GRANULARITIES) ??
    defaultTimestampGranularitiesForModel(model, responseFormat);
  const openAiApiKey = normalizeEnvValue(env.OPENAI_API_KEY);

  return {
    providerName: providerName.toLowerCase(),
    model,
    responseFormat,
    timestampGranularities,
    openAiApiKey,
  };
}

export function buildOpenAITranscriptionRequest(input: {
  model: string;
  mediaPath: string;
  responseFormat: string;
  timestampGranularities: OpenAITimestampGranularity[];
}): Record<string, unknown> {
  const baseRequest = {
    file: createReadStream(input.mediaPath),
    model: input.model,
    response_format: input.responseFormat,
  } as Record<string, unknown>;

  if (
    input.responseFormat === "verbose_json" &&
    input.timestampGranularities.length > 0
  ) {
    baseRequest.timestamp_granularities = [...input.timestampGranularities];
  }

  if (
    input.model === "gpt-4o-transcribe-diarize" &&
    input.responseFormat === "diarized_json"
  ) {
    baseRequest.chunking_strategy = "auto";
  }

  return baseRequest;
}

export function normalizeOpenAITranscription(response: unknown): {
  fullText: string;
  segments: SttSegment[];
  words: SttWord[];
  captionSegments: SttCaptionSegment[];
} {
  if (typeof response === "string") {
    return {
      fullText: response,
      segments: [],
      words: [],
      captionSegments: [],
    };
  }

  const responseObject = asRecord(response);
  const fullText = typeof responseObject?.text === "string" ? responseObject.text : "";
  const rawSegments = Array.isArray(responseObject?.segments)
    ? responseObject.segments
    : [];
  const rawWords = Array.isArray(responseObject?.words)
    ? responseObject.words
    : [];
  const words = normalizeSttWords(rawWords);

  return {
    fullText,
    segments: normalizeSttSegments(rawSegments),
    words,
    captionSegments: buildCaptionSegments(words),
  };
}

export function normalizeSttSegments(rawSegments: unknown[]): SttSegment[] {
  return rawSegments
    .map(parseSegment)
    .filter((segment): segment is SttSegment => segment !== null)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
}

export function normalizeSttWords(rawWords: unknown[]): SttWord[] {
  return rawWords
    .map(parseWord)
    .filter((word): word is SttWord => word !== null)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
}

function parseSegment(value: unknown): SttSegment | null {
  const segment = asRecord(value);
  if (!segment) {
    return null;
  }

  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (!text) {
    return null;
  }

  const startMs =
    millisecondsValue(segment.startMs) ??
    millisecondsValue(segment.start_ms) ??
    secondsToMs(segment.start);
  const endMs =
    millisecondsValue(segment.endMs) ??
    millisecondsValue(segment.end_ms) ??
    secondsToMs(segment.end);
  if (startMs === null || endMs === null) {
    return null;
  }

  if (startMs < 0 || endMs <= startMs) {
    return null;
  }

  const speaker = typeof segment.speaker === "string" ? segment.speaker : null;

  return {
    startMs,
    endMs,
    text,
    ...(speaker ? { speaker } : {}),
  };
}

function parseWord(value: unknown): SttWord | null {
  const word = asRecord(value);
  if (!word) {
    return null;
  }

  const text =
    typeof word.word === "string"
      ? word.word.trim()
      : typeof word.text === "string"
        ? word.text.trim()
        : "";
  if (!text) {
    return null;
  }

  const startMs =
    millisecondsValue(word.startMs) ??
    millisecondsValue(word.start_ms) ??
    secondsToMs(word.start);
  const endMs =
    millisecondsValue(word.endMs) ??
    millisecondsValue(word.end_ms) ??
    secondsToMs(word.end);
  if (startMs === null || endMs === null) {
    return null;
  }

  if (startMs < 0 || endMs <= startMs) {
    return null;
  }

  return {
    startMs,
    endMs,
    word: text,
  };
}

function defaultResponseFormatForModel(model: string): string {
  if (model === "whisper-1") {
    return "verbose_json";
  }

  if (model === "gpt-4o-transcribe-diarize") {
    return "diarized_json";
  }

  return "json";
}

function defaultTimestampGranularitiesForModel(
  model: string,
  responseFormat: string,
): OpenAITimestampGranularity[] {
  if (model === "whisper-1" && responseFormat === "verbose_json") {
    return ["word", "segment"];
  }

  return [];
}

function parseTimestampGranularities(
  value: string | undefined,
): OpenAITimestampGranularity[] | null {
  const normalizedValue = normalizeEnvValue(value);
  if (!normalizedValue) {
    return null;
  }

  const parsedValues = parseTimestampGranularityValues(normalizedValue);
  const uniqueGranularities = Array.from(new Set(parsedValues));

  return uniqueGranularities.length > 0 ? uniqueGranularities : null;
}

function parseTimestampGranularityValues(value: string): OpenAITimestampGranularity[] {
  const trimmed = value.trim();
  let rawValues: unknown[] | null = null;

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      rawValues = Array.isArray(parsed) ? parsed : null;
    } catch {
      rawValues = null;
    }
  }

  const candidates = rawValues ?? trimmed.split(",");

  return candidates
    .map((candidate) => String(candidate).trim().toLowerCase())
    .filter(
      (candidate): candidate is OpenAITimestampGranularity =>
        candidate === "segment" || candidate === "word",
    );
}

function millisecondsValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function secondsToMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000);
}

function normalizeEnvValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value === "object" && value !== null) {
    return value as UnknownRecord;
  }

  return null;
}
