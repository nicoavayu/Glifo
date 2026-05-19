import type { CaptionSegment } from "../types/transcribe";

type UnknownRecord = Record<string, unknown>;

export type MogrtBridgeProbeStatus = "ok" | "failed";
export type MogrtBridgeBatchStatus = "ok" | "partial" | "failed";

export type MogrtBridgeErrorCode =
  | "local_backend_unavailable"
  | "job_create_failed"
  | "cep_bridge_inactive"
  | "bridge_result_timeout"
  | "bridge_result_failed";

export interface MogrtBridgeProbeInput {
  captionSegments: CaptionSegment[];
  sequenceInMs: number;
  mogrtPath: string;
  videoTrackOffset?: number;
  audioTrackOffset?: number;
}

export interface MogrtBridgeBatchInput extends MogrtBridgeProbeInput {
  onProgress?: (progress: MogrtBridgeBatchProgress) => void;
}

export interface MogrtBridgeProbeTarget {
  sequenceInMs: number;
  captionStartMs: number;
  captionEndMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  durationMs: number;
  text: string;
}

export interface MogrtBridgeOperationSummary {
  ok: boolean;
  error: string | null;
  details: UnknownRecord;
}

export interface MogrtBridgeProbeReport {
  status: MogrtBridgeProbeStatus;
  failureMessage: string | null;
  failureCode: MogrtBridgeErrorCode | null;
  skipped: boolean;
  captionIndex: number;
  jobId: string | null;
  mogrtPath: string;
  target: MogrtBridgeProbeTarget;
  insert: MogrtBridgeOperationSummary;
  text: MogrtBridgeOperationSummary;
  duration: MogrtBridgeOperationSummary;
  visualDiagnostics: unknown | null;
  itemName: string | null;
  startTicks: string | null;
  endTicks: string | null;
  rawResult: unknown | null;
  errors: string[];
  warnings: string[];
}

export interface MogrtBridgeBatchProgress {
  phase: "starting" | "item_started" | "item_completed" | "completed";
  current: number;
  total: number;
  captionIndex: number | null;
  report: MogrtBridgeProbeReport | null;
}

export interface MogrtBridgeBatchTotals {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  insertOk: number;
  textOk: number;
  durationOk: number;
  invalid: number;
  skipped: number;
}

export interface MogrtBridgeBatchReport {
  status: MogrtBridgeBatchStatus;
  mogrtPath: string;
  sequenceInMs: number;
  totals: MogrtBridgeBatchTotals;
  items: MogrtBridgeProbeReport[];
  warnings: string[];
}

interface CreatedBridgeJob {
  id: string;
  createdAt: string | null;
  videoTrackOffset: number | null;
  audioTrackOffset: number | null;
}

interface CaptionJobItem {
  captionIndex: number;
  captionSegment: CaptionSegment;
  target: MogrtBridgeProbeTarget;
}

export class MogrtBridgeError extends Error {
  readonly code: MogrtBridgeErrorCode;
  readonly details: unknown;

  constructor(code: MogrtBridgeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "MogrtBridgeError";
    this.code = code;
    this.details = details;
  }
}

const MOGRT_JOBS_ENDPOINT = "http://localhost:3001/bridge/mogrt-jobs";
const CEP_INACTIVE_AFTER_MS = 5_000;
const RESULT_TIMEOUT_MS = 90_000;
const RESULT_POLL_MS = 1_000;

export function isMogrtBridgeError(value: unknown): value is MogrtBridgeError {
  return value instanceof MogrtBridgeError;
}

export async function runSingleCaptionMogrtBridgeProbe(
  input: MogrtBridgeProbeInput,
): Promise<MogrtBridgeProbeReport> {
  const item = getFirstUsableCaptionJobItem(input.sequenceInMs, input.captionSegments);
  const report = await runCaptionMogrtBridgeJob({
    captionIndex: item.captionIndex,
    captionSegment: item.captionSegment,
    target: item.target,
    mogrtPath: input.mogrtPath,
    sequenceInMs: input.sequenceInMs,
    videoTrackOffset: input.videoTrackOffset ?? 0,
    audioTrackOffset: input.audioTrackOffset ?? 0,
  });

  console.info("[GLIFO] mogrt-bridge:report", report);
  return report;
}

