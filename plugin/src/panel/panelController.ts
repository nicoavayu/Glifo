import {
  isTranscribeApiError,
  requestTranscript,
} from "../services/api";
import {
  pickExportedMediaFile,
  pickMogrtFile,
} from "../services/localFilePicker";
import {
  isMogrtBridgeError,
  runCaptionSegmentsMogrtBridgeFlow,
} from "../services/mogrtBridge";
import type {
  MogrtBridgeBatchProgress,
  MogrtBridgeBatchReport,
  MogrtBridgeProbeReport,
} from "../services/mogrtBridge";
import {
  exportActiveSequenceInOutToWav,
  isAudioExportError,
} from "../premiere/audioExport";
import {
  isSrtExportError,
  saveCaptionSegmentsAsSrtFile,
} from "../services/srt";
import type { ExportedWav } from "../premiere/audioExport";
import type { TranscribeResponse } from "../types/transcribe";

interface PanelElements {
  root: HTMLElement;
}

interface ResultElements {
  emptyState: HTMLDivElement;
  metadataSection: HTMLElement;
  metadataList: HTMLDivElement;
  segmentsSection: HTMLElement;
  segmentsPreview: HTMLPreElement;
  captionsSection: HTMLElement;
  srtInstruction: HTMLParagraphElement;
  captionsPreview: HTMLPreElement;
  textSection: HTMLElement;
  fullTextPreview: HTMLPreElement;
  copyButton: HTMLButtonElement;
  copyFeedback: HTMLParagraphElement;
}

