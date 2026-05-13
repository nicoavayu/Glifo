import { createReadStream } from "node:fs";
import OpenAI from "openai";

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

export interface SttSuccessResult {
  status: "ok";
  provider: string;
  model: string;
  fullText: string;
  segments: SttSegment[];
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
  openAiApiKey: string | null;
}

type UnknownRecord = Record<string, unknown>;

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
  private readonly client: OpenAI;

  constructor(input: { apiKey: string; model: string }) {
    this.model = input.model;
    this.client = new OpenAI({
      apiKey: input.apiKey,
    });
  }

  async transcribe(input: SttRequest): Promise<SttProviderResult> {
    try {
      const request = buildOpenAITranscriptionRequest({
        model: this.model,
        mediaPath: input.mediaPath,
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
  });
}

function readConfig(env: NodeJS.ProcessEnv): SttProviderConfig {
  const providerName = normalizeEnvValue(env.STT_PROVIDER) ?? DEFAULT_PROVIDER;
  const model = normalizeEnvValue(env.STT_MODEL) ?? DEFAULT_MODEL;
  const openAiApiKey = normalizeEnvValue(env.OPENAI_API_KEY);

  return {
    providerName: providerName.toLowerCase(),
    model,
    openAiApiKey,
  };
}

function buildOpenAITranscriptionRequest(input: {
  model: string;
  mediaPath: string;
}): Record<string, unknown> {
  const baseRequest = {
    file: createReadStream(input.mediaPath),
    model: input.model,
  } as Record<string, unknown>;

  if (input.model === "whisper-1") {
    baseRequest.response_format = "verbose_json";
    baseRequest.timestamp_granularities = ["segment"];
  } else if (input.model === "gpt-4o-transcribe-diarize") {
    baseRequest.response_format = "diarized_json";
    baseRequest.chunking_strategy = "auto";
  } else {
    baseRequest.response_format = "json";
  }

  return baseRequest;
}

function normalizeOpenAITranscription(response: unknown): {
  fullText: string;
  segments: SttSegment[];
} {
  const responseObject = asRecord(response);
  const fullText = typeof responseObject?.text === "string" ? responseObject.text : "";
  const rawSegments = Array.isArray(responseObject?.segments)
    ? responseObject.segments
    : [];

  return {
    fullText,
    segments: rawSegments
      .map(parseSegment)
      .filter((segment): segment is SttSegment => segment !== null),
  };
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

  const startMs = secondsToMs(segment.start);
  const endMs = secondsToMs(segment.end);
  if (startMs === null || endMs === null) {
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