export async function runCaptionSegmentsMogrtBridgeFlow(
  input: MogrtBridgeBatchInput,
): Promise<MogrtBridgeBatchReport> {
  const items = buildCaptionJobItems(input.sequenceInMs, input.captionSegments);
  if (items.length === 0) {
    throw new MogrtBridgeError(
      "job_create_failed",
      "No hay captionSegments válidos para crear subtítulos MOGRT.",
    );
  }

  const report: MogrtBridgeBatchReport = {
    status: "failed",
    mogrtPath: input.mogrtPath,
    sequenceInMs: input.sequenceInMs,
    totals: createBatchTotals(input.captionSegments.length, input.captionSegments.length - items.length),
    items: [],
    warnings: [],
  };

  if (report.totals.invalid > 0) {
    report.warnings.push(
      `${report.totals.invalid} captionSegment(s) inválido(s) no se enviaron al CEP bridge.`,
    );
  }

  emitBatchProgress(input, {
    phase: "starting",
    current: 0,
    total: items.length,
    captionIndex: null,
    report: null,
  });

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    emitBatchProgress(input, {
      phase: "item_started",
      current: index + 1,
      total: items.length,
      captionIndex: item.captionIndex,
      report: null,
    });

    const itemReport = await runCaptionMogrtBridgeJob({
      captionIndex: item.captionIndex,
      captionSegment: item.captionSegment,
      target: item.target,
      mogrtPath: input.mogrtPath,
      sequenceInMs: input.sequenceInMs,
      videoTrackOffset: input.videoTrackOffset ?? 0,
      audioTrackOffset: input.audioTrackOffset ?? 0,
    });

    report.items.push(itemReport);
    recalculateBatchTotals(report);

    console.info("[GLIFO] mogrt-bridge:item-result", {
      captionIndex: item.captionIndex,
      current: index + 1,
      total: items.length,
      itemReport,
    });

    emitBatchProgress(input, {
      phase: "item_completed",
      current: index + 1,
      total: items.length,
      captionIndex: item.captionIndex,
      report: itemReport,
    });

    if (isFatalBridgeFailure(itemReport) && index < items.length - 1) {
      appendSkippedReportsAfterFatalFailure(report, items.slice(index + 1), itemReport);
      break;
    }
  }

  recalculateBatchTotals(report);
  emitBatchProgress(input, {
    phase: "completed",
    current: items.length,
    total: items.length,
    captionIndex: null,
    report: null,
  });

  console.info("[GLIFO] mogrt-bridge:batch-report", report);
  return report;
}

export function isMogrtBridgeReportFullyOk(report: MogrtBridgeProbeReport): boolean {
  return report.insert.ok && report.text.ok && report.duration.ok;
}

function createInitialReport(
  mogrtPath: string,
  target: MogrtBridgeProbeTarget,
  captionIndex: number,
): MogrtBridgeProbeReport {
  return {
    status: "failed",
    failureMessage: null,
    failureCode: null,
    skipped: false,
    captionIndex,
    jobId: null,
    mogrtPath,
    target,
    insert: createOperationSummary(),
    text: createOperationSummary(),
    duration: createOperationSummary(),
    visualDiagnostics: null,
    itemName: null,
    startTicks: null,
    endTicks: null,
    rawResult: null,
    errors: [],
    warnings: [],
  };
}

function createOperationSummary(): MogrtBridgeOperationSummary {
  return {
    ok: false,
    error: null,
    details: {},
  };
}

