/**
 * Payload mínimo que enviamos al backend para pedir la transcripción.
 */
export interface SelectedClipInfo {
  clipId: string;
  clipName: string;
  projectItemId: string | null;
  mediaPath: string | null;
  durationMs: number | null;
}

export type SelectionSource = "timeline" | "project_panel";

/**
 * Representa un item seleccionado en Premiere junto con el objeto original.
 * `raw` permite a futuras capas de integración usar APIs específicas del host.
 */
export interface SelectedPremiereItem extends SelectedClipInfo {
  selectionSource: SelectionSource;
  raw: Record<string, unknown>;
}

/**
 * Estructura intermedia que usaremos para mapear texto externo a segmentos
 * compatibles con la futura importación a `Transcript`.
 */
export interface TextWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/**
 * Segmento de texto normalizado para integración con Premiere.
 */
export interface TextSegment {
  id: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
  words: TextWord[];
}

/**
 * Salida para exportación de transcript existente desde Premiere.
 * En este MVP se deja la estructura y función stub.
 */
export interface ExistingTranscriptJson {
  clipId: string;
  exportedAt: string;
  source: "premiere";
  textSegments: TextSegment[];
}

/**
 * Resultado de preparar una importación externa.
 */
export interface PreparedTranscriptImport {
  selectedItem: SelectedClipInfo;
  textSegments: TextSegment[];
  textSegmentsHandle?: unknown;
  importAction?: unknown;
}

export interface PremiereTranscriptCapabilities {
  hasRequirePremierePro: boolean;
  premiereModuleLoaded: boolean;
  hasTranscriptClass: boolean;
  hasClipProjectItem: boolean;
  canReadSelection: boolean;
  canExportTranscript: boolean;
  canImportTranscript: boolean;
  canCreateImportTextSegmentsAction: boolean;
  canExecuteTransaction: boolean;
  missingRequirements: string[];
}

export type TranscriptOperationStatus =
  | "ok"
  | "unsupported_in_runtime"
  | "no_selection"
  | "selection_invalid"
  | "empty_transcript"
  | "error";

export interface TranscriptExportResult {
  status: TranscriptOperationStatus;
  reason?: string;
  capabilities: PremiereTranscriptCapabilities;
  selectedItem?: SelectedClipInfo;
  exportedTranscript?: ExistingTranscriptJson;
  rawJson?: string;
}

export interface PreparedTranscriptImportResult {
  status: TranscriptOperationStatus;
  reason?: string;
  capabilities: PremiereTranscriptCapabilities;
  preparedImport?: PreparedTranscriptImport;
}
