export type AudioExportErrorCode =
  | "premiere_runtime_unavailable"
  | "active_project_missing"
  | "active_sequence_missing"
  | "in_out_missing"
  | "wav_preset_missing"
  | "encoder_manager_unavailable"
  | "encoder_export_failed"
  | "encoder_render_error"
  | "encoder_render_cancelled"
  | "encoder_render_timeout"
  | "exported_file_missing"
  | "exported_file_empty";

export interface ExportedWav {
  mediaPath: string;
  filename: string;
  cleanup?: () => Promise<void>;
}

export interface InOutRangeValidation {
  valid: boolean;
  inSeconds: number | null;
  outSeconds: number | null;
  endSeconds: number | null;
}

export class AudioExportError extends Error {
  readonly code: AudioExportErrorCode;
  readonly details: unknown;

  constructor(code: AudioExportErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AudioExportError";
    this.code = code;
    this.details = details;
  }
}

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;
type EntrypointAccessType = "method" | "property";

interface EntrypointCandidateDefinition {
  name: string;
  accessType: EntrypointAccessType;
  path: string[];
  args?: unknown[];
  note?: string;
}

interface EntrypointCandidateReport {
  name: string;
  accessType: EntrypointAccessType;
  path: string;
  available: boolean;
  invoked: boolean;
  resolved: boolean;
  error: string | null;
  valueKind: string;
  note: string | null;
}

interface CandidateEvaluation {
  report: EntrypointCandidateReport;
  value: unknown;
}

type EncoderEventKind = "complete" | "error" | "cancel";
type EncoderRenderCompletionSource = "event" | "file";

interface FileStatus {
  exists: boolean;
  size: number | null;
}

interface EncoderEventOutcome {
  kind: EncoderEventKind;
  source: string;
  eventName: string;
  event: unknown;
  message: string;
}

interface EncoderEventRuntimeDiagnostics {
  eventNames: {
    complete: string[];
    error: string[];
    cancel: string[];
  };
  hasEventManager: boolean;
  eventManagerMethods: string[];
  encoderManagerMethods: string[];
  encoderMethods: string[];
  constantsEncoderEventKeys: string[];
  listenerApisAvailable: string[];
}

interface EncoderRenderDiagnostics {
  outputPath: string;
  presetPath: string;
  timeoutMs: number;
  pollMs: number;
  exportSequenceReturnValue: unknown;
  eventsRegistered: string[];
  eventRegistrationErrors: string[];
  eventRuntime: EncoderEventRuntimeDiagnostics;
  fileExists: boolean;
  fileSize: number | null;
  completionSource: EncoderRenderCompletionSource | null;
  lastEvent: {
    kind: EncoderEventKind;
    source: string;
    eventName: string;
    message: string;
    event: unknown;
  } | null;
}

export interface AudioExportEntrypointDiagnostics {
  topLevelKeys: string[];
  hasProject: boolean;
  hasApp: boolean;
  hasCapitalApp: boolean;
  hasProjectGetActiveProject: boolean;
  activeProjectRelatedEntrypoints: string[];
  projectCandidates: EntrypointCandidateReport[];
  sequenceCandidates: EntrypointCandidateReport[];
  resolvedProjectPath: string | null;
  resolvedSequencePath: string | null;
}

export interface ActivePremiereContextForAudioExport {
  activeProject: UnknownRecord | null;
  activeSequence: UnknownRecord;
  diagnostics: AudioExportEntrypointDiagnostics;
}

const WAV_PRESET_RELATIVE_PATH = "presets/glifo-wav.epr";
const RENDER_TIMEOUT_MS = 60 * 1000;
const RENDER_FILE_POLL_MS = 2 * 1000;
const FILE_READY_TIMEOUT_MS = 10 * 1000;
const FILE_READY_POLL_MS = 250;

export function isAudioExportError(value: unknown): value is AudioExportError {
  return value instanceof AudioExportError;
}

