import {
  resolveActivePremiereContextForAudioExport,
} from "./audioExport";
import type { CaptionSegment } from "../types/transcribe";

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

export type MogrtProbeStatus = "ok" | "failed";

export interface MogrtProbeInput {
  captionSegments: CaptionSegment[];
  sequenceInMs: number;
  mogrtPath: string;
  videoTrackIndex?: number;
  audioTrackIndex?: number;
}

export interface MogrtProbeApiInventory {
  moduleKeys: string[];
  sequenceEditorExists: boolean;
  sequenceEditorMethods: string[];
  getEditorAvailable: boolean;
  editorMethods: string[];
  insertMogrtFromPathAvailable: boolean;
  insertMogrtFromLibraryAvailable: boolean;
  tickTimeExists: boolean;
  tickTimeMethods: string[];
  activeProjectResolved: boolean;
  executeTransactionAvailable: boolean;
}

export interface MogrtProbeTrackItemSummary {
  valueKind: string;
  ownKeys: string[];
  methods: string[];
  name: string | null;
  startMs: number | null;
  endMs: number | null;
  durationMs: number | null;
  hasComponentChain: boolean;
}

export interface MogrtProbeParamSummary {
  componentIndex: number;
  paramIndex: number;
  displayName: string | null;
  matchName: string | null;
  valueKind: string;
  valuePreview: string | null;
  methods: string[];
  candidateScore: number;
  styleSignal: boolean;
}

export interface MogrtProbeComponentSummary {
  index: number;
  displayName: string | null;
  matchName: string | null;
  ownKeys: string[];
  methods: string[];
  paramCount: number | null;
  params: MogrtProbeParamSummary[];
}

export interface MogrtProbeOperationSummary {
  attempted: boolean;
  ok: boolean;
  method: string | null;
  error: string | null;
  details: UnknownRecord;
}

export interface MogrtProbeReport {
  status: MogrtProbeStatus;
  failureMessage: string | null;
  mogrtPath: string;
  target: {
    sequenceInMs: number;
    captionStartMs: number;
    captionEndMs: number;
    timelineStartMs: number;
    timelineEndMs: number;
    durationMs: number;
    text: string;
  };
  apiInventory: MogrtProbeApiInventory;
  insert: MogrtProbeOperationSummary;
  duration: MogrtProbeOperationSummary;
  text: MogrtProbeOperationSummary;
  insertedTrackItems: MogrtProbeTrackItemSummary[];
  selectedTrackItem: MogrtProbeTrackItemSummary | null;
  selectedTrackItemAfterActions: MogrtProbeTrackItemSummary | null;
  components: MogrtProbeComponentSummary[];
  textParamCandidates: MogrtProbeParamSummary[];
  styleParamCandidates: MogrtProbeParamSummary[];
  warnings: string[];
}

interface ComponentInspection {
  components: MogrtProbeComponentSummary[];
  textCandidates: InternalParamCandidate[];
  styleCandidates: MogrtProbeParamSummary[];
}

interface InternalParamCandidate {
  paramObject: UnknownRecord;
  summary: MogrtProbeParamSummary;
}

const PREMIERE_TICKS_PER_SECOND = 254_016_000_000;

