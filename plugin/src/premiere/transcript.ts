import { getSelectedRuntimeContext } from "./selection";
import { getPremiereTranscriptCapabilities } from "./runtimeDiagnostics";
import type {
  ExistingTranscriptJson,
  PreparedTranscriptImportResult,
  SelectedClipInfo,
  TextSegment,
  TextWord,
  TranscriptExportResult,
} from "../types/premiere";
import type { Segment, TranscriptResult, Word } from "../types/transcript";

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

/**
 * Adapter: mapea un `Word` externo al formato `TextWord` interno.
 */
export function mapWordToTextWord(word: Word): TextWord {
  return {
    text: word.text,
    startMs: word.startMs,
    endMs: word.endMs,
    confidence: word.confidence,
  };
}

/**
 * Adapter: mapea un `Segment` externo al formato `TextSegment`.
 */
export function mapSegmentToTextSegment(segment: Segment): TextSegment {
  return {
    id: segment.id,
    speaker: segment.speaker,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    words: segment.words.map(mapWordToTextWord),
  };
}

/**
 * Valida si un segmento tiene estructura mínima utilizable para importación.
 */
export function isValidTranscriptSegment(segment: Segment): boolean {
  if (!segment.id || !segment.text) {
    return false;
  }

  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)) {
    return false;
  }

  if (segment.endMs < segment.startMs) {
    return false;
  }

  return Array.isArray(segment.words);
}

/**
 * Adapter principal: convierte todo el `TranscriptResult` a `TextSegment[]`
 * filtrando segmentos inválidos para no romper la importación.
 */
export function mapTranscriptResultToTextSegments(
  transcriptResult: TranscriptResult,
): TextSegment[] {
  if (!Array.isArray(transcriptResult.segments)) {
    return [];
  }

  return transcriptResult.segments
    .filter(isValidTranscriptSegment)
    .map(mapSegmentToTextSegment);
}

/**
 * Exporta transcript existente desde Premiere si el runtime lo soporta.
 * Si no existe soporte, devuelve estado estructurado y trazable.
 */
export async function exportExistingTranscriptToJson(
  selectedItem: SelectedClipInfo,
): Promise<TranscriptExportResult> {
  const capabilities = await getPremiereTranscriptCapabilities();

  if (!capabilities.canExportTranscript || !capabilities.hasClipProjectItem) {
    return {
      status: "unsupported_in_runtime",
      reason: describeUnsupportedReason(capabilities),
      capabilities,
      selectedItem,
    };
  }

  const runtime = await resolveTranscriptRuntimeHandles();
  if (!runtime) {
    return {
      status: "unsupported_in_runtime",
      reason: "No se pudieron resolver handles runtime de Transcript/ClipProjectItem",
      capabilities,
      selectedItem,
    };
  }

  const selectedContext = await getSelectedRuntimeContext();
  if (!selectedContext || !selectedContext.clipProjectItem) {
    return {
      status: "no_selection",
      reason: "No hay clip seleccionado o no se pudo resolver ClipProjectItem",
      capabilities,
      selectedItem,
    };
  }

  const exportToJsonFn = asFunction(runtime.transcriptStatic.exportToJSON);
  if (!exportToJsonFn) {
    return {
      status: "unsupported_in_runtime",
      reason: "Transcript.exportToJSON no está disponible",
      capabilities,
      selectedItem,
    };
  }

  try {
    const rawJson = await Promise.resolve(
      exportToJsonFn.call(runtime.transcriptStatic, selectedContext.clipProjectItem),
    );

    const transcriptString = typeof rawJson === "string" ? rawJson : "";
    if (!transcriptString.trim()) {
      return {
        status: "empty_transcript",
        reason: "El clip no tiene transcript para exportar",
        capabilities,
        selectedItem,
        rawJson: transcriptString,
      };
    }

    const exportedTranscript = toExistingTranscriptJson(selectedItem, transcriptString);

    return {
      status: "ok",
      capabilities,
      selectedItem,
      rawJson: transcriptString,
      exportedTranscript,
    };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Error desconocido al exportar transcript",
      capabilities,
      selectedItem,
    };
  }
}

/**
 * Prepara importación de transcript externo usando APIs reales de Premiere
 * cuando están disponibles. Si no, retorna estado `unsupported_in_runtime`.
 */