export async function exportActiveSequenceInOutToWav(): Promise<ExportedWav> {
  const requireFn = getRuntimeRequire();
  const premiereModule = loadPremiereModule(requireFn);
  const localFileSystem = loadLocalFileSystem(requireFn);

  const { activeSequence } = await resolveActivePremiereContextForAudioExport(premiereModule);
  await assertValidInOutRange(activeSequence);

  const presetPath = await resolveWavPresetPath(localFileSystem);
  const output = await createTemporaryWavFile(localFileSystem);
  const encoder = await getEncoderManager(premiereModule);
  const exportType = getImmediateExportType(premiereModule);
  const monitor = createEncoderRenderMonitor({
    premiereModule,
    encoder,
    outputPath: output.mediaPath,
    presetPath,
  });

  console.info("[GLIFO] encoder:export-setup", {
    outputPath: output.mediaPath,
    presetPath,
    timeoutMs: RENDER_TIMEOUT_MS,
    pollMs: RENDER_FILE_POLL_MS,
    eventRuntime: monitor.diagnostics.eventRuntime,
    eventsRegistered: monitor.diagnostics.eventsRegistered,
    eventRegistrationErrors: monitor.diagnostics.eventRegistrationErrors,
  });

  try {
    const exportSequence = asFunction(encoder.exportSequence);
    if (!exportSequence) {
      throw new AudioExportError(
        "encoder_manager_unavailable",
        "EncoderManager.exportSequence no está disponible. Usá Transcribir archivo.",
      );
    }

    let started: unknown;
    try {
      started = await Promise.resolve(
        exportSequence.call(
          encoder,
          activeSequence,
          exportType,
          output.mediaPath,
          presetPath,
          false,
        ),
      );
      monitor.diagnostics.exportSequenceReturnValue = started;
      console.info("[GLIFO] encoder:exportSequence:return", {
        outputPath: output.mediaPath,
        presetPath,
        value: started,
        valueKind: getValueKind(started),
      });
    } catch (error) {
      throw new AudioExportError(
        "encoder_export_failed",
        `EncoderManager.exportSequence falló: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
        { cause: error },
      );
    }

    if (started === false) {
      throw new AudioExportError(
        "encoder_export_failed",
        createEncoderExportFailedMessage(monitor.diagnostics),
        monitor.diagnostics,
      );
    }

    if (started !== true) {
      console.warn("[GLIFO] encoder:exportSequence:non-boolean-start", {
        outputPath: output.mediaPath,
        presetPath,
        value: started,
        valueKind: getValueKind(started),
      });
    }

    await waitForEncoderRenderOrFile({
      requireFn,
      fileEntry: output.fileEntry,
      mediaPath: output.mediaPath,
      monitor,
    });
  } finally {
    monitor.dispose();
  }

  await verifyExportedFileReady({
    requireFn,
    fileEntry: output.fileEntry,
    mediaPath: output.mediaPath,
  });

  return {
    mediaPath: output.mediaPath,
    filename: output.filename,
    cleanup: createTemporaryWavCleanup({
      requireFn,
      fileEntry: output.fileEntry,
      mediaPath: output.mediaPath,
      filename: output.filename,
    }),
  };
}

export function validateInOutRange(
  inPoint: unknown,
  outPoint: unknown,
  endPoint?: unknown,
): InOutRangeValidation {
  const inSeconds = readTickSeconds(inPoint);
  const outSeconds = readTickSeconds(outPoint);
  const endSeconds = readTickSeconds(endPoint);
  const hasPositiveRange =
    inSeconds !== null &&
    outSeconds !== null &&
    outSeconds > inSeconds;
  const looksLikeWholeSequenceDefault =
    hasPositiveRange &&
    endSeconds !== null &&
    isNearlyEqual(inSeconds, 0) &&
    isNearlyEqual(outSeconds, endSeconds);

  return {
    valid: hasPositiveRange && !looksLikeWholeSequenceDefault,
    inSeconds,
    outSeconds,
    endSeconds,
  };
}

function getRuntimeRequire(): UnknownFn {
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      "Premiere UXP runtime no está disponible. Usá Transcribir archivo.",
    );
  }

  return requireFn as UnknownFn;
}

function loadPremiereModule(requireFn: UnknownFn): UnknownRecord {
  try {
    const premiereModule = asRecord(requireFn("premierepro"));
    if (!premiereModule) {
      throw new Error("require('premierepro') devolvió un valor inválido");
    }

    return premiereModule;
  } catch (error) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      `No se pudo cargar el runtime de Premiere: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }
}

function loadLocalFileSystem(requireFn: UnknownFn): UnknownRecord {
  try {
    const uxpModule = asRecord(requireFn("uxp"));
    const storage = asRecord(uxpModule?.storage);
    const localFileSystem = asRecord(storage?.localFileSystem);
    if (!localFileSystem) {
      throw new Error("uxp.storage.localFileSystem no está disponible");
    }

    return localFileSystem;
  } catch (error) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      `No se pudo acceder al filesystem UXP: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }
}

export async function resolveActivePremiereContextForAudioExport(
  premiereModule: UnknownRecord,
): Promise<ActivePremiereContextForAudioExport> {
  const diagnostics = createAudioExportEntrypointDiagnostics(premiereModule);
  logAudioExportEntrypointDiagnostics(diagnostics);

  const projectEvaluations = await evaluateCandidateDefinitions({
    root: premiereModule,
    rootLabel: "premierepro",
    definitions: buildProjectCandidateDefinitions(premiereModule),
  });
  diagnostics.projectCandidates = projectEvaluations.map((evaluation) => evaluation.report);

  const projectEvaluation = pickFirstObjectResolution(projectEvaluations);
  const activeProject = asRecord(projectEvaluation?.value);
  diagnostics.resolvedProjectPath = projectEvaluation?.report.path ?? null;

  const sequenceEvaluations = await evaluateCandidateDefinitions({
    root: premiereModule,
    rootLabel: "premierepro",
    definitions: buildSequenceCandidateDefinitions(premiereModule, activeProject),
    activeProject,
  });
  diagnostics.sequenceCandidates = sequenceEvaluations.map((evaluation) => evaluation.report);

  const sequenceEvaluation = pickFirstObjectResolution(sequenceEvaluations);
  const activeSequence = asRecord(sequenceEvaluation?.value);
  diagnostics.resolvedSequencePath = sequenceEvaluation?.report.path ?? null;

  logAudioExportResolutionResult(diagnostics);

  if (activeSequence) {
    if (!activeProject) {
      console.warn("[GLIFO] Premiere active sequence resolved without active project", {
        resolvedSequencePath: diagnostics.resolvedSequencePath,
        entrypoints: createEntrypointLogSummary(diagnostics),
      });
    }

    return {
      activeProject,
      activeSequence,
      diagnostics,
    };
  }

  if (!activeProject) {
    throw new AudioExportError(
      "active_project_missing",
      createActiveProjectMissingMessage(diagnostics),
      diagnostics,
    );
  }

  throw new AudioExportError(
    "active_sequence_missing",
    createActiveSequenceMissingMessage(diagnostics),
    diagnostics,
  );
}

function createAudioExportEntrypointDiagnostics(
  premiereModule: UnknownRecord,
): AudioExportEntrypointDiagnostics {
  const projectStatic = asRecord(safeGetProperty(premiereModule, "Project"));

  return {
    topLevelKeys: safeEnumerableKeys(premiereModule),
    hasProject: safeGetProperty(premiereModule, "Project") !== undefined &&
      safeGetProperty(premiereModule, "Project") !== null,
    hasApp: safeGetProperty(premiereModule, "app") !== undefined &&
      safeGetProperty(premiereModule, "app") !== null,
    hasCapitalApp: safeGetProperty(premiereModule, "App") !== undefined &&
      safeGetProperty(premiereModule, "App") !== null,
    hasProjectGetActiveProject: Boolean(asFunction(projectStatic?.getActiveProject)),
    activeProjectRelatedEntrypoints: findActiveProjectRelatedEntrypoints(premiereModule),
    projectCandidates: [],
    sequenceCandidates: [],
    resolvedProjectPath: null,
    resolvedSequencePath: null,
  };
}

function buildProjectCandidateDefinitions(premiereModule: UnknownRecord): EntrypointCandidateDefinition[] {
  const definitions: EntrypointCandidateDefinition[] = [];
  const seen = new Set<string>();

  const add = (definition: EntrypointCandidateDefinition): void => {
    const key = `${definition.accessType}:${definition.path.join(".")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    definitions.push(definition);
  };

  add({ name: "Project.getActiveProject", accessType: "method", path: ["Project", "getActiveProject"] });
  add({ name: "Project.getCurrentProject", accessType: "method", path: ["Project", "getCurrentProject"] });

  for (const rootKey of [
    "app",
    "App",
    "application",
    "Application",
    "Projects",
    "ProjectUtils",
    "Context",
    "Document",
  ]) {
    add({
      name: `${rootKey}.getActiveProject`,
      accessType: "method",
      path: [rootKey, "getActiveProject"],
    });
    add({
      name: `${rootKey}.getCurrentProject`,
      accessType: "method",
      path: [rootKey, "getCurrentProject"],
    });
    add({
      name: `${rootKey}.activeProject`,
      accessType: "property",
      path: [rootKey, "activeProject"],
    });
    add({
      name: `${rootKey}.currentProject`,
      accessType: "property",
      path: [rootKey, "currentProject"],
    });
    add({
      name: `${rootKey}.project`,
      accessType: "property",
      path: [rootKey, "project"],
    });
  }

  for (const rootKey of ["app", "App", "application", "Application"]) {
    add({
      name: `${rootKey}.getProject`,
      accessType: "method",
      path: [rootKey, "getProject"],
      note: "compatibility_fallback",
    });

    for (const projectContainerKey of ["project", "Project", "projects", "Projects"]) {
      add({
        name: `${rootKey}.${projectContainerKey}.getActiveProject`,
        accessType: "method",
        path: [rootKey, projectContainerKey, "getActiveProject"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.getCurrentProject`,
        accessType: "method",
        path: [rootKey, projectContainerKey, "getCurrentProject"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.activeProject`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "activeProject"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.currentProject`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "currentProject"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.project`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "project"],
      });
    }
  }

  appendDynamicProjectCandidates(premiereModule, add);

  return definitions;
}

function buildSequenceCandidateDefinitions(
  premiereModule: UnknownRecord,
  activeProject: UnknownRecord | null,
): EntrypointCandidateDefinition[] {
  const definitions: EntrypointCandidateDefinition[] = [];
  const seen = new Set<string>();

  const add = (definition: EntrypointCandidateDefinition): void => {
    const key = `${definition.accessType}:${definition.path.join(".")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    definitions.push(definition);
  };

  if (activeProject) {
    add({ name: "activeProject.getActiveSequence", accessType: "method", path: ["__activeProject", "getActiveSequence"] });
    add({ name: "activeProject.getCurrentSequence", accessType: "method", path: ["__activeProject", "getCurrentSequence"] });
    add({ name: "activeProject.activeSequence", accessType: "property", path: ["__activeProject", "activeSequence"] });
    add({ name: "activeProject.currentSequence", accessType: "property", path: ["__activeProject", "currentSequence"] });
    add({ name: "activeProject.sequence", accessType: "property", path: ["__activeProject", "sequence"] });
  }

  for (const rootKey of [
    "app",
    "App",
    "application",
    "Application",
    "Project",
    "ProjectUtils",
    "Context",
    "Document",
    "Sequence",
    "Timeline",
  ]) {
    add({
      name: `${rootKey}.getActiveSequence`,
      accessType: "method",
      path: [rootKey, "getActiveSequence"],
    });
    add({
      name: `${rootKey}.getCurrentSequence`,
      accessType: "method",
      path: [rootKey, "getCurrentSequence"],
    });
    add({
      name: `${rootKey}.activeSequence`,
      accessType: "property",
      path: [rootKey, "activeSequence"],
    });
    add({
      name: `${rootKey}.currentSequence`,
      accessType: "property",
      path: [rootKey, "currentSequence"],
    });
    add({
      name: `${rootKey}.sequence`,
      accessType: "property",
      path: [rootKey, "sequence"],
    });
    add({
      name: `${rootKey}.getActiveTimeline`,
      accessType: "method",
      path: [rootKey, "getActiveTimeline"],
      note: "timeline_sequence_fallback",
    });
    add({
      name: `${rootKey}.activeTimeline`,
      accessType: "property",
      path: [rootKey, "activeTimeline"],
      note: "timeline_sequence_fallback",
    });
  }

  add({ name: "module.getActiveSequence", accessType: "method", path: ["getActiveSequence"] });
  add({ name: "module.getCurrentSequence", accessType: "method", path: ["getCurrentSequence"] });
  add({ name: "module.activeSequence", accessType: "property", path: ["activeSequence"] });
  add({ name: "module.currentSequence", accessType: "property", path: ["currentSequence"] });
  add({ name: "module.sequence", accessType: "property", path: ["sequence"] });

  for (const rootKey of ["app", "App", "application", "Application"]) {
    for (const projectContainerKey of ["project", "Project", "currentProject", "activeProject"]) {
      add({
        name: `${rootKey}.${projectContainerKey}.getActiveSequence`,
        accessType: "method",
        path: [rootKey, projectContainerKey, "getActiveSequence"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.getCurrentSequence`,
        accessType: "method",
        path: [rootKey, projectContainerKey, "getCurrentSequence"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.activeSequence`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "activeSequence"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.currentSequence`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "currentSequence"],
      });
      add({
        name: `${rootKey}.${projectContainerKey}.sequence`,
        accessType: "property",
        path: [rootKey, projectContainerKey, "sequence"],
      });
    }
  }

  appendDynamicSequenceCandidates(premiereModule, add);

  return definitions;
}