export async function runSingleCaptionMogrtProbe(
  input: MogrtProbeInput,
): Promise<MogrtProbeReport> {
  const captionSegment = getFirstUsableCaptionSegment(input.captionSegments);
  const target = buildProbeTarget(input.sequenceInMs, captionSegment);
  const report = createInitialReport(input.mogrtPath, target);

  try {
    const requireFn = getRuntimeRequire();
    const premiereModule = loadPremiereModule(requireFn);
    const activeContext = await resolveActivePremiereContextForAudioExport(premiereModule);
    const activeProject = activeContext.activeProject ??
      await resolveActiveProject(premiereModule);
    const activeProjectObject = asRecord(activeProject);
    const activeSequenceObject = activeContext.activeSequence;

    updateApiInventoryForModule(report, premiereModule, activeProjectObject);

    const sequenceEditorStatic = asRecord(safeGetProperty(premiereModule, "SequenceEditor"));
    const getEditor = asFunction(safeGetProperty(sequenceEditorStatic, "getEditor"));
    if (!sequenceEditorStatic || !getEditor) {
      failReport(report, "SequenceEditor.getEditor no está disponible en este runtime.");
      return report;
    }

    const editor = await Promise.resolve(getEditor.call(sequenceEditorStatic, activeSequenceObject));
    const editorObject = asRecord(editor);
    updateApiInventoryForEditor(report, editorObject);
    if (!editorObject) {
      failReport(report, "SequenceEditor.getEditor devolvió un valor inválido.");
      return report;
    }

    const insertMogrtFromPath = asFunction(safeGetProperty(editorObject, "insertMogrtFromPath"));
    if (!insertMogrtFromPath) {
      failReport(report, "SequenceEditor.insertMogrtFromPath no está disponible.");
      return report;
    }

    const startTime = await createTickTime(premiereModule, target.timelineStartMs);
    const endTime = await createTickTime(premiereModule, target.timelineEndMs);
    const videoTrackIndex = input.videoTrackIndex ??
      await resolveAppendVideoTrackIndex(activeSequenceObject, report);
    const audioTrackIndex = input.audioTrackIndex ?? 0;

    report.insert.attempted = true;
    report.insert.method = "SequenceEditor.insertMogrtFromPath";
    report.insert.details = {
      videoTrackIndex,
      audioTrackIndex,
      timelineStartMs: target.timelineStartMs,
      timelineEndMs: target.timelineEndMs,
    };

    const insertedValue = await Promise.resolve(
      insertMogrtFromPath.call(
        editorObject,
        input.mogrtPath,
        startTime,
        videoTrackIndex,
        audioTrackIndex,
      ),
    );
    const insertedTrackItems = normalizeTrackItems(insertedValue);
    report.insert.ok = insertedTrackItems.length > 0;
    report.insert.details.returnKind = getValueKind(insertedValue);
    report.insert.details.returnedTrackItems = insertedTrackItems.length;
    report.insertedTrackItems = await Promise.all(
      insertedTrackItems.map((trackItem) => inspectTrackItem(trackItem)),
    );

    const selectedTrackItem = pickTrackItemForMogrtProbe(insertedTrackItems);
    if (!selectedTrackItem) {
      failReport(report, "El MOGRT se invocó, pero no devolvió un track item usable.");
      return report;
    }

    report.selectedTrackItem = await inspectTrackItem(selectedTrackItem);

    const componentInspection = await inspectComponentChain(selectedTrackItem, startTime);
    report.components = componentInspection.components;
    report.textParamCandidates = componentInspection.textCandidates.map((candidate) => candidate.summary);
    report.styleParamCandidates = componentInspection.styleCandidates;

    if (!activeProjectObject) {
      report.warnings.push("No se pudo resolver activeProject; se omiten acciones de duración/texto.");
    } else {
      await tryApplyDurationActions({
        activeProjectObject,
        trackItemObject: selectedTrackItem,
        startTime,
        endTime,
        report,
      });

      await tryApplyTextAction({
        activeProjectObject,
        textCandidates: componentInspection.textCandidates,
        text: target.text,
        report,
      });
    }

    report.selectedTrackItemAfterActions = await inspectTrackItem(selectedTrackItem);
    report.status = "ok";
  } catch (error) {
    failReport(report, toErrorMessage(error));
  }

  console.info("[GLIFO] mogrt-probe:report", report);
  return report;
}