export function createPanelController(elements: PanelElements) {
  const mount = () => {
    const { root } = elements;
    let latestFullText = "";
    let latestSrtPayload: {
      captionSegments: TranscribeResponse["captionSegments"];
      sequenceInMs: number | null;
    } | null = null;

    root.style.display = "block";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.maxHeight = "100%";
    root.style.minHeight = "260px";
    root.style.boxSizing = "border-box";
    root.style.overflow = "hidden";

    root.innerHTML = `
      <section class="panel" role="region" aria-label="Panel GLIFO">
        <header class="panel__header">
          <h1 class="panel__title">GLIFO</h1>
          <p id="statusLabel" class="panel__status">Estado: listo</p>
        </header>

        <p id="fileLabel" class="panel__file">Archivo: ninguno</p>

        <div id="panelActions" class="panel__actions" aria-label="Acciones de transcripción"></div>

        <div class="panel__resultViewport">
          <div id="resultPreview" class="panel__result" aria-live="polite">
            <div id="resultEmpty" class="panel__empty"></div>

            <section id="resultMetadataSection" class="panel__resultSection" hidden>
              <h2 class="panel__sectionTitle">Metadata</h2>
              <div id="resultMetadataList" class="panel__metadataList"></div>
            </section>

            <section id="resultSegmentsSection" class="panel__resultSection" hidden>
              <h2 class="panel__sectionTitle">Segmentos STT originales</h2>
              <pre id="segmentsPreview" class="panel__segmentsList"></pre>
            </section>

            <section id="resultCaptionsSection" class="panel__resultSection" hidden>
              <h2 class="panel__sectionTitle">Caption segments</h2>
              <p id="srtInstruction" class="panel__srtInstruction" hidden></p>
              <pre id="captionsPreview" class="panel__segmentsList"></pre>
            </section>

            <section id="resultTextSection" class="panel__resultSection" hidden>
              <div class="panel__textHeader">
                <h2 class="panel__sectionTitle">Texto completo</h2>
                <button id="copyTextButton" class="panel__copyButton" type="button" disabled>
                  Copiar texto
                </button>
              </div>
              <p id="copyFeedback" class="panel__copyFeedback" aria-live="polite"></p>
              <pre id="fullTextPreview" class="panel__fullText"></pre>
            </section>
          </div>
        </div>
      </section>
    `;

    const statusLabel = root.querySelector<HTMLParagraphElement>("#statusLabel");
    const panelActions = root.querySelector<HTMLDivElement>("#panelActions");
    const fileLabel = root.querySelector<HTMLParagraphElement>("#fileLabel");
    const resultElements = getResultElements(root);

    if (!statusLabel || !panelActions || !fileLabel || !resultElements) {
      console.error("[GLIFO] panel mount incompleto: faltan nodos esperados", {
        hasStatusLabel: Boolean(statusLabel),
        hasPanelActions: Boolean(panelActions),
        hasFileLabel: Boolean(fileLabel),
        hasResultElements: Boolean(resultElements),
      });
      return;
    }

    const fileButton = document.createElement("button");
    fileButton.id = "fileButton";
    fileButton.className = "panel__button panel__button--primary";
    fileButton.type = "button";
    fileButton.textContent = "Transcribir archivo";

    const selectionButton = document.createElement("button");
    selectionButton.id = "selectionButton";
    selectionButton.className = "panel__button panel__button--secondary";
    selectionButton.type = "button";
    selectionButton.title = "Transcribir el rango In/Out de la secuencia activa";
    selectionButton.textContent = "Transcribir rango In/Out";

    panelActions.textContent = "";
    panelActions.appendChild(fileButton);
    panelActions.appendChild(selectionButton);

    const srtButton = document.createElement("button");
    srtButton.id = "srtButton";
    srtButton.className = "panel__button panel__button--secondary";
    srtButton.type = "button";
    srtButton.textContent = "Exportar SRT";
    srtButton.title = "Guarda un archivo .srt desde los caption segments de la última transcripción.";
    srtButton.hidden = true;
    srtButton.disabled = true;
    panelActions.appendChild(srtButton);

    const mogrtButton = document.createElement("button");
    mogrtButton.id = "mogrtButton";
    mogrtButton.className = "panel__button panel__button--secondary";
    mogrtButton.type = "button";
    mogrtButton.textContent = "Crear subtítulos MOGRT";
    mogrtButton.title = "Inserta un MOGRT por cada captionSegment de la última transcripción Fase 2.";
    mogrtButton.hidden = true;
    mogrtButton.disabled = true;
    panelActions.appendChild(mogrtButton);

    renderEmptyResult(resultElements);

    resultElements.copyButton.addEventListener("click", async () => {
      if (!latestFullText) {
        setCopyFeedback(resultElements, "No hay texto para copiar.", "warning");
        return;
      }

      resultElements.copyButton.disabled = true;
      setCopyFeedback(resultElements, "Copiando texto...", "neutral");

      try {
        const copyResult = await copyTextToClipboard(latestFullText);
        if (copyResult === "copied") {
          setCopyFeedback(resultElements, "Texto copiado al portapapeles.", "success");
        } else {
          setCopyFeedback(
            resultElements,
            "El portapapeles no está disponible en este runtime. El texto completo queda visible para copiarlo manualmente.",
            "warning",
          );
        }
      } catch (error) {
        setCopyFeedback(
          resultElements,
          `No se pudo copiar automáticamente: ${getErrorMessage(error)}. El texto completo queda visible para copiarlo manualmente.`,
          "warning",
        );
      } finally {
        resultElements.copyButton.disabled = latestFullText.length === 0;
      }
    });

    fileButton.addEventListener("click", async () => {
      console.info("[GLIFO] transcribe:start");

      fileButton.disabled = true;
      selectionButton.disabled = true;
      srtButton.disabled = true;
      srtButton.hidden = true;
      mogrtButton.disabled = true;
      mogrtButton.hidden = true;
      fileButton.textContent = "Seleccionando archivo...";
      latestFullText = "";
      latestSrtPayload = null;
      statusLabel.textContent = "Estado: seleccionando archivo...";
      renderPendingResult(resultElements, "Abrí el selector y elegí un archivo exportado desde Premiere.");

      try {
        const file = await pickExportedMediaFile();
        if (!file) {
          console.info("[GLIFO] transcribe:cancelled");
          statusLabel.textContent = "Estado: selección cancelada";
          renderPendingResult(resultElements, "No se seleccionó ningún archivo.");
          return;
        }

        fileLabel.textContent = `Archivo: ${file.name}`;
        fileButton.textContent = "Transcribiendo...";
        statusLabel.textContent = "Estado: transcribiendo archivo...";

        console.info("[GLIFO] transcribe:file-selected", {
          fileName: file.name,
          mediaPath: file.nativePath,
        });

        renderPendingResult(resultElements, "Transcribiendo archivo...");

        const transcript = await requestTranscript({
          mediaPath: file.nativePath,
          durationMs: null,
        });

        latestFullText = transcript.fullText;
        latestSrtPayload = {
          captionSegments: transcript.captionSegments,
          sequenceInMs: null,
        };
        srtButton.hidden = false;
        srtButton.disabled = !canExportSrt(latestSrtPayload);
        mogrtButton.hidden = true;
        mogrtButton.disabled = true;
        statusLabel.textContent = "Estado: transcripción lista";
        renderTranscript(resultElements, transcript);

        console.info("[GLIFO] transcribe:ok", {
          provider: transcript.provider,
          model: transcript.model,
          fullTextLength: transcript.fullText.length,
          segments: transcript.segments.length,
          words: transcript.words.length,
          captionSegments: transcript.captionSegments.length,
        });
      } catch (error) {
        const formatted = formatTranscriptionError(error);
        statusLabel.textContent = "Estado: error";
        renderErrorResult(resultElements, formatted);

        console.error("[GLIFO] transcribe:error", {
          message: getErrorMessage(error),
        });
      } finally {
        fileButton.disabled = false;
        selectionButton.disabled = false;
        srtButton.disabled = srtButton.hidden || !canExportSrt(latestSrtPayload);
        mogrtButton.disabled = mogrtButton.hidden || !canRunMogrtFlow(latestSrtPayload);
        fileButton.textContent = "Transcribir archivo";
      }
    });

    selectionButton.addEventListener("click", async () => {
      console.info("[GLIFO] transcribe-range:start");
      let cleanupExportedWav: (() => Promise<void>) | null = null;
      let exportedWavFilename: string | null = null;

      fileButton.disabled = true;
      selectionButton.disabled = true;
      srtButton.disabled = true;
      srtButton.hidden = true;
      mogrtButton.disabled = true;
      mogrtButton.hidden = true;
      selectionButton.textContent = "Exportando...";
      latestFullText = "";
      latestSrtPayload = null;
      statusLabel.textContent = "Estado: exportando audio...";
      renderPendingResult(resultElements, "Exportando audio del rango...");

      try {
        const exportedWav = await exportActiveSequenceInOutToWav();
        cleanupExportedWav = exportedWav.cleanup ?? null;
        exportedWavFilename = exportedWav.filename;

        fileLabel.textContent = `Archivo: ${exportedWav.filename}`;
        selectionButton.textContent = "Transcribiendo...";
        statusLabel.textContent = "Estado: transcribiendo audio...";
        renderPendingResult(resultElements, "Transcribiendo audio...");

        console.info("[GLIFO] transcribe-range:wav-exported", {
          fileName: exportedWav.filename,
          mediaPath: exportedWav.mediaPath,
        });

        let transcript: TranscribeResponse;
        try {
          transcript = await requestTranscript({
            mediaPath: exportedWav.mediaPath,
            durationMs: exportedWav.durationMs,
          });
        } finally {
          await cleanupExportedWavSafely(cleanupExportedWav, exportedWavFilename);
          cleanupExportedWav = null;
        }

        latestFullText = transcript.fullText;
        latestSrtPayload = {
          captionSegments: transcript.captionSegments,
          sequenceInMs: exportedWav.sequenceInMs,
        };
        srtButton.hidden = false;
        srtButton.disabled = !canExportSrt(latestSrtPayload);
        mogrtButton.hidden = !canRunMogrtFlow(latestSrtPayload);
        mogrtButton.disabled = !canRunMogrtFlow(latestSrtPayload);
        statusLabel.textContent = "Estado: transcripción lista";
        renderTranscript(resultElements, hideTemporaryWavPath(transcript), exportedWav);

        console.info("[GLIFO] transcribe-range:ok", {
          provider: transcript.provider,
          model: transcript.model,
          fullTextLength: transcript.fullText.length,
          segments: transcript.segments.length,
          words: transcript.words.length,
          captionSegments: transcript.captionSegments.length,
        });
      } catch (error) {
        const formatted = formatRangeTranscriptionError(error);
        statusLabel.textContent = "Estado: error";
        renderErrorResult(resultElements, formatted);

        console.error("[GLIFO] transcribe-range:error", {
          message: getErrorMessage(error),
          code: isAudioExportError(error) ? error.code : null,
        });
      } finally {
        await cleanupExportedWavSafely(cleanupExportedWav, exportedWavFilename);
        fileButton.disabled = false;
        selectionButton.disabled = false;
        srtButton.disabled = srtButton.hidden || !canExportSrt(latestSrtPayload);
        mogrtButton.disabled = mogrtButton.hidden || !canRunMogrtFlow(latestSrtPayload);
        selectionButton.textContent = "Transcribir rango In/Out";
      }
    });

    srtButton.addEventListener("click", async () => {
      if (!latestSrtPayload) {
        statusLabel.textContent = "Estado: error";
        setCopyFeedback(
          resultElements,
          "No hay captionSegments disponibles para exportar SRT.",
          "warning",
        );
        return;
      }

      if (latestSrtPayload.captionSegments.length === 0) {
        statusLabel.textContent = "Estado: error al exportar SRT";
        setCopyFeedback(
          resultElements,
          "No hay captionSegments disponibles para exportar SRT.",
          "warning",
        );
        return;
      }

      fileButton.disabled = true;
      selectionButton.disabled = true;
      srtButton.disabled = true;
      mogrtButton.disabled = true;
      srtButton.textContent = "Guardando SRT...";
      statusLabel.textContent = "Estado: guardando SRT...";
      setCopyFeedback(
        resultElements,
        "Elegí dónde guardar el archivo .srt.",
        "neutral",
      );

      try {
        const result = await saveCaptionSegmentsAsSrtFile(latestSrtPayload.captionSegments);
        if (result.status === "cancelled") {
          statusLabel.textContent = "Estado: exportación SRT cancelada";
          setCopyFeedback(resultElements, "No se guardó ningún SRT.", "warning");
          return;
        }

        const instruction = buildSrtPlacementInstruction(latestSrtPayload.sequenceInMs);
        statusLabel.textContent = `Estado: SRT exportado (${result.cueCount ?? 0})`;
        setCopyFeedback(
          resultElements,
          instruction,
          "success",
        );
        console.info("[GLIFO] srt:export:ok", result);
      } catch (error) {
        const message = formatSrtExportError(error);
        statusLabel.textContent = "Estado: error al exportar SRT";
        setCopyFeedback(resultElements, message, "warning");
        console.error("[GLIFO] srt:export:error", {
          message: getErrorMessage(error),
          code: isSrtExportError(error) ? error.code : null,
        });
      } finally {
        fileButton.disabled = false;
        selectionButton.disabled = false;
        srtButton.disabled = !canExportSrt(latestSrtPayload);
        mogrtButton.disabled = mogrtButton.hidden || !canRunMogrtFlow(latestSrtPayload);
        srtButton.textContent = "Exportar SRT";
      }
    });

    mogrtButton.addEventListener("click", async () => {
      if (!canRunMogrtFlow(latestSrtPayload)) {
        statusLabel.textContent = "Estado: MOGRT no disponible";
        setCopyFeedback(
          resultElements,
          "Crear subtítulos MOGRT requiere captionSegments y sequenceInMs de Fase 2.",
          "warning",
        );
        return;
      }

      const payload = latestSrtPayload;
      fileButton.disabled = true;
      selectionButton.disabled = true;
      srtButton.disabled = true;
      mogrtButton.disabled = true;
      mogrtButton.textContent = "Seleccionando MOGRT...";
      statusLabel.textContent = "Estado: seleccionando MOGRT...";
      setCopyFeedback(
        resultElements,
        "Elegí un archivo .mogrt local. Se usará para todos los captionSegments.",
        "neutral",
      );

      try {
        const mogrtFile = await pickMogrtFile();
        if (!mogrtFile) {
          statusLabel.textContent = "Estado: MOGRT cancelado";
          setCopyFeedback(resultElements, "No se seleccionó ningún MOGRT.", "warning");
          return;
        }

        mogrtButton.textContent = "Creando MOGRTs...";
        statusLabel.textContent = `Estado: creando subtítulos MOGRT (0/${payload.captionSegments.length})`;
        setCopyFeedback(
          resultElements,
          "Creando un MOGRT por captionSegment. Dejá abierto el panel CEP GLIFO Bridge.",
          "neutral",
        );

        const report = await runCaptionSegmentsMogrtBridgeFlow({
          captionSegments: payload.captionSegments,
          sequenceInMs: payload.sequenceInMs,
          mogrtPath: mogrtFile.nativePath,
          onProgress: (progress) => {
            renderMogrtProgress(statusLabel, resultElements, progress);
          },
        });

        const feedback = formatMogrtBatchFeedback(report);
        statusLabel.textContent = formatMogrtBatchStatus(report);
        setCopyFeedback(
          resultElements,
          feedback,
          report.status === "ok" ? "success" : "warning",
        );
        console.info("[GLIFO] mogrt-bridge:panel-result", {
          mogrtName: mogrtFile.name,
          report,
        });
      } catch (error) {
        statusLabel.textContent = "Estado: error al crear MOGRTs";
        const message = isMogrtBridgeError(error) && error.code === "cep_bridge_inactive"
          ? "CEP bridge no está activo."
          : getErrorMessage(error);
        setCopyFeedback(
          resultElements,
          `No se pudieron crear subtítulos MOGRT: ${message}`,
          "warning",
        );
        console.error("[GLIFO] mogrt-bridge:panel-error", {
          message: getErrorMessage(error),
        });
      } finally {
        fileButton.disabled = false;
        selectionButton.disabled = false;
        srtButton.disabled = !canExportSrt(latestSrtPayload);
        mogrtButton.disabled = mogrtButton.hidden || !canRunMogrtFlow(latestSrtPayload);
        mogrtButton.textContent = "Crear subtítulos MOGRT";
      }
    });
  };

  return {
    mount,
  };
}

