import { randomUUID } from "crypto";

export type MogrtBridgeJobStatus = "queued" | "claimed" | "completed" | "failed";

export interface MogrtBridgeCaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface MogrtBridgeJob {
  id: string;
  mogrtPath: string;
  sequenceInMs: number;
  captionSegment: MogrtBridgeCaptionSegment;
  mogrtStyle: Record<string, unknown> | null;
  videoTrackOffset: number;
  audioTrackOffset: number;
  status: MogrtBridgeJobStatus;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  result: unknown | null;
}

export interface CreateMogrtBridgeJobResult {
  ok: boolean;
  job?: MogrtBridgeJob;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const jobs = new Map<string, MogrtBridgeJob>();
const CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

export function createMogrtBridgeJob(input: unknown): CreateMogrtBridgeJobResult {
  const body = asRecord(input);
  if (!body) {
    return invalid("invalid_body", "El payload del job MOGRT debe ser un objeto.");
  }

  const id = normalizeOptionalString(body.id) ?? randomUUID();
  if (jobs.has(id)) {
    return invalid("job_id_conflict", `Ya existe un job MOGRT con id ${id}.`);
  }

  const mogrtPath = normalizeRequiredString(body.mogrtPath);
  if (!mogrtPath) {
    return invalid("mogrt_path_missing", "El job MOGRT requiere mogrtPath absoluto.");
  }

  if (!isLikelyAbsolutePath(mogrtPath)) {
    return invalid("mogrt_path_not_absolute", "mogrtPath debe ser una ruta absoluta.");
  }

  const sequenceInMs = normalizeNonNegativeNumber(body.sequenceInMs);
  if (sequenceInMs === null) {
    return invalid("sequence_in_ms_invalid", "sequenceInMs debe ser un número mayor o igual a cero.");
  }

  const captionSegment = normalizeCaptionSegment(body.captionSegment);
  if (!captionSegment) {
    return invalid(
      "caption_segment_invalid",
      "captionSegment debe tener startMs, endMs y text válidos.",
    );
  }

  const videoTrackOffset = normalizeTrackOffset(body.videoTrackOffset);
  const audioTrackOffset = normalizeTrackOffset(body.audioTrackOffset);
  const mogrtStyle = normalizeOptionalRecord(body.mogrtStyle);

  const job: MogrtBridgeJob = {
    id,
    mogrtPath,
    sequenceInMs: Math.round(sequenceInMs),
    captionSegment,
    mogrtStyle,
    videoTrackOffset,
    audioTrackOffset,
    status: "queued",
    createdAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    result: null,
  };

  jobs.set(id, job);
  return {
    ok: true,
    job,
  };
}

export function claimNextMogrtBridgeJob(): MogrtBridgeJob | null {
  releaseExpiredClaims();

  for (const job of jobs.values()) {
    if (job.status !== "queued") {
      continue;
    }

    job.status = "claimed";
    job.claimedAt = new Date().toISOString();
    return job;
  }

  return null;
}

export function completeMogrtBridgeJob(id: string, result: unknown): MogrtBridgeJob | null {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  const resultObject = asRecord(result);
  const ok = resultObject?.ok === true || resultObject?.inserted === true;
  job.status = ok ? "completed" : "failed";
  job.result = result;
  job.completedAt = new Date().toISOString();
  return job;
}

export function getMogrtBridgeJob(id: string): MogrtBridgeJob | null {
  return jobs.get(id) ?? null;
}

export function clearMogrtBridgeJobsForTests(): void {
  jobs.clear();
}

function releaseExpiredClaims(): void {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== "claimed" || !job.claimedAt || job.result !== null) {
      continue;
    }

    const claimedAtMs = Date.parse(job.claimedAt);
    if (Number.isFinite(claimedAtMs) && now - claimedAtMs > CLAIM_TIMEOUT_MS) {
      job.status = "queued";
      job.claimedAt = null;
    }
  }
}

function normalizeCaptionSegment(value: unknown): MogrtBridgeCaptionSegment | null {
  const segment = asRecord(value);
  if (!segment) {
    return null;
  }

  const startMs = normalizeNonNegativeNumber(segment.startMs);
  const endMs = normalizeNonNegativeNumber(segment.endMs);
  const text = normalizeRequiredString(segment.text);
  if (startMs === null || endMs === null || endMs <= startMs || !text) {
    return null;
  }

  return {
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    text,
  };
}

function normalizeTrackOffset(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeOptionalRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return { ...record };
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLikelyAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return null;
}

function invalid(
  code: string,
  message: string,
  details?: unknown,
): CreateMogrtBridgeJobResult {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}
