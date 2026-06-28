import {
  isTranscribeApiError,
  requestTranscript,
} from "../services/api";
import {
  pickExportedMediaFile,
  pickMogrtFile,
} from "../services/localFilePicker";
import {
  DEFAULT_MOGRT_STYLE_SETTINGS,
  isMogrtBridgeError,
  runCaptionSegmentsMogrtBridgeFlow,
} from "../services/mogrtBridge";
import type {
  MogrtBridgeBatchProgress,
  MogrtBridgeBatchReport,
  MogrtBridgeProbeReport,
  MogrtStyleSettings,
} from "../services/mogrtBridge";
import {
  exportActiveSequenceInOutToWav,
  isAudioExportError,
} from "../premiere/audioExport";
import {
  isSrtExportError,
  saveCaptionSegmentsAsSrtFile,
} from "../services/srt";
import {
  buildCaptionSegmentsFromWords,
  CAPTION_EDITOR_LIMITS,
  DEFAULT_CAPTION_EDITOR_SETTINGS,
  resolveCaptionEditorSettings,
  type CaptionEditorSettings,
  type CaptionSegmentationMode,
} from "../services/captionSegmentation";
import type { ExportedWav } from "../premiere/audioExport";
import type {
  CaptionSegment,
  SttWord,
  TranscribeResponse,
} from "../types/transcribe";

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
  captionVisualPreview: HTMLElement;
  captionVisualSubtitle: HTMLDivElement;
  captionEditorWorkspace: HTMLElement;
  captionEditorControls: HTMLDivElement;
  captionModeButtons: HTMLButtonElement[];
  captionMaxLinesButtons: HTMLButtonElement[];
  captionMaxCharsRange: HTMLInputElement;
  captionMaxCharsNumber: HTMLInputElement;
  captionMaxCharsValue: HTMLElement;
  captionMaxDurationRange: HTMLInputElement;
  captionMaxDurationNumber: HTMLInputElement;
  captionMaxDurationValue: HTMLElement;
  captionMinPauseRange: HTMLInputElement;
  captionMinPauseNumber: HTMLInputElement;
  captionMinPauseValue: HTMLElement;
  captionAdvancedToggle: HTMLButtonElement;
  mogrtStyleToggle: HTMLButtonElement;
  captionPreviewToggle: HTMLButtonElement;
  captionEditorSummary: HTMLParagraphElement;
  captionManualNotice: HTMLParagraphElement;
  captionEditorList: HTMLDivElement;
  mogrtFillColorInput: HTMLInputElement;
  mogrtFontSizeRange: HTMLInputElement;
  mogrtFontSizeNumber: HTMLInputElement;
  mogrtStrokeEnabledInput: HTMLInputElement;
  mogrtStrokeWidthRange: HTMLInputElement;
  mogrtStrokeWidthNumber: HTMLInputElement;
  mogrtShadowEnabledInput: HTMLInputElement;
  mogrtPositionYRange: HTMLInputElement;
  mogrtPositionYNumber: HTMLInputElement;
  mogrtPositionYValue: HTMLElement;
  mogrtStylePresetButtons: HTMLButtonElement[];
  debugDetails: HTMLElement;
  textSection: HTMLElement;
  fullTextPreview: HTMLPreElement;
  copyButton: HTMLButtonElement;
  copyFeedback: HTMLParagraphElement;
}

export interface CaptionPayload {
  captionSegments: CaptionSegment[];
  sequenceInMs: number | null;
}

export interface CaptionEditorState {
  settings: CaptionEditorSettings;
  words: SttWord[];
  transcriptCaptionSegments: CaptionSegment[];
  originalCaptionSegments: CaptionSegment[];
  editableCaptionSegments: CaptionSegment[];
  hasManualEdits: boolean;
  lastRebuildNotice: string | null;
}

export interface CaptionEditorSettingsChangeResult {
  state: CaptionEditorState;
  settingName: CaptionEditorSettingName;
  oldValue: string | number;
  newValue: string | number;
  captionsCountBefore: number;
  captionsCountAfter: number;
}

export interface CaptionPreviewRowData {
  captionSegment: CaptionSegment;
  timecode: string;
  timelineLabel: string;
  text: string;
  durationMs: number;
  durationLabel: string;
}

const CAPTION_AUTO_REBUILD_DEBOUNCE_MS = 180;
const CAPTION_MANUAL_FORMAT_WARNING =
  "Cambiar formato va a regenerar captions y puede sobrescribir ediciones manuales.";
export type CaptionEditorSettingName = "mode" | "maxLines" | "maxCharsPerLine" | "maxDurationMs" | "minPauseMs";

interface CaptionEditorSettingsChangeLog {
  settingName: CaptionEditorSettingName;
  oldValue: string | number;
  newValue: string | number;
  captionsCountBefore: number;
}

export interface CaptionStylePreset {
  id: string;
  label: string;
  settings: MogrtStyleSettings;
}

/**
 * Presets visuales de estilo de subtítulos. Cada preset es un set completo de
 * MogrtStyleSettings, así aplicarlo es simplemente reemplazar el estado actual.
 * El preset "activo" se deriva de los settings (ver resolveStylePresetId): si el
 * usuario mueve un slider manualmente el estado deja de coincidir y queda "Custom".
 */
export const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
  {
    id: "clean",
    label: "Clean",
    settings: {
      fillColor: "#ffffff",
      fontSize: 82,
      strokeEnabled: false,
      strokeWidth: 0,
      shadowEnabled: true,
      positionYMode: "bottom",
    },
  },
  {
    id: "bold",
    label: "Bold",
    settings: {
      fillColor: "#ffffff",
      fontSize: 96,
      strokeEnabled: true,
      strokeWidth: 4,
      shadowEnabled: true,
      positionYMode: "bottom",
    },
  },
  {
    id: "social",
    label: "Social",
    settings: {
      fillColor: "#ffffff",
      fontSize: 104,
      strokeEnabled: true,
      strokeWidth: 6,
      shadowEnabled: true,
      positionYMode: "center",
    },
  },
  {
    id: "karaoke",
    label: "Karaoke",
    settings: {
      fillColor: "#ffe14d",
      fontSize: 100,
      strokeEnabled: true,
      strokeWidth: 5,
      shadowEnabled: true,
      positionYMode: "bottom",
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    settings: {
      fillColor: "#ffffff",
      fontSize: 72,
      strokeEnabled: false,
      strokeWidth: 0,
      shadowEnabled: false,
      positionYMode: "bottom",
    },
  },
];