async function runCaptionMogrtBridgeJob(input: {
  captionIndex: number;
  captionSegment: CaptionSegment;
  target: MogrtBridgeProbeTarget;
  mogrtPath: string;
  sequenceInMs: number;
  videoTrackOffset: number;
  audioTrackOffset: number;
}): Promise<MogrtBridgeProbeReport> {
  const report = createInitialReport(input.mogrtPath, input.target, input.captionIndex);

  try {
    const jobId = createJobId(input.captionIndex);
    const job = await createBridgeJob({
      id: jobId,
      mogrtPath: input.mogrtPath,
      sequenceInMs: input.sequenceInMs,
      captionSegment: input.captionSegment,
      videoTrackOffset: input.videoTrackOffset,
      audioTrackOffset: input.audioTrackOffset,
    });
    report.jobId = job.id;
    report.insert.details.jobCreatedAt = job.createdAt;
    report.insert.details.videoTrackOffset = job.videoTrackOffset;
    report.insert.details.audioTrackOffset = job.audioTrackOffset;

    const result = await waitForBridgeResult(job.id);
    applyBridgeResult(report, result);
  } catch (error) {
    failReport(
      report,
      formatBridgeErrorMessage(error),
      isMogrtBridgeError(error) ? error.code : null,
    );
  }

  return report;
}

function getFirstUsableCaptionJobItem(
  sequenceInMs: number,
  captionSegments: CaptionSegment[],
): CaptionJobItem {
  const item = buildCaptionJobItems(sequenceInMs, captionSegments)[0] ?? null;

  if (!item) {
    throw new MogrtBridgeError(
      "job_create_failed",
      "No hay un captionSegment válido para probar MOGRT.",
    );
  }

  return item;
}

function buildCaptionJobItems(
  sequenceInMs: number,
  captionSegments: CaptionSegment[],
): CaptionJobItem[] {
  if (!Number.isFinite(sequenceInMs) || sequenceInMs < 0) {
    throw new MogrtBridgeError(
      "job_create_failed",
      "sequenceInMs no es válido; la creación MOGRT requiere un rango Fase 2.",
    );
  }

  const items: CaptionJobItem[] = [];

  captionSegments.forEach((captionSegment, captionIndex) => {
    if (!isUsableCaptionSegment(captionSegment)) {
      return;
    }

    items.push({
      captionIndex,
      captionSegment,
      target: buildProbeTarget(sequenceInMs, captionSegment),
    });
  });

  return items;
}

function isUsableCaptionSegment(candidate: CaptionSegment): boolean {
  return (
    Number.isFinite(candidate.startMs) &&
    Number.isFinite(candidate.endMs) &&
    candidate.endMs > candidate.startMs &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0
  );
}

function buildProbeTarget(
  sequenceInMs: number,
  captionSegment: CaptionSegment,
): MogrtBridgeProbeTarget {
  if (!Number.isFinite(sequenceInMs) || sequenceInMs < 0) {
    throw new MogrtBridgeError(
      "job_create_failed",
      "sequenceInMs no es válido; la prueba requiere un rango Fase 2.",
    );
  }

  const timelineStartMs = Math.max(0, Math.round(sequenceInMs + captionSegment.startMs));
  const durationMs = Math.max(1, Math.round(captionSegment.endMs - captionSegment.startMs));
  const timelineEndMs = timelineStartMs + durationMs;

  return {
    sequenceInMs,
    captionStartMs: captionSegment.startMs,
    captionEndMs: captionSegment.endMs,
    timelineStartMs,
    timelineEndMs,
    durationMs,
    text: captionSegment.text,
  };
}

function createBatchTotals(total: number, invalid: number): MogrtBridgeBatchTotals {
  return {
    total,
    processed: 0,
    successful: 0,
    failed: 0,
    insertOk: 0,
    textOk: 0,
    durationOk: 0,
    invalid,
    skipped: 0,
  };
}

function recalculateBatchTotals(report: MogrtBridgeBatchReport): void {
  const invalid = report.totals.invalid;
  const processedItems = report.items.filter((item) => !item.skipped);
  const skipped = report.items.length - processedItems.length;
  const successful = processedItems.filter(isMogrtBridgeReportFullyOk).length;
  const failed = report.totals.total - successful;

  report.totals = {
    total: report.totals.total,
    processed: processedItems.length,
    successful,
    failed,
    insertOk: processedItems.filter((item) => item.insert.ok).length,
    textOk: processedItems.filter((item) => item.text.ok).length,
    durationOk: processedItems.filter((item) => item.duration.ok).length,
    invalid,
    skipped,
  };

  if (report.totals.successful === report.totals.total && report.totals.total > 0) {
    report.status = "ok";
  } else if (report.totals.successful > 0) {
    report.status = "partial";
  } else {
    report.status = "failed";
  }
}