function canExportSrt(payload: {
  captionSegments: TranscribeResponse["captionSegments"];
  sequenceInMs: number | null;
} | null): boolean {
  return payload !== null;
}

function canRunMogrtFlow(payload: {
  captionSegments: TranscribeResponse["captionSegments"];
  sequenceInMs: number | null;
} | null): payload is {
  captionSegments: TranscribeResponse["captionSegments"];
  sequenceInMs: number;
} {
  return Boolean(
    payload &&
    payload.captionSegments.length > 0 &&
    payload.sequenceInMs !== null &&
    Number.isFinite(payload.sequenceInMs),
  );
}

async function cleanupExportedWavSafely(
  cleanup: (() => Promise<void>) | null,
  filename: string | null,
): Promise<void> {
  if (!cleanup) {
    return;
  }

  try {
    await cleanup();
  } catch (error) {
    console.warn("[GLIFO] temporary-wav:cleanup-error", {
      filename,
      error: getErrorMessage(error),
    });
  }
}

function hideTemporaryWavPath(response: TranscribeResponse): TranscribeResponse {
  return {
    ...response,
    metadata: {
      ...response.metadata,
      mediaPath: "(WAV temporal de Fase 2)",
    },
  };
}

function getResultElements(root: HTMLElement): ResultElements | null {
  const emptyState = root.querySelector<HTMLDivElement>("#resultEmpty");
  const metadataSection = root.querySelector<HTMLElement>("#resultMetadataSection");
  const metadataList = root.querySelector<HTMLDivElement>("#resultMetadataList");
  const segmentsSection = root.querySelector<HTMLElement>("#resultSegmentsSection");
  const segmentsPreview = root.querySelector<HTMLPreElement>("#segmentsPreview");
  const captionsSection = root.querySelector<HTMLElement>("#resultCaptionsSection");
  const srtInstruction = root.querySelector<HTMLParagraphElement>("#srtInstruction");
  const captionsPreview = root.querySelector<HTMLPreElement>("#captionsPreview");
  const textSection = root.querySelector<HTMLElement>("#resultTextSection");
  const fullTextPreview = root.querySelector<HTMLPreElement>("#fullTextPreview");
  const copyButton = root.querySelector<HTMLButtonElement>("#copyTextButton");
  const copyFeedback = root.querySelector<HTMLParagraphElement>("#copyFeedback");

  if (
    !emptyState ||
    !metadataSection ||
    !metadataList ||
    !segmentsSection ||
    !segmentsPreview ||
    !captionsSection ||
    !srtInstruction ||
    !captionsPreview ||
    !textSection ||
    !fullTextPreview ||
    !copyButton ||
    !copyFeedback
  ) {
    return null;
  }

  return {
    emptyState,
    metadataSection,
    metadataList,
    segmentsSection,
    segmentsPreview,
    captionsSection,
    srtInstruction,
    captionsPreview,
    textSection,
    fullTextPreview,
    copyButton,
    copyFeedback,
  };
}

