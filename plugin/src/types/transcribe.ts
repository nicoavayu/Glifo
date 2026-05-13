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
  metadata: TranscribeMetadata;
}
