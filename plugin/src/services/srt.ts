import type { CaptionSegment } from "../types/transcribe";

export type SrtExportErrorCode =
  | "caption_segments_missing"
  | "caption_segments_invalid"
  | "uxp_runtime_unavailable"
  | "save_dialog_unavailable"
  | "file_write_unavailable";

export interface SaveSrtResult {
  status: "saved" | "cancelled";
  filename?: string;
  nativePath?: string;
  cueCount?: number;
}

interface SrtCue {
  startMs: number;
  endMs: number;
  text: string;
}

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

export class SrtExportError extends Error {
  readonly code: SrtExportErrorCode;
  readonly details: unknown;

  constructor(code: SrtExportErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "SrtExportError";
    this.code = code;
    this.details = details;
  }
}

export function isSrtExportError(value: unknown): value is SrtExportError {
  return value instanceof SrtExportError;
}

export function buildSrtFromCaptionSegments(captionSegments: CaptionSegment[]): string {
  return formatSrtCues(buildSrtCues(captionSegments));
}

export function buildSuggestedSrtFilename(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `glifo-captions-${year}${month}${day}-${hours}${minutes}${seconds}.srt`;
}

export function formatSrtTimestamp(ms: number): string {
  const totalMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return [
    String(hours).padStart(2, "0"),
    ":",
    String(minutes).padStart(2, "0"),
    ":",
    String(seconds).padStart(2, "0"),
    ",",
    String(milliseconds).padStart(3, "0"),
  ].join("");
}

export function buildSrtCues(captionSegments: CaptionSegment[]): SrtCue[] {
  if (!Array.isArray(captionSegments) || captionSegments.length === 0) {
    throw new SrtExportError(
      "caption_segments_missing",
      "No hay captionSegments disponibles para exportar SRT.",
    );
  }

  const normalized = captionSegments
    .map(normalizeCaptionSegment)
    .filter((cue): cue is SrtCue => cue !== null)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  const cues: SrtCue[] = [];
  let previousEndMs = 0;

  for (const cue of normalized) {
    const startMs = Math.max(cue.startMs, previousEndMs);
    if (cue.endMs <= startMs) {
      continue;
    }

    cues.push({
      ...cue,
      startMs,
    });
    previousEndMs = cue.endMs;
  }

  if (cues.length === 0) {
    throw new SrtExportError(
      "caption_segments_invalid",
      "No hay captionSegments válidos para exportar SRT.",
      { receivedSegments: captionSegments.length },
    );
  }

  return cues;
}

export async function saveCaptionSegmentsAsSrtFile(
  captionSegments: CaptionSegment[],
): Promise<SaveSrtResult> {
  const cues = buildSrtCues(captionSegments);
  const srt = formatSrtCues(cues);
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new SrtExportError(
      "uxp_runtime_unavailable",
      "UXP require no está disponible para guardar el SRT.",
    );
  }

  const uxpModule = asRecord((requireFn as UnknownFn)("uxp"));
  const storage = asRecord(uxpModule?.storage);
  const localFileSystem = asRecord(storage?.localFileSystem);
  const getFileForSaving = asFunction(localFileSystem?.getFileForSaving);

  if (!localFileSystem || !getFileForSaving) {
    throw new SrtExportError(
      "save_dialog_unavailable",
      "UXP localFileSystem.getFileForSaving no está disponible.",
    );
  }

  const selected = await Promise.resolve(
    getFileForSaving.call(localFileSystem, buildSuggestedSrtFilename(), {
      types: ["srt"],
    }),
  );

  const fileObject = asRecord(selected);
  if (!fileObject) {
    return { status: "cancelled" };
  }

  const write = asFunction(fileObject.write);
  if (!write) {
    throw new SrtExportError(
      "file_write_unavailable",
      "El archivo seleccionado no permite escribir el SRT.",
    );
  }

  await Promise.resolve(write.call(fileObject, srt));

  return {
    status: "saved",
    filename: resolveFileName(fileObject),
    nativePath: typeof fileObject.nativePath === "string" ? fileObject.nativePath : undefined,
    cueCount: cues.length,
  };
}

function formatSrtCues(cues: SrtCue[]): string {
  return `${cues
    .map((cue, index) => {
      return [
        String(index + 1),
        `${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}`,
        cue.text,
      ].join("\n");
    })
    .join("\n\n")}\n`;
}

function normalizeCaptionSegment(segment: CaptionSegment): SrtCue | null {
  const startMs = Number.isFinite(segment.startMs) ? Math.max(0, Math.round(segment.startMs)) : null;
  const endMs = Number.isFinite(segment.endMs) ? Math.max(0, Math.round(segment.endMs)) : null;
  const text = sanitizeSrtText(segment.text);

  if (startMs === null || endMs === null || endMs <= startMs || text.length === 0) {
    return null;
  }

  return {
    startMs,
    endMs,
    text,
  };
}

function sanitizeSrtText(text: string): string {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function resolveFileName(fileObject: UnknownRecord): string {
  if (typeof fileObject.name === "string" && fileObject.name.trim().length > 0) {
    return fileObject.name;
  }

  if (typeof fileObject.nativePath === "string" && fileObject.nativePath.trim().length > 0) {
    return fileObject.nativePath.split(/[\\/]/).pop() ?? buildSuggestedSrtFilename();
  }

  return buildSuggestedSrtFilename();
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value === "object" && value !== null) {
    return value as UnknownRecord;
  }

  return null;
}

function asFunction(value: unknown): UnknownFn | null {
  if (typeof value === "function") {
    return value as UnknownFn;
  }

  return null;
}