async function evaluateCandidateDefinitions(input: {
  root: UnknownRecord;
  rootLabel: string;
  definitions: EntrypointCandidateDefinition[];
  activeProject?: UnknownRecord | null;
}): Promise<CandidateEvaluation[]> {
  const evaluations: CandidateEvaluation[] = [];

  for (const definition of input.definitions) {
    evaluations.push(await evaluateCandidate({
      root: input.root,
      rootLabel: input.rootLabel,
      definition,
      activeProject: input.activeProject ?? null,
    }));
  }

  return evaluations;
}

async function evaluateCandidate(input: {
  root: UnknownRecord;
  rootLabel: string;
  definition: EntrypointCandidateDefinition;
  activeProject: UnknownRecord | null;
}): Promise<CandidateEvaluation> {
  const { root, rootLabel, definition, activeProject } = input;
  const resolvedPath = definition.path[0] === "__activeProject"
    ? definition.name
    : [rootLabel, ...definition.path].join(".");
  const path = definition.path[0] === "__activeProject"
    ? definition.path.slice(1)
    : definition.path;
  const parentPath = path.slice(0, -1);
  const propertyName = path[path.length - 1] ?? "";
  const parentValue = definition.path[0] === "__activeProject"
    ? activeProject
    : safeGetPath(root, parentPath);
  const parentObject = asRecord(parentValue);

  const report: EntrypointCandidateReport = {
    name: definition.name,
    accessType: definition.accessType,
    path: resolvedPath,
    available: false,
    invoked: false,
    resolved: false,
    error: null,
    valueKind: "undefined",
    note: definition.note ?? null,
  };

  if (!parentObject) {
    report.note = report.note ?? "parent_not_object";
    return {
      report,
      value: null,
    };
  }

  if (definition.accessType === "method") {
    const method = asFunction(safeGetProperty(parentObject, propertyName));
    report.available = Boolean(method);

    if (!method) {
      report.note = report.note ?? "method_not_available";
      return {
        report,
        value: null,
      };
    }

    try {
      report.invoked = true;
      const value = await Promise.resolve(method.apply(parentObject, definition.args ?? []));
      report.resolved = value !== null && value !== undefined;
      report.valueKind = getValueKind(value);
      return {
        report,
        value,
      };
    } catch (error) {
      report.error = toErrorMessage(error);
      report.note = report.note ?? "method_threw";
      return {
        report,
        value: null,
      };
    }
  }

  report.available = hasPropertyKey(parentObject, propertyName);
  if (!report.available) {
    report.note = report.note ?? "property_not_available";
    return {
      report,
      value: null,
    };
  }

  try {
    const value = parentObject[propertyName];
    report.resolved = value !== null && value !== undefined;
    report.valueKind = getValueKind(value);
    return {
      report,
      value,
    };
  } catch (error) {
    report.error = toErrorMessage(error);
    report.note = report.note ?? "property_getter_threw";
    return {
      report,
      value: null,
    };
  }
}

function pickFirstObjectResolution(evaluations: CandidateEvaluation[]): CandidateEvaluation | null {
  for (const evaluation of evaluations) {
    if (!evaluation.report.resolved) {
      continue;
    }

    if (asRecord(evaluation.value)) {
      return evaluation;
    }
  }

  return null;
}