function renderEmptyResult(elements: ResultElements): void {
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = [
    "Listo para transcribir un archivo exportado desde Premiere.",
    "Formatos soportados: WAV, MP4, M4A, MP3, MPEG, MPGA, WEBM, FLAC, OGG.",
  ].join("\n");
  elements.metadataSection.hidden = true;
  elements.segmentsSection.hidden = true;
  elements.captionsSection.hidden = true;
  elements.srtInstruction.hidden = true;
  elements.srtInstruction.textContent = "";
  elements.textSection.hidden = true;
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  elements.fullTextPreview.textContent = "";
  elements.copyButton.disabled = true;
  setCopyFeedback(elements, "", "neutral");
}

function renderPendingResult(elements: ResultElements, message: string): void {
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = message;
  elements.metadataSection.hidden = true;
  elements.segmentsSection.hidden = true;
  elements.captionsSection.hidden = true;
  elements.srtInstruction.hidden = true;
  elements.srtInstruction.textContent = "";
  elements.textSection.hidden = true;
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  elements.fullTextPreview.textContent = "";
  elements.copyButton.disabled = true;
  setCopyFeedback(elements, "", "neutral");
}

function renderTranscript(
  elements: ResultElements,
  response: TranscribeResponse,
  rangeDebug?: ExportedWav,
): void {
  elements.emptyState.hidden = true;
  elements.metadataSection.hidden = false;
  elements.segmentsSection.hidden = false;
  elements.captionsSection.hidden = false;
  elements.textSection.hidden = false;
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = formatSegmentsText(response.segments);
  elements.srtInstruction.hidden = !rangeDebug;
  elements.srtInstruction.textContent = rangeDebug
    ? buildSrtPlacementInstruction(rangeDebug.sequenceInMs)
    : "";
  elements.captionsPreview.textContent = formatCaptionSegmentsText(
    response.captionSegments,
    rangeDebug ? { sequenceInMs: rangeDebug.sequenceInMs } : undefined,
  );
  elements.fullTextPreview.textContent = response.fullText || "(sin texto)";
  elements.copyButton.disabled = response.fullText.length === 0;
  setCopyFeedback(elements, "", "neutral");

  renderMetadataRow(elements.metadataList, "transcriptSource", response.transcriptSource);
  renderMetadataRow(elements.metadataList, "provider", response.provider);
  renderMetadataRow(elements.metadataList, "model", response.model);
  renderMetadataRow(elements.metadataList, "filename", response.metadata.filename);
  renderMetadataRow(elements.metadataList, "mediaPath", response.metadata.mediaPath);
  renderMetadataRow(elements.metadataList, "segments", String(response.segments.length));
  renderMetadataRow(elements.metadataList, "words", String(response.words.length));
  renderMetadataRow(elements.metadataList, "captionSegments", String(response.captionSegments.length));

  if (rangeDebug) {
    renderMetadataRow(
      elements.metadataList,
      "In real detectado",
      formatDebugMs(rangeDebug.sequenceInMs),
    );
    renderMetadataRow(
      elements.metadataList,
      "Out real detectado",
      formatDebugMs(rangeDebug.sequenceOutMs),
    );
    renderMetadataRow(
      elements.metadataList,
      "Duración detectada",
      formatDebugMs(rangeDebug.durationMs),
    );
  }
}