function createInitialReport(
  mogrtPath: string,
  target: MogrtProbeReport["target"],
): MogrtProbeReport {
  return {
    status: "failed",
    failureMessage: null,
    mogrtPath,
    target,
    apiInventory: {
      moduleKeys: [],
      sequenceEditorExists: false,
      sequenceEditorMethods: [],
      getEditorAvailable: false,
      editorMethods: [],
      insertMogrtFromPathAvailable: false,
      insertMogrtFromLibraryAvailable: false,
      tickTimeExists: false,
      tickTimeMethods: [],
      activeProjectResolved: false,
      executeTransactionAvailable: false,
    },
    insert: createOperationSummary(),
    duration: createOperationSummary(),
    text: createOperationSummary(),
    insertedTrackItems: [],
    selectedTrackItem: null,
    selectedTrackItemAfterActions: null,
    components: [],
    textParamCandidates: [],
    styleParamCandidates: [],
    warnings: [],
  };
}

function createOperationSummary(): MogrtProbeOperationSummary {
  return {
    attempted: false,
    ok: false,
    method: null,
    error: null,
    details: {},
  };
}

function getFirstUsableCaptionSegment(captionSegments: CaptionSegment[]): CaptionSegment {
  const segment = captionSegments.find((candidate) =>
    Number.isFinite(candidate.startMs) &&
    Number.isFinite(candidate.endMs) &&
    candidate.endMs > candidate.startMs &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0
  );

  if (!segment) {
    throw new Error("No hay un captionSegment válido para probar MOGRT.");
  }

  return segment;
}

function buildProbeTarget(
  sequenceInMs: number,
  captionSegment: CaptionSegment,
): MogrtProbeReport["target"] {
  if (!Number.isFinite(sequenceInMs) || sequenceInMs < 0) {
    throw new Error("sequenceInMs no es válido; la prueba requiere un rango Fase 2.");
  }

  const timelineStartMs = Math.max(0, Math.round(sequenceInMs + captionSegment.startMs));
  const timelineEndMs = Math.max(timelineStartMs + 1, Math.round(sequenceInMs + captionSegment.endMs));

  return {
    sequenceInMs,
    captionStartMs: captionSegment.startMs,
    captionEndMs: captionSegment.endMs,
    timelineStartMs,
    timelineEndMs,
    durationMs: timelineEndMs - timelineStartMs,
    text: captionSegment.text,
  };
}

function updateApiInventoryForModule(
  report: MogrtProbeReport,
  premiereModule: UnknownRecord,
  activeProjectObject: UnknownRecord | null,
): void {
  const sequenceEditorStatic = asRecord(safeGetProperty(premiereModule, "SequenceEditor"));
  const tickTimeStatic = asRecord(safeGetProperty(premiereModule, "TickTime"));

  report.apiInventory.moduleKeys = safePropertyNames(premiereModule);
  report.apiInventory.sequenceEditorExists = Boolean(sequenceEditorStatic);
  report.apiInventory.sequenceEditorMethods = sequenceEditorStatic
    ? extractMethods(sequenceEditorStatic)
    : [];
  report.apiInventory.getEditorAvailable = hasMethod(sequenceEditorStatic, "getEditor");
  report.apiInventory.tickTimeExists = Boolean(tickTimeStatic);
  report.apiInventory.tickTimeMethods = tickTimeStatic ? extractMethods(tickTimeStatic) : [];
  report.apiInventory.activeProjectResolved = Boolean(activeProjectObject);
  report.apiInventory.executeTransactionAvailable = hasMethod(activeProjectObject, "executeTransaction");
}

function updateApiInventoryForEditor(
  report: MogrtProbeReport,
  editorObject: UnknownRecord | null,
): void {
  report.apiInventory.editorMethods = editorObject ? extractMethods(editorObject) : [];
  report.apiInventory.insertMogrtFromPathAvailable = hasMethod(editorObject, "insertMogrtFromPath");
  report.apiInventory.insertMogrtFromLibraryAvailable = hasMethod(editorObject, "insertMogrtFromLibrary");
}