function appendDynamicProjectCandidates(
  premiereModule: UnknownRecord,
  add: (definition: EntrypointCandidateDefinition) => void,
): void {
  for (const methodName of extractMethods(premiereModule)) {
    if (isActiveProjectMethodName(methodName)) {
      add({
        name: `module.${methodName}`,
        accessType: "method",
        path: [methodName],
        note: "dynamic_project_entrypoint",
      });
    }
  }

  for (const propertyName of safePropertyNames(premiereModule)) {
    if (isActiveProjectPropertyName(propertyName)) {
      add({
        name: `module.${propertyName}`,
        accessType: "property",
        path: [propertyName],
        note: "dynamic_project_entrypoint",
      });
    }
  }

  for (const rootKey of safePropertyNames(premiereModule)) {
    if (!isRelevantProjectRootKey(rootKey)) {
      continue;
    }

    const rootObject = asRecord(safeGetProperty(premiereModule, rootKey));
    if (!rootObject) {
      continue;
    }

    for (const methodName of extractMethods(rootObject)) {
      if (isActiveProjectMethodName(methodName)) {
        add({
          name: `${rootKey}.${methodName}`,
          accessType: "method",
          path: [rootKey, methodName],
          note: "dynamic_project_entrypoint",
        });
      }
    }

    for (const propertyName of safePropertyNames(rootObject)) {
      if (isActiveProjectPropertyName(propertyName)) {
        add({
          name: `${rootKey}.${propertyName}`,
          accessType: "property",
          path: [rootKey, propertyName],
          note: "dynamic_project_entrypoint",
        });
      }
    }
  }
}

function appendDynamicSequenceCandidates(
  premiereModule: UnknownRecord,
  add: (definition: EntrypointCandidateDefinition) => void,
): void {
  for (const methodName of extractMethods(premiereModule)) {
    if (isActiveSequenceMethodName(methodName)) {
      add({
        name: `module.${methodName}`,
        accessType: "method",
        path: [methodName],
        note: "dynamic_sequence_entrypoint",
      });
    }
  }

  for (const propertyName of safePropertyNames(premiereModule)) {
    if (isActiveSequencePropertyName(propertyName)) {
      add({
        name: `module.${propertyName}`,
        accessType: "property",
        path: [propertyName],
        note: "dynamic_sequence_entrypoint",
      });
    }
  }

  for (const rootKey of safePropertyNames(premiereModule)) {
    if (!isRelevantSequenceRootKey(rootKey)) {
      continue;
    }

    const rootObject = asRecord(safeGetProperty(premiereModule, rootKey));
    if (!rootObject) {
      continue;
    }

    for (const methodName of extractMethods(rootObject)) {
      if (isActiveSequenceMethodName(methodName)) {
        add({
          name: `${rootKey}.${methodName}`,
          accessType: "method",
          path: [rootKey, methodName],
          note: "dynamic_sequence_entrypoint",
        });
      }
    }

    for (const propertyName of safePropertyNames(rootObject)) {
      if (isActiveSequencePropertyName(propertyName)) {
        add({
          name: `${rootKey}.${propertyName}`,
          accessType: "property",
          path: [rootKey, propertyName],
          note: "dynamic_sequence_entrypoint",
        });
      }
    }
  }
}

function findActiveProjectRelatedEntrypoints(premiereModule: UnknownRecord): string[] {
  const result: string[] = [];

  const pushRelatedNames = (rootLabel: string, value: unknown): void => {
    const objectValue = asRecord(value);
    if (!objectValue) {
      return;
    }

    for (const methodName of extractMethods(objectValue)) {
      if (isActiveProjectRelatedName(methodName)) {
        result.push(`${rootLabel}.${methodName}()`);
      }
    }

    for (const propertyName of safePropertyNames(objectValue)) {
      if (isActiveProjectRelatedName(propertyName)) {
        result.push(`${rootLabel}.${propertyName}`);
      }
    }
  };

  pushRelatedNames("premierepro", premiereModule);

  for (const rootKey of safePropertyNames(premiereModule)) {
    if (!isRelevantProjectRootKey(rootKey)) {
      continue;
    }

    pushRelatedNames(rootKey, safeGetProperty(premiereModule, rootKey));
  }

  return Array.from(new Set(result)).sort();
}

function logAudioExportEntrypointDiagnostics(
  diagnostics: AudioExportEntrypointDiagnostics,
): void {
  console.info("[GLIFO] premierepro entrypoints", createEntrypointLogSummary(diagnostics));
}

function logAudioExportResolutionResult(
  diagnostics: AudioExportEntrypointDiagnostics,
): void {
  console.info("[GLIFO] premiere active context resolution", {
    resolvedProjectPath: diagnostics.resolvedProjectPath,
    resolvedSequencePath: diagnostics.resolvedSequencePath,
    projectCandidates: summarizeCandidateReports(diagnostics.projectCandidates),
    sequenceCandidates: summarizeCandidateReports(diagnostics.sequenceCandidates),
  });
}

function createEntrypointLogSummary(
  diagnostics: AudioExportEntrypointDiagnostics,
): UnknownRecord {
  return {
    topLevelKeys: diagnostics.topLevelKeys,
    hasProject: diagnostics.hasProject,
    hasApp: diagnostics.hasApp,
    hasCapitalApp: diagnostics.hasCapitalApp,
    hasProjectGetActiveProject: diagnostics.hasProjectGetActiveProject,
    activeProjectRelatedEntrypoints: diagnostics.activeProjectRelatedEntrypoints,
  };
}

function createActiveProjectMissingMessage(
  diagnostics: AudioExportEntrypointDiagnostics,
): string {
  const hasAvailableProjectCandidate = diagnostics.projectCandidates.some((candidate) => candidate.available);
  const prefix = hasAvailableProjectCandidate
    ? "No se pudo resolver un proyecto activo de Premiere."
    : "Premiere runtime disponible, pero no se encontró API de proyecto activo. Revisar entrypoints UXP.";

  return `${prefix} ${formatEntrypointDiagnosticSummary(diagnostics)}`;
}

function createActiveSequenceMissingMessage(
  diagnostics: AudioExportEntrypointDiagnostics,
): string {
  return [
    "No hay una secuencia activa en Premiere o no se pudo resolver desde UXP.",
    formatEntrypointDiagnosticSummary(diagnostics),
  ].join(" ");
}

function formatEntrypointDiagnosticSummary(
  diagnostics: AudioExportEntrypointDiagnostics,
): string {
  return [
    `top-level keys=[${formatList(diagnostics.topLevelKeys)}]`,
    `Project=${String(diagnostics.hasProject)}`,
    `app=${String(diagnostics.hasApp)}`,
    `Project.getActiveProject=${String(diagnostics.hasProjectGetActiveProject)}`,
    `active/current project=[${formatList(diagnostics.activeProjectRelatedEntrypoints)}]`,
    `project candidates=[${formatList(summarizeCandidateReports(diagnostics.projectCandidates))}]`,
    `sequence candidates=[${formatList(summarizeCandidateReports(diagnostics.sequenceCandidates))}]`,
  ].join("; ");
}

function summarizeCandidateReports(candidates: EntrypointCandidateReport[]): string[] {
  return candidates
    .filter((candidate) => candidate.available || candidate.resolved || candidate.error)
    .map((candidate) => {
      if (candidate.resolved) {
        return `${candidate.name}:resolved`;
      }

      if (candidate.error) {
        return `${candidate.name}:error:${candidate.error}`;
      }

      return `${candidate.name}:available`;
    });
}