function renderErrorResult(elements: ResultElements, message: string): void {
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = message;
  elements.metadataSection.hidden = true;
  elements.segmentsSection.hidden = true;
  elements.captionsSection.hidden = true;
  elements.srtInstruction.hidden = true;
  elements.srtInstruction.textContent = "";
  elements.textSection.hidden = true;
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  elements.fullTextPreview.textContent = "";
  elements.copyButton.disabled = true;
  setCopyFeedback(elements, "", "neutral");
}

export function formatSegmentsText(
  segments: TranscribeResponse["segments"],
): string {
  if (segments.length === 0) {
    return "Sin segmentos disponibles";
  }

  return segments
    .map((segment) => {
      return `[${formatMs(segment.startMs)} - ${formatMs(segment.endMs)}] ${segment.text}`;
    })
    .join("\n");
}

export function formatCaptionSegmentsText(
  captionSegments: TranscribeResponse["captionSegments"],
  timeline?: { sequenceInMs: number },
): string {
  if (captionSegments.length === 0) {
    return "Sin caption segments disponibles";
  }

  return captionSegments
    .map((segment) => {
      const relativeLine = `[${formatMs(segment.startMs)} - ${formatMs(segment.endMs)}] ${segment.text}`;
      if (!timeline) {
        return relativeLine;
      }

      const timelineStartMs = timeline.sequenceInMs + segment.startMs;
      const timelineEndMs = timeline.sequenceInMs + segment.endMs;
      return [
        relativeLine,
        `Timeline: [${formatMs(timelineStartMs)} - ${formatMs(timelineEndMs)}]`,
      ].join("\n");
    })
    .join("\n");
}

