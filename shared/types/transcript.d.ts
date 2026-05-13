/**
 * Representa una palabra individual del transcript.
 */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/**
 * Representa un bloque continuo de texto (segmento) con sus palabras.
 */
export interface Segment {
  id: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
  words: Word[];
}

/**
 * Resultado normalizado que viaja entre backend y plugin.
 */
export interface TranscriptResult {
  clipId: string;
  language: string;
  createdAt: string;
  segments: Segment[];
}