function formatList(values: string[], maxItems = 10): string {
  if (values.length === 0) {
    return "(none)";
  }

  const shown = values.slice(0, maxItems);
  const suffix = values.length > maxItems ? `, +${values.length - maxItems} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function filterRuntimeMethodNames(methods: string[]): string[] {
  const noisyMethods = new Set([
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
  ]);

  return methods.filter((method) => !noisyMethods.has(method));
}

function isRelevantProjectRootKey(rootKey: string): boolean {
  return /^(app|application|project|projects|projectutils|context|document)$/i.test(rootKey);
}

function isRelevantSequenceRootKey(rootKey: string): boolean {
  return /^(app|application|project|projects|projectutils|context|document|sequence|timeline)$/i.test(rootKey);
}

function isActiveProjectMethodName(methodName: string): boolean {
  return /^get(Active|Current)(Project|Document)$/i.test(methodName);
}

function isActiveProjectPropertyName(propertyName: string): boolean {
  return /^(active|current)?(Project|Document)$/i.test(propertyName) ||
    /^(project|document)$/i.test(propertyName);
}

function isActiveProjectRelatedName(name: string): boolean {
  return /project|document/i.test(name) && /active|current|get|project|document/i.test(name);
}

function isActiveSequenceMethodName(methodName: string): boolean {
  return /^get(Active|Current)(Sequence|Timeline)$/i.test(methodName);
}

function isActiveSequencePropertyName(propertyName: string): boolean {
  return /^(active|current)?(Sequence|Timeline)$/i.test(propertyName) ||
    /^(sequence|timeline)$/i.test(propertyName);
}

async function assertValidInOutRange(activeSequence: UnknownRecord): Promise<void> {
  const getInPoint = asFunction(activeSequence.getInPoint);
  const getOutPoint = asFunction(activeSequence.getOutPoint);
  if (!getInPoint || !getOutPoint) {
    throw new AudioExportError(
      "in_out_missing",
      "Marcá un rango In/Out en la timeline o usá Transcribir archivo.",
    );
  }

  let inPoint: unknown;
  let outPoint: unknown;
  let endPoint: unknown;
  try {
    inPoint = await Promise.resolve(getInPoint.call(activeSequence));
    outPoint = await Promise.resolve(getOutPoint.call(activeSequence));
    const getEndTime = asFunction(activeSequence.getEndTime);
    endPoint = getEndTime ? await Promise.resolve(getEndTime.call(activeSequence)) : undefined;
  } catch (error) {
    throw new AudioExportError(
      "in_out_missing",
      "Marcá un rango In/Out en la timeline o usá Transcribir archivo.",
      { cause: error },
    );
  }
  const validation = validateInOutRange(inPoint, outPoint, endPoint);
  if (!validation.valid) {
    throw new AudioExportError(
      "in_out_missing",
      "Marcá un rango In/Out en la timeline o usá Transcribir archivo.",
      validation,
    );
  }
}

async function resolveWavPresetPath(localFileSystem: UnknownRecord): Promise<string> {
  const getPluginFolder = asFunction(localFileSystem.getPluginFolder);
  if (!getPluginFolder) {
    throw new AudioExportError(
      "wav_preset_missing",
      `No se pudo acceder al preset WAV ${WAV_PRESET_RELATIVE_PATH}. Usá Transcribir archivo.`,
    );
  }

  try {
    const pluginFolder = asRecord(await Promise.resolve(getPluginFolder.call(localFileSystem)));
    const getEntry = asFunction(pluginFolder?.getEntry);
    if (!pluginFolder || !getEntry) {
      throw new Error("getPluginFolder no devolvió un Folder usable");
    }

    const presetEntry = await Promise.resolve(getEntry.call(pluginFolder, WAV_PRESET_RELATIVE_PATH));
    const presetPath = await getNativePath(localFileSystem, presetEntry);
    if (!presetPath) {
      throw new Error("El preset no expone nativePath");
    }

    return presetPath;
  } catch (error) {
    throw new AudioExportError(
      "wav_preset_missing",
      `No se encontró el preset WAV en plugin/${WAV_PRESET_RELATIVE_PATH}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }
}

async function createTemporaryWavFile(localFileSystem: UnknownRecord): Promise<{
  mediaPath: string;
  filename: string;
  fileEntry: unknown;
}> {
  const getTemporaryFolder = asFunction(localFileSystem.getTemporaryFolder);
  if (!getTemporaryFolder) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      "No se pudo crear el archivo WAV temporal en UXP. Usá Transcribir archivo.",
    );
  }

  let tempFolderValue: unknown;
  try {
    tempFolderValue = await Promise.resolve(getTemporaryFolder.call(localFileSystem));
  } catch (error) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      `No se pudo crear el archivo WAV temporal en UXP: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }

  const tempFolder = asRecord(tempFolderValue);
  const createFile = asFunction(tempFolder?.createFile);
  if (!tempFolder || !createFile) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      "La carpeta temporal UXP no permite crear archivos. Usá Transcribir archivo.",
    );
  }

  const filename = `glifo-${Date.now()}.wav`;
  let fileEntry: unknown;
  try {
    fileEntry = await Promise.resolve(createFile.call(tempFolder, filename, { overwrite: true }));
  } catch (error) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      `No se pudo crear el WAV temporal: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }
  const mediaPath = await getNativePath(localFileSystem, fileEntry);
  if (!mediaPath) {
    throw new AudioExportError(
      "premiere_runtime_unavailable",
      "El archivo WAV temporal no expone nativePath. Usá Transcribir archivo.",
    );
  }

  return {
    mediaPath,
    filename,
    fileEntry,
  };
}

function createTemporaryWavCleanup(input: {
  requireFn: UnknownFn;
  fileEntry: unknown;
  mediaPath: string;
  filename: string;
}): () => Promise<void> {
  let cleanupStarted = false;

  return async (): Promise<void> => {
    if (cleanupStarted) {
      return;
    }

    cleanupStarted = true;

    try {
      const result = await deleteTemporaryWavFile(input);
      if (result.ok) {
        console.info("[GLIFO] temporary-wav:cleanup-ok", {
          filename: input.filename,
          method: result.method,
        });
        return;
      }

      console.warn("[GLIFO] temporary-wav:cleanup-error", {
        filename: input.filename,
        error: result.error,
      });
    } catch (error) {
      console.warn("[GLIFO] temporary-wav:cleanup-error", {
        filename: input.filename,
        error: toErrorMessage(error),
      });
    }
  };
}

async function deleteTemporaryWavFile(input: {
  requireFn: UnknownFn;
  fileEntry: unknown;
  mediaPath: string;
  filename: string;
}): Promise<{ ok: true; method: string } | { ok: false; error: string }> {
  if (!/^glifo-\d+\.wav$/i.test(input.filename)) {
    return {
      ok: false,
      error: "unexpected_temporary_wav_filename",
    };
  }

  const fileEntryObject = asRecord(input.fileEntry);
  for (const methodName of ["delete", "remove"]) {
    const deleteMethod = asFunction(fileEntryObject?.[methodName]);
    if (!fileEntryObject || !deleteMethod) {
      continue;
    }

    try {
      await Promise.resolve(deleteMethod.call(fileEntryObject));
      return {
        ok: true,
        method: `fileEntry.${methodName}`,
      };
    } catch (error) {
      console.warn("[GLIFO] temporary-wav:file-entry-cleanup-error", {
        filename: input.filename,
        method: `fileEntry.${methodName}`,
        error: toErrorMessage(error),
      });
    }
  }

  try {
    const fsModule = asRecord(input.requireFn("fs"));
    const unlinkSync = asFunction(fsModule?.unlinkSync);
    if (fsModule && unlinkSync) {
      unlinkSync.call(fsModule, input.mediaPath);
      return {
        ok: true,
        method: "fs.unlinkSync",
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error),
    };
  }

  return {
    ok: false,
    error: "no_supported_delete_method",
  };
}

