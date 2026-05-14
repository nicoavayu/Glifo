import type {
  TranscribeRequest,
  TranscribeResponse,
  TranscriptSource,
} from "../types/transcribe";

const TRANSCRIBE_ENDPOINT = "http://localhost:3001/transcribe";

interface BackendErrorPayload {
  transcriptSource?: TranscriptSource;
  provider?: string | null;
  model?: string | null;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

interface BackendSuccessPayload extends Record<string, unknown> {
  transcriptSource?: TranscriptSource;
  provider?: string;
  model?: string;
  fullText?: string;
  segments?: unknown;
  words?: unknown;
  captionSegments?: unknown;
  metadata?: unknown;
}

export class TranscribeApiError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  readonly transcriptSource: TranscriptSource;
  readonly provider: string | null;
  readonly model: string | null;

  constructor(input: {
    message: string;
    httpStatus: number;
    code?: string | null;
    transcriptSource?: TranscriptSource;
    provider?: string | null;
    model?: string | null;
  }) {
    super(input.message);
    this.name = "TranscribeApiError";
    this.httpStatus = input.httpStatus;
    this.code = input.code ?? null;
    this.transcriptSource = input.transcriptSource ?? "file";
    this.provider = input.provider ?? null;
    this.model = input.model ?? null;
  }
}

export function isTranscribeApiError(value: unknown): value is TranscribeApiError {
  return value instanceof TranscribeApiError;
}

/**
 * Llama al backend local y devuelve el transcript normalizado.
 */
export async function requestTranscript(
  payload: TranscribeRequest,
): Promise<TranscribeResponse> {
  const response = await fetch(TRANSCRIBE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let backendMessage = "";
    let backendCode = "";
    let backendSource: TranscriptSource = "file";
    let backendProvider: string | null = null;
    let backendModel: string | null = null;

    try {
      const maybeJson = (await response.json()) as BackendErrorPayload;
      backendMessage = maybeJson.error?.message ?? maybeJson.message ?? "";
      backendCode = maybeJson.error?.code ?? "";
      backendSource = maybeJson.transcriptSource ?? "file";
      backendProvider = maybeJson.provider ?? null;
      backendModel = maybeJson.model ?? null;
    } catch {
      try {
        backendMessage = await response.text();
      } catch {
        backendMessage = "";
      }
    }

    const normalizedMessage = backendMessage.trim();
    const details = [
      `Error HTTP ${response.status} al transcribir`,
      backendCode ? `code=${backendCode}` : "",
      `source=${backendSource}`,
      backendProvider ? `provider=${backendProvider}` : "",
      backendModel ? `model=${backendModel}` : "",
      normalizedMessage || "",
    ]
      .filter(Boolean)
      .join(" - ");

    throw new TranscribeApiError({
      message: details,
      httpStatus: response.status,
      code: backendCode || null,
      transcriptSource: backendSource,
      provider: backendProvider,
      model: backendModel,
    });
  }

  const data = (await response.json()) as BackendSuccessPayload;
  return normalizeSuccessPayload(data);
}

function normalizeSuccessPayload(payload: BackendSuccessPayload): TranscribeResponse {
  const metadata =
    typeof payload.metadata === "object" && payload.metadata !== null
      ? payload.metadata as TranscribeResponse["metadata"]
      : {
          mediaPath: "",
          filename: "",
          durationMs: null,
        };

  return {
    transcriptSource: payload.transcriptSource ?? "file",
    provider: typeof payload.provider === "string" ? payload.provider : "unknown",
    model: typeof payload.model === "string" ? payload.model : "unknown",
    fullText: typeof payload.fullText === "string" ? payload.fullText : "",
    segments: normalizeSegments(payload.segments),
    words: normalizeWords(payload.words),
    captionSegments: normalizeCaptionSegments(payload.captionSegments),
    metadata,
  };
}

function normalizeSegments(value: unknown): TranscribeResponse["segments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const segments: TranscribeResponse["segments"] = [];
  for (const segment of value) {
    const segmentObject = asRecord(segment);
    if (!segmentObject) {
      continue;
    }

    const startMs = asFiniteNumber(segmentObject.startMs);
    const endMs = asFiniteNumber(segmentObject.endMs);
    const text = typeof segmentObject.text === "string" ? segmentObject.text.trim() : "";
    if (startMs === null || endMs === null || startMs < 0 || endMs <= startMs || !text) {
      continue;
    }

    const speaker = typeof segmentObject.speaker === "string"
      ? segmentObject.speaker
      : null;

    segments.push({
      startMs,
      endMs,
      text,
      ...(speaker ? { speaker } : {}),
    });
  }

  return segments;
}

function normalizeWords(value: unknown): TranscribeResponse["words"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const words: TranscribeResponse["words"] = [];
  for (const word of value) {
    const wordObject = asRecord(word);
    if (!wordObject) {
      continue;
    }

    const startMs = asFiniteNumber(wordObject.startMs);
    const endMs = asFiniteNumber(wordObject.endMs);
    const text = typeof wordObject.word === "string" ? wordObject.word.trim() : "";
    if (startMs === null || endMs === null || startMs < 0 || endMs <= startMs || !text) {
      continue;
    }

    words.push({
      startMs,
      endMs,
      word: text,
    });
  }

  return words;
}

function normalizeCaptionSegments(value: unknown): TranscribeResponse["captionSegments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const captionSegments: TranscribeResponse["captionSegments"] = [];
  for (const segment of value) {
    const segmentObject = asRecord(segment);
    if (!segmentObject) {
      continue;
    }

    const startMs = asFiniteNumber(segmentObject.startMs);
    const endMs = asFiniteNumber(segmentObject.endMs);
    const text = typeof segmentObject.text === "string" ? segmentObject.text.trim() : "";
    if (startMs === null || endMs === null || startMs < 0 || endMs <= startMs || !text) {
      continue;
    }

    const timelineStartMs = asFiniteNumber(segmentObject.timelineStartMs);
    const timelineEndMs = asFiniteNumber(segmentObject.timelineEndMs);

    captionSegments.push({
      startMs,
      endMs,
      text,
      ...(timelineStartMs !== null ? { timelineStartMs } : {}),
      ...(timelineEndMs !== null ? { timelineEndMs } : {}),
    });
  }

  return captionSegments;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}