export async function prepareExternalTranscriptImport(
  selectedItem: SelectedClipInfo,
  transcriptResult: TranscriptResult,
): Promise<PreparedTranscriptImportResult> {
  const capabilities = await getPremiereTranscriptCapabilities();
  const textSegments = mapTranscriptResultToTextSegments(transcriptResult);

  if (textSegments.length === 0) {
    return {
      status: "empty_transcript",
      reason: "El transcript normalizado no contiene segmentos válidos",
      capabilities,
    };
  }

  const runtime = await resolveTranscriptRuntimeHandles();
  if (
    !runtime ||
    !capabilities.canImportTranscript ||
    !capabilities.canCreateImportTextSegmentsAction ||
    !capabilities.canExecuteTransaction ||
    !capabilities.hasClipProjectItem
  ) {
    return {
      status: "unsupported_in_runtime",
      reason: describeUnsupportedReason(capabilities),
      capabilities,
      preparedImport: {
        selectedItem,
        textSegments,
      },
    };
  }

  const selectedContext = await getSelectedRuntimeContext();
  if (!selectedContext || !selectedContext.clipProjectItem) {
    return {
      status: "no_selection",
      reason: "No hay clip seleccionado o no se pudo resolver ClipProjectItem",
      capabilities,
      preparedImport: {
        selectedItem,
        textSegments,
      },
    };
  }

  const importFromJsonFn = asFunction(runtime.transcriptStatic.importFromJSON);
  const createImportActionFn = asFunction(runtime.transcriptStatic.createImportTextSegmentsAction);

  if (!importFromJsonFn || !createImportActionFn) {
    return {
      status: "unsupported_in_runtime",
      reason: "Faltan métodos Transcript.importFromJSON/createImportTextSegmentsAction",
      capabilities,
      preparedImport: {
        selectedItem,
        textSegments,
      },
    };
  }

  try {
    const textSegmentsHandle = importFromJsonFn.call(
      runtime.transcriptStatic,
      JSON.stringify({ segments: textSegments }),
    );

    const importAction = createImportActionFn.call(
      runtime.transcriptStatic,
      textSegmentsHandle,
      selectedContext.clipProjectItem,
    );

    return {
      status: "ok",
      capabilities,
      preparedImport: {
        selectedItem,
        textSegments,
        textSegmentsHandle,
        importAction,
      },
    };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Error desconocido al preparar importación",
      capabilities,
      preparedImport: {
        selectedItem,
        textSegments,
      },
    };
  }
}

interface RuntimeHandles {
  transcriptStatic: UnknownRecord;
}

async function resolveTranscriptRuntimeHandles(): Promise<RuntimeHandles | null> {
  const globalRequire = (globalThis as UnknownRecord).require;
  if (typeof globalRequire !== "function") {
    return null;
  }

  try {
    const moduleValue = (globalRequire as UnknownFn)("premierepro");
    const moduleObject = asRecord(moduleValue);
    const transcriptStatic = asRecord(moduleObject?.Transcript);

    if (!moduleObject || !transcriptStatic) {
      return null;
    }

    return {
      transcriptStatic,
    };
  } catch {
    return null;
  }
}

function toExistingTranscriptJson(
  selectedItem: SelectedClipInfo,
  rawJson: string,
): ExistingTranscriptJson {
  const parsed = safeJsonParse(rawJson);
  const textSegments = extractTextSegmentsFromExportPayload(parsed);

  return {
    clipId: selectedItem.clipId,
    exportedAt: new Date().toISOString(),
    source: "premiere",
    textSegments,
  };
}

function extractTextSegmentsFromExportPayload(parsedPayload: unknown): TextSegment[] {
  const payload = asRecord(parsedPayload);
  if (!payload) {
    return [];
  }

  const candidateSegments = payload.segments;
  if (!Array.isArray(candidateSegments)) {
    return [];
  }

  return candidateSegments
    .map(parseExportedSegment)
    .filter((segment): segment is TextSegment => segment !== null);
}

function parseExportedSegment(value: unknown): TextSegment | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const words = Array.isArray(item.words)
    ? item.words
        .map(parseExportedWord)
        .filter((word): word is TextWord => word !== null)
    : [];

  const id = asString(item.id);
  const text = asString(item.text);
  const startMs = asNumber(item.startMs);
  const endMs = asNumber(item.endMs);

  if (!id || !text || startMs === null || endMs === null || endMs < startMs) {
    return null;
  }

  return {
    id,
    speaker: asNullableString(item.speaker),
    startMs,
    endMs,
    text,
    words,
  };
}

function parseExportedWord(value: unknown): TextWord | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const text = asString(item.text);
  const startMs = asNumber(item.startMs);
  const endMs = asNumber(item.endMs);
  const confidence = asNumber(item.confidence);

  if (!text || startMs === null || endMs === null || confidence === null) {
    return null;
  }

  if (endMs < startMs) {
    return null;
  }

  return {
    text,
    startMs,
    endMs,
    confidence,
  };
}

function describeUnsupportedReason(capabilities: {
  missingRequirements: string[];
}): string {
  if (capabilities.missingRequirements.length === 0) {
    return "El runtime actual no soporta la operación requerida";
  }

  return `Runtime sin soporte suficiente: ${capabilities.missingRequirements.join("; ")}`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
}

function asNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}