function appendSkippedReportsAfterFatalFailure(
  report: MogrtBridgeBatchReport,
  remainingItems: CaptionJobItem[],
  failedReport: MogrtBridgeProbeReport,
): void {
  const message = [
    "No se envió este caption porque se detuvo el flujo tras un error del bridge.",
    failedReport.failureMessage ?? "Error desconocido.",
  ].join(" ");

  remainingItems.forEach((item) => {
    const skippedReport = createInitialReport(report.mogrtPath, item.target, item.captionIndex);
    skippedReport.skipped = true;
    skippedReport.warnings.push("Job no creado para evitar encolar más trabajo con el bridge inactivo.");
    failReport(skippedReport, message, failedReport.failureCode);
    report.items.push(skippedReport);
  });

  report.warnings.push("El flujo se detuvo antes de encolar todos los captions por un error del bridge.");
  recalculateBatchTotals(report);
}

function isFatalBridgeFailure(report: MogrtBridgeProbeReport): boolean {
  return (
    report.failureCode === "local_backend_unavailable" ||
    report.failureCode === "cep_bridge_inactive" ||
    report.failureCode === "bridge_result_timeout" ||
    report.failureCode === "bridge_result_failed"
  );
}

function emitBatchProgress(
  input: MogrtBridgeBatchInput,
  progress: MogrtBridgeBatchProgress,
): void {
  try {
    input.onProgress?.(progress);
  } catch (error) {
    console.warn("[GLIFO] mogrt-bridge:progress-callback-error", {
      message: getErrorMessage(error),
    });
  }
}

async function createBridgeJob(input: {
  id: string;
  mogrtPath: string;
  sequenceInMs: number;
  captionSegment: CaptionSegment;
  videoTrackOffset: number;
  audioTrackOffset: number;
}): Promise<CreatedBridgeJob> {
  let response: Response;
  try {
    response = await fetch(MOGRT_JOBS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new MogrtBridgeError(
      "local_backend_unavailable",
      "Backend local no disponible para crear el job MOGRT.",
      { cause: getErrorMessage(error) },
    );
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new MogrtBridgeError(
      "job_create_failed",
      readBackendErrorMessage(payload) ?? `No se pudo crear el job MOGRT (HTTP ${response.status}).`,
      payload,
    );
  }

  const job = asRecord(asRecord(payload)?.job);
  if (!job || typeof job.id !== "string") {
    throw new MogrtBridgeError(
      "job_create_failed",
      "El backend creó una respuesta de job MOGRT inválida.",
      payload,
    );
  }

  return {
    id: job.id,
    createdAt: typeof job.createdAt === "string" ? job.createdAt : null,
    videoTrackOffset: typeof job.videoTrackOffset === "number" ? job.videoTrackOffset : null,
    audioTrackOffset: typeof job.audioTrackOffset === "number" ? job.audioTrackOffset : null,
  };
}

async function waitForBridgeResult(jobId: string): Promise<unknown> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RESULT_TIMEOUT_MS) {
    let response: Response;
    try {
      response = await fetch(`${MOGRT_JOBS_ENDPOINT}/${encodeURIComponent(jobId)}/result`);
    } catch (error) {
      throw new MogrtBridgeError(
        "local_backend_unavailable",
        "Backend local no disponible para consultar el resultado MOGRT.",
        { cause: getErrorMessage(error), jobId },
      );
    }

    const payload = await readJsonResponse(response);
    if (response.status === 202) {
      const status = asRecord(payload)?.status;
      if (status === "queued" && Date.now() - startedAt >= CEP_INACTIVE_AFTER_MS) {
        throw new MogrtBridgeError(
          "cep_bridge_inactive",
          "CEP bridge no está activo.",
          { jobId, waitedMs: Date.now() - startedAt },
        );
      }

      await delay(RESULT_POLL_MS);
      continue;
    }

    if (!response.ok) {
      throw new MogrtBridgeError(
        "bridge_result_failed",
        readBackendErrorMessage(payload) ?? `No se pudo leer el resultado MOGRT (HTTP ${response.status}).`,
        payload,
      );
    }

    return asRecord(payload)?.result ?? payload;
  }

  throw new MogrtBridgeError(
    "bridge_result_timeout",
    "El CEP bridge no devolvió resultado MOGRT a tiempo.",
    { jobId, timeoutMs: RESULT_TIMEOUT_MS },
  );
}