async function createTickTime(
  premiereModule: UnknownRecord,
  milliseconds: number,
): Promise<unknown> {
  const tickTimeStatic = asRecord(safeGetProperty(premiereModule, "TickTime"));
  if (!tickTimeStatic) {
    throw new Error("TickTime no está expuesto en require('premierepro').");
  }

  const seconds = milliseconds / 1000;
  const createWithSeconds = asFunction(safeGetProperty(tickTimeStatic, "createWithSeconds"));
  if (createWithSeconds) {
    return Promise.resolve(createWithSeconds.call(tickTimeStatic, seconds));
  }

  const createWithTicks = asFunction(safeGetProperty(tickTimeStatic, "createWithTicks"));
  if (createWithTicks) {
    return Promise.resolve(createWithTicks.call(
      tickTimeStatic,
      String(Math.round(seconds * PREMIERE_TICKS_PER_SECOND)),
    ));
  }

  throw new Error("TickTime no expone createWithSeconds ni createWithTicks.");
}

async function resolveAppendVideoTrackIndex(
  activeSequenceObject: UnknownRecord,
  report: MogrtProbeReport,
): Promise<number> {
  const getVideoTrackCount = asFunction(safeGetProperty(activeSequenceObject, "getVideoTrackCount"));
  if (getVideoTrackCount) {
    const count = await Promise.resolve(getVideoTrackCount.call(activeSequenceObject));
    const numericCount = asNumber(count);
    if (numericCount !== null && numericCount >= 0) {
      report.insert.details.detectedVideoTrackCount = numericCount;
      return numericCount;
    }
  }

  const videoTracks = safeGetProperty(activeSequenceObject, "videoTracks");
  if (Array.isArray(videoTracks)) {
    report.insert.details.detectedVideoTrackCount = videoTracks.length;
    return videoTracks.length;
  }

  throw new Error(
    "No se pudo detectar el total de video tracks; se cancela la prueba para no insertar sobre clips existentes.",
  );
}

function normalizeTrackItems(value: unknown): UnknownRecord[] {
  const rawItems = Array.isArray(value) ? value : [value];
  return rawItems
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => item !== null);
}

function pickTrackItemForMogrtProbe(trackItems: UnknownRecord[]): UnknownRecord | null {
  return trackItems.find((trackItem) => hasMethod(trackItem, "getComponentChain")) ??
    trackItems[0] ??
    null;
}

async function inspectTrackItem(trackItemObject: UnknownRecord): Promise<MogrtProbeTrackItemSummary> {
  const start = await readTrackItemTimeMs(trackItemObject, ["getStart", "getStartTime"], ["start", "startTime"]);
  const end = await readTrackItemTimeMs(trackItemObject, ["getEnd", "getEndTime"], ["end", "endTime"]);
  const duration = await readTrackItemTimeMs(
    trackItemObject,
    ["getDuration", "getDurationTime"],
    ["duration", "durationTime"],
  );

  return {
    valueKind: getValueKind(trackItemObject),
    ownKeys: safePropertyNames(trackItemObject),
    methods: extractMethods(trackItemObject),
    name: await readOptionalString(trackItemObject, ["getName"], ["name"]),
    startMs: start,
    endMs: end,
    durationMs: duration ?? (start !== null && end !== null ? end - start : null),
    hasComponentChain: hasMethod(trackItemObject, "getComponentChain"),
  };
}