async function getEncoderManager(premiereModule: UnknownRecord): Promise<UnknownRecord> {
  const encoderManagerStatic = asRecord(premiereModule.EncoderManager);
  const getManager = asFunction(encoderManagerStatic?.getManager);
  if (!encoderManagerStatic || !getManager) {
    throw new AudioExportError(
      "encoder_manager_unavailable",
      "EncoderManager no está disponible en este runtime de Premiere. Usá Transcribir archivo.",
    );
  }

  let encoderValue: unknown;
  try {
    encoderValue = await Promise.resolve(getManager.call(encoderManagerStatic));
  } catch (error) {
    throw new AudioExportError(
      "encoder_manager_unavailable",
      `EncoderManager no está disponible: ${toErrorMessage(error)}. Usá Transcribir archivo.`,
      { cause: error },
    );
  }

  const encoder = asRecord(encoderValue);
  if (!encoder) {
    throw new AudioExportError(
      "encoder_manager_unavailable",
      "EncoderManager no devolvió un manager usable. Usá Transcribir archivo.",
    );
  }

  return encoder;
}

function getImmediateExportType(premiereModule: UnknownRecord): unknown {
  const constants = getConstants(premiereModule);
  const exportType = asRecord(constants?.ExportType);
  if (!exportType || exportType.IMMEDIATELY === undefined) {
    throw new AudioExportError(
      "encoder_manager_unavailable",
      "Constants.ExportType.IMMEDIATELY no está disponible. Usá Transcribir archivo.",
    );
  }

  return exportType.IMMEDIATELY;
}

function createEncoderRenderMonitor(input: {
  premiereModule: UnknownRecord;
  encoder: UnknownRecord;
  outputPath: string;
  presetPath: string;
}): {
  promise: Promise<EncoderEventOutcome>;
  dispose: () => void;
  diagnostics: EncoderRenderDiagnostics;
} {
  const { premiereModule, encoder, outputPath, presetPath } = input;
  const eventRuntime = createEncoderEventRuntimeDiagnostics(premiereModule, encoder);
  const diagnostics: EncoderRenderDiagnostics = {
    outputPath,
    presetPath,
    timeoutMs: RENDER_TIMEOUT_MS,
    pollMs: RENDER_FILE_POLL_MS,
    exportSequenceReturnValue: null,
    eventsRegistered: [],
    eventRegistrationErrors: [],
    eventRuntime,
    fileExists: false,
    fileSize: null,
    completionSource: null,
    lastEvent: null,
  };

  const eventManager = asRecord(premiereModule.EventManager);
  const encoderManagerStatic = asRecord(premiereModule.EncoderManager);
  const listenerApis = getEncoderListenerApis({
    eventManager,
    encoderManagerStatic,
    encoder,
  });

  const eventNames = getEncoderEventNames(premiereModule);
  const listeners: Array<{
    target: UnknownRecord;
    remove: UnknownFn;
    name: unknown;
    handler: UnknownFn;
    registration: string;
  }> = [];
  let settled = false;

  const cleanup = (): void => {
    for (const listener of listeners) {
      try {
        listener.remove.call(listener.target, listener.name, listener.handler);
      } catch (error) {
        console.warn("[GLIFO] encoder:event-listener-cleanup-error", {
          registration: listener.registration,
          error: toErrorMessage(error),
        });
        // Listener cleanup must not mask the render result.
      }
    }
    listeners.length = 0;
  };

  const promise = new Promise<EncoderEventOutcome>((resolve) => {
    const settle = (outcome: EncoderEventOutcome): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      diagnostics.lastEvent = {
        kind: outcome.kind,
        source: outcome.source,
        eventName: outcome.eventName,
        message: outcome.message,
        event: summarizeEvent(outcome.event),
      };
      resolve(outcome);
    };

    registerEncoderEventListeners({
      listenerApis,
      eventNames,
      listeners,
      diagnostics,
      settle,
    });
  });

  return {
    promise,
    dispose: cleanup,
    diagnostics,
  };
}