function applyBridgeResult(report: MogrtBridgeProbeReport, result: unknown): void {
  const resultObject = asRecord(result);
  report.rawResult = result;
  if (!resultObject) {
    failReport(report, "El CEP bridge devolvió un resultado inválido.");
    return;
  }

  report.itemName = typeof resultObject.itemName === "string" ? resultObject.itemName : null;
  report.startTicks = typeof resultObject.startTicks === "string" ? resultObject.startTicks : null;
  report.endTicks = typeof resultObject.endTicks === "string" ? resultObject.endTicks : null;
  report.errors = normalizeStringArray(resultObject.errors);
  report.visualDiagnostics =
    resultObject.visual ??
    asRecord(resultObject.diagnostics)?.visualAudit ??
    null;
  report.warnings.push(...readVisualDiagnosticWarnings(report.visualDiagnostics));

  report.insert.ok = resultObject.inserted === true;
  report.insert.error = report.insert.ok
    ? null
    : firstString(report.errors) ?? "activeSequence.importMGT no insertó un TrackItem.";
  report.insert.details = {
    ok: resultObject.ok,
    inserted: resultObject.inserted,
    itemName: report.itemName,
  };

  applyOperationResult(report.text, resultObject.text, "No se pudo setear el texto del MOGRT.");
  applyOperationResult(report.duration, resultObject.duration, "No se pudo ajustar la duración del MOGRT.");

  report.status = report.insert.ok ? "ok" : "failed";
  if (!report.insert.ok) {
    report.failureMessage = report.insert.error;
  }
}

function applyOperationResult(
  operation: MogrtBridgeOperationSummary,
  value: unknown,
  defaultError: string,
): void {
  if (typeof value === "boolean") {
    operation.ok = value;
    operation.error = value ? null : defaultError;
    operation.details = { value };
    return;
  }

  const object = asRecord(value);
  if (!object) {
    operation.ok = false;
    operation.error = defaultError;
    operation.details = {};
    return;
  }

  operation.ok = object.ok === true;
  operation.error = operation.ok
    ? null
    : typeof object.error === "string" && object.error.trim().length > 0
      ? object.error
      : defaultError;
  operation.details = object;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readBackendErrorMessage(payload: unknown): string | null {
  const payloadObject = asRecord(payload);
  const errorObject = asRecord(payloadObject?.error);
  const message = errorObject?.message ?? payloadObject?.message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

function createJobId(captionIndex?: number): string {
  const prefix = Number.isInteger(captionIndex)
    ? `mogrt-caption-${Number(captionIndex) + 1}-`
    : "mogrt-";

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}${crypto.randomUUID()}`;
  }

  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failReport(
  report: MogrtBridgeProbeReport,
  message: string,
  code: MogrtBridgeErrorCode | null = null,
): void {
  report.status = "failed";
  report.failureMessage = message;
  report.failureCode = code;
  if (message && !report.errors.includes(message)) {
    report.errors.push(message);
  }
  if (!report.insert.error) {
    report.insert.error = message;
  }
  console.warn("[GLIFO] mogrt-bridge:failed", {
    message,
    report,
  });
}

function formatBridgeErrorMessage(error: unknown): string {
  if (isMogrtBridgeError(error)) {
    return error.message;
  }

  return getErrorMessage(error);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0
  );
}

function readVisualDiagnosticWarnings(value: unknown): string[] {
  const warnings = asRecord(value)?.warnings;
  return normalizeStringArray(warnings).map((warning) => `Visual audit: ${warning}`);
}

function firstString(values: string[]): string | null {
  return values.length > 0 ? values[0] : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value === "object" && value !== null) {
    return value as UnknownRecord;
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
