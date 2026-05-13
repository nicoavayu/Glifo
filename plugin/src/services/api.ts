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
    segments: Array.isArray(payload.segments)
      ? payload.segments as TranscribeResponse["segments"]
      : [],
    metadata,
  };
}
