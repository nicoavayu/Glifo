export type TranscriptSource = "file";

export interface TranscribeRequest {
  mediaPath: string | null;
  durationMs?: number | null;
  clipId?: string | null;
  clipName?: string | null;
  projectItemId?: string | null;
}

export interface TranscribeSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
}

export interface SttWord {
  startMs: number;
  endMs: number;
  word: string;
}

export interface CaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  timelineStartMs?: number;
  timelineEndMs?: number;
}

export interface TranscribeMetadata {
  mediaPath: string;
  filename: string;
  durationMs: number | null;
}

export interface TranscribeResponse {
  transcriptSource: TranscriptSource;
  provider: string;
  model: string;
  fullText: string;
  segments: TranscribeSegment[];
  words: SttWord[];
  captionSegments: CaptionSegment[];
  metadata: TranscribeMetadata;
}