export function getCaptionStylePreset(presetId: string | null): CaptionStylePreset | null {
  if (!presetId) {
    return null;
  }

  return CAPTION_STYLE_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

/**
 * Devuelve el id del preset cuyos settings coinciden exactamente con los actuales,
 * o null ("Custom") si el usuario tocó algo manualmente y ya no coincide ninguno.
 */
export function resolveStylePresetId(settings: MogrtStyleSettings): string | null {
  const match = CAPTION_STYLE_PRESETS.find((preset) =>
    captionStyleSettingsMatchPreset(settings, preset.settings),
  );
  return match ? match.id : null;
}

function captionStyleSettingsMatchPreset(
  settings: MogrtStyleSettings,
  preset: MogrtStyleSettings,
): boolean {
  return (
    normalizeHexColor(settings.fillColor) === normalizeHexColor(preset.fillColor) &&
    settings.fontSize === preset.fontSize &&
    settings.strokeEnabled === preset.strokeEnabled &&
    settings.strokeWidth === preset.strokeWidth &&
    settings.shadowEnabled === preset.shadowEnabled &&
    settings.positionYMode === preset.positionYMode
  );
}

export function createPanelController(elements: PanelElements) {
  const mount = () => {
    const { root } = elements;
    let latestFullText = "";
    let latestSrtPayload: CaptionPayload | null = null;
    let captionEditorState = createEmptyCaptionEditorState();
    let mogrtStyleSettings: MogrtStyleSettings = { ...DEFAULT_MOGRT_STYLE_SETTINGS };
    let captionRebuildTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSettingsChangeLog: CaptionEditorSettingsChangeLog | null = null;
    let activeCaptionEditIndex: number | null = null;
    let previewCaptionIndex: number | null = null;

    root.style.display = "block";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.maxHeight = "100%";
    root.style.minHeight = "260px";
    root.style.boxSizing = "border-box";
    root.style.overflow = "auto";
    root.style.overflowX = "hidden";
    root.style.overflowY = "auto";

    root.innerHTML = `
      <section class="panel" role="region" aria-label="Panel GLIFO">
        <header class="panel__header">
          <h1 class="panel__title">GLIFO</h1>
          <p id="statusLabel" class="panel__status">Estado: listo</p>
        </header>

        <p id="fileLabel" class="panel__file">Archivo: ninguno</p>

        <div id="panelActions" class="panel__actions" aria-label="Acciones de transcripción"></div>

        <section id="captionEditorWorkspace" class="captionEditorWorkspace">
          <section class="captionEditorSimpleSection" aria-label="Caption Editor">
            <div class="captionEditorSimpleHeader">
              <div>
                <h2 class="panel__captionMainTitle">Caption Editor</h2>
                <p id="captionEditorSummary" class="panel__captionSummary"></p>
              </div>
            </div>

            <div id="captionEditorControls" class="panel__captionEditorControls">
              <section class="panel__controlCard panel__controlCard--primary formatCaptionsCard captionFormatToolbar" data-testid="formatCaptionsCard" aria-labelledby="captionModeLabel">
                <div class="captionFormatToolbar__row captionFormatToolbar__row--primary">
                  <div class="captionFormatToolbar__group">
                    <span id="captionModeLabel" class="panel__controlLabel">Formato</span>
                    <div class="panel__segmentedControl" role="group" aria-labelledby="captionModeLabel">
                      <button id="captionModeNatural" class="panel__segmentedButton" type="button" data-caption-mode="natural" aria-pressed="true">Natural</button>
                      <button id="captionModeShort" class="panel__segmentedButton" type="button" data-caption-mode="short" aria-pressed="false">Corto</button>
                      <button id="captionModeWordByWord" class="panel__segmentedButton" type="button" data-caption-mode="word-by-word" aria-pressed="false">Palabra</button>
                    </div>
                  </div>

                  <div class="captionFormatToolbar__group">
                    <span id="captionLinesLabel" class="panel__controlLabel">Líneas</span>
                    <div class="panel__segmentedControl panel__segmentedControl--compact" role="group" aria-labelledby="captionLinesLabel">
                      <button id="captionMaxLinesOne" class="panel__segmentedButton" type="button" data-caption-lines="1" aria-pressed="false">1</button>
                      <button id="captionMaxLinesTwo" class="panel__segmentedButton" type="button" data-caption-lines="2" aria-pressed="true">2</button>
                    </div>
                  </div>
                </div>

                <div class="captionFormatToolbar__row captionFormatToolbar__row--secondary">
                  <button id="mogrtStyleToggle" class="panel__smallButton" type="button" aria-expanded="false" aria-controls="mogrtStylePanel">Style</button>
                  <button id="captionPreviewToggle" class="panel__smallButton" type="button" aria-expanded="false" aria-controls="resultCaptionsSection">Preview</button>
                  <button id="captionAdvancedToggle" class="panel__smallButton" type="button" aria-expanded="false" aria-controls="captionAdvancedControls">Advanced</button>
                </div>

                <div id="captionAdvancedControls" class="captionAdvancedControls" aria-label="Advanced caption settings" style="display: none;">
                  <h3 class="panel__controlTitle panel__controlTitle--compact">Advanced</h3>
                  <label class="panel__captionControlRow captionControlRow panel__captionField panel__captionField--chars" for="captionMaxCharsNumber">
                    <span class="panel__fieldHeader">
                      <span>Chars</span>
                      <strong id="captionMaxCharsValue">32</strong>
                    </span>
                    <div class="panel__rangeGroup panel__rangeGroup--large">
                      <input id="captionMaxCharsRange" class="panel__captionRange captionSlider" type="range" min="1" max="42" step="1" value="32" />
                      <input id="captionMaxCharsNumber" class="panel__captionNumber captionNumberInput" type="number" min="1" max="42" step="1" value="32" aria-label="Chars" />
                    </div>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="captionMaxDurationNumber">
                    <span class="panel__fieldHeader">
                      <span>Max</span>
                      <strong id="captionMaxDurationValue">3500 ms</strong>
                    </span>
                    <div class="panel__rangeGroup">
                      <input id="captionMaxDurationRange" class="panel__captionRange captionSlider" type="range" min="500" max="4000" step="100" value="3500" />
                      <input id="captionMaxDurationNumber" class="panel__captionNumber captionNumberInput" type="number" min="500" max="4000" step="100" value="3500" aria-label="Max duration en milisegundos" />
                    </div>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="captionMinPauseNumber">
                    <span class="panel__fieldHeader">
                      <span>Gap</span>
                      <strong id="captionMinPauseValue">600 ms</strong>
                    </span>
                    <div class="panel__rangeGroup">
                      <input id="captionMinPauseRange" class="panel__captionRange captionSlider" type="range" min="200" max="1000" step="50" value="600" />
                      <input id="captionMinPauseNumber" class="panel__captionNumber captionNumberInput" type="number" min="200" max="1000" step="50" value="600" aria-label="Gap en milisegundos" />
                    </div>
                  </label>

                  <p id="captionManualNotice" class="panel__captionManualNotice">Cambiar formato va a regenerar captions y puede sobrescribir ediciones manuales.</p>
                </div>
              </section>

              <section id="mogrtStylePanel" class="panel__controlCard panel__controlCard--secondary mogrtStyleCard" data-testid="mogrtStyleCard" aria-labelledby="mogrtStyleTitle" style="display: none;">
                <div class="panel__controlHeader">
                  <h3 id="mogrtStyleTitle" class="panel__controlTitle">Style</h3>
                </div>
                <p class="panel__styleNotice">Este MOGRT puede no exponer todos los parámetros de estilo.</p>
                <div class="panel__stylePresets" aria-label="Presets de estilo">
                  <span id="stylePresetsLabel" class="panel__controlLabel">Presets</span>
                  <div class="panel__segmentedControl panel__stylePresetButtons" role="group" aria-labelledby="stylePresetsLabel">
                    <button id="stylePresetClean" class="panel__segmentedButton" type="button" data-style-preset="clean" aria-pressed="false">Clean</button>
                    <button id="stylePresetBold" class="panel__segmentedButton" type="button" data-style-preset="bold" aria-pressed="false">Bold</button>
                    <button id="stylePresetSocial" class="panel__segmentedButton" type="button" data-style-preset="social" aria-pressed="false">Social</button>
                    <button id="stylePresetKaraoke" class="panel__segmentedButton" type="button" data-style-preset="karaoke" aria-pressed="false">Karaoke</button>
                    <button id="stylePresetMinimal" class="panel__segmentedButton" type="button" data-style-preset="minimal" aria-pressed="false">Minimal</button>
                  </div>
                </div>
                <div class="panel__styleGrid">
                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="mogrtFillColor">
                    <span>Text color</span>
                    <input id="mogrtFillColor" class="panel__colorInput" type="color" value="#ffffff" />
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="mogrtFontSizeNumber">
                    <span>Font size</span>
                    <div class="panel__rangeGroup">
                      <input id="mogrtFontSizeRange" class="panel__captionRange captionSlider" type="range" min="24" max="220" step="1" value="96" />
                      <input id="mogrtFontSizeNumber" class="panel__captionNumber captionNumberInput" type="number" min="24" max="220" step="1" value="96" />
                    </div>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__checkField" for="mogrtStrokeEnabled">
                    <input id="mogrtStrokeEnabled" type="checkbox" checked />
                    <span>Stroke</span>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="mogrtStrokeWidthNumber">
                    <span>Stroke width</span>
                    <div class="panel__rangeGroup">
                      <input id="mogrtStrokeWidthRange" class="panel__captionRange captionSlider" type="range" min="0" max="24" step="1" value="4" />
                      <input id="mogrtStrokeWidthNumber" class="panel__captionNumber captionNumberInput" type="number" min="0" max="24" step="1" value="4" />
                    </div>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__checkField" for="mogrtShadowEnabled">
                    <input id="mogrtShadowEnabled" type="checkbox" checked />
                    <span>Shadow</span>
                  </label>

                  <label class="panel__captionControlRow captionControlRow panel__captionField" for="mogrtPositionYNumber">
                    <span class="panel__fieldHeader">
                      <span>Position vertical</span>
                      <strong id="mogrtPositionYValue">Bottom</strong>
                    </span>
                    <div class="panel__rangeGroup">
                      <input id="mogrtPositionYRange" class="panel__captionRange captionSlider" type="range" min="0" max="100" step="1" value="100" aria-label="Position vertical" />
                      <input id="mogrtPositionYNumber" class="panel__captionNumber captionNumberInput" type="number" min="0" max="100" step="1" value="100" aria-label="Position vertical" />
                    </div>
                  </label>
                </div>
              </section>
            </div>

            <div id="captionEditorList" class="captionEditorSimpleList panel__captionList"></div>

            <section id="resultCaptionsSection" class="captionPreviewPane" aria-label="Caption Preview" style="display: none;">
              <h3 class="panel__controlTitle">Preview</h3>
              <section id="captionVisualPreview" class="captionVisualPreview" aria-label="Preview visual de subtítulos">
                <div class="captionVisualPreview__monitor">
                  <div class="captionVisualPreview__safeArea" aria-hidden="true"></div>
                  <div id="captionVisualPreviewSubtitle" class="captionVisualPreview__subtitle">Preview de subtítulos</div>
                </div>
                <p class="captionVisualPreview__notice">Preview aproximado del estilo. El MOGRT final puede variar según el template.</p>
              </section>
              <p id="srtInstruction" class="panel__srtInstruction" style="display: none;"></p>
              <pre id="captionsPreview" class="panel__segmentsList captionPreviewRawText"></pre>
            </section>
          </section>
        </section>

        <div class="panel__resultViewport">
          <div id="resultPreview" class="panel__result" aria-live="polite">
            <div id="resultEmpty" class="panel__empty"></div>

            <div id="resultDebugDetails" class="panel__debugDetails" style="display: none;">
              <h2 class="panel__debugTitle">Debug</h2>

              <section id="resultMetadataSection" class="panel__resultSection" style="display: none;">
                <h2 class="panel__sectionTitle">Metadata</h2>
                <div id="resultMetadataList" class="panel__metadataList"></div>
              </section>

              <section id="resultSegmentsSection" class="panel__resultSection" style="display: none;">
                <h2 class="panel__sectionTitle">Segmentos STT originales</h2>
                <pre id="segmentsPreview" class="panel__segmentsList"></pre>
              </section>

              <section id="resultTextSection" class="panel__resultSection" style="display: none;">
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
    srtButton.disabled = true;
    panelActions.appendChild(srtButton);

    const mogrtButton = document.createElement("button");
    mogrtButton.id = "mogrtButton";
    mogrtButton.className = "panel__button panel__button--secondary";
    mogrtButton.type = "button";
    mogrtButton.textContent = "Crear subtítulos MOGRT";
    mogrtButton.title = "Inserta un MOGRT por cada captionSegment de la última transcripción Fase 2.";
    mogrtButton.disabled = true;
    panelActions.appendChild(mogrtButton);

    renderEmptyResult(resultElements);
    syncMogrtStyleControls(resultElements, mogrtStyleSettings);
    bindPanelToggle(root, {
      buttonId: "captionAdvancedToggle",
      panelId: "captionAdvancedControls",
      collapsedLabel: "Advanced",
      expandedLabel: "Hide advanced",
    });
    bindPanelToggle(root, {
      buttonId: "mogrtStyleToggle",
      panelId: "mogrtStylePanel",
      collapsedLabel: "Style",
      expandedLabel: "Hide style",
    });
    bindPanelToggle(root, {
      buttonId: "captionPreviewToggle",
      panelId: "resultCaptionsSection",
      collapsedLabel: "Preview",
      expandedLabel: "Ocultar preview",
    });

    const getLatestCaptionPayload = (): CaptionPayload | null => {
      if (!latestSrtPayload) {
        return null;
      }

      latestSrtPayload = getCaptionEditorPayload(captionEditorState, latestSrtPayload.sequenceInMs);
      return latestSrtPayload;
    };

    const refreshActionButtons = () => {
      const payload = getLatestCaptionPayload();
      srtButton.disabled = !canExportSrt(payload);
      mogrtButton.disabled = !canRunMogrtFlow(payload);
    };

    const renderCurrentVisualPreview = () => {
      renderCaptionVisualPreview(
        resultElements,
        captionEditorState,
        mogrtStyleSettings,
        previewCaptionIndex,
      );
    };

    const renderCurrentCaptionEditor = () => {
      captionEditorState = ensureCaptionEditorSegmentsBeforeRender(captionEditorState);
      renderCaptionEditor(
        resultElements,
        captionEditorState,
        latestSrtPayload?.sequenceInMs ?? null,
        activeCaptionEditIndex,
        {
          onTextChange: (index, text) => {
            previewCaptionIndex = index;
            captionEditorState = updateCaptionEditorSegmentText(captionEditorState, index, text);
            renderCaptionEditorSummary(resultElements, captionEditorState);
            renderSimpleCaptionPreview(
              resultElements,
              captionEditorState,
              latestSrtPayload?.sequenceInMs ?? null,
            );
            renderCurrentVisualPreview();
            refreshActionButtons();
          },
          onFocus: (index) => {
            previewCaptionIndex = index;
            renderCurrentVisualPreview();
          },
          onSplitAtCursor: (index, cursorPosition) => {
            const captionsCountBefore = captionEditorState.editableCaptionSegments.length;
            const nextCaptionEditorState = splitCaptionAtCursor(captionEditorState, index, cursorPosition);
            captionEditorState = nextCaptionEditorState;
            if (captionEditorState.editableCaptionSegments.length <= captionsCountBefore) {
              activeCaptionEditIndex = null;
              renderCurrentCaptionEditor();
              return;
            }

            activeCaptionEditIndex = Math.min(
              index + 1,
              Math.max(0, captionEditorState.editableCaptionSegments.length - 1),
            );
            renderCurrentCaptionEditor();
            statusLabel.textContent = "Estado: captions editados";
            setCopyFeedback(resultElements, "Caption dividido.", "success");
          },
        },
      );
      renderCurrentVisualPreview();
      activeCaptionEditIndex = null;
      refreshActionButtons();
    };

    const applyCaptionRebuild = (
      reason: "auto" | "manual",
      settingsChangeLog: CaptionEditorSettingsChangeLog | null = pendingSettingsChangeLog,
    ) => {
      if (captionEditorState.words.length === 0) {
        setCopyFeedback(
          resultElements,
          "No hay words disponibles para recalcular captions sin transcribir de nuevo.",
          "warning",
        );
        if (settingsChangeLog) {
          logCaptionEditorSettingsChange({
            ...settingsChangeLog,
            captionsCountAfter: captionEditorState.editableCaptionSegments.length,
          });
          pendingSettingsChangeLog = null;
        }
        return;
      }

      const hadManualEdits = captionEditorState.hasManualEdits;
      captionEditorState = rebuildCaptionEditorSegments(captionEditorState, hadManualEdits
        ? "Los cambios manuales fueron sobrescritos por el recálculo."
        : null);
      activeCaptionEditIndex = null;
      previewCaptionIndex = null;
      renderCurrentCaptionEditor();
      if (settingsChangeLog) {
        logCaptionEditorSettingsChange({
          ...settingsChangeLog,
          captionsCountAfter: captionEditorState.editableCaptionSegments.length,
        });
        pendingSettingsChangeLog = null;
      }
      statusLabel.textContent = reason === "auto"
        ? "Estado: captions recalculados"
        : "Estado: captions recalculados manualmente";
      setCopyFeedback(
        resultElements,
        hadManualEdits
          ? "Recalculado usando words existentes. Se sobrescribieron ajustes manuales."
          : "Captions recalculados usando words existentes y settings actuales.",
        hadManualEdits ? "warning" : "success",
      );
    };

    const scheduleCaptionAutoRebuild = (settingsChangeLog: CaptionEditorSettingsChangeLog | null = null) => {
      if (captionRebuildTimer) {
        clearTimeout(captionRebuildTimer);
      }

      if (settingsChangeLog) {
        pendingSettingsChangeLog = settingsChangeLog;
      }

      if (captionEditorState.words.length === 0) {
        renderCaptionEditorSummary(resultElements, captionEditorState);
        return;
      }

      if (captionEditorState.hasManualEdits) {
        captionEditorState = {
          ...captionEditorState,
          lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
        };
        renderCaptionEditorSummary(resultElements, captionEditorState);
      }

      captionRebuildTimer = setTimeout(() => {
        captionRebuildTimer = null;
        applyCaptionRebuild("auto");
      }, CAPTION_AUTO_REBUILD_DEBOUNCE_MS);
    };

    const flushPendingCaptionRebuild = () => {
      if (!captionRebuildTimer) {
        return;
      }

      clearTimeout(captionRebuildTimer);
      captionRebuildTimer = null;
      applyCaptionRebuild("auto");
    };

    const changeCaptionSetting = (
      settingName: CaptionEditorSettingName,
      value: unknown,
      rebuildTiming: "immediate" | "debounced",
    ) => {
      const oldValue = getCaptionEditorSettingValue(captionEditorState.settings, settingName);
      const captionsCountBefore = captionEditorState.editableCaptionSegments.length;
      const nextSettings = resolveCaptionEditorSettingsWithChange(
        captionEditorState.settings,
        settingName,
        value,
      );
      const newValue = getCaptionEditorSettingValue(nextSettings, settingName);

      captionEditorState = {
        ...captionEditorState,
        settings: nextSettings,
        lastRebuildNotice: captionEditorState.hasManualEdits
          ? CAPTION_MANUAL_FORMAT_WARNING
          : captionEditorState.lastRebuildNotice,
      };
      syncCaptionEditorControls(resultElements, captionEditorState.settings);
      renderCurrentVisualPreview();

      if (oldValue === newValue) {
        renderCaptionEditorSummary(resultElements, captionEditorState);
        return;
      }

      const settingsChangeLog: CaptionEditorSettingsChangeLog = {
        settingName,
        oldValue,
        newValue,
        captionsCountBefore,
      };

      if (rebuildTiming === "immediate") {
        if (captionRebuildTimer) {
          clearTimeout(captionRebuildTimer);
          captionRebuildTimer = null;
          pendingSettingsChangeLog = null;
        }
        applyCaptionRebuild("auto", settingsChangeLog);
        return;
      }

      scheduleCaptionAutoRebuild(settingsChangeLog);
    };

    const resetCaptionRuntimeState = () => {
      latestFullText = "";
      latestSrtPayload = null;
      captionEditorState = createEmptyCaptionEditorState();
      activeCaptionEditIndex = null;
      previewCaptionIndex = null;
      if (captionRebuildTimer) {
        clearTimeout(captionRebuildTimer);
        captionRebuildTimer = null;
      }
    };

    const setCaptionRuntimeState = (
      transcript: TranscribeResponse,
      sequenceInMs: number | null,
    ) => {
      captionEditorState = ensureCaptionEditorSegmentsBeforeRender(
        createCaptionEditorStateFromTranscript(transcript),
      );
      latestSrtPayload = {
        captionSegments: cloneCaptionSegments(captionEditorState.editableCaptionSegments),
        sequenceInMs,
      };
      syncCaptionEditorControls(resultElements, captionEditorState.settings);
      syncMogrtStyleControls(resultElements, mogrtStyleSettings);
      previewCaptionIndex = captionEditorState.editableCaptionSegments.length > 0 ? 0 : null;
      renderCurrentVisualPreview();
    };

    resultElements.captionModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        changeCaptionSetting(
          "mode",
          button.getAttribute("data-caption-mode") ?? DEFAULT_CAPTION_EDITOR_SETTINGS.mode,
          "immediate",
        );
      });
    });

    resultElements.captionMaxLinesButtons.forEach((button) => {
      button.addEventListener("click", () => {
        changeCaptionSetting(
          "maxLines",
          button.getAttribute("data-caption-lines") === "1" ? 1 : 2,
          "immediate",
        );
      });
    });

    bindCaptionNumberControls(
      resultElements.captionMaxCharsRange,
      resultElements.captionMaxCharsNumber,
      CAPTION_EDITOR_LIMITS.maxCharsPerLine.min,
      CAPTION_EDITOR_LIMITS.maxCharsPerLine.max,
      (value) => {
        changeCaptionSetting("maxCharsPerLine", value, "debounced");
      },
    );

    bindCaptionNumberControls(
      resultElements.captionMaxDurationRange,
      resultElements.captionMaxDurationNumber,
      CAPTION_EDITOR_LIMITS.maxDurationMs.min,
      CAPTION_EDITOR_LIMITS.maxDurationMs.max,
      (value) => {
        changeCaptionSetting("maxDurationMs", value, "debounced");
      },
    );

    bindCaptionNumberControls(
      resultElements.captionMinPauseRange,
      resultElements.captionMinPauseNumber,
      CAPTION_EDITOR_LIMITS.minPauseMs.min,
      CAPTION_EDITOR_LIMITS.minPauseMs.max,
      (value) => {
        changeCaptionSetting("minPauseMs", value, "debounced");
      },
    );

    resultElements.mogrtFillColorInput.addEventListener("input", () => {
      mogrtStyleSettings = {
        ...mogrtStyleSettings,
        fillColor: normalizeHexColor(resultElements.mogrtFillColorInput.value),
      };
      syncMogrtStyleControls(resultElements, mogrtStyleSettings);
      renderCurrentVisualPreview();
    });

    bindCaptionNumberControls(
      resultElements.mogrtFontSizeRange,
      resultElements.mogrtFontSizeNumber,
      24,
      220,
      (value) => {
        mogrtStyleSettings = {
          ...mogrtStyleSettings,
          fontSize: value,
        };
        syncMogrtStyleControls(resultElements, mogrtStyleSettings);
        renderCurrentVisualPreview();
      },
    );

    resultElements.mogrtStrokeEnabledInput.addEventListener("change", () => {
      mogrtStyleSettings = {
        ...mogrtStyleSettings,
        strokeEnabled: resultElements.mogrtStrokeEnabledInput.checked,
      };
      syncMogrtStyleControls(resultElements, mogrtStyleSettings);
      renderCurrentVisualPreview();
    });

    bindCaptionNumberControls(
      resultElements.mogrtStrokeWidthRange,
      resultElements.mogrtStrokeWidthNumber,
      0,
      24,
      (value) => {
        mogrtStyleSettings = {
          ...mogrtStyleSettings,
          strokeWidth: value,
        };
        syncMogrtStyleControls(resultElements, mogrtStyleSettings);
        renderCurrentVisualPreview();
      },
    );

    resultElements.mogrtShadowEnabledInput.addEventListener("change", () => {
      mogrtStyleSettings = {
        ...mogrtStyleSettings,
        shadowEnabled: resultElements.mogrtShadowEnabledInput.checked,
      };
      syncMogrtStyleControls(resultElements, mogrtStyleSettings);
      renderCurrentVisualPreview();
    });

    bindCaptionNumberControls(
      resultElements.mogrtPositionYRange,
      resultElements.mogrtPositionYNumber,
      0,
      100,
      (value) => {
        mogrtStyleSettings = {
          ...mogrtStyleSettings,
          positionYMode: positionYSliderValueToMode(value),
        };
        syncMogrtStyleControls(resultElements, mogrtStyleSettings);
        renderCurrentVisualPreview();
      },
    );

    resultElements.mogrtStylePresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const preset = getCaptionStylePreset(button.getAttribute("data-style-preset"));
        if (!preset) {
          return;
        }

        mogrtStyleSettings = { ...preset.settings };
        console.info("[GLIFO] caption-style:preset-apply", {
          preset: preset.id,
          settings: mogrtStyleSettings,
        });
        syncMogrtStyleControls(resultElements, mogrtStyleSettings);
        renderCurrentVisualPreview();
      });
    });

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
      mogrtButton.disabled = true;
      fileButton.textContent = "Seleccionando archivo...";
      resetCaptionRuntimeState();
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
        setCaptionRuntimeState(transcript, null);
        refreshActionButtons();
        statusLabel.textContent = "Estado: transcripción lista";
        renderTranscript(resultElements, transcript);
        renderCurrentCaptionEditor();

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
        refreshActionButtons();
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
      mogrtButton.disabled = true;
      selectionButton.textContent = "Exportando...";
      resetCaptionRuntimeState();
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
        setCaptionRuntimeState(transcript, exportedWav.sequenceInMs);
        refreshActionButtons();
        statusLabel.textContent = "Estado: transcripción lista";
        renderTranscript(resultElements, hideTemporaryWavPath(transcript), exportedWav);
        renderCurrentCaptionEditor();

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
        refreshActionButtons();
        selectionButton.textContent = "Transcribir rango In/Out";
      }
    });

    srtButton.addEventListener("click", async () => {
      flushPendingCaptionRebuild();
      const srtPayload = getLatestCaptionPayload();
      if (!srtPayload) {
        statusLabel.textContent = "Estado: error";
        setCopyFeedback(
          resultElements,
          "No hay captionSegments disponibles para exportar SRT.",
          "warning",
        );
        return;
      }

      if (srtPayload.captionSegments.length === 0) {
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
        const result = await saveCaptionSegmentsAsSrtFile(srtPayload.captionSegments);
        if (result.status === "cancelled") {
          statusLabel.textContent = "Estado: exportación SRT cancelada";
          setCopyFeedback(resultElements, "No se guardó ningún SRT.", "warning");
          return;
        }

        const instruction = buildSrtPlacementInstruction(srtPayload.sequenceInMs);
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
        refreshActionButtons();
        srtButton.textContent = "Exportar SRT";
      }
    });

    mogrtButton.addEventListener("click", async () => {
      flushPendingCaptionRebuild();
      const payload = getLatestCaptionPayload();
      if (!canRunMogrtFlow(payload)) {
        statusLabel.textContent = "Estado: MOGRT no disponible";
        setCopyFeedback(
          resultElements,
          "Crear subtítulos MOGRT requiere captionSegments y sequenceInMs de Fase 2.",
          "warning",
        );
        return;
      }

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
          mogrtStyle: mogrtStyleSettings,
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
        refreshActionButtons();
        mogrtButton.textContent = "Crear subtítulos MOGRT";
      }
    });
  };

  return {
    mount,
  };
}

export function createEmptyCaptionEditorState(): CaptionEditorState {
  return {
    settings: { ...DEFAULT_CAPTION_EDITOR_SETTINGS },
    words: [],
    transcriptCaptionSegments: [],
    originalCaptionSegments: [],
    editableCaptionSegments: [],
    hasManualEdits: false,
    lastRebuildNotice: null,
  };
}

export function applyCaptionEditorSettingsChange(
  state: CaptionEditorState,
  settingName: CaptionEditorSettingName,
  value: unknown,
): CaptionEditorSettingsChangeResult {
  const oldValue = getCaptionEditorSettingValue(state.settings, settingName);
  const captionsCountBefore = state.editableCaptionSegments.length;
  const nextSettings = resolveCaptionEditorSettingsWithChange(
    state.settings,
    settingName,
    value,
  );
  const newValue = getCaptionEditorSettingValue(nextSettings, settingName);
  const stateWithSettings: CaptionEditorState = {
    ...state,
    settings: nextSettings,
    lastRebuildNotice: state.hasManualEdits
      ? CAPTION_MANUAL_FORMAT_WARNING
      : state.lastRebuildNotice,
  };
  const nextState = stateWithSettings.words.length > 0
    ? rebuildCaptionEditorSegments(
      stateWithSettings,
      state.hasManualEdits ? "Los cambios manuales fueron sobrescritos por el recálculo." : null,
    )
    : stateWithSettings;

  return {
    state: nextState,
    settingName,
    oldValue,
    newValue,
    captionsCountBefore,
    captionsCountAfter: nextState.editableCaptionSegments.length,
  };
}

export function createCaptionEditorStateFromTranscript(
  transcript: Pick<TranscribeResponse, "words" | "captionSegments">,
): CaptionEditorState {
  const words = cloneWords(transcript.words);
  const transcriptCaptionSegments = cloneCaptionSegments(transcript.captionSegments);
  const initialCaptionSegments = transcriptCaptionSegments.length > 0
    ? cloneCaptionSegments(transcriptCaptionSegments)
    : buildCaptionSegmentsFromWords(words, DEFAULT_CAPTION_EDITOR_SETTINGS);

  return {
    settings: { ...DEFAULT_CAPTION_EDITOR_SETTINGS },
    words,
    transcriptCaptionSegments,
    originalCaptionSegments: cloneCaptionSegments(initialCaptionSegments),
    editableCaptionSegments: cloneCaptionSegments(initialCaptionSegments),
    hasManualEdits: false,
    lastRebuildNotice: null,
  };
}

function ensureCaptionEditorSegmentsBeforeRender(state: CaptionEditorState): CaptionEditorState {
  if (state.editableCaptionSegments.length > 0) {
    return state;
  }

  const transcriptCaptionSegments = state.transcriptCaptionSegments ?? [];
  const fallbackCaptionSegments = transcriptCaptionSegments.length > 0
    ? transcriptCaptionSegments
    : state.originalCaptionSegments;
  if (fallbackCaptionSegments.length > 0) {
    return {
      ...state,
      originalCaptionSegments: state.originalCaptionSegments.length > 0
        ? cloneCaptionSegments(state.originalCaptionSegments)
        : cloneCaptionSegments(fallbackCaptionSegments),
      editableCaptionSegments: cloneCaptionSegments(fallbackCaptionSegments),
      hasManualEdits: false,
    };
  }

  if (state.words.length > 0) {
    const rebuiltCaptionSegments = buildCaptionSegmentsFromWords(state.words, state.settings);
    return {
      ...state,
      originalCaptionSegments: state.originalCaptionSegments.length > 0
        ? cloneCaptionSegments(state.originalCaptionSegments)
        : cloneCaptionSegments(rebuiltCaptionSegments),
      editableCaptionSegments: cloneCaptionSegments(rebuiltCaptionSegments),
      hasManualEdits: false,
    };
  }

  return state;
}

export function updateCaptionEditorSegmentText(
  state: CaptionEditorState,
  index: number,
  text: string,
): CaptionEditorState {
  const editableCaptionSegments = cloneCaptionSegments(state.editableCaptionSegments);
  const segment = editableCaptionSegments[index];
  if (!segment) {
    return state;
  }

  if (segment.text === text) {
    return state;
  }

  console.log("[GLIFO] caption-editor:text-update", {
    index,
    oldText: segment.text,
    newText: text,
  });

  editableCaptionSegments[index] = {
    ...segment,
    text,
  };

  return {
    ...state,
    editableCaptionSegments,
    hasManualEdits: true,
    lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
  };
}

export function splitCaptionAtCursor(
  state: CaptionEditorState,
  index: number,
  cursorPosition: number,
): CaptionEditorState {
  const segment = state.editableCaptionSegments[index];
  if (!segment) {
    return state;
  }

  const text = segment.text;
  const normalizedCursor = Math.min(
    text.length,
    Math.max(0, Math.round(cursorPosition)),
  );
  if (normalizedCursor <= 0 || normalizedCursor >= text.length) {
    return state;
  }

  const beforeText = text.slice(0, normalizedCursor).trim();
  const afterText = text.slice(normalizedCursor).trim();
  if (!beforeText || !afterText || segment.endMs - segment.startMs < 2) {
    return state;
  }

  const splitRatio = calculateCaptionSplitRatio(
    beforeText,
    afterText,
    normalizedCursor,
    text.length,
  );
  const splitTime = calculateSplitTime(segment.startMs, segment.endMs, splitRatio);
  const splitTimelineTime = calculateTimelineSplitTime(segment, splitTime, splitRatio);
  const beforeSegment: CaptionSegment = {
    ...segment,
    endMs: splitTime,
    text: beforeText,
  };
  const afterSegment: CaptionSegment = {
    ...segment,
    startMs: splitTime,
    text: afterText,
  };

  if (splitTimelineTime !== null) {
    beforeSegment.timelineEndMs = splitTimelineTime;
    afterSegment.timelineStartMs = splitTimelineTime;
  }

  const editableCaptionSegments = cloneCaptionSegments(state.editableCaptionSegments);
  editableCaptionSegments.splice(index, 1, beforeSegment, afterSegment);

  console.log("[GLIFO] caption-editor:split-caption", {
    index,
    beforeText,
    afterText,
    originalStart: segment.startMs,
    originalEnd: segment.endMs,
    splitTime,
  });

  return {
    ...state,
    editableCaptionSegments,
    hasManualEdits: true,
    lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
  };
}

export function rebuildCaptionEditorSegments(
  state: CaptionEditorState,
  lastRebuildNotice: string | null = null,
): CaptionEditorState {
  return {
    ...state,
    editableCaptionSegments: buildCaptionSegmentsFromWords(state.words, state.settings),
    hasManualEdits: false,
    lastRebuildNotice,
  };
}

export function resetCaptionEditorSegments(state: CaptionEditorState): CaptionEditorState {
  return {
    ...state,
    editableCaptionSegments: cloneCaptionSegments(state.originalCaptionSegments),
    hasManualEdits: false,
    lastRebuildNotice: null,
  };
}

export function mergeCaptionSegmentWithNext(
  state: CaptionEditorState,
  index: number,
): CaptionEditorState {
  const current = state.editableCaptionSegments[index];
  const next = state.editableCaptionSegments[index + 1];
  if (!current || !next) {
    return state;
  }

  const editableCaptionSegments = cloneCaptionSegments(state.editableCaptionSegments);
  editableCaptionSegments.splice(index, 2, {
    ...current,
    endMs: next.endMs,
    timelineEndMs: next.timelineEndMs,
    text: mergeCaptionTexts(current.text, next.text),
  });

  return {
    ...state,
    editableCaptionSegments,
    hasManualEdits: true,
    lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
  };
}

export function splitCaptionSegment(
  state: CaptionEditorState,
  index: number,
): CaptionEditorState {
  const segment = state.editableCaptionSegments[index];
  if (!segment || !canSplitCaptionSegment(state, index)) {
    return state;
  }

  const wordsInSegment = getWordsInsideCaption(state.words, segment);
  const replacement = wordsInSegment.length >= 2
    ? splitSegmentFromWords(wordsInSegment)
    : splitSegmentFromText(segment);
  if (!replacement) {
    return state;
  }

  const editableCaptionSegments = cloneCaptionSegments(state.editableCaptionSegments);
  editableCaptionSegments.splice(index, 1, ...replacement);

  return {
    ...state,
    editableCaptionSegments,
    hasManualEdits: true,
    lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
  };
}

export function restoreCaptionSegment(
  state: CaptionEditorState,
  index: number,
): CaptionEditorState {
  const segment = state.editableCaptionSegments[index];
  const original = segment ? findOriginalCaptionForSegment(state, segment) : null;
  if (!segment || !original) {
    return state;
  }

  const editableCaptionSegments = cloneCaptionSegments(state.editableCaptionSegments);
  editableCaptionSegments[index] = cloneCaptionSegments([original])[0];

  return {
    ...state,
    editableCaptionSegments,
    hasManualEdits: true,
    lastRebuildNotice: CAPTION_MANUAL_FORMAT_WARNING,
  };
}

function resolveCaptionEditorSettingsWithChange(
  settings: CaptionEditorSettings,
  settingName: CaptionEditorSettingName,
  value: unknown,
): CaptionEditorSettings {
  switch (settingName) {
    case "mode":
      return resolveCaptionEditorSettings({
        ...settings,
        mode: value as CaptionSegmentationMode,
      });
    case "maxLines":
      return resolveCaptionEditorSettings({
        ...settings,
        maxLines: value === 1 || value === "1" ? 1 : 2,
      });
    case "maxCharsPerLine":
      return resolveCaptionEditorSettings({
        ...settings,
        maxCharsPerLine: Number(value),
      });
    case "maxDurationMs":
      return resolveCaptionEditorSettings({
        ...settings,
        maxDurationMs: Number(value),
      });
    case "minPauseMs":
      return resolveCaptionEditorSettings({
        ...settings,
        minPauseMs: Number(value),
      });
  }
}

function getCaptionEditorSettingValue(
  settings: CaptionEditorSettings,
  settingName: CaptionEditorSettingName,
): string | number {
  return settings[settingName];
}

function logCaptionEditorSettingsChange(input: CaptionEditorSettingsChangeLog & {
  captionsCountAfter: number;
}): void {
  void input;
}

export function getCaptionEditorPayload(
  state: CaptionEditorState,
  sequenceInMs: number | null,
): CaptionPayload {
  return {
    sequenceInMs,
    captionSegments: cloneCaptionSegments(state.editableCaptionSegments),
  };
}

function cloneWords(words: SttWord[]): SttWord[] {
  return words.map((word) => ({
    startMs: word.startMs,
    endMs: word.endMs,
    word: word.word,
  }));
}

function cloneCaptionSegments(captionSegments: CaptionSegment[]): CaptionSegment[] {
  return captionSegments.map((segment) => ({
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    ...(typeof segment.timelineStartMs === "number" && Number.isFinite(segment.timelineStartMs)
      ? { timelineStartMs: segment.timelineStartMs }
      : {}),
    ...(typeof segment.timelineEndMs === "number" && Number.isFinite(segment.timelineEndMs)
      ? { timelineEndMs: segment.timelineEndMs }
      : {}),
  }));
}

function calculateCaptionSplitRatio(
  beforeText: string,
  afterText: string,
  cursorPosition: number,
  textLength: number,
): number {
  const beforeCharCount = countCaptionCharacters(beforeText);
  const afterCharCount = countCaptionCharacters(afterText);
  if (beforeCharCount > 0 && afterCharCount > 0) {
    return clampSplitRatio(beforeCharCount / (beforeCharCount + afterCharCount));
  }

  const beforeWordCount = countCaptionWords(beforeText);
  const afterWordCount = countCaptionWords(afterText);
  if (beforeWordCount > 0 && afterWordCount > 0) {
    return clampSplitRatio(beforeWordCount / (beforeWordCount + afterWordCount));
  }

  if (textLength > 0) {
    return clampSplitRatio(cursorPosition / textLength);
  }

  return 0.5;
}

function countCaptionWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function countCaptionCharacters(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0.5;
  }

  return Math.min(0.95, Math.max(0.05, ratio));
}

function calculateSplitTime(startMs: number, endMs: number, ratio: number): number {
  const start = Number.isFinite(startMs) ? startMs : 0;
  const end = Number.isFinite(endMs) ? endMs : start;
  if (end - start < 2) {
    return start;
  }

  const rawSplitTime = Math.round(start + (end - start) * clampSplitRatio(ratio));
  return Math.min(end - 1, Math.max(start + 1, rawSplitTime));
}

function calculateTimelineSplitTime(
  segment: CaptionSegment,
  splitTime: number,
  ratio: number,
): number | null {
  const hasTimelineStart = typeof segment.timelineStartMs === "number" && Number.isFinite(segment.timelineStartMs);
  const hasTimelineEnd = typeof segment.timelineEndMs === "number" && Number.isFinite(segment.timelineEndMs);

  if (hasTimelineStart && hasTimelineEnd) {
    return calculateSplitTime(segment.timelineStartMs as number, segment.timelineEndMs as number, ratio);
  }

  if (hasTimelineStart) {
    return Math.round((segment.timelineStartMs as number) + (splitTime - segment.startMs));
  }

  if (hasTimelineEnd) {
    return Math.round((segment.timelineEndMs as number) - (segment.endMs - splitTime));
  }

  return null;
}

function mergeCaptionTexts(left: string, right: string): string {
  return [left, right]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

function canSplitCaptionSegment(state: CaptionEditorState, index: number): boolean {
  const segment = state.editableCaptionSegments[index];
  if (!segment || segment.endMs - segment.startMs < 2) {
    return false;
  }

  const wordsInSegment = getWordsInsideCaption(state.words, segment);
  if (wordsInSegment.length >= 2) {
    return true;
  }

  return segment.text.trim().split(/\s+/).length >= 2;
}

function getWordsInsideCaption(words: SttWord[], segment: CaptionSegment): SttWord[] {
  return words.filter((word) =>
    word.startMs >= segment.startMs &&
    word.endMs <= segment.endMs
  );
}

function splitSegmentFromWords(words: SttWord[]): CaptionSegment[] | null {
  const splitIndex = Math.max(1, Math.floor(words.length / 2));
  const leftWords = words.slice(0, splitIndex);
  const rightWords = words.slice(splitIndex);
  const leftFirst = leftWords[0];
  const leftLast = leftWords[leftWords.length - 1];
  const rightFirst = rightWords[0];
  const rightLast = rightWords[rightWords.length - 1];

  if (!leftFirst || !leftLast || !rightFirst || !rightLast) {
    return null;
  }

  return [
    {
      startMs: leftFirst.startMs,
      endMs: leftLast.endMs,
      text: leftWords.map((word) => word.word).join(" "),
    },
    {
      startMs: rightFirst.startMs,
      endMs: rightLast.endMs,
      text: rightWords.map((word) => word.word).join(" "),
    },
  ];
}

function splitSegmentFromText(segment: CaptionSegment): CaptionSegment[] | null {
  const words = segment.text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 2) {
    return null;
  }

  const splitIndex = Math.max(1, Math.floor(words.length / 2));
  const durationMs = segment.endMs - segment.startMs;
  const midpointMs = Math.round(segment.startMs + durationMs * (splitIndex / words.length));

  return [
    {
      startMs: segment.startMs,
      endMs: midpointMs,
      text: words.slice(0, splitIndex).join(" "),
    },
    {
      startMs: midpointMs,
      endMs: segment.endMs,
      text: words.slice(splitIndex).join(" "),
    },
  ];
}

function findOriginalCaptionForSegment(
  state: CaptionEditorState,
  segment: CaptionSegment,
): CaptionSegment | null {
  return state.originalCaptionSegments.find((candidate) =>
    candidate.startMs === segment.startMs &&
    candidate.endMs === segment.endMs
  ) ?? null;
}

export function getCaptionPreviewRows(
  state: CaptionEditorState,
  sequenceInMs: number | null,
): CaptionPreviewRowData[] {
  return state.editableCaptionSegments.map((segment) => {
    const durationMs = Math.max(0, Math.round(segment.endMs - segment.startMs));
    return {
      captionSegment: cloneCaptionSegments([segment])[0],
      timecode: formatCaptionPreviewTimecode(segment, sequenceInMs),
      timelineLabel: [
        `Relativo ${formatMs(segment.startMs)} - ${formatMs(segment.endMs)}`,
        formatCaptionTimelineLabel(segment, sequenceInMs),
      ].join("\n"),
      text: segment.text,
      durationMs,
      durationLabel: formatCaptionDurationLabel(durationMs),
    };
  });
}

function renderCaptionEditor(
  elements: ResultElements,
  state: CaptionEditorState,
  sequenceInMs: number | null,
  activeEditIndex: number | null,
  callbacks: {
    onTextChange: (index: number, text: string) => void;
    onFocus: (index: number) => void;
    onSplitAtCursor: (index: number, cursorPosition: number) => void;
  } = {
    onTextChange: () => undefined,
    onFocus: () => undefined,
    onSplitAtCursor: () => undefined,
  },
): void {
  elements.captionEditorList.textContent = "";

  const previewRows = getCaptionPreviewRows(state, sequenceInMs);
  const transcriptCaptionSegmentsCount = state.transcriptCaptionSegments?.length ?? 0;
  const wordsCount = state.words.length;
  const shouldRenderEditor =
    state.editableCaptionSegments.length > 0 ||
    transcriptCaptionSegmentsCount > 0 ||
    wordsCount > 0;

  console.info("[GLIFO] caption-editor:compact-render", {
    editableCaptionSegmentsCount: state.editableCaptionSegments.length,
    transcriptCaptionSegmentsCount,
    wordsCount,
    shouldRenderEditor,
    previewRowsCount: previewRows.length,
    sequenceInMs,
  });

  if (!shouldRenderEditor) {
    showCaptionEditorWorkspace(elements);
    renderCaptionEditorSummary(elements, state);
    renderSimpleCaptionPreview(elements, state, sequenceInMs);
    const empty = document.createElement("p");
    empty.className = "panel__captionEmpty";
    empty.textContent = "No hay captions para editar y no hay words disponibles.";
    elements.captionEditorList.appendChild(empty);
    return;
  }

  showCaptionEditorWorkspace(elements);
  renderCaptionEditorSummary(elements, state);
  renderSimpleCaptionPreview(elements, state, sequenceInMs);

  if (previewRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel__captionEmpty";
    empty.textContent = wordsCount > 0
      ? `No hay captions para editar, pero hay ${wordsCount} words disponibles.`
      : "Sin caption segments disponibles";
    elements.captionEditorList.appendChild(empty);
    return;
  }

  previewRows.forEach((previewRow, index) => {
    const item = document.createElement("article");
    item.className = "captionRow captionEditorSimpleRow";
    item.setAttribute("data-caption-index", String(index));

    const timeLabel = document.createElement("span");
    timeLabel.className = "captionTimecode captionEditorSimpleTime";
    timeLabel.textContent = formatCaptionEditorTimecode(previewRow.captionSegment, sequenceInMs);
    timeLabel.title = [
      `Caption ${index + 1}`,
      previewRow.timelineLabel,
      previewRow.durationLabel,
    ].join(" | ");

    const textarea = document.createElement("textarea");
    textarea.className = "captionText captionEditorCompactTextarea";
    textarea.rows = 1;
    textarea.value = previewRow.text;
    textarea.spellcheck = true;
    textarea.setAttribute("aria-label", `Texto del caption ${index + 1}`);
    textarea.addEventListener("focus", () => {
      callbacks.onFocus(index);
    });
    textarea.addEventListener("input", () => {
      resizeCaptionTextarea(textarea);
      callbacks.onTextChange(index, textarea.value);
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const cursorPosition = textarea.selectionStart ?? textarea.value.length;
        callbacks.onTextChange(index, textarea.value);

        if (cursorPosition > 0 && cursorPosition < textarea.value.length) {
          callbacks.onSplitAtCursor(index, cursorPosition);
          return;
        }

        if (cursorPosition <= 0) {
          focusCaptionEditorTextarea(elements.captionEditorList, index > 0 ? index - 1 : index + 1, {
            caret: "end",
          }) || textarea.blur();
          return;
        }

        focusCaptionEditorTextarea(elements.captionEditorList, index + 1, {
          selectText: true,
        }) || textarea.blur();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusCaptionEditorTextarea(elements.captionEditorList, index + 1, {
          caret: "end",
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusCaptionEditorTextarea(elements.captionEditorList, index - 1, {
          caret: "end",
        });
      }
    });

    item.appendChild(timeLabel);
    item.appendChild(textarea);

    elements.captionEditorList.appendChild(item);
    resizeCaptionTextarea(textarea);
  });

  if (activeEditIndex !== null) {
    focusCaptionEditorTextarea(elements.captionEditorList, activeEditIndex, {
      caret: "start",
    });
  }
}

function focusCaptionEditorTextarea(
  container: HTMLElement,
  index: number,
  options: {
    caret?: "start" | "end";
    selectText?: boolean;
  } = {},
): boolean {
  const nextInput = container.querySelector<HTMLTextAreaElement>(
    `.captionEditorSimpleRow[data-caption-index="${index}"] .captionText`,
  );
  if (!nextInput) {
    return false;
  }

  nextInput.focus();
  if (options.selectText) {
    nextInput.select();
    return true;
  }

  const caretPosition = options.caret === "start" ? 0 : nextInput.value.length;
  nextInput.setSelectionRange(caretPosition, caretPosition);
  return true;
}

function resizeCaptionTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
}

function renderSimpleCaptionPreview(
  elements: ResultElements,
  state: CaptionEditorState,
  sequenceInMs: number | null,
): void {
  elements.captionsPreview.style.display = "none";
  elements.captionsPreview.textContent = formatCaptionSegmentsText(
    state.editableCaptionSegments,
    sequenceInMs !== null && Number.isFinite(sequenceInMs) ? { sequenceInMs } : undefined,
  );
}

function renderCaptionVisualPreview(
  elements: ResultElements,
  state: CaptionEditorState,
  styleSettings: MogrtStyleSettings,
  selectedCaptionIndex: number | null,
): void {
  const settings = resolveCaptionEditorSettings(state.settings);
  const previewText = selectCaptionVisualPreviewText(state, selectedCaptionIndex, settings.maxLines);
  const fillColor = normalizeHexColor(styleSettings.fillColor);
  const previewFontSize = mapMogrtFontSizeToPreviewPx(styleSettings.fontSize);
  const previewStrokeWidth = styleSettings.strokeEnabled
    ? mapMogrtStrokeWidthToPreviewPx(styleSettings.strokeWidth)
    : 0;

  elements.captionVisualPreview.style.setProperty("--caption-color", fillColor);
  elements.captionVisualPreview.style.setProperty("--caption-font-size", `${previewFontSize}px`);
  elements.captionVisualPreview.style.setProperty("--caption-stroke-width", `${previewStrokeWidth}px`);
  elements.captionVisualPreview.style.setProperty("--caption-position-y", formatPreviewPositionY(styleSettings.positionYMode));
  elements.captionVisualPreview.style.setProperty("--caption-shadow", buildCaptionPreviewShadow(styleSettings));
  elements.captionVisualPreview.setAttribute("data-lines", String(settings.maxLines));
  elements.captionVisualSubtitle.textContent = previewText;
}

function selectCaptionVisualPreviewText(
  state: CaptionEditorState,
  selectedCaptionIndex: number | null,
  maxLines: number,
): string {
  const selected = selectedCaptionIndex !== null
    ? state.editableCaptionSegments[selectedCaptionIndex]
    : null;
  const firstCaption = state.editableCaptionSegments[0] ?? null;
  const rawText = selected?.text.trim() || firstCaption?.text.trim() || "Preview de subtítulos";

  if (maxLines <= 1) {
    return rawText.replace(/\s+/g, " ");
  }

  const explicitLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (explicitLines.length > 1) {
    return explicitLines.slice(0, 2).join("\n");
  }

  return rawText.replace(/[ \t]+/g, " ");
}

function mapMogrtFontSizeToPreviewPx(fontSize: number): number {
  const normalized = Number.isFinite(fontSize) ? fontSize : DEFAULT_MOGRT_STYLE_SETTINGS.fontSize;
  return Math.round(Math.min(34, Math.max(13, normalized * 0.24)));
}

function mapMogrtStrokeWidthToPreviewPx(strokeWidth: number): number {
  const normalized = Number.isFinite(strokeWidth) ? strokeWidth : DEFAULT_MOGRT_STYLE_SETTINGS.strokeWidth;
  if (normalized <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(Math.min(4, normalized * 0.45)));
}

function formatPreviewPositionY(positionYMode: MogrtStyleSettings["positionYMode"]): string {
  if (positionYMode === "top") {
    return "22%";
  }

  if (positionYMode === "center") {
    return "50%";
  }

  return "78%";
}

function buildCaptionPreviewShadow(settings: MogrtStyleSettings): string {
  const shadows: string[] = [];

  if (settings.strokeEnabled && settings.strokeWidth > 0) {
    shadows.push(
      "0 1px 0 #000000",
      "1px 0 0 #000000",
      "0 -1px 0 #000000",
      "-1px 0 0 #000000",
    );
  }

  if (settings.shadowEnabled) {
    shadows.push("0 3px 8px rgba(0, 0, 0, 0.85)");
  }

  return shadows.length > 0 ? shadows.join(", ") : "none";
}

function formatCaptionEditorTimecode(
  segment: CaptionSegment,
  sequenceInMs: number | null,
): string {
  const startMs = sequenceInMs !== null && Number.isFinite(sequenceInMs)
    ? sequenceInMs + segment.startMs
    : segment.startMs;
  return formatTimelineMs(startMs);
}

function renderCaptionEditorSummary(
  elements: ResultElements,
  state: CaptionEditorState,
): void {
  const settings = state.settings;
  const lines = [
    `${state.editableCaptionSegments.length} captions generados`,
    `${formatCaptionMode(settings.mode)} · ${settings.maxLines} linea(s) · ${settings.maxCharsPerLine} chars/linea`,
    `max ${settings.maxDurationMs} ms · pausa ${settings.minPauseMs} ms`,
  ];

  if (state.hasManualEdits) {
    lines.push("edición manual activa");
  }

  if (state.lastRebuildNotice) {
    lines.push(state.lastRebuildNotice);
  }

  elements.captionEditorSummary.textContent = lines.join(" | ");
  elements.captionManualNotice.style.display = state.hasManualEdits ? "block" : "none";
  elements.captionManualNotice.textContent = state.hasManualEdits
    ? CAPTION_MANUAL_FORMAT_WARNING
    : "";
}

function getCaptionSegmentMetrics(
  segment: CaptionSegment,
  settings: CaptionEditorSettings,
): {
  maxLineChars: number;
  estimatedLines: number;
  durationMs: number;
} {
  const lines = segment.text.split(/\r?\n/).map((line) => line.trim());
  const maxLineChars = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const estimatedLines = lines.length > 1
    ? lines.length
    : Math.max(1, Math.ceil(segment.text.replace(/\s+/g, " ").trim().length / settings.maxCharsPerLine));

  return {
    maxLineChars,
    estimatedLines,
    durationMs: Math.max(0, Math.round(segment.endMs - segment.startMs)),
  };
}

function createCaptionMetric(label: string, value: string, isWarning: boolean): HTMLSpanElement {
  const metric = document.createElement("span");
  metric.className = "panel__captionMetric";
  metric.setAttribute("data-warning", isWarning ? "true" : "false");
  metric.textContent = `${label}: ${value}`;
  return metric;
}

function formatCaptionPreviewTimecode(
  segment: CaptionSegment,
  sequenceInMs: number | null,
): string {
  const startMs = sequenceInMs !== null && Number.isFinite(sequenceInMs)
    ? sequenceInMs + segment.startMs
    : segment.startMs;
  return formatTimecodeMs(startMs);
}

function formatCaptionDurationLabel(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatCaptionTimelineLabel(
  segment: CaptionSegment,
  sequenceInMs: number | null,
): string {
  if (sequenceInMs === null || !Number.isFinite(sequenceInMs)) {
    return "Timeline real: no disponible";
  }

  return `Timeline real ${formatTimelineMs(sequenceInMs + segment.startMs)} - ${formatTimelineMs(sequenceInMs + segment.endMs)}`;
}

function formatTimecodeMs(ms: number): string {
  const totalMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const frames = Math.floor(((totalMs % 1000) / 1000) * 30);

  return [
    String(hours).padStart(2, "0"),
    ":",
    String(minutes).padStart(2, "0"),
    ":",
    String(seconds).padStart(2, "0"),
    ":",
    String(frames).padStart(2, "0"),
  ].join("");
}

function formatCaptionMode(mode: CaptionSegmentationMode): string {
  if (mode === "short") {
    return "Corto";
  }

  if (mode === "word-by-word") {
    return "Palabra por palabra";
  }

  return "Natural";
}

function syncCaptionEditorControls(
  elements: ResultElements,
  settings: CaptionEditorSettings,
): void {
  const resolvedSettings = resolveCaptionEditorSettings(settings);
  elements.captionModeButtons.forEach((button) => {
    const isActive = button.getAttribute("data-caption-mode") === resolvedSettings.mode;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("data-active", isActive ? "true" : "false");
  });
  elements.captionMaxLinesButtons.forEach((button) => {
    const isActive = button.getAttribute("data-caption-lines") === String(resolvedSettings.maxLines);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("data-active", isActive ? "true" : "false");
  });
  elements.captionMaxCharsRange.value = String(resolvedSettings.maxCharsPerLine);
  elements.captionMaxCharsNumber.value = String(resolvedSettings.maxCharsPerLine);
  elements.captionMaxCharsValue.textContent = String(resolvedSettings.maxCharsPerLine);
  elements.captionMaxDurationRange.value = String(resolvedSettings.maxDurationMs);
  elements.captionMaxDurationNumber.value = String(resolvedSettings.maxDurationMs);
  elements.captionMaxDurationValue.textContent = `${resolvedSettings.maxDurationMs} ms`;
  elements.captionMinPauseRange.value = String(resolvedSettings.minPauseMs);
  elements.captionMinPauseNumber.value = String(resolvedSettings.minPauseMs);
  elements.captionMinPauseValue.textContent = `${resolvedSettings.minPauseMs} ms`;
}

function syncMogrtStyleControls(
  elements: ResultElements,
  settings: MogrtStyleSettings,
): void {
  elements.mogrtFillColorInput.value = normalizeHexColor(settings.fillColor);
  elements.mogrtFontSizeRange.value = String(settings.fontSize);
  elements.mogrtFontSizeNumber.value = String(settings.fontSize);
  elements.mogrtStrokeEnabledInput.checked = settings.strokeEnabled;
  elements.mogrtStrokeWidthRange.value = String(settings.strokeWidth);
  elements.mogrtStrokeWidthNumber.value = String(settings.strokeWidth);
  elements.mogrtStrokeWidthRange.disabled = !settings.strokeEnabled;
  elements.mogrtStrokeWidthNumber.disabled = !settings.strokeEnabled;
  elements.mogrtShadowEnabledInput.checked = settings.shadowEnabled;
  const positionYValue = positionYModeToSliderValue(settings.positionYMode);
  elements.mogrtPositionYRange.value = String(positionYValue);
  elements.mogrtPositionYNumber.value = String(positionYValue);
  elements.mogrtPositionYValue.textContent = formatPositionYMode(settings.positionYMode);

  const activePresetId = resolveStylePresetId(settings);
  elements.mogrtStylePresetButtons.forEach((button) => {
    const isActive = button.getAttribute("data-style-preset") === activePresetId;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("data-active", isActive ? "true" : "false");
  });
}

function normalizeHexColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : DEFAULT_MOGRT_STYLE_SETTINGS.fillColor;
}

function positionYModeToSliderValue(value: MogrtStyleSettings["positionYMode"]): number {
  if (value === "top") {
    return 0;
  }

  if (value === "center") {
    return 50;
  }

  return 100;
}

function positionYSliderValueToMode(value: number): MogrtStyleSettings["positionYMode"] {
  if (value <= 33) {
    return "top";
  }

  if (value <= 66) {
    return "center";
  }

  return "bottom";
}

function formatPositionYMode(value: MogrtStyleSettings["positionYMode"]): string {
  if (value === "top") {
    return "Top";
  }

  if (value === "center") {
    return "Center";
  }

  return "Bottom";
}

function bindCaptionNumberControls(
  rangeInput: HTMLInputElement,
  numberInput: HTMLInputElement,
  min: number,
  max: number,
  onChange: (value: number) => void,
): void {
  const handleInput = (input: HTMLInputElement) => {
    const value = clampNumberInput(input.value, min, max);
    rangeInput.value = String(value);
    numberInput.value = String(value);
    onChange(value);
  };

  rangeInput.addEventListener("input", () => {
    handleInput(rangeInput);
  });

  numberInput.addEventListener("input", () => {
    handleInput(numberInput);
  });
}

function clampNumberInput(value: string, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function bindPanelToggle(
  root: HTMLElement,
  config: {
    buttonId: string;
    panelId: string;
    collapsedLabel: string;
    expandedLabel: string;
  },
): void {
  const button = root.querySelector<HTMLButtonElement>(`#${config.buttonId}`);
  const panel = root.querySelector<HTMLElement>(`#${config.panelId}`);
  if (!button || !panel) {
    return;
  }

  const setExpanded = (expanded: boolean) => {
    button.textContent = expanded ? config.expandedLabel : config.collapsedLabel;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    panel.style.display = expanded ? "" : "none";
  };

  setExpanded(button.getAttribute("aria-expanded") === "true");
  button.addEventListener("click", () => {
    setExpanded(button.getAttribute("aria-expanded") !== "true");
  });
}

function collapseCaptionEditorPanels(elements: ResultElements): void {
  collapseTogglePanel(elements.captionAdvancedToggle, elements.captionEditorControls.querySelector<HTMLElement>("#captionAdvancedControls"), "Advanced");
  collapseTogglePanel(elements.mogrtStyleToggle, elements.captionEditorControls.querySelector<HTMLElement>("#mogrtStylePanel"), "Style");
  collapseTogglePanel(elements.captionPreviewToggle, elements.captionsSection, "Preview");
}

function collapseTogglePanel(
  button: HTMLButtonElement,
  panel: HTMLElement | null,
  label: string,
): void {
  button.textContent = label;
  button.setAttribute("aria-expanded", "false");
  if (panel) {
    panel.style.display = "none";
  }
}

function canExportSrt(payload: CaptionPayload | null): boolean {
  return payload !== null;
}

function canRunMogrtFlow(payload: CaptionPayload | null): payload is CaptionPayload & {
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

function showCaptionEditorWorkspace(elements: ResultElements): void {
  elements.captionEditorWorkspace.style.display = "block";
  elements.captionEditorWorkspace.style.visibility = "visible";
  elements.captionEditorControls.style.display = "block";
}

function hideCaptionEditorWorkspace(elements: ResultElements, reason: string): void {
  void reason;
  elements.captionEditorWorkspace.style.display = "none";
  elements.captionEditorControls.style.display = "none";
  elements.captionsSection.style.display = "none";
}

function keepDebugDetailsHiddenAtEnd(elements: ResultElements): void {
  elements.debugDetails.style.display = "none";
}

function hideDebugDetails(elements: ResultElements): void {
  elements.debugDetails.style.display = "none";
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
  const captionVisualPreview = root.querySelector<HTMLElement>("#captionVisualPreview");
  const captionVisualSubtitle = root.querySelector<HTMLDivElement>("#captionVisualPreviewSubtitle");
  const captionEditorWorkspace = root.querySelector<HTMLElement>("#captionEditorWorkspace");
  const captionEditorControls = root.querySelector<HTMLDivElement>("#captionEditorControls");
  const captionModeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-caption-mode]"));
  const captionMaxLinesButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-caption-lines]"));
  const captionMaxCharsRange = root.querySelector<HTMLInputElement>("#captionMaxCharsRange");
  const captionMaxCharsNumber = root.querySelector<HTMLInputElement>("#captionMaxCharsNumber");
  const captionMaxCharsValue = root.querySelector<HTMLElement>("#captionMaxCharsValue");
  const captionMaxDurationRange = root.querySelector<HTMLInputElement>("#captionMaxDurationRange");
  const captionMaxDurationNumber = root.querySelector<HTMLInputElement>("#captionMaxDurationNumber");
  const captionMaxDurationValue = root.querySelector<HTMLElement>("#captionMaxDurationValue");
  const captionMinPauseRange = root.querySelector<HTMLInputElement>("#captionMinPauseRange");
  const captionMinPauseNumber = root.querySelector<HTMLInputElement>("#captionMinPauseNumber");
  const captionMinPauseValue = root.querySelector<HTMLElement>("#captionMinPauseValue");
  const captionAdvancedToggle = root.querySelector<HTMLButtonElement>("#captionAdvancedToggle");
  const mogrtStyleToggle = root.querySelector<HTMLButtonElement>("#mogrtStyleToggle");
  const captionPreviewToggle = root.querySelector<HTMLButtonElement>("#captionPreviewToggle");
  const captionEditorSummary = root.querySelector<HTMLParagraphElement>("#captionEditorSummary");
  const captionManualNotice = root.querySelector<HTMLParagraphElement>("#captionManualNotice");
  const captionEditorList = root.querySelector<HTMLDivElement>("#captionEditorList");
  const mogrtFillColorInput = root.querySelector<HTMLInputElement>("#mogrtFillColor");
  const mogrtFontSizeRange = root.querySelector<HTMLInputElement>("#mogrtFontSizeRange");
  const mogrtFontSizeNumber = root.querySelector<HTMLInputElement>("#mogrtFontSizeNumber");
  const mogrtStrokeEnabledInput = root.querySelector<HTMLInputElement>("#mogrtStrokeEnabled");
  const mogrtStrokeWidthRange = root.querySelector<HTMLInputElement>("#mogrtStrokeWidthRange");
  const mogrtStrokeWidthNumber = root.querySelector<HTMLInputElement>("#mogrtStrokeWidthNumber");
  const mogrtShadowEnabledInput = root.querySelector<HTMLInputElement>("#mogrtShadowEnabled");
  const mogrtPositionYRange = root.querySelector<HTMLInputElement>("#mogrtPositionYRange");
  const mogrtPositionYNumber = root.querySelector<HTMLInputElement>("#mogrtPositionYNumber");
  const mogrtPositionYValue = root.querySelector<HTMLElement>("#mogrtPositionYValue");
  const mogrtStylePresetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-style-preset]"));
  const debugDetails = root.querySelector<HTMLElement>("#resultDebugDetails");
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
    !captionVisualPreview ||
    !captionVisualSubtitle ||
    !captionEditorWorkspace ||
    !captionEditorControls ||
    captionModeButtons.length !== 3 ||
    captionMaxLinesButtons.length !== 2 ||
    !captionMaxCharsRange ||
    !captionMaxCharsNumber ||
    !captionMaxCharsValue ||
    !captionMaxDurationRange ||
    !captionMaxDurationNumber ||
    !captionMaxDurationValue ||
    !captionMinPauseRange ||
    !captionMinPauseNumber ||
    !captionMinPauseValue ||
    !captionAdvancedToggle ||
    !mogrtStyleToggle ||
    !captionPreviewToggle ||
    !captionEditorSummary ||
    !captionManualNotice ||
    !captionEditorList ||
    !mogrtFillColorInput ||
    !mogrtFontSizeRange ||
    !mogrtFontSizeNumber ||
    !mogrtStrokeEnabledInput ||
    !mogrtStrokeWidthRange ||
    !mogrtStrokeWidthNumber ||
    !mogrtShadowEnabledInput ||
    !mogrtPositionYRange ||
    !mogrtPositionYNumber ||
    !mogrtPositionYValue ||
    mogrtStylePresetButtons.length !== CAPTION_STYLE_PRESETS.length ||
    !debugDetails ||
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
    captionVisualPreview,
    captionVisualSubtitle,
    captionEditorWorkspace,
    captionEditorControls,
    captionModeButtons,
    captionMaxLinesButtons,
    captionMaxCharsRange,
    captionMaxCharsNumber,
    captionMaxCharsValue,
    captionMaxDurationRange,
    captionMaxDurationNumber,
    captionMaxDurationValue,
    captionMinPauseRange,
    captionMinPauseNumber,
    captionMinPauseValue,
    captionAdvancedToggle,
    mogrtStyleToggle,
    captionPreviewToggle,
    captionEditorSummary,
    captionManualNotice,
    captionEditorList,
    mogrtFillColorInput,
    mogrtFontSizeRange,
    mogrtFontSizeNumber,
    mogrtStrokeEnabledInput,
    mogrtStrokeWidthRange,
    mogrtStrokeWidthNumber,
    mogrtShadowEnabledInput,
    mogrtPositionYRange,
    mogrtPositionYNumber,
    mogrtPositionYValue,
    mogrtStylePresetButtons,
    debugDetails,
    textSection,
    fullTextPreview,
    copyButton,
    copyFeedback,
  };
}