export function formatMs(ms: number): string {
  const totalMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return [
    String(minutes).padStart(2, "0"),
    ":",
    String(seconds).padStart(2, "0"),
    ".",
    String(milliseconds).padStart(3, "0"),
  ].join("");
}

function formatDebugMs(ms: number): string {
  return `${formatMs(ms)} (${Math.round(ms)} ms)`;
}

export function formatTimelineMs(ms: number): string {
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
    ".",
    String(milliseconds).padStart(3, "0"),
  ].join("");
}

function buildSrtPlacementInstruction(sequenceInMs: number | null): string {
  if (sequenceInMs !== null && Number.isFinite(sequenceInMs) && sequenceInMs >= 0) {
    return `Importá este SRT en Premiere y arrastralo al In del rango: ${formatTimelineMs(sequenceInMs)}`;
  }

  return "Importá este SRT en Premiere y colocalo manualmente en el inicio que corresponda.";
}

function renderMetadataRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  row.className = "panel__metadataRow";

  const key = document.createElement("span");
  key.className = "panel__metadataKey";
  key.textContent = label;

  const content = document.createElement("span");
  content.className = "panel__metadataValue";
  content.textContent = value || "(sin dato)";

  row.appendChild(key);
  row.appendChild(content);
  container.appendChild(row);
}