async function waitForEncoderRenderOrFile(input: {
  requireFn: UnknownFn;
  fileEntry: unknown;
  mediaPath: string;
  monitor: ReturnType<typeof createEncoderRenderMonitor>;
}): Promise<EncoderRenderCompletionSource> {
  const { requireFn, fileEntry, mediaPath, monitor } = input;
  const diagnostics = monitor.diagnostics;
  const startedAt = Date.now();
  const eventSignal = monitor.promise.then((outcome) => ({
    type: "event" as const,
    outcome,
  }));

  while (Date.now() - startedAt <= RENDER_TIMEOUT_MS) {
    const fileStatus = await readFileStatus({ requireFn, fileEntry, mediaPath });
    updateRenderFileStatus(diagnostics, fileStatus);

    console.info("[GLIFO] encoder:file-poll", {
      outputPath: diagnostics.outputPath,
      fileExists: diagnostics.fileExists,
      fileSize: diagnostics.fileSize,
      elapsedMs: Date.now() - startedAt,
    });

    if (fileStatus.exists && fileStatus.size !== null && fileStatus.size > 0) {
      diagnostics.completionSource = "file";
      console.info("[GLIFO] encoder:file-ready-before-event", {
        outputPath: diagnostics.outputPath,
        fileSize: diagnostics.fileSize,
        elapsedMs: Date.now() - startedAt,
      });
      return "file";
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = RENDER_TIMEOUT_MS - elapsedMs;
    if (remainingMs <= 0) {
      break;
    }

    const waitMs = Math.min(RENDER_FILE_POLL_MS, remainingMs);
    const result = await Promise.race([
      eventSignal,
      delay(waitMs).then(() => ({ type: "poll" as const })),
    ]);

    if (result.type === "event") {
      const outcome = result.outcome;
      diagnostics.lastEvent = {
        kind: outcome.kind,
        source: outcome.source,
        eventName: outcome.eventName,
        message: outcome.message,
        event: summarizeEvent(outcome.event),
      };

      console.info("[GLIFO] encoder:event", {
        outputPath: diagnostics.outputPath,
        kind: outcome.kind,
        source: outcome.source,
        eventName: outcome.eventName,
        event: summarizeEvent(outcome.event),
      });

      const latestFileStatus = await readFileStatus({ requireFn, fileEntry, mediaPath });
      updateRenderFileStatus(diagnostics, latestFileStatus);
      if (latestFileStatus.exists && latestFileStatus.size !== null && latestFileStatus.size > 0) {
        diagnostics.completionSource = "file";
        console.warn("[GLIFO] encoder:event-with-ready-file", {
          outputPath: diagnostics.outputPath,
          kind: outcome.kind,
          eventName: outcome.eventName,
          fileSize: diagnostics.fileSize,
        });
        return "file";
      }

      if (outcome.kind === "complete") {
        diagnostics.completionSource = "event";
        return "event";
      }

      if (outcome.kind === "error") {
        throw new AudioExportError(
          "encoder_render_error",
          createEncoderRenderEventFailureMessage("error", diagnostics),
          diagnostics,
        );
      }

      throw new AudioExportError(
        "encoder_render_cancelled",
        createEncoderRenderEventFailureMessage("cancel", diagnostics),
        diagnostics,
      );
    }
  }

  const finalFileStatus = await readFileStatus({ requireFn, fileEntry, mediaPath });
  updateRenderFileStatus(diagnostics, finalFileStatus);
  if (finalFileStatus.exists && finalFileStatus.size !== null && finalFileStatus.size > 0) {
    diagnostics.completionSource = "file";
    console.info("[GLIFO] encoder:file-ready-at-timeout-boundary", {
      outputPath: diagnostics.outputPath,
      fileSize: diagnostics.fileSize,
    });
    return "file";
  }

  throw new AudioExportError(
    "encoder_render_timeout",
    createEncoderRenderTimeoutMessage(diagnostics),
    diagnostics,
  );
}

function createEncoderEventRuntimeDiagnostics(
  premiereModule: UnknownRecord,
  encoder: UnknownRecord,
): EncoderEventRuntimeDiagnostics {
  const eventNames = getEncoderEventNames(premiereModule);
  const eventManager = asRecord(premiereModule.EventManager);
  const encoderManagerStatic = asRecord(premiereModule.EncoderManager);
  const constants = getConstants(premiereModule);
  const encoderEvent = asRecord(constants?.EncoderEvent);
  const listenerApis = getEncoderListenerApis({
    eventManager,
    encoderManagerStatic,
    encoder,
  });

  return {
    eventNames: {
      complete: eventNames.complete.map(formatUnknownValue),
      error: eventNames.error.map(formatUnknownValue),
      cancel: eventNames.cancel.map(formatUnknownValue),
    },
    hasEventManager: Boolean(eventManager),
    eventManagerMethods: filterRuntimeMethodNames(extractMethods(eventManager)),
    encoderManagerMethods: filterRuntimeMethodNames(extractMethods(encoderManagerStatic)),
    encoderMethods: filterRuntimeMethodNames(extractMethods(encoder)),
    constantsEncoderEventKeys: safePropertyNames(encoderEvent),
    listenerApisAvailable: listenerApis.map((api) => `${api.targetLabel}.${api.addMethodName}`),
  };
}

function getEncoderListenerApis(input: {
  eventManager: UnknownRecord | null;
  encoderManagerStatic: UnknownRecord | null;
  encoder: UnknownRecord;
}): Array<{
  targetLabel: string;
  target: UnknownRecord;
  addMethodName: string;
  add: UnknownFn;
  removeMethodName: string;
  remove: UnknownFn;
}> {
  const apis: Array<{
    targetLabel: string;
    target: UnknownRecord;
    addMethodName: string;
    add: UnknownFn;
    removeMethodName: string;
    remove: UnknownFn;
  }> = [];

  const maybeAddApi = (
    targetLabel: string,
    target: UnknownRecord | null,
    addMethodName: string,
    removeMethodName: string,
  ): void => {
    const add = asFunction(target?.[addMethodName]);
    const remove = asFunction(target?.[removeMethodName]);
    if (!target || !add || !remove) {
      return;
    }

    apis.push({
      targetLabel,
      target,
      addMethodName,
      add,
      removeMethodName,
      remove,
    });
  };

  maybeAddApi(
    "EventManager",
    input.eventManager,
    "addGlobalEventListener",
    "removeGlobalEventListener",
  );
  maybeAddApi("EventManager", input.eventManager, "addEventListener", "removeEventListener");
  maybeAddApi(
    "EncoderManager",
    input.encoderManagerStatic,
    "addEventListener",
    "removeEventListener",
  );
  maybeAddApi("EncoderManager", input.encoderManagerStatic, "on", "off");
  maybeAddApi("EncoderManager", input.encoderManagerStatic, "addListener", "removeListener");
  maybeAddApi("encoder", input.encoder, "addEventListener", "removeEventListener");
  maybeAddApi("encoder", input.encoder, "on", "off");
  maybeAddApi("encoder", input.encoder, "addListener", "removeListener");

  return apis;
}

function registerEncoderEventListeners(input: {
  listenerApis: ReturnType<typeof getEncoderListenerApis>;
  eventNames: ReturnType<typeof getEncoderEventNames>;
  listeners: Array<{
    target: UnknownRecord;
    remove: UnknownFn;
    name: unknown;
    handler: UnknownFn;
    registration: string;
  }>;
  diagnostics: EncoderRenderDiagnostics;
  settle: (outcome: EncoderEventOutcome) => void;
}): void {
  const registerKind = (kind: EncoderEventKind, eventNames: unknown[]): void => {
    for (const listenerApi of input.listenerApis) {
      for (const eventName of eventNames) {
        const eventLabel = formatUnknownValue(eventName);
        const registration = `${listenerApi.targetLabel}.${listenerApi.addMethodName}(${eventLabel})`;
        const handler = ((event?: unknown) => {
          const message = extractEventMessage(event);
          input.settle({
            kind,
            source: `${listenerApi.targetLabel}.${listenerApi.addMethodName}`,
            eventName: eventLabel,
            event,
            message,
          });
        }) as UnknownFn;

        try {
          listenerApi.add.call(listenerApi.target, eventName, handler);
          input.listeners.push({
            target: listenerApi.target,
            remove: listenerApi.remove,
            name: eventName,
            handler,
            registration,
          });
          input.diagnostics.eventsRegistered.push(registration);
        } catch (error) {
          input.diagnostics.eventRegistrationErrors.push(
            `${registration}: ${toErrorMessage(error)}`,
          );
        }
      }
    }
  };

  registerKind("complete", input.eventNames.complete);
  registerKind("error", input.eventNames.error);
  registerKind("cancel", input.eventNames.cancel);
}

function updateRenderFileStatus(
  diagnostics: EncoderRenderDiagnostics,
  fileStatus: FileStatus,
): void {
  diagnostics.fileExists = fileStatus.exists;
  diagnostics.fileSize = fileStatus.size;
}

function createEncoderExportFailedMessage(diagnostics: EncoderRenderDiagnostics): string {
  return [
    "EncoderManager.exportSequence devolvió false y no inició el export.",
    formatEncoderRenderDiagnosticSummary(diagnostics),
    "Usá Transcribir archivo.",
  ].join(" ");
}

function createEncoderRenderTimeoutMessage(diagnostics: EncoderRenderDiagnostics): string {
  return [
    `El export de audio no terminó en ${Math.round(diagnostics.timeoutMs / 1000)} segundos.`,
    formatEncoderRenderDiagnosticSummary(diagnostics),
    "Usá Transcribir archivo.",
  ].join(" ");
}

function createEncoderRenderEventFailureMessage(
  kind: "error" | "cancel",
  diagnostics: EncoderRenderDiagnostics,
): string {
  const eventMessage = diagnostics.lastEvent?.message || "sin detalle";
  const prefix = kind === "error"
    ? `EncoderManager reportó error al exportar: ${eventMessage}.`
    : "El export de audio fue cancelado.";

  return [
    prefix,
    formatEncoderRenderDiagnosticSummary(diagnostics),
    "Usá Transcribir archivo.",
  ].join(" ");
}

function formatEncoderRenderDiagnosticSummary(diagnostics: EncoderRenderDiagnostics): string {
  return [
    `outputPath=${diagnostics.outputPath}`,
    `presetPath=${diagnostics.presetPath}`,
    `exportSequenceReturnValue=${formatUnknownValue(diagnostics.exportSequenceReturnValue)}`,
    `eventsRegistered=[${formatList(diagnostics.eventsRegistered)}]`,
    `fileExists=${String(diagnostics.fileExists)}`,
    `fileSize=${diagnostics.fileSize === null ? "(unknown)" : String(diagnostics.fileSize)}`,
  ].join("; ");
}

function getEncoderEventNames(premiereModule: UnknownRecord): {
  complete: unknown[];
  error: unknown[];
  cancel: unknown[];
} {
  const constants = getConstants(premiereModule);
  const encoderEvent = asRecord(constants?.EncoderEvent);

  return {
    complete: dedupeEventNames([
      encoderEvent?.RENDER_COMPLETE,
      "EVENT_RENDER_COMPLETE",
    ]),
    error: dedupeEventNames([
      encoderEvent?.RENDER_ERROR,
      "EVENT_RENDER_ERROR",
    ]),
    cancel: dedupeEventNames([
      encoderEvent?.RENDER_CANCEL,
      "EVENT_RENDER_CANCEL",
    ]),
  };
}

async function verifyExportedFileReady(input: {
  requireFn: UnknownFn;
  fileEntry: unknown;
  mediaPath: string;
}): Promise<void> {
  const startedAt = Date.now();
  let lastSize: number | null = null;
  let sawFile = false;

  while (Date.now() - startedAt <= FILE_READY_TIMEOUT_MS) {
    const fileStatus = await readFileStatus(input);
    if (fileStatus.exists) {
      sawFile = true;
      lastSize = fileStatus.size;
      if (fileStatus.size !== null && fileStatus.size > 0) {
        return;
      }
    }

    await delay(FILE_READY_POLL_MS);
  }

  if (!sawFile) {
    throw new AudioExportError(
      "exported_file_missing",
      "El WAV exportado no existe o no es legible. Usá Transcribir archivo.",
      { mediaPath: input.mediaPath },
    );
  }

  throw new AudioExportError(
    "exported_file_empty",
    "El WAV exportado está vacío. Usá Transcribir archivo.",
    { mediaPath: input.mediaPath, size: lastSize },
  );
}

async function readFileStatus(input: {
  requireFn: UnknownFn;
  fileEntry: unknown;
  mediaPath: string;
}): Promise<FileStatus> {
  const entryObject = asRecord(input.fileEntry);
  const getMetadata = asFunction(entryObject?.getMetadata);
  if (entryObject && getMetadata) {
    try {
      const metadata = asRecord(await Promise.resolve(getMetadata.call(entryObject)));
      const size = asNumber(metadata?.size);
      if (size !== null) {
        return {
          exists: true,
          size,
        };
      }
    } catch {
      // Fall back to the UXP fs module below.
    }
  }

  try {
    const fsModule = asRecord(input.requireFn("fs"));
    const lstatSync = asFunction(fsModule?.lstatSync);
    if (!fsModule || !lstatSync) {
      return {
        exists: false,
        size: null,
      };
    }

    const stats = asRecord(lstatSync.call(fsModule, input.mediaPath));
    const size = asNumber(stats?.size);
    return {
      exists: true,
      size,
    };
  } catch {
    return {
      exists: false,
      size: null,
    };
  }
}

async function getNativePath(
  localFileSystem: UnknownRecord,
  entry: unknown,
): Promise<string | null> {
  const entryObject = asRecord(entry);
  const entryNativePath = asString(entryObject?.nativePath);
  if (entryNativePath) {
    return entryNativePath;
  }

  const getNativePathFn = asFunction(localFileSystem.getNativePath);
  if (!getNativePathFn) {
    return null;
  }

  return asString(await Promise.resolve(getNativePathFn.call(localFileSystem, entry)));
}

function getConstants(premiereModule: UnknownRecord): UnknownRecord | null {
  return asRecord(premiereModule.Constants) ?? asRecord(premiereModule.constants);
}

function safeGetPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;

  for (const segment of path) {
    const currentObject = asRecord(current);
    if (!currentObject) {
      return undefined;
    }

    current = safeGetProperty(currentObject, segment);
  }

  return current;
}