async function inspectComponentChain(
  trackItemObject: UnknownRecord,
  time: unknown,
): Promise<ComponentInspection> {
  const getComponentChain = asFunction(safeGetProperty(trackItemObject, "getComponentChain"));
  if (!getComponentChain) {
    return {
      components: [],
      textCandidates: [],
      styleCandidates: [],
    };
  }

  const chain = await Promise.resolve(getComponentChain.call(trackItemObject));
  const chainObject = asRecord(chain);
  if (!chainObject) {
    return {
      components: [],
      textCandidates: [],
      styleCandidates: [],
    };
  }

  const componentCount = await readCount(chainObject, [
    "getComponentCount",
    "getNumComponents",
    "getLength",
  ], ["componentCount", "length", "numComponents"]);

  const components: MogrtProbeComponentSummary[] = [];
  const textCandidates: InternalParamCandidate[] = [];
  const styleCandidates: MogrtProbeParamSummary[] = [];

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
    const component = await readIndexedValue(chainObject, [
      "getComponent",
      "getComponentAtIndex",
      "getAt",
      "at",
    ], componentIndex);
    const componentObject = asRecord(component);
    if (!componentObject) {
      continue;
    }

    const componentSummary = await inspectComponent(componentObject, componentIndex, time);
    components.push(componentSummary.summary);
    textCandidates.push(...componentSummary.textCandidates);
    styleCandidates.push(...componentSummary.styleCandidates);
  }

  return {
    components,
    textCandidates: textCandidates.sort((left, right) =>
      right.summary.candidateScore - left.summary.candidateScore
    ),
    styleCandidates,
  };
}

async function inspectComponent(
  componentObject: UnknownRecord,
  componentIndex: number,
  time: unknown,
): Promise<{
  summary: MogrtProbeComponentSummary;
  textCandidates: InternalParamCandidate[];
  styleCandidates: MogrtProbeParamSummary[];
}> {
  const paramCount = await readCount(componentObject, [
    "getParamCount",
    "getNumParams",
    "getLength",
  ], ["paramCount", "numParams", "length"]);

  const params: MogrtProbeParamSummary[] = [];
  const textCandidates: InternalParamCandidate[] = [];
  const styleCandidates: MogrtProbeParamSummary[] = [];

  for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
    const param = await readIndexedValue(componentObject, [
      "getParam",
      "getParamAtIndex",
      "getProperty",
      "getAt",
      "at",
    ], paramIndex);
    const paramObject = asRecord(param);
    if (!paramObject) {
      continue;
    }

    const paramSummary = await inspectParam(paramObject, componentIndex, paramIndex, time);
    params.push(paramSummary);

    if (paramSummary.candidateScore > 0) {
      textCandidates.push({
        paramObject,
        summary: paramSummary,
      });
    }

    if (paramSummary.styleSignal) {
      styleCandidates.push(paramSummary);
    }
  }

  return {
    summary: {
      index: componentIndex,
      displayName: await readOptionalString(componentObject, ["getDisplayName"], [
        "displayName",
        "name",
      ]),
      matchName: await readOptionalString(componentObject, ["getMatchName"], ["matchName"]),
      ownKeys: safePropertyNames(componentObject),
      methods: extractMethods(componentObject),
      paramCount,
      params,
    },
    textCandidates,
    styleCandidates,
  };
}

async function inspectParam(
  paramObject: UnknownRecord,
  componentIndex: number,
  paramIndex: number,
  time: unknown,
): Promise<MogrtProbeParamSummary> {
  const displayName = await readOptionalString(paramObject, ["getDisplayName"], [
    "displayName",
    "name",
  ]);
  const matchName = await readOptionalString(paramObject, ["getMatchName"], ["matchName"]);
  const value = await readParamValue(paramObject, time);
  const methods = extractMethods(paramObject);
  const valueKind = getValueKind(value);
  const score = scoreTextParamCandidate({
    displayName,
    matchName,
    valueKind,
    methods,
  });

  return {
    componentIndex,
    paramIndex,
    displayName,
    matchName,
    valueKind,
    valuePreview: previewValue(value),
    methods,
    candidateScore: score,
    styleSignal: isStyleParamName(displayName) || isStyleParamName(matchName),
  };
}