function setCopyFeedback(
  elements: ResultElements,
  message: string,
  tone: "neutral" | "success" | "warning",
): void {
  elements.copyFeedback.textContent = message;
  elements.copyFeedback.setAttribute("data-tone", tone);
}

async function copyTextToClipboard(text: string): Promise<"copied" | "unsupported"> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // UXP may expose navigator.clipboard but reject writes in some contexts.
    }
  }

  if (typeof document.execCommand !== "function") {
    return "unsupported";
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy") ? "copied" : "unsupported";
  } catch {
    return "unsupported";
  } finally {
    document.body.removeChild(textArea);
  }
}

function formatTranscriptionError(error: unknown): string {
  if (isTranscribeApiError(error)) {
    return [
      "No se pudo transcribir el archivo",
      `code: ${error.code ?? "(none)"}`,
      `provider: ${error.provider ?? "(none)"}`,
      `model: ${error.model ?? "(none)"}`,
      `message: ${error.message}`,
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : "Error desconocido";
  return [
    "No se pudo transcribir el archivo",
    `message: ${message}`,
  ].join("\n");
}

function formatRangeTranscriptionError(error: unknown): string {
  if (isAudioExportError(error)) {
    return [
      "No se pudo transcribir el rango In/Out",
      `code: ${error.code}`,
      `message: ${error.message}`,
    ].join("\n");
  }

  if (isTranscribeApiError(error)) {
    return [
      "No se pudo transcribir el audio exportado",
      `code: ${error.code ?? "(none)"}`,
      `provider: ${error.provider ?? "(none)"}`,
      `model: ${error.model ?? "(none)"}`,
      `message: ${error.message}`,
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : "Error desconocido";
  return [
    "No se pudo transcribir el rango In/Out",
    `message: ${message}`,
  ].join("\n");
}

function formatSrtExportError(error: unknown): string {
  if (isSrtExportError(error)) {
    return [
      "No se pudo exportar el SRT",
      `code: ${error.code}`,
      `message: ${error.message}`,
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : "Error desconocido";
  return [
    "No se pudo exportar el SRT",
    `message: ${message}`,
  ].join("\n");
}

function renderMogrtProgress(
  statusLabel: HTMLParagraphElement,
  elements: ResultElements,
  progress: MogrtBridgeBatchProgress,
): void {
  if (progress.phase === "starting") {
    statusLabel.textContent = `Estado: creando subtítulos MOGRT (0/${progress.total})`;
    setCopyFeedback(elements, `Preparando ${progress.total} captionSegment(s)...`, "neutral");
    return;
  }

  if (progress.phase === "item_started") {
    statusLabel.textContent = `Estado: creando subtítulos MOGRT (${progress.current}/${progress.total})`;
    setCopyFeedback(
      elements,
      `Procesando caption ${progress.current}/${progress.total}...`,
      "neutral",
    );
    return;
  }

  if (progress.phase === "item_completed" && progress.report) {
    statusLabel.textContent = `Estado: creando subtítulos MOGRT (${progress.current}/${progress.total})`;
    setCopyFeedback(
      elements,
      [
        `Procesado ${progress.current}/${progress.total}`,
        formatMogrtItemLine(progress.report),
      ].join("\n"),
      isMogrtReportFullyOk(progress.report) ? "neutral" : "warning",
    );
    return;
  }

  if (progress.phase === "completed") {
    statusLabel.textContent = `Estado: subtítulos MOGRT procesados (${progress.current}/${progress.total})`;
  }
}

function formatMogrtBatchStatus(report: MogrtBridgeBatchReport): string {
  if (report.status === "ok") {
    return `Estado: MOGRTs creados (${report.totals.successful}/${report.totals.total})`;
  }

  if (report.status === "partial") {
    return `Estado: MOGRTs con errores parciales (${report.totals.successful}/${report.totals.total})`;
  }

  return `Estado: error al crear MOGRTs (${report.totals.successful}/${report.totals.total})`;
}

function formatMogrtBatchFeedback(report: MogrtBridgeBatchReport): string {
  const maxVisibleItems = 40;
  const visibleItems = report.items.slice(0, maxVisibleItems);
  const hiddenItems = Math.max(0, report.items.length - visibleItems.length);
  const itemLines = visibleItems.map(formatMogrtItemLine);

  return [
    report.status === "ok"
      ? "Subtítulos MOGRT creados"
      : "Subtítulos MOGRT procesados con errores",
    `procesados: ${report.totals.processed}/${report.totals.total}`,
    `ok completos: ${report.totals.successful}`,
    `fallidos: ${report.totals.failed}`,
    `insert ok: ${report.totals.insertOk}/${report.totals.total}`,
    `text ok: ${report.totals.textOk}/${report.totals.total}`,
    `duration ok: ${report.totals.durationOk}/${report.totals.total}`,
    report.totals.skipped > 0 ? `omitidos: ${report.totals.skipped}` : "",
    report.warnings.length > 0 ? `warnings: ${report.warnings.join(" | ")}` : "",
    itemLines.length > 0 ? "Items:" : "",
    ...itemLines,
    hiddenItems > 0 ? `${hiddenItems} item(s) más en consola UXP.` : "",
    "Detalle completo en consola UXP: [GLIFO] mogrt-bridge:batch-report. Logs host-side en el panel CEP.",
  ].filter((line) => line.length > 0).join("\n");
}

function formatMogrtItemLine(report: MogrtBridgeProbeReport): string {
  const errors = uniqueStrings([
    report.failureMessage,
    report.insert.error,
    report.text.error,
    report.duration.error,
    ...report.errors,
  ]);

  return [
    `#${report.captionIndex + 1}`,
    formatTimelineMs(report.target.timelineStartMs),
    `${Math.round(report.target.durationMs)} ms`,
    report.skipped ? "omitido" : "",
    `insert: ${formatMogrtBoolean(report.insert.ok)}`,
    `text: ${formatMogrtBoolean(report.text.ok)}`,
    `duration: ${formatMogrtBoolean(report.duration.ok)}`,
    errors.length > 0 ? `error: ${errors.join(" | ")}` : "",
  ].filter((line) => line.length > 0).join(" | ");
}

function isMogrtReportFullyOk(report: MogrtBridgeProbeReport): boolean {
  return report.insert.ok && report.text.ok && report.duration.ok;
}

function formatMogrtBoolean(value: boolean): string {
  return value ? "ok" : "no";
}

function uniqueStrings(values: Array<string | null>): string[] {
  const result: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return;
    }

    const normalized = value.trim();
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  });

  return result;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