function renderEmptyResult(elements: ResultElements): void {
  elements.emptyState.style.display = "block";
  elements.emptyState.textContent = [
    "Listo para transcribir un archivo exportado desde Premiere.",
    "Formatos soportados: WAV, MP4, M4A, MP3, MPEG, MPGA, WEBM, FLAC, OGG.",
  ].join("\n");
  elements.metadataSection.style.display = "none";
  elements.segmentsSection.style.display = "none";
  elements.captionsSection.style.display = "none";
  elements.srtInstruction.style.display = "none";
  elements.srtInstruction.textContent = "";
  elements.textSection.style.display = "none";
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  hideCaptionEditorWorkspace(elements, "empty-result");
  collapseCaptionEditorPanels(elements);
  elements.captionEditorSummary.textContent = "";
  elements.captionManualNotice.style.display = "none";
  elements.captionManualNotice.textContent = "";
  elements.captionEditorList.textContent = "";
  hideDebugDetails(elements);
  elements.fullTextPreview.textContent = "";
  elements.copyButton.disabled = true;
  setCopyFeedback(elements, "", "neutral");
}

function renderPendingResult(elements: ResultElements, message: string): void {
  elements.emptyState.style.display = "block";
  elements.emptyState.textContent = message;
  elements.metadataSection.style.display = "none";
  elements.segmentsSection.style.display = "none";
  elements.captionsSection.style.display = "none";
  elements.srtInstruction.style.display = "none";
  elements.srtInstruction.textContent = "";
  elements.textSection.style.display = "none";
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  hideCaptionEditorWorkspace(elements, "pending-result");
  collapseCaptionEditorPanels(elements);
  elements.captionEditorSummary.textContent = "";
  elements.captionManualNotice.style.display = "none";
  elements.captionManualNotice.textContent = "";
  elements.captionEditorList.textContent = "";
  hideDebugDetails(elements);
  elements.fullTextPreview.textContent = "";
  elements.copyButton.disabled = true;
  setCopyFeedback(elements, "", "neutral");
}