async function readParamValue(paramObject: UnknownRecord, time: unknown): Promise<unknown> {
  const getValueAtTime = asFunction(safeGetProperty(paramObject, "getValueAtTime"));
  if (getValueAtTime) {
    try {
      return await Promise.resolve(getValueAtTime.call(paramObject, time));
    } catch {
      // fall through to direct/start-value probes
    }
  }

  const getStartValue = asFunction(safeGetProperty(paramObject, "getStartValue"));
  if (getStartValue) {
    try {
      return await Promise.resolve(getStartValue.call(paramObject));
    } catch {
      // fall through to direct probes
    }
  }

  for (const propertyName of ["value", "currentValue", "defaultValue"]) {
    if (hasPropertyKey(paramObject, propertyName)) {
      return safeGetProperty(paramObject, propertyName);
    }
  }

  return undefined;
}

function scoreTextParamCandidate(input: {
  displayName: string | null;
  matchName: string | null;
  valueKind: string;
  methods: string[];
}): number {
  const names = [input.displayName, input.matchName]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.toLowerCase());
  let score = 0;

  for (const name of names) {
    if (/^(text|caption text|source text)$/i.test(name)) {
      score += 80;
    }
    if (name.includes("caption")) {
      score += 40;
    }
    if (name.includes("text") || name.includes("texto")) {
      score += 40;
    }
    if (name.includes("source")) {
      score += 10;
    }
  }

  if (input.valueKind === "string") {
    score += 30;
  }

  if (input.methods.includes("createKeyframe") && input.methods.includes("createSetValueAction")) {
    score += 20;
  }

  return score;
}

function isStyleParamName(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return /(font|size|scale|position|anchor|fill|stroke|color|colour|shadow|opacity|tracking|leading|style)/i
    .test(value);
}

async function tryApplyDurationActions(input: {
  activeProjectObject: UnknownRecord;
  trackItemObject: UnknownRecord;
  startTime: unknown;
  endTime: unknown;
  report: MogrtProbeReport;
}): Promise<void> {
  const { activeProjectObject, trackItemObject, startTime, endTime, report } = input;
  const setStartActionFactory = asFunction(safeGetProperty(trackItemObject, "createSetStartAction"));
  const setEndActionFactory = asFunction(safeGetProperty(trackItemObject, "createSetEndAction"));
  const actions: unknown[] = [];

  report.duration.attempted = true;
  report.duration.method = "TrackItem.createSetStartAction/createSetEndAction";
  report.duration.details = {
    createSetStartActionAvailable: Boolean(setStartActionFactory),
    createSetEndActionAvailable: Boolean(setEndActionFactory),
  };

  try {
    if (setStartActionFactory) {
      actions.push(await Promise.resolve(setStartActionFactory.call(trackItemObject, startTime)));
    }

    if (setEndActionFactory) {
      actions.push(await Promise.resolve(setEndActionFactory.call(trackItemObject, endTime)));
    }

    if (actions.length === 0) {
      report.duration.error = "El track item no expone actions para ajustar start/end.";
      return;
    }

    await executeProjectActions(activeProjectObject, actions, "GLIFO MOGRT probe: set duration");
    report.duration.ok = true;
    report.duration.details.actions = actions.length;
  } catch (error) {
    report.duration.error = toErrorMessage(error);
  }
}

async function tryApplyTextAction(input: {
  activeProjectObject: UnknownRecord;
  textCandidates: InternalParamCandidate[];
  text: string;
  report: MogrtProbeReport;
}): Promise<void> {
  const { activeProjectObject, textCandidates, text, report } = input;
  report.text.attempted = true;
  report.text.method = "ComponentParam.createKeyframe/createSetValueAction";
  report.text.details = {
    candidateCount: textCandidates.length,
    tried: [],
  };

  for (const candidate of textCandidates) {
    const createKeyframe = asFunction(safeGetProperty(candidate.paramObject, "createKeyframe"));
    const createSetValueAction = asFunction(safeGetProperty(candidate.paramObject, "createSetValueAction"));
    const label = formatParamLabel(candidate.summary);
    const tried = report.text.details.tried;
    if (Array.isArray(tried)) {
      tried.push(label);
    }

    if (!createKeyframe || !createSetValueAction) {
      continue;
    }

    try {
      const keyframe = await Promise.resolve(createKeyframe.call(candidate.paramObject, text));
      const action = await Promise.resolve(createSetValueAction.call(candidate.paramObject, keyframe, true));
      await executeProjectActions(activeProjectObject, [action], "GLIFO MOGRT probe: set text");
      report.text.ok = true;
      report.text.details.selectedParam = label;
      return;
    } catch (error) {
      report.text.error = `${label}: ${toErrorMessage(error)}`;
    }
  }

  if (!report.text.error) {
    report.text.error = "No se encontró parámetro de texto con createKeyframe/createSetValueAction.";
  }
}