function hasPropertyKey(target: UnknownRecord, key: string): boolean {
  try {
    return key in target;
  } catch {
    return false;
  }
}

function safeGetProperty(target: unknown, key: string): unknown {
  const targetObject = asRecord(target);
  if (!targetObject) {
    return undefined;
  }

  try {
    return targetObject[key];
  } catch {
    return undefined;
  }
}

function safeEnumerableKeys(value: unknown): string[] {
  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  try {
    return Object.keys(valueObject).sort();
  } catch {
    return [];
  }
}

function safePropertyNames(value: unknown): string[] {
  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  const names = new Set<string>();

  try {
    for (const key of Object.keys(valueObject)) {
      names.add(key);
    }
  } catch {
    // Continue with getOwnPropertyNames below.
  }

  try {
    for (const key of Object.getOwnPropertyNames(valueObject)) {
      names.add(key);
    }
  } catch {
    // UXP host objects may reject reflection; use whatever was collected.
  }

  return Array.from(names).sort();
}

function extractMethods(value: unknown): string[] {
  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  const methods = new Set<string>();

  for (const key of safePropertyNames(valueObject)) {
    if (key === "constructor" || key === "prototype") {
      continue;
    }

    if (typeof safeGetProperty(valueObject, key) === "function") {
      methods.add(key);
    }
  }

  try {
    const prototype = Object.getPrototypeOf(valueObject) as unknown;
    const prototypeObject = asRecord(prototype);
    if (prototypeObject) {
      for (const key of safePropertyNames(prototypeObject)) {
        if (key === "constructor") {
          continue;
        }

        if (typeof safeGetProperty(valueObject, key) === "function") {
          methods.add(key);
        }
      }
    }
  } catch {
    // Reflection on native UXP objects can fail; own methods are enough.
  }

  return Array.from(methods).sort();
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

function readTickSeconds(value: unknown): number | null {
  const valueObject = asRecord(value);
  const seconds = asNumber(valueObject?.seconds);
  if (seconds !== null) {
    return seconds;
  }

  return null;
}

function isNearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}

function dedupeEventNames(values: unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function summarizeEvent(event: unknown): unknown {
  if (!event || typeof event !== "object") {
    return event ?? null;
  }

  const eventObject = event as UnknownRecord;
  const summary: UnknownRecord = {};
  for (const key of Object.keys(eventObject).slice(0, 12)) {
    const value = eventObject[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    }
  }

  return summary;
}

function extractEventMessage(event: unknown): string {
  if (event instanceof Error) {
    return event.message;
  }

  if (typeof event === "string") {
    return event;
  }

  const eventObject = asRecord(event);
  if (!eventObject) {
    return "";
  }

  const candidates = [
    eventObject.message,
    eventObject.error,
    eventObject.reason,
    eventObject.details,
    eventObject.status,
  ];

  return candidates
    .map((value) => typeof value === "string" ? value.trim() : "")
    .find((value) => value.length > 0) ?? "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): UnknownRecord | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