function renderTranscript(
  elements: ResultElements,
  response: TranscribeResponse,
  rangeDebug?: ExportedWav,
): void {
  elements.emptyState.style.display = "none";
  showCaptionEditorWorkspace(elements);
  collapseCaptionEditorPanels(elements);
  elements.metadataSection.style.display = "block";
  elements.segmentsSection.style.display = "block";
  elements.captionsSection.style.display = "none";
  elements.textSection.style.display = "block";
  keepDebugDetailsHiddenAtEnd(elements);
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = formatSegmentsText(response.segments);
  elements.srtInstruction.style.display = rangeDebug ? "block" : "none";
  elements.srtInstruction.textContent = rangeDebug
    ? buildSrtPlacementInstruction(rangeDebug.sequenceInMs)
    : "";
  elements.captionsPreview.textContent = "";
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
  elements.emptyState.style.display = "block";
  elements.emptyState.textContent = message;
  elements.metadataSection.style.display = "none";
  elements.segmentsSection.style.display = "none";
  elements.captionsSection.style.display = "none";
  elements.srtInstruction.style.display = "none";
  elements.srtInstruction.textContent = "";
  elements.textSection.style.display = "none";
  elements.metadataList.textContent = "";
  elements.segmentsPreview.textContent = "";
  elements.captionsPreview.textContent = "";
  hideCaptionEditorWorkspace(elements, "error-result");
  collapseCaptionEditorPanels(elements);
  elements.captionEditorSummary.textContent = "";
  elements.captionManualNotice.style.display = "none";
  elements.captionManualNotice.textContent = "";
  elements.captionEditorList.textContent = "";
  hideDebugDetails(elements);
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
  const styleDiagnostics = formatMogrtStyleDiagnostics(report);

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
    ...styleDiagnostics,
    itemLines.length > 0 ? "Items:" : "",
    ...itemLines,
    hiddenItems > 0 ? `${hiddenItems} item(s) más en consola UXP.` : "",
    "Detalle completo en consola UXP: [GLIFO] mogrt-bridge:batch-report. Logs host-side en el panel CEP.",
  ].filter((line) => line.length > 0).join("\n");
}