async function executeProjectActions(
  projectObject: UnknownRecord,
  actions: unknown[],
  label: string,
): Promise<void> {
  const executeTransaction = asFunction(safeGetProperty(projectObject, "executeTransaction"));
  if (!executeTransaction) {
    throw new Error("Project.executeTransaction no está disponible.");
  }

  const executed = await Promise.resolve(
    executeTransaction.call(
      projectObject,
      (compoundAction: unknown) => {
        const compoundObject = asRecord(compoundAction);
        const addAction = asFunction(safeGetProperty(compoundObject, "addAction"));
        if (!compoundObject || !addAction) {
          throw new Error("CompoundAction.addAction no está disponible.");
        }

        for (const action of actions) {
          addAction.call(compoundObject, action);
        }
      },
      label,
    ),
  );

  if (executed === false) {
    throw new Error("Project.executeTransaction devolvió false.");
  }
}

async function resolveActiveProject(premiereModule: UnknownRecord): Promise<unknown | null> {
  const projectStatic = asRecord(safeGetProperty(premiereModule, "Project"));
  const getActiveProject = asFunction(safeGetProperty(projectStatic, "getActiveProject"));
  if (projectStatic && getActiveProject) {
    try {
      return await Promise.resolve(getActiveProject.call(projectStatic));
    } catch {
      return null;
    }
  }

  return null;
}

async function readCount(
  object: UnknownRecord,
  methodNames: string[],
  propertyNames: string[],
): Promise<number> {
  for (const methodName of methodNames) {
    const method = asFunction(safeGetProperty(object, methodName));
    if (!method) {
      continue;
    }

    try {
      const value = await Promise.resolve(method.call(object));
      const count = asNumber(value);
      if (count !== null && count >= 0) {
        return Math.floor(count);
      }
    } catch {
      // try next candidate
    }
  }

  for (const propertyName of propertyNames) {
    if (!hasPropertyKey(object, propertyName)) {
      continue;
    }

    const value = safeGetProperty(object, propertyName);
    const count = asNumber(value);
    if (count !== null && count >= 0) {
      return Math.floor(count);
    }
  }

  return 0;
}

async function readIndexedValue(
  object: UnknownRecord,
  methodNames: string[],
  index: number,
): Promise<unknown> {
  for (const methodName of methodNames) {
    const method = asFunction(safeGetProperty(object, methodName));
    if (!method) {
      continue;
    }

    try {
      return await Promise.resolve(method.call(object, index));
    } catch {
      // try next method
    }
  }

  if (Array.isArray(object)) {
    return object[index];
  }

  return undefined;
}

async function readTrackItemTimeMs(
  object: UnknownRecord,
  methodNames: string[],
  propertyNames: string[],
): Promise<number | null> {
  for (const methodName of methodNames) {
    const method = asFunction(safeGetProperty(object, methodName));
    if (!method) {
      continue;
    }

    try {
      const value = await Promise.resolve(method.call(object));
      const ms = readPremiereTimeMilliseconds(value);
      if (ms !== null) {
        return ms;
      }
    } catch {
      // try next candidate
    }
  }

  for (const propertyName of propertyNames) {
    if (!hasPropertyKey(object, propertyName)) {
      continue;
    }

    const value = safeGetProperty(object, propertyName);
    const ms = readPremiereTimeMilliseconds(value);
    if (ms !== null) {
      return ms;
    }
  }

  return null;
}