function formatMogrtStyleDiagnostics(report: MogrtBridgeBatchReport): string[] {
  const firstProcessed = report.items.find((item) => !item.skipped && item.insert.ok) ?? report.items[0];
  if (!firstProcessed) {
    return [];
  }

  const availability = firstProcessed.styleAvailability;
  const parameters = firstProcessed.exposedParameters.slice(0, 16);
  const styleApplied = report.items.reduce((total, item) => {
    const applied = Array.isArray(item.style.details.applied) ? item.style.details.applied.length : 0;
    return total + applied;
  }, 0);

  const lines = [
    "Parámetros MOGRT:",
    `texto: ${availability.text}`,
    `fill: ${availability.fillColor}`,
    `stroke color: ${availability.strokeColor}`,
    `stroke width: ${availability.strokeWidth}`,
    `shadow: ${availability.shadow}`,
    `font size: ${availability.fontSize}`,
    `position: ${availability.position}`,
    `scale: ${availability.scale}`,
    `opacity: ${availability.opacity}`,
    `animation: ${availability.animation}`,
    `style setValue aplicados: ${styleApplied}`,
  ];

  if (availability.totalStyleParams === 0) {
    lines.push("Este template solo permite editar texto. Para controlar estilo, exponé parámetros en After Effects.");
  }

  if (parameters.length > 0) {
    lines.push("Expuestos:");
    parameters.forEach((param) => {
      lines.push([
        param.displayName ?? "(sin nombre)",
        `kind=${param.inferredKind}`,
        `type=${String(param.type ?? "(sin tipo)")}`,
        `value=${formatMogrtParamValue(param.value)}`,
      ].join(" | "));
    });
  }

  return lines;
}

function formatMogrtParamValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return "(sin valor)";
    }
    return serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized;
  } catch {
    return String(value);
  }
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
    report.style.details.status ? `style: ${String(report.style.details.status)}` : "",
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