async function readOptionalString(
  object: UnknownRecord,
  methodNames: string[],
  propertyNames: string[],
): Promise<string | null> {
  for (const methodName of methodNames) {
    const method = asFunction(safeGetProperty(object, methodName));
    if (!method) {
      continue;
    }

    try {
      const value = await Promise.resolve(method.call(object));
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    } catch {
      // try next candidate
    }
  }

  for (const propertyName of propertyNames) {
    if (!hasPropertyKey(object, propertyName)) {
      continue;
    }

    const value = safeGetProperty(object, propertyName);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readPremiereTimeMilliseconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 1000);
  }

  const valueObject = asRecord(value);
  if (!valueObject) {
    return null;
  }

  const seconds = asNumber(safeGetProperty(valueObject, "seconds"));
  if (seconds !== null) {
    return Math.round(seconds * 1000);
  }

  const ticks = asNumber(safeGetProperty(valueObject, "ticksNumber")) ??
    asNumberLike(safeGetProperty(valueObject, "ticks"));
  if (ticks !== null) {
    return Math.round((ticks / PREMIERE_TICKS_PER_SECOND) * 1000);
  }

  return null;
}

function getRuntimeRequire(): UnknownFn {
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new Error("Premiere UXP runtime no está disponible.");
  }

  return requireFn as UnknownFn;
}

function loadPremiereModule(requireFn: UnknownFn): UnknownRecord {
  const premiereModule = asRecord(requireFn("premierepro"));
  if (!premiereModule) {
    throw new Error("require('premierepro') devolvió un valor inválido.");
  }

  return premiereModule;
}

function failReport(report: MogrtProbeReport, message: string): void {
  report.status = "failed";
  report.failureMessage = message;
  console.warn("[GLIFO] mogrt-probe:failed", {
    message,
    report,
  });
}

function formatParamLabel(param: MogrtProbeParamSummary): string {
  return [
    `component=${param.componentIndex}`,
    `param=${param.paramIndex}`,
    `display=${param.displayName ?? "(none)"}`,
    `match=${param.matchName ?? "(none)"}`,
    `score=${param.candidateScore}`,
  ].join(" | ");
}

function previewValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }

  const object = asRecord(value);
  return object ? `{${safePropertyNames(object).slice(0, 8).join(",")}}` : String(value);
}

function safeGetProperty(object: UnknownRecord | null | undefined, propertyName: string): unknown {
  if (!object) {
    return undefined;
  }

  try {
    return object[propertyName];
  } catch {
    return undefined;
  }
}

function hasPropertyKey(object: UnknownRecord | null | undefined, propertyName: string): boolean {
  if (!object) {
    return false;
  }

  try {
    return propertyName in object;
  } catch {
    return false;
  }
}

function safePropertyNames(value: UnknownRecord): string[] {
  const names = new Set<string>();

  try {
    for (const key of Object.keys(value)) {
      names.add(key);
    }
  } catch {
    // native objects may reject reflection
  }

  try {
    for (const key of Object.getOwnPropertyNames(value)) {
      names.add(key);
    }
  } catch {
    // native objects may reject reflection
  }

  try {
    const prototype = Object.getPrototypeOf(value) as unknown;
    const prototypeObject = asRecord(prototype);
    if (prototypeObject) {
      for (const key of Object.getOwnPropertyNames(prototypeObject)) {
        names.add(key);
      }
    }
  } catch {
    // native objects may reject reflection
  }

  return Array.from(names).filter((name) => name !== "constructor").sort();
}

function extractMethods(value: UnknownRecord): string[] {
  return safePropertyNames(value)
    .filter((name) => typeof safeGetProperty(value, name) === "function")
    .sort();
}

function hasMethod(object: UnknownRecord | null | undefined, methodName: string): boolean {
  return typeof safeGetProperty(object, methodName) === "function";
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

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function asNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getValueKind(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
