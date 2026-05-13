import type {
  SelectedClipInfo,
  SelectedPremiereItem,
  SelectionSource,
} from "../types/premiere";

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

type EntrypointCategory = "project" | "sequence" | "selection";
type EntrypointAccessType = "method" | "property";
type SelectionCandidateKind = "timeline" | "project_panel" | "unknown";

interface SerializableModuleAccess {
  hasRequirePremierePro: boolean;
  premiereModuleLoaded: boolean;
  requireError: string | null;
  premiereModuleKeys: string[];
}

interface ObjectInspection {
  exists: boolean;
  jsType: string;
  isArray: boolean;
  arrayLength: number | null;
  ownKeys: string[];
  methods: string[];
}

interface ModuleExportProbe {
  name: string;
  kind: "class" | "function" | "object" | "array" | "primitive" | "undefined";
  info: ObjectInspection;
}

type ExportValueKind = ModuleExportProbe["kind"];

interface KeywordMatch {
  keyword: string;
  names: string[];
}

interface SubObjectInspection {
  path: string;
  kind: ExportValueKind;
  ownKeys: string[];
  methods: string[];
  keywordMatches: KeywordMatch[];
}

export interface RelevantExportInspection {
  name: string;
  exists: boolean;
  kind: ExportValueKind;
  ownKeys: string[];
  methods: string[];
  staticPropertyNames: string[];
  staticMethodNames: string[];
  prototypePropertyNames: string[];
  prototypeMethodNames: string[];
  accessibleStaticMembers: SubObjectInspection[];
  keywordMatches: KeywordMatch[];
}

interface EntrypointCandidateReport {
  name: string;
  category: EntrypointCategory;
  accessType: EntrypointAccessType;
  selectionKind: SelectionCandidateKind;
  path: string;
  available: boolean;
  invoked: boolean;
  resolved: boolean;
  parentInfo: ObjectInspection | null;
  valueInfo: ObjectInspection | null;
  parentMethods: string[];
  error: string | null;
  note: string | null;
}

interface TrackItemCandidateProbe {
  index: number;
  info: ObjectInspection;
  hasGetProjectItem: boolean;
  projectItemResolutionMethod: string | null;
  projectItemResolved: boolean;
  projectItemInfo: ObjectInspection | null;
}

interface ProjectItemCandidateProbe {
  index: number;
  info: ObjectInspection;
}

interface SelectionStepReport {
  hasMethod: boolean;
  objectInfo: ObjectInspection | null;
  rawResultInfo: ObjectInspection | null;
  extractionMethod: string | null;
  count: number;
}

interface MediaPathObjectAudit {
  label: string;
  exists: boolean;
  kind: ExportValueKind;
  ownKeys: string[];
  methods: string[];
  staticKeys: string[];
  prototypeMethods: string[];
  keywordMatches: KeywordMatch[];
}

interface MediaPathDiagnosticsReport {
  started: boolean;
  resolved: boolean;
  resolvedPath: string | null;
  resolvedMethod: string | null;
  attempts: string[];
  candidateObjects: MediaPathObjectAudit[];
  bestCandidateObject: string | null;
  projectTraversalMethods: string[];
  projectTraversalObjects: MediaPathObjectAudit[];
  projectUtilsMethods: string[];
  projectViewIds: string[];
  projectViewObjects: MediaPathObjectAudit[];
  pathSignalObjects: string[];
  comparison: {
    timelineProjectItemMethods: string[];
    projectPanelItemMethods: string[];
    timelineKeywordMatches: string[];
    projectPanelKeywordMatches: string[];
    richerSource: "timeline" | "project_panel" | "equal" | "unknown";
  };
  runtimeConclusion: string | null;
  recommendedNextStep: string | null;
  audioExportDiagnostics: {
    started: boolean;
    sequenceMethods: string[];
    projectMethods: string[];
    projectUtilsMethods: string[];
    projectStaticMethods: string[];
    trackItemMethods: string[];
    timelineProjectItemMethods: string[];
    projectPanelProjectItemMethods: string[];
    keywordMatches: string[];
    actionMethods: string[];
    directExportCandidates: string[];
    subsequenceCandidates: string[];
    routeOptions: {
      viableFromUxpDirect: string[];
      viableIndirectHandoff: string[];
      notViable: string[];
    };
    routeStatus: "viable_direct" | "viable_indirect" | "not_found";
    chosenRoute: string | null;
    conclusion: string | null;
    recommendedNextStep: string | null;
    externalRouteTried: string | null;
    externalRouteReason: string | null;
    externalRouteResult: string | null;
    externalRoutePath: string | null;
    externalRouteExists: boolean | null;
    externalRouteConclusion: string | null;
    externalRouteNextRecommendation: string | null;
    subsequenceProbe: {
      attempted: boolean;
      createSubsequenceAvailable: boolean;
      createSubsequenceArity: number | null;
      createSubsequenceSignature: string | null;
      invocationTried: string[];
      invocationUsed: string | null;
      invocationError: string | null;
      subsequenceCreated: boolean;
      subsequenceReturnType: string;
      subsequenceName: string | null;
      subsequenceId: string | null;
      subsequenceDurationMs: number | null;
      subsequenceOwnKeys: string[];
      subsequenceMethods: string[];
      subsequenceKeywordMatches: string[];
      exportCandidatesFromSubsequence: string[];
      richerThanActiveSequence: boolean | null;
      actionProbeTried: string[];
      actionProbeResult: string | null;
      actionProbeError: string | null;
      actionNextRecommendation: string | null;
      transactionProbeTried: string[];
      transactionProbeResult: string | null;
      transactionProbeError: string | null;
      transactionProbeConclusion: string | null;
      transactionNextRecommendation: string | null;
      observableActionTried: string | null;
      observableBefore: string | null;
      observableAfter: string | null;
      observableChanged: boolean | null;
      observableConclusion: string | null;
      observableNextRecommendation: string | null;
      outputProbeTried: string[];
      outputProbeResult: string | null;
      outputProbeError: string | null;
      outputProbePath: string | null;
      outputProbeExists: boolean | null;
      outputProbeConclusion: string | null;
      outputNextRecommendation: string | null;
      conclusion: string | null;
    };
  };
}

export interface PremiereEntrypointsDiagnostics {
  createdAt: string;
  moduleAccess: SerializableModuleAccess;
  exportInventory: ModuleExportProbe[];
  relevantExportInspection: RelevantExportInspection[];
  projectCandidates: EntrypointCandidateReport[];
  sequenceCandidates: EntrypointCandidateReport[];
  selectionCandidates: EntrypointCandidateReport[];
  promisingCandidate: string | null;
  failureReason: string | null;
}

export interface SelectionProbeReport {
  createdAt: string;
  moduleAccess: SerializableModuleAccess;
  projectInfo: {
    projectStaticInfo: ObjectInspection | null;
    hasGetActiveProject: boolean;
    activeProjectResolved: boolean;
    activeProjectInfo: ObjectInspection | null;
    resolutionPath: string | null;
  };
  sequenceInfo: {
    hasGetActiveSequence: boolean;
    sequenceResolved: boolean;
    sequenceInfo: ObjectInspection | null;
    resolutionPath: string | null;
  };
  timelineSelection: SelectionStepReport;
  projectPanelSelection: SelectionStepReport;
  candidateTrackItems: TrackItemCandidateProbe[];
  candidateProjectItems: ProjectItemCandidateProbe[];
  clipProjectItemCast: {
    available: boolean;
    attempted: boolean;
    succeeded: boolean;
    resultInfo: ObjectInspection | null;
    reason: string | null;
  };
  chosenResult: {
    source: SelectionSource | null;
    selectedClipInfo: SelectedClipInfo | null;
  };
  entrypointSummary: {
    promisingCandidate: string | null;
    projectCandidatesTried: number;
    sequenceCandidatesTried: number;
    selectionCandidatesTried: number;
  };
  mediaPathDiagnostics: MediaPathDiagnosticsReport;
  failureReason: string | null;
}

export interface PremiereModuleAccess {
  hasRequirePremierePro: boolean;
  premiereModuleLoaded: boolean;
  requireError: string | null;
  premiereModule: UnknownRecord | null;
  premiereModuleKeys: string[];
}

export interface SelectedRuntimeContext {
  selectionSource: SelectionSource;
  selectedItem: SelectedPremiereItem;
  trackItem: unknown | null;
  projectItem: unknown;
  clipProjectItem: unknown | null;
}

interface ResolveSelectionOptions {
  enableConsoleLogs: boolean;
  enableSubsequenceProbe: boolean;
}

interface ResolveSelectionResult {
  context: SelectedRuntimeContext | null;
  probe: SelectionProbeReport;
}

interface SelectionResolutionAttempt {
  context: SelectedRuntimeContext | null;
  reason: string | null;
}

interface ActiveProjectResolution {
  activeProject: unknown | null;
  resolutionPath: string | null;
  reason: string | null;
}

interface ProjectPanelSelectionEntry {
  label: string;
  value: unknown;
}

interface ProjectPanelSelectionsResolution {
  entries: ProjectPanelSelectionEntry[];
  reason: string | null;
}

interface CandidateDefinition {
  name: string;
  accessType: EntrypointAccessType;
  path: string[];
  selectionKind?: SelectionCandidateKind;
  args?: unknown[];
  note?: string;
}

interface CandidateEvaluation {
  report: EntrypointCandidateReport;
  value: unknown;
}

interface CandidateEvalOptions {
  root: unknown;
  rootLabel: string;
  category: EntrypointCategory;
  definition: CandidateDefinition;
}

interface DiscoveryOptions {
  enableConsoleLogs: boolean;
}

interface EntrypointDiscoveryResult {
  moduleAccess: PremiereModuleAccess;
  diagnostics: PremiereEntrypointsDiagnostics;
  activeProject: unknown | null;
  activeProjectCandidate: string | null;
  activeSequence: unknown | null;
  activeSequenceCandidate: string | null;
  timelineSelection: unknown | null;
  timelineSelectionCandidate: string | null;
  projectPanelSelection: unknown | null;
  projectPanelSelectionCandidate: string | null;
}

interface ResolveTimelineParams {
  selectionValue: unknown;
  selectionCandidate: string | null;
  activeSequence: unknown;
  premiereModule: UnknownRecord;
  probe: SelectionProbeReport;
  log: SelectionLogger;
}

interface ResolveProjectPanelParams {
  selectionValue: unknown;
  selectionCandidate: string | null;
  premiereModule: UnknownRecord;
  probe: SelectionProbeReport;
  log: SelectionLogger;
}

interface ExtractItemsOptions {
  primaryMethod: string;
  fallbackMethod: string;
  arrayProperty: string;
  secondArrayProperty: string;
  directItemPredicate?: (value: unknown) => boolean;
  label: string;
  log: SelectionLogger;
}

interface ExtractItemsResult {
  items: unknown[];
  method: string;
  reason: string | null;
}

interface BuildContextInput {
  source: SelectionSource;
  trackItem: unknown | null;
  projectItem: unknown;
  premiereModule: UnknownRecord;
  probe: SelectionProbeReport;
  log: SelectionLogger;
}

interface CastClipResult {
  available: boolean;
  attempted: boolean;
  clipProjectItem: unknown | null;
  reason: string | null;
}

interface MediaDiagnosticsEnrichmentInput {
  premiereModule: UnknownRecord;
  projectStaticObject: UnknownRecord | null;
  activeProjectObject: UnknownRecord;
  activeSequenceObject: UnknownRecord | null;
  enableSubsequenceProbe: boolean;
  timelineContext: SelectedRuntimeContext | null;
  projectPanelContext: SelectedRuntimeContext | null;
  projectPanelSelections: ProjectPanelSelectionsResolution | null;
  probe: SelectionProbeReport;
  log: SelectionLogger;
}

interface AudioExportDiagnosticsInput {
  projectStaticObject: UnknownRecord | null;
  projectUtilsStatic: UnknownRecord | null;
  activeProjectObject: UnknownRecord;
  activeSequenceObject: UnknownRecord | null;
  enableSubsequenceProbe: boolean;
  timelineContext: SelectedRuntimeContext | null;
  projectPanelContext: SelectedRuntimeContext | null;
  timelineMethods: string[];
  panelMethods: string[];
  probe: SelectionProbeReport;
  log: SelectionLogger;
}

interface MediaPathResolutionResult {
  mediaPath: string | null;
  method: string | null;
  attempts: string[];
  candidateObjects: MediaPathObjectAudit[];
  bestCandidateObject: string | null;
}

type SelectionLogger = (step: string, details?: unknown) => void;

const RELEVANT_EXPORTS = [
  "App",
  "Application",
  "Project",
  "Projects",
  "ProjectUtils",
  "Sequence",
  "Timeline",
  "Context",
  "Document",
  "Transcript",
  "ClipProjectItem",
  "app",
  "application",
] as const;

const TARGETED_RELEVANT_EXPORTS = [
  "Application",
  "Project",
  "ProjectUtils",
  "Sequence",
] as const;

const ENTRYPOINT_SEARCH_KEYWORDS = [
  "active",
  "current",
  "project",
  "projects",
  "app",
  "application",
  "sequence",
  "timeline",
  "selection",
  "selected",
  "item",
  "items",
  "context",
  "document",
] as const;

const MEDIA_PATH_SEARCH_KEYWORDS = [
  "media",
  "path",
  "file",
  "source",
  "original",
  "master",
  "clip",
  "projectitem",
  "item",
] as const;

const NOISY_METHOD_NAMES = new Set([
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
]);

/**
 * Obtiene acceso seguro al módulo `premierepro` en runtime UXP.
 */
export function getPremiereModuleAccess(): PremiereModuleAccess {
  const globalRequire = (globalThis as UnknownRecord).require;
  if (typeof globalRequire !== "function") {
    return {
      hasRequirePremierePro: false,
      premiereModuleLoaded: false,
      requireError: "globalThis.require no está disponible en este runtime",
      premiereModule: null,
      premiereModuleKeys: [],
    };
  }

  try {
    const loadedModule = (globalRequire as UnknownFn)("premierepro");
    const premiereModule = asRecord(loadedModule);

    if (!premiereModule) {
      return {
        hasRequirePremierePro: true,
        premiereModuleLoaded: false,
        requireError: "require('premierepro') devolvió un valor no-objeto",
        premiereModule: null,
        premiereModuleKeys: [],
      };
    }

    return {
      hasRequirePremierePro: true,
      premiereModuleLoaded: true,
      requireError: null,
      premiereModule,
      premiereModuleKeys: safeOwnKeys(premiereModule),
    };
  } catch (error) {
    return {
      hasRequirePremierePro: true,
      premiereModuleLoaded: false,
      requireError: toErrorMessage(error),
      premiereModule: null,
      premiereModuleKeys: [],
    };
  }
}

/**
 * Diagnóstico profundo de entrypoints de proyecto/secuencia/selección
 * usando introspección real del módulo `premierepro` cargado en runtime.
 */
export async function debugPremiereEntrypoints(): Promise<PremiereEntrypointsDiagnostics> {
  const discovery = await discoverPremiereEntrypoints({
    enableConsoleLogs: true,
  });

  logEntrypointsDiagnostics(discovery.diagnostics);
  return discovery.diagnostics;
}

/**
 * Diagnóstico exportable de selección en runtime Premiere.
 */
export async function debugSelectionProbe(): Promise<SelectionProbeReport> {
  const { probe } = await resolveSelectedRuntimeContext({
    enableConsoleLogs: true,
    enableSubsequenceProbe: true,
  });

  return probe;
}

/**
 * Obtiene el item seleccionado en Premiere (timeline primero, luego panel de proyecto).
 */
export async function getSelectedPremiereItem(): Promise<SelectedPremiereItem | null> {
  const context = await getSelectedRuntimeContext();
  return context?.selectedItem ?? null;
}

/**
 * Devuelve únicamente el payload serializable que se envía al backend.
 */
export async function getSelectedClipInfo(): Promise<SelectedClipInfo | null> {
  const selectedItem = await getSelectedPremiereItem();
  if (!selectedItem) {
    return null;
  }

  const { raw: _raw, ...clipInfo } = selectedItem;
  return clipInfo;
}

/**
 * Resuelve la selección y retorna referencias runtime (track/project/clip item)
 * para usar en adaptadores de transcript y diagnóstico.
 */
export async function getSelectedRuntimeContext(): Promise<SelectedRuntimeContext | null> {
  const { context } = await resolveSelectedRuntimeContext({
    enableConsoleLogs: true,
    enableSubsequenceProbe: false,
  });

  return context;
}

async function resolveSelectedRuntimeContext(
  options: ResolveSelectionOptions,
): Promise<ResolveSelectionResult> {
  const probe = createInitialProbe();
  const log = createSelectionLogger(options.enableConsoleLogs);

  const fail = (reason: string, details?: unknown): ResolveSelectionResult => {
    probe.failureReason = reason;
    log(`failure: ${reason}`, details);
    return {
      context: null,
      probe,
    };
  };

  const moduleAccess = getPremiereModuleAccess();
  probe.moduleAccess = {
    hasRequirePremierePro: moduleAccess.hasRequirePremierePro,
    premiereModuleLoaded: moduleAccess.premiereModuleLoaded,
    requireError: moduleAccess.requireError,
    premiereModuleKeys: moduleAccess.premiereModuleKeys,
  };

  log("require('premierepro')", probe.moduleAccess);

  if (!moduleAccess.premiereModuleLoaded || !moduleAccess.premiereModule) {
    return fail("require('premierepro') no disponible o falló al cargar", {
      requireError: moduleAccess.requireError,
    });
  }

  const premiereModule = moduleAccess.premiereModule;
  const projectStatic = asObjectLike(premiereModule.Project);

  probe.projectInfo.projectStaticInfo = inspectObject(projectStatic);
  probe.projectInfo.hasGetActiveProject = hasMethod(projectStatic, "getActiveProject");
  probe.entrypointSummary = {
    promisingCandidate: "Project.getActiveProject()",
    projectCandidatesTried: 1,
    sequenceCandidatesTried: 1,
    selectionCandidatesTried: 2,
  };

  log("Project static inspection", {
    hasProjectStatic: Boolean(projectStatic),
    hasGetActiveProject: probe.projectInfo.hasGetActiveProject,
    hasGetProject: hasMethod(projectStatic, "getProject"),
    staticKeys: projectStatic ? safeOwnKeys(projectStatic) : [],
  });

  const activeProjectResolution = await resolveActiveProjectFromProjectStatic(projectStatic, log);
  probe.projectInfo.activeProjectResolved = activeProjectResolution.activeProject !== null;
  probe.projectInfo.activeProjectInfo = inspectObject(activeProjectResolution.activeProject);
  probe.projectInfo.resolutionPath = activeProjectResolution.resolutionPath;

  if (!activeProjectResolution.activeProject) {
    return fail(
      activeProjectResolution.reason ?? "no active project",
      {
        projectStaticPath: "premierepro.Project",
      },
    );
  }

  log("project static path usado", {
    path: activeProjectResolution.resolutionPath,
    projectInfo: probe.projectInfo.activeProjectInfo,
    projectRaw: activeProjectResolution.activeProject,
  });

  const projectObject = asRecord(activeProjectResolution.activeProject);
  if (!projectObject) {
    return fail("Project.getActiveProject/getProject devolvió valor no-objeto", {
      rawProject: activeProjectResolution.activeProject,
    });
  }

  const getActiveSequenceFn = asFunction(projectObject.getActiveSequence);
  probe.sequenceInfo.hasGetActiveSequence = Boolean(getActiveSequenceFn);

  log("project.getActiveSequence disponible", {
    available: probe.sequenceInfo.hasGetActiveSequence,
    projectMethods: extractMethods(projectObject),
  });

  if (!getActiveSequenceFn) {
    return fail("project.getActiveSequence no está disponible", {
      projectKeys: safeOwnKeys(projectObject),
      projectMethods: extractMethods(projectObject),
    });
  }

  let activeSequence: unknown = null;
  try {
    activeSequence = await Promise.resolve(getActiveSequenceFn.call(projectObject));
  } catch (error) {
    return fail("project.getActiveSequence lanzó error", {
      message: toErrorMessage(error),
    });
  }

  probe.sequenceInfo.sequenceResolved = activeSequence !== null && activeSequence !== undefined;
  probe.sequenceInfo.sequenceInfo = inspectObject(activeSequence);
  probe.sequenceInfo.resolutionPath = "project.getActiveSequence()";

  log("active sequence resuelta", {
    resolved: probe.sequenceInfo.sequenceResolved,
    sequenceInfo: probe.sequenceInfo.sequenceInfo,
    sequenceRaw: activeSequence,
  });

  const sequenceObject = asRecord(activeSequence);
  if (!sequenceObject) {
    return fail("project.getActiveSequence devolvió null/undefined o valor no-objeto", {
      activeSequence,
    });
  }

  let projectPanelSelectionsCache: ProjectPanelSelectionsResolution | null = null;
  const getProjectPanelSelectionsCached = async (): Promise<ProjectPanelSelectionsResolution> => {
    if (projectPanelSelectionsCache) {
      return projectPanelSelectionsCache;
    }

    projectPanelSelectionsCache = await resolveProjectPanelSelections(premiereModule, log);
    return projectPanelSelectionsCache;
  };

  probe.timelineSelection.objectInfo = inspectObject(sequenceObject);
  const getSelectionFn = asFunction(sequenceObject.getSelection);
  probe.timelineSelection.hasMethod = Boolean(getSelectionFn);

  if (!getSelectionFn) {
    log("sequence.getSelection resultado", {
      available: false,
      sequenceMethods: extractMethods(sequenceObject),
    });
  }

  let timelineSelectionValue: unknown = null;
  if (getSelectionFn) {
    try {
      timelineSelectionValue = await Promise.resolve(getSelectionFn.call(sequenceObject));
    } catch (error) {
      log("sequence.getSelection error", {
        message: toErrorMessage(error),
      });
    }
  }

  probe.timelineSelection.rawResultInfo = inspectObject(timelineSelectionValue);
  log("sequence.getSelection resultado", {
    shape: describeSelectionContainerShape(timelineSelectionValue),
    info: probe.timelineSelection.rawResultInfo,
    raw: timelineSelectionValue,
  });

  const timelineAttempt = timelineSelectionValue
    ? await resolveTimelineContextFromSelection({
        selectionValue: timelineSelectionValue,
        selectionCandidate: "sequence.getSelection()",
        activeSequence,
        premiereModule,
        probe,
        log,
      })
    : {
        context: null,
        reason: "sequence.getSelection devolvió vacío o null",
      };

  if (timelineAttempt.context) {
    probe.chosenResult.source = "timeline";
    probe.chosenResult.selectedClipInfo = toSelectedClipInfo(timelineAttempt.context.selectedItem);
    log("selection resolved from timeline", {
      selected: probe.chosenResult.selectedClipInfo,
    });

    const projectPanelSelectionsForDiagnostics = await getProjectPanelSelectionsCached();
    await enrichMediaPathDiagnostics({
      premiereModule,
      projectStaticObject: projectStatic,
      activeProjectObject: projectObject,
      activeSequenceObject: sequenceObject,
      enableSubsequenceProbe: options.enableSubsequenceProbe,
      timelineContext: timelineAttempt.context,
      projectPanelContext: null,
      projectPanelSelections: projectPanelSelectionsForDiagnostics,
      probe,
      log,
    });

    return {
      context: timelineAttempt.context,
      probe,
    };
  }

  log("timeline selection unresolved", {
    reason: timelineAttempt.reason,
    selectionShape: describeSelectionContainerShape(timelineSelectionValue),
  });

  const projectPanelSelections = await getProjectPanelSelectionsCached();
  const projectUtilsStatic = asObjectLike(premiereModule.ProjectUtils);
  probe.projectPanelSelection.objectInfo = inspectObject(projectUtilsStatic);
  probe.projectPanelSelection.hasMethod = hasMethod(projectUtilsStatic, "getSelection");

  if (projectPanelSelections.entries.length === 0) {
    const timelineReason = timelineAttempt.reason ?? "timeline selection no disponible";
    const panelReason = projectPanelSelections.reason ?? "project panel selection vacía";
    await enrichMediaPathDiagnostics({
      premiereModule,
      projectStaticObject: projectStatic,
      activeProjectObject: projectObject,
      activeSequenceObject: sequenceObject,
      enableSubsequenceProbe: options.enableSubsequenceProbe,
      timelineContext: null,
      projectPanelContext: null,
      projectPanelSelections,
      probe,
      log,
    });
    return fail(
      `No se pudo detectar selección. timeline: ${timelineReason}; project panel: ${panelReason}`,
    );
  }

  const panelReasons: string[] = [];
  for (const entry of projectPanelSelections.entries) {
    log("ProjectUtils selection candidate", {
      source: entry.label,
      shape: describeSelectionContainerShape(entry.value),
      info: inspectObject(entry.value),
      raw: entry.value,
    });

    const projectPanelAttempt = await resolveProjectPanelContextFromSelection({
      selectionValue: entry.value,
      selectionCandidate: entry.label,
      premiereModule,
      probe,
      log,
    });

    if (projectPanelAttempt.context) {
      probe.chosenResult.source = "project_panel";
      probe.chosenResult.selectedClipInfo = toSelectedClipInfo(projectPanelAttempt.context.selectedItem);
      log("selection resolved from project panel", {
        selected: probe.chosenResult.selectedClipInfo,
        source: entry.label,
      });

      await enrichMediaPathDiagnostics({
        premiereModule,
        projectStaticObject: projectStatic,
        activeProjectObject: projectObject,
        activeSequenceObject: sequenceObject,
        enableSubsequenceProbe: options.enableSubsequenceProbe,
        timelineContext: null,
        projectPanelContext: projectPanelAttempt.context,
        projectPanelSelections,
        probe,
        log,
      });

      return {
        context: projectPanelAttempt.context,
        probe,
      };
    }

    panelReasons.push(`${entry.label}: ${projectPanelAttempt.reason ?? "sin detalle"}`);
  }

  const timelineReason = timelineAttempt.reason ?? "timeline selection no disponible";
  const panelReason = panelReasons.length > 0
    ? panelReasons.join(" | ")
    : projectPanelSelections.reason ?? "project panel selection no disponible";

  await enrichMediaPathDiagnostics({
    premiereModule,
    projectStaticObject: projectStatic,
    activeProjectObject: projectObject,
    activeSequenceObject: sequenceObject,
    enableSubsequenceProbe: options.enableSubsequenceProbe,
    timelineContext: null,
    projectPanelContext: null,
    projectPanelSelections,
    probe,
    log,
  });

  return fail(
    `No se pudo detectar selección. timeline: ${timelineReason}; project panel: ${panelReason}`,
  );
}

async function resolveActiveProjectFromProjectStatic(
  projectStatic: UnknownRecord | null,
  log: SelectionLogger,
): Promise<ActiveProjectResolution> {
  if (!projectStatic) {
    return {
      activeProject: null,
      resolutionPath: null,
      reason: "premierepro.Project no está disponible en runtime",
    };
  }

  const getActiveProjectFn = asFunction(projectStatic.getActiveProject);
  if (getActiveProjectFn) {
    try {
      const activeProject = await Promise.resolve(getActiveProjectFn.call(projectStatic));
      if (activeProject !== null && activeProject !== undefined) {
        return {
          activeProject,
          resolutionPath: "Project.getActiveProject()",
          reason: null,
        };
      }

      log("Project.getActiveProject resultado vacío", {
        raw: activeProject,
      });
    } catch (error) {
      log("Project.getActiveProject error", {
        message: toErrorMessage(error),
      });
    }
  } else {
    log("Project.getActiveProject no disponible", {
      staticKeys: safeOwnKeys(projectStatic),
      staticMethods: extractMethods(projectStatic),
    });
  }

  const getProjectFn = asFunction(projectStatic.getProject);
  if (!getProjectFn) {
    return {
      activeProject: null,
      resolutionPath: null,
      reason: "Project.getActiveProject no resolvió proyecto y Project.getProject no está disponible",
    };
  }

  try {
    const defaultProject = await Promise.resolve(getProjectFn.call(projectStatic));
    if (defaultProject !== null && defaultProject !== undefined) {
      return {
        activeProject: defaultProject,
        resolutionPath: "Project.getProject()",
        reason: null,
      };
    }

    log("Project.getProject() resultado vacío", {
      raw: defaultProject,
    });
  } catch (error) {
    log("Project.getProject() error", {
      message: toErrorMessage(error),
    });
  }

  try {
    const indexedProject = await Promise.resolve(getProjectFn.call(projectStatic, 0));
    if (indexedProject !== null && indexedProject !== undefined) {
      return {
        activeProject: indexedProject,
        resolutionPath: "Project.getProject(0)",
        reason: null,
      };
    }

    log("Project.getProject(0) resultado vacío", {
      raw: indexedProject,
    });
  } catch (error) {
    log("Project.getProject(0) error", {
      message: toErrorMessage(error),
    });
  }

  return {
    activeProject: null,
    resolutionPath: null,
    reason: "Project.getActiveProject y Project.getProject devolvieron vacío/no usable",
  };
}

async function resolveProjectPanelSelections(
  premiereModule: UnknownRecord,
  log: SelectionLogger,
): Promise<ProjectPanelSelectionsResolution> {
  const projectUtilsStatic = asObjectLike(premiereModule.ProjectUtils);
  if (!projectUtilsStatic) {
    return {
      entries: [],
      reason: "ProjectUtils no está disponible en runtime",
    };
  }

  const entries: ProjectPanelSelectionEntry[] = [];
  const getSelectionFn = asFunction(projectUtilsStatic.getSelection);
  const getProjectViewsFn = asFunction(projectUtilsStatic.getProjectViews);
  const getSelectionFromViewIdFn = asFunction(projectUtilsStatic.getSelectionFromViewId);

  log("ProjectUtils métodos disponibles", {
    hasGetSelection: Boolean(getSelectionFn),
    hasGetProjectViews: Boolean(getProjectViewsFn),
    hasGetSelectionFromViewId: Boolean(getSelectionFromViewIdFn),
    staticKeys: safeOwnKeys(projectUtilsStatic),
    staticMethods: extractMethods(projectUtilsStatic),
  });

  if (getSelectionFn) {
    try {
      const selection = await Promise.resolve(getSelectionFn.call(projectUtilsStatic));
      log("ProjectUtils.getSelection resultado", {
        shape: describeSelectionContainerShape(selection),
        info: inspectObject(selection),
        raw: selection,
      });

      if (selection !== null && selection !== undefined) {
        entries.push({
          label: "ProjectUtils.getSelection()",
          value: selection,
        });
      }
    } catch (error) {
      log("ProjectUtils.getSelection error", {
        message: toErrorMessage(error),
      });
    }
  }

  if (getProjectViewsFn && getSelectionFromViewIdFn) {
    try {
      const projectViews = await Promise.resolve(getProjectViewsFn.call(projectUtilsStatic));
      const projectViewIds = extractProjectViewIds(projectViews);

      log("ProjectUtils.getProjectViews resultado", {
        shape: describeSelectionContainerShape(projectViews),
        info: inspectObject(projectViews),
        viewIds: projectViewIds,
        raw: projectViews,
      });

      for (const viewId of projectViewIds) {
        try {
          const selectionFromViewId = await Promise.resolve(
            getSelectionFromViewIdFn.call(projectUtilsStatic, viewId),
          );
          log("ProjectUtils.getSelectionFromViewId resultado", {
            viewId,
            shape: describeSelectionContainerShape(selectionFromViewId),
            info: inspectObject(selectionFromViewId),
            raw: selectionFromViewId,
          });

          if (selectionFromViewId !== null && selectionFromViewId !== undefined) {
            entries.push({
              label: `ProjectUtils.getSelectionFromViewId(${viewId})`,
              value: selectionFromViewId,
            });
          }
        } catch (error) {
          log("ProjectUtils.getSelectionFromViewId error", {
            viewId,
            message: toErrorMessage(error),
          });
        }
      }
    } catch (error) {
      log("ProjectUtils.getProjectViews error", {
        message: toErrorMessage(error),
      });
    }
  }

  if (entries.length === 0) {
    return {
      entries: [],
      reason: "ProjectUtils.getSelection/getSelectionFromViewId no devolvieron selección utilizable",
    };
  }

  return {
    entries,
    reason: null,
  };
}

function extractProjectViewIds(projectViews: unknown): string[] {
  const ids = new Set<string>();

  const pushId = (rawId: unknown): void => {
    const id = asString(rawId);
    if (id) {
      ids.add(id);
    }
  };

  const collectFromValue = (value: unknown): void => {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        collectFromValue(entry);
      }
      return;
    }

    if (typeof value === "string" || typeof value === "number") {
      pushId(value);
      return;
    }

    const valueObject = asRecord(value);
    if (!valueObject) {
      return;
    }

    pushId(valueObject.viewId);
    pushId(valueObject.id);
    pushId(callSync(valueObject, "getViewId"));
    pushId(callSync(valueObject, "getId"));

    const nestedCandidates = [
      valueObject.items,
      valueObject.views,
      valueObject.projectViews,
      callSync(valueObject, "getItems"),
      callSync(valueObject, "getViews"),
      callSync(valueObject, "getProjectViews"),
    ];

    for (const nested of nestedCandidates) {
      if (nested !== value) {
        collectFromValue(nested);
      }
    }
  };

  collectFromValue(projectViews);
  return Array.from(ids);
}

function describeSelectionContainerShape(selectionValue: unknown): string {
  if (selectionValue === null || selectionValue === undefined) {
    return "null_or_undefined";
  }

  if (Array.isArray(selectionValue)) {
    return `array(length=${selectionValue.length})`;
  }

  const selectionObject = asRecord(selectionValue);
  if (!selectionObject) {
    return `primitive(type=${typeof selectionValue})`;
  }

  const hasGetTrackItems = hasMethod(selectionObject, "getTrackItems");
  const hasGetItems = hasMethod(selectionObject, "getItems");
  const hasGetProjectItems = hasMethod(selectionObject, "getProjectItems");
  const hasTrackItemsArray = Array.isArray(selectionObject.trackItems);
  const hasItemsArray = Array.isArray(selectionObject.items);
  const hasProjectItemsArray = Array.isArray(selectionObject.projectItems);
  const hasGetProjectItem = hasMethod(selectionObject, "getProjectItem");

  return [
    "object",
    `keys=${safeOwnKeys(selectionObject).join(",") || "(none)"}`,
    `getTrackItems=${String(hasGetTrackItems)}`,
    `getItems=${String(hasGetItems)}`,
    `getProjectItems=${String(hasGetProjectItems)}`,
    `trackItemsArray=${String(hasTrackItemsArray)}`,
    `itemsArray=${String(hasItemsArray)}`,
    `projectItemsArray=${String(hasProjectItemsArray)}`,
    `getProjectItem=${String(hasGetProjectItem)}`,
  ].join(" | ");
}

async function discoverPremiereEntrypoints(
  options: DiscoveryOptions,
): Promise<EntrypointDiscoveryResult> {
  const log = createEntrypointLogger(options.enableConsoleLogs);
  const moduleAccess = getPremiereModuleAccess();

  const diagnostics: PremiereEntrypointsDiagnostics = {
    createdAt: new Date().toISOString(),
    moduleAccess: {
      hasRequirePremierePro: moduleAccess.hasRequirePremierePro,
      premiereModuleLoaded: moduleAccess.premiereModuleLoaded,
      requireError: moduleAccess.requireError,
      premiereModuleKeys: moduleAccess.premiereModuleKeys,
    },
    exportInventory: [],
    relevantExportInspection: [],
    projectCandidates: [],
    sequenceCandidates: [],
    selectionCandidates: [],
    promisingCandidate: null,
    failureReason: null,
  };

  if (!moduleAccess.premiereModuleLoaded || !moduleAccess.premiereModule) {
    diagnostics.failureReason = "require('premierepro') no disponible";
    return {
      moduleAccess,
      diagnostics,
      activeProject: null,
      activeProjectCandidate: null,
      activeSequence: null,
      activeSequenceCandidate: null,
      timelineSelection: null,
      timelineSelectionCandidate: null,
      projectPanelSelection: null,
      projectPanelSelectionCandidate: null,
    };
  }

  const premiereModule = moduleAccess.premiereModule;
  diagnostics.exportInventory = inspectModuleExports(premiereModule);
  diagnostics.relevantExportInspection = inspectRelevantExportsDeep(premiereModule);

  log("módulo cargado", {
    keys: moduleAccess.premiereModuleKeys,
  });

  log("exports relevantes", summarizeRelevantExports(diagnostics.exportInventory));
  log("exports relevantes (inspección profunda)", summarizeRelevantExportInspection(
    diagnostics.relevantExportInspection,
  ));

  const projectDefinitions = buildProjectCandidateDefinitions(premiereModule);
  const projectEvaluations = await evaluateCandidateDefinitions({
    root: premiereModule,
    rootLabel: "premiereModule",
    category: "project",
    definitions: projectDefinitions,
  });

  diagnostics.projectCandidates = projectEvaluations.map((candidate) => candidate.report);

  const activeProjectEvaluation = pickFirstObjectResolution(projectEvaluations);
  const activeProject = activeProjectEvaluation?.value ?? null;
  const activeProjectCandidate = activeProjectEvaluation?.report.path ?? null;

  log("project candidates evaluados", summarizeCandidateResults(diagnostics.projectCandidates));

  const sequenceDefinitions = buildSequenceCandidateDefinitions(premiereModule, activeProject);
  const sequenceEvaluations = await evaluateMultiRootDefinitions(sequenceDefinitions);
  diagnostics.sequenceCandidates = sequenceEvaluations.map((candidate) => candidate.report);

  const activeSequenceEvaluation = pickFirstObjectResolution(sequenceEvaluations);
  const activeSequence = activeSequenceEvaluation?.value ?? null;
  const activeSequenceCandidate = activeSequenceEvaluation?.report.path ?? null;

  log("sequence candidates evaluados", summarizeCandidateResults(diagnostics.sequenceCandidates));

  const selectionDefinitions = buildSelectionCandidateDefinitions(
    premiereModule,
    activeProject,
    activeSequence,
  );
  const selectionEvaluations = await evaluateMultiRootDefinitions(selectionDefinitions);

  diagnostics.selectionCandidates = selectionEvaluations.map((candidate) => candidate.report);

  const timelineSelectionEvaluation = pickFirstSelectionResolution(selectionEvaluations, "timeline");
  const projectPanelSelectionEvaluation = pickFirstSelectionResolution(
    selectionEvaluations,
    "project_panel",
  );

  const timelineSelection = timelineSelectionEvaluation?.value ?? null;
  const timelineSelectionCandidate = timelineSelectionEvaluation?.report.path ?? null;

  const projectPanelSelection = projectPanelSelectionEvaluation?.value ?? null;
  const projectPanelSelectionCandidate = projectPanelSelectionEvaluation?.report.path ?? null;

  diagnostics.promisingCandidate =
    findFirstResolvedPath(diagnostics.projectCandidates) ??
    findFirstResolvedPath(diagnostics.sequenceCandidates) ??
    findFirstResolvedPath(diagnostics.selectionCandidates) ??
    findFirstAvailablePath(diagnostics.projectCandidates) ??
    findFirstAvailablePath(diagnostics.sequenceCandidates) ??
    findFirstAvailablePath(diagnostics.selectionCandidates);

  diagnostics.failureReason = resolveEntrypointFailureReason({
    activeProject,
    activeSequence,
    timelineSelection,
    projectPanelSelection,
  });

  log("selection candidates evaluados", summarizeCandidateResults(diagnostics.selectionCandidates));

  return {
    moduleAccess,
    diagnostics,
    activeProject,
    activeProjectCandidate,
    activeSequence,
    activeSequenceCandidate,
    timelineSelection,
    timelineSelectionCandidate,
    projectPanelSelection,
    projectPanelSelectionCandidate,
  };
}

function buildProjectCandidateDefinitions(premiereModule: UnknownRecord): CandidateDefinition[] {
  const definitions: CandidateDefinition[] = [];
  const seen = new Set<string>();

  const push = (definition: CandidateDefinition): void => {
    const key = `${definition.accessType}:${definition.path.join(".")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    definitions.push(definition);
  };

  push({ name: "Project.getActiveProject", accessType: "method", path: ["Project", "getActiveProject"] });
  push({ name: "Projects.getActiveProject", accessType: "method", path: ["Projects", "getActiveProject"] });
  push({ name: "App.getProject", accessType: "method", path: ["App", "getProject"] });
  push({ name: "App.project", accessType: "property", path: ["App", "project"] });
  push({ name: "Application.getProject", accessType: "method", path: ["Application", "getProject"] });
  push({ name: "Application.project", accessType: "property", path: ["Application", "project"] });
  push({ name: "Context.getActiveProject", accessType: "method", path: ["Context", "getActiveProject"] });
  push({ name: "Document.getActiveProject", accessType: "method", path: ["Document", "getActiveProject"] });
  push({ name: "ProjectUtils.getActiveProject", accessType: "method", path: ["ProjectUtils", "getActiveProject"] });
  push({ name: "app.getProject", accessType: "method", path: ["app", "getProject"] });
  push({ name: "app.project", accessType: "property", path: ["app", "project"] });
  push({ name: "application.getProject", accessType: "method", path: ["application", "getProject"] });
  push({ name: "application.project", accessType: "property", path: ["application", "project"] });
  push({ name: "module.getActiveProject", accessType: "method", path: ["getActiveProject"] });
  push({ name: "module.getCurrentProject", accessType: "method", path: ["getCurrentProject"] });

  appendDynamicDefinitions({
    destination: definitions,
    seen,
    root: premiereModule,
    rootPath: [],
    matcher: isProjectMethodName,
    propertyMatcher: isProjectPropertyName,
    note: "dynamic_project_probe",
  });

  return definitions;
}

function buildSequenceCandidateDefinitions(
  premiereModule: UnknownRecord,
  activeProject: unknown,
): Array<{
  root: unknown;
  rootLabel: string;
  category: EntrypointCategory;
  definition: CandidateDefinition;
}> {
  const entries: Array<{
    root: unknown;
    rootLabel: string;
    category: EntrypointCategory;
    definition: CandidateDefinition;
  }> = [];

  const add = (
    root: unknown,
    rootLabel: string,
    definition: CandidateDefinition,
  ) => {
    entries.push({
      root,
      rootLabel,
      category: "sequence",
      definition,
    });
  };

  const activeProjectObject = asRecord(activeProject);
  if (activeProjectObject) {
    add(activeProjectObject, "activeProject", {
      name: "activeProject.getActiveSequence",
      accessType: "method",
      path: ["getActiveSequence"],
    });
    add(activeProjectObject, "activeProject", {
      name: "activeProject.getCurrentSequence",
      accessType: "method",
      path: ["getCurrentSequence"],
    });
    add(activeProjectObject, "activeProject", {
      name: "activeProject.activeSequence",
      accessType: "property",
      path: ["activeSequence"],
    });
    add(activeProjectObject, "activeProject", {
      name: "activeProject.currentSequence",
      accessType: "property",
      path: ["currentSequence"],
    });
    add(activeProjectObject, "activeProject", {
      name: "activeProject.sequence",
      accessType: "property",
      path: ["sequence"],
    });

    appendDynamicEntryCandidates({
      target: entries,
      root: activeProjectObject,
      rootLabel: "activeProject",
      category: "sequence",
      matcher: isSequenceMethodName,
      propertyMatcher: isSequencePropertyName,
      note: "dynamic_project_sequence_probe",
    });
  }

  add(premiereModule, "premiereModule", {
    name: "App.getActiveSequence",
    accessType: "method",
    path: ["App", "getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "App.getCurrentSequence",
    accessType: "method",
    path: ["App", "getCurrentSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "App.activeSequence",
    accessType: "property",
    path: ["App", "activeSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "Application.getActiveSequence",
    accessType: "method",
    path: ["Application", "getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "Context.getActiveSequence",
    accessType: "method",
    path: ["Context", "getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "Document.getActiveSequence",
    accessType: "method",
    path: ["Document", "getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "app.getActiveSequence",
    accessType: "method",
    path: ["app", "getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "app.activeSequence",
    accessType: "property",
    path: ["app", "activeSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "module.getActiveSequence",
    accessType: "method",
    path: ["getActiveSequence"],
  });
  add(premiereModule, "premiereModule", {
    name: "module.getCurrentSequence",
    accessType: "method",
    path: ["getCurrentSequence"],
  });

  appendDynamicEntryCandidates({
    target: entries,
    root: premiereModule,
    rootLabel: "premiereModule",
    category: "sequence",
    matcher: isSequenceMethodName,
    propertyMatcher: isSequencePropertyName,
    note: "dynamic_module_sequence_probe",
    onlyRelevantRoots: true,
  });

  return dedupeEntryCandidates(entries);
}

function buildSelectionCandidateDefinitions(
  premiereModule: UnknownRecord,
  activeProject: unknown,
  activeSequence: unknown,
): Array<{
  root: unknown;
  rootLabel: string;
  category: EntrypointCategory;
  definition: CandidateDefinition;
}> {
  const entries: Array<{
    root: unknown;
    rootLabel: string;
    category: EntrypointCategory;
    definition: CandidateDefinition;
  }> = [];

  const add = (
    root: unknown,
    rootLabel: string,
    definition: CandidateDefinition,
  ) => {
    entries.push({
      root,
      rootLabel,
      category: "selection",
      definition,
    });
  };

  const activeSequenceObject = asRecord(activeSequence);
  if (activeSequenceObject) {
    add(activeSequenceObject, "activeSequence", {
      name: "activeSequence.getSelection",
      accessType: "method",
      path: ["getSelection"],
      selectionKind: "timeline",
    });
    add(activeSequenceObject, "activeSequence", {
      name: "activeSequence.getSelectedItems",
      accessType: "method",
      path: ["getSelectedItems"],
      selectionKind: "timeline",
    });
    add(activeSequenceObject, "activeSequence", {
      name: "activeSequence.selection",
      accessType: "property",
      path: ["selection"],
      selectionKind: "timeline",
    });
    add(activeSequenceObject, "activeSequence", {
      name: "activeSequence.trackSelection",
      accessType: "property",
      path: ["trackSelection"],
      selectionKind: "timeline",
    });

    appendDynamicEntryCandidates({
      target: entries,
      root: activeSequenceObject,
      rootLabel: "activeSequence",
      category: "selection",
      matcher: isSelectionMethodName,
      propertyMatcher: isSelectionPropertyName,
      note: "dynamic_sequence_selection_probe",
      selectionKind: "timeline",
    });
  }

  const activeProjectObject = asRecord(activeProject);
  if (activeProjectObject) {
    add(activeProjectObject, "activeProject", {
      name: "activeProject.getSelection",
      accessType: "method",
      path: ["getSelection"],
      selectionKind: "project_panel",
    });
    add(activeProjectObject, "activeProject", {
      name: "activeProject.selection",
      accessType: "property",
      path: ["selection"],
      selectionKind: "project_panel",
    });

    appendDynamicEntryCandidates({
      target: entries,
      root: activeProjectObject,
      rootLabel: "activeProject",
      category: "selection",
      matcher: isSelectionMethodName,
      propertyMatcher: isSelectionPropertyName,
      note: "dynamic_project_selection_probe",
      selectionKind: "project_panel",
    });
  }

  add(premiereModule, "premiereModule", {
    name: "ProjectUtils.getSelection(project)",
    accessType: "method",
    path: ["ProjectUtils", "getSelection"],
    selectionKind: "project_panel",
    args: activeProject ? [activeProject] : [],
  });
  add(premiereModule, "premiereModule", {
    name: "ProjectUtils.getSelection()",
    accessType: "method",
    path: ["ProjectUtils", "getSelection"],
    selectionKind: "project_panel",
  });

  add(premiereModule, "premiereModule", {
    name: "App.getSelection",
    accessType: "method",
    path: ["App", "getSelection"],
    selectionKind: "unknown",
  });
  add(premiereModule, "premiereModule", {
    name: "app.getSelection",
    accessType: "method",
    path: ["app", "getSelection"],
    selectionKind: "unknown",
  });
  add(premiereModule, "premiereModule", {
    name: "Application.getSelection",
    accessType: "method",
    path: ["Application", "getSelection"],
    selectionKind: "unknown",
  });
  add(premiereModule, "premiereModule", {
    name: "Context.getSelection",
    accessType: "method",
    path: ["Context", "getSelection"],
    selectionKind: "unknown",
  });
  add(premiereModule, "premiereModule", {
    name: "Document.getSelection",
    accessType: "method",
    path: ["Document", "getSelection"],
    selectionKind: "unknown",
  });

  appendDynamicEntryCandidates({
    target: entries,
    root: premiereModule,
    rootLabel: "premiereModule",
    category: "selection",
    matcher: isSelectionMethodName,
    propertyMatcher: isSelectionPropertyName,
    note: "dynamic_module_selection_probe",
    selectionKind: "unknown",
    onlyRelevantRoots: true,
  });

  return dedupeEntryCandidates(entries);
}

async function evaluateCandidateDefinitions(input: {
  root: unknown;
  rootLabel: string;
  category: EntrypointCategory;
  definitions: CandidateDefinition[];
}): Promise<CandidateEvaluation[]> {
  const { root, rootLabel, category, definitions } = input;
  const results: CandidateEvaluation[] = [];

  for (const definition of definitions) {
    const evaluated = await evaluateCandidate({
      root,
      rootLabel,
      category,
      definition,
    });

    results.push(evaluated);
  }

  return results;
}

async function evaluateMultiRootDefinitions(
  entries: Array<{
    root: unknown;
    rootLabel: string;
    category: EntrypointCategory;
    definition: CandidateDefinition;
  }>,
): Promise<CandidateEvaluation[]> {
  const evaluations: CandidateEvaluation[] = [];

  for (const entry of entries) {
    evaluations.push(
      await evaluateCandidate({
        root: entry.root,
        rootLabel: entry.rootLabel,
        category: entry.category,
        definition: entry.definition,
      }),
    );
  }

  return evaluations;
}

async function evaluateCandidate(options: CandidateEvalOptions): Promise<CandidateEvaluation> {
  const { root, rootLabel, category, definition } = options;
  const fullPath = [rootLabel, ...definition.path].join(".");
  const parentPath = definition.path.slice(0, -1);
  const propertyName = definition.path[definition.path.length - 1] ?? "";

  const parentValue = safeGetPath(root, parentPath);
  const parentObject = asRecord(parentValue);

  const report: EntrypointCandidateReport = {
    name: definition.name,
    category,
    accessType: definition.accessType,
    selectionKind: definition.selectionKind ?? "unknown",
    path: fullPath,
    available: false,
    invoked: false,
    resolved: false,
    parentInfo: inspectObject(parentValue),
    valueInfo: null,
    parentMethods: parentObject ? extractMethods(parentObject) : [],
    error: null,
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
    const method = asFunction(parentObject[propertyName]);
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
      report.valueInfo = inspectObject(value);
      report.resolved = value !== null && value !== undefined;
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

  const hasProperty = hasPropertyKey(parentObject, propertyName);
  report.available = hasProperty;

  if (!hasProperty) {
    report.note = report.note ?? "property_not_available";
    return {
      report,
      value: null,
    };
  }

  let propertyValue: unknown = null;
  try {
    propertyValue = parentObject[propertyName];
  } catch (error) {
    report.error = toErrorMessage(error);
    report.note = report.note ?? "property_getter_threw";
    return {
      report,
      value: null,
    };
  }

  report.resolved = propertyValue !== null && propertyValue !== undefined;
  report.valueInfo = inspectObject(propertyValue);

  return {
    report,
    value: propertyValue,
  };
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

function pickFirstSelectionResolution(
  evaluations: CandidateEvaluation[],
  kind: SelectionCandidateKind,
): CandidateEvaluation | null {
  for (const evaluation of evaluations) {
    if (evaluation.report.category !== "selection") {
      continue;
    }

    if (evaluation.report.selectionKind !== kind) {
      continue;
    }

    if (!evaluation.report.resolved) {
      continue;
    }

    return evaluation;
  }

  return null;
}

function findFirstResolvedPath(candidates: EntrypointCandidateReport[]): string | null {
  for (const candidate of candidates) {
    if (candidate.resolved) {
      return candidate.path;
    }
  }

  return null;
}

function findFirstAvailablePath(candidates: EntrypointCandidateReport[]): string | null {
  for (const candidate of candidates) {
    if (candidate.available) {
      return candidate.path;
    }
  }

  return null;
}

function resolveEntrypointFailureReason(input: {
  activeProject: unknown | null;
  activeSequence: unknown | null;
  timelineSelection: unknown | null;
  projectPanelSelection: unknown | null;
}): string | null {
  const { activeProject, activeSequence, timelineSelection, projectPanelSelection } = input;

  if (!activeProject && !activeSequence && !timelineSelection && !projectPanelSelection) {
    return "no_entrypoint_for_project_sequence_selection";
  }

  if (!activeProject && activeSequence) {
    return "project_entrypoint_missing_but_sequence_found";
  }

  if (activeProject && !activeSequence && !projectPanelSelection) {
    return "project_found_but_no_sequence_or_project_selection";
  }

  if (activeSequence && !timelineSelection && !projectPanelSelection) {
    return "sequence_found_but_no_selection_entrypoint";
  }

  return null;
}

async function resolveTimelineContextFromSelection(
  params: ResolveTimelineParams,
): Promise<SelectionResolutionAttempt> {
  const {
    selectionValue,
    selectionCandidate,
    activeSequence,
    premiereModule,
    probe,
    log,
  } = params;

  probe.timelineSelection.objectInfo = inspectObject(activeSequence);
  probe.timelineSelection.rawResultInfo = inspectObject(selectionValue);
  probe.timelineSelection.hasMethod = Boolean(selectionCandidate?.includes("getSelection"));

  log("timeline selection candidate", {
    via: selectionCandidate,
    rawInfo: probe.timelineSelection.rawResultInfo,
    raw: selectionValue,
  });

  const extracted = await extractItemsFromSelectionContainer(selectionValue, {
    primaryMethod: "getTrackItems",
    fallbackMethod: "getItems",
    arrayProperty: "trackItems",
    secondArrayProperty: "items",
    label: "timeline trackSelection",
    log,
  });

  probe.timelineSelection.extractionMethod = extracted.method;
  probe.timelineSelection.count = extracted.items.length;

  log("timeline track items extraídos", {
    method: extracted.method,
    count: extracted.items.length,
    reason: extracted.reason,
  });

  if (extracted.items.length === 0) {
    return {
      context: null,
      reason: extracted.reason ?? "trackItems vacío",
    };
  }

  let chosenTrackItem: unknown | null = null;
  let chosenProjectItem: unknown | null = null;

  for (let index = 0; index < extracted.items.length; index += 1) {
    const trackItem = extracted.items[index];
    const trackItemObject = asRecord(trackItem);
    const trackItemInfo = inspectObject(trackItem);

    const candidateProbe: TrackItemCandidateProbe = {
      index,
      info: trackItemInfo,
      hasGetProjectItem: false,
      projectItemResolutionMethod: null,
      projectItemResolved: false,
      projectItemInfo: null,
    };

    if (!trackItemObject) {
      probe.candidateTrackItems.push(candidateProbe);
      continue;
    }

    const getProjectItemFn = asFunction(trackItemObject.getProjectItem);
    candidateProbe.hasGetProjectItem = Boolean(getProjectItemFn);

    let projectItem: unknown = null;
    if (getProjectItemFn) {
      try {
        projectItem = await Promise.resolve(getProjectItemFn.call(trackItemObject));
        candidateProbe.projectItemResolutionMethod = "getProjectItem";
      } catch (error) {
        log("trackItem.getProjectItem error", {
          index,
          message: toErrorMessage(error),
        });
      }
    } else if (trackItemObject.projectItem !== undefined) {
      projectItem = trackItemObject.projectItem;
      candidateProbe.projectItemResolutionMethod = "trackItem.projectItem";
    }

    candidateProbe.projectItemResolved = projectItem !== null && projectItem !== undefined;
    candidateProbe.projectItemInfo = inspectObject(projectItem);

    probe.candidateTrackItems.push(candidateProbe);

    log("trackItem inspección", {
      index,
      keys: trackItemInfo.ownKeys,
      methods: trackItemInfo.methods,
      hasGetProjectItem: candidateProbe.hasGetProjectItem,
      projectItemMethod: candidateProbe.projectItemResolutionMethod,
      projectItemInfo: candidateProbe.projectItemInfo,
      projectItemRaw: projectItem,
    });

    if (!chosenProjectItem && candidateProbe.projectItemResolved) {
      chosenTrackItem = trackItem;
      chosenProjectItem = projectItem;
    }
  }

  if (!chosenProjectItem) {
    return {
      context: null,
      reason: "trackItems encontrados pero ninguno resolvió projectItem",
    };
  }

  const context = await buildRuntimeContext({
    source: "timeline",
    trackItem: chosenTrackItem,
    projectItem: chosenProjectItem,
    premiereModule,
    probe,
    log,
  });

  if (!context) {
    return {
      context: null,
      reason: "cast a ClipProjectItem falló o projectItem inválido",
    };
  }

  return {
    context,
    reason: null,
  };
}

async function resolveProjectPanelContextFromSelection(
  params: ResolveProjectPanelParams,
): Promise<SelectionResolutionAttempt> {
  const {
    selectionValue,
    selectionCandidate,
    premiereModule,
    probe,
    log,
  } = params;

  probe.projectPanelSelection.rawResultInfo = inspectObject(selectionValue);
  probe.projectPanelSelection.hasMethod = Boolean(selectionCandidate?.includes("getSelection"));

  log("project panel selection candidate", {
    via: selectionCandidate,
    rawInfo: probe.projectPanelSelection.rawResultInfo,
    raw: selectionValue,
  });

  const extracted = await extractItemsFromSelectionContainer(selectionValue, {
    primaryMethod: "getItems",
    fallbackMethod: "getProjectItems",
    arrayProperty: "items",
    secondArrayProperty: "projectItems",
    directItemPredicate: (value) => {
      const objectValue = asRecord(value);
      return Boolean(
        objectValue &&
          (hasMethod(objectValue, "getMediaFilePath") ||
            hasMethod(objectValue, "getMediaPath") ||
            hasMethod(objectValue, "getName") ||
            hasPropertyKey(objectValue, "id") ||
            hasPropertyKey(objectValue, "name")),
      );
    },
    label: "project panel selection",
    log,
  });

  probe.projectPanelSelection.extractionMethod = extracted.method;
  probe.projectPanelSelection.count = extracted.items.length;

  log("project panel items extraídos", {
    method: extracted.method,
    count: extracted.items.length,
    reason: extracted.reason,
  });

  if (extracted.items.length === 0) {
    return {
      context: null,
      reason: extracted.reason ?? "project selection vacía",
    };
  }

  for (let index = 0; index < extracted.items.length; index += 1) {
    const item = extracted.items[index];
    const info = inspectObject(item);

    probe.candidateProjectItems.push({
      index,
      info,
    });

    log("project item candidato", {
      index,
      keys: info.ownKeys,
      methods: info.methods,
      raw: item,
    });
  }

  const chosenProjectItem = extracted.items[0] ?? null;
  if (!chosenProjectItem) {
    return {
      context: null,
      reason: "project selection no devolvió primer item",
    };
  }

  const context = await buildRuntimeContext({
    source: "project_panel",
    trackItem: null,
    projectItem: chosenProjectItem,
    premiereModule,
    probe,
    log,
  });

  if (!context) {
    return {
      context: null,
      reason: "cast a ClipProjectItem falló o project item inválido",
    };
  }

  return {
    context,
    reason: null,
  };
}

async function extractItemsFromSelectionContainer(
  selectionValue: unknown,
  options: ExtractItemsOptions,
): Promise<ExtractItemsResult> {
  const {
    primaryMethod,
    fallbackMethod,
    arrayProperty,
    secondArrayProperty,
    directItemPredicate,
    label,
    log,
  } = options;

  if (Array.isArray(selectionValue)) {
    return {
      items: selectionValue,
      method: `${label}:selection_is_array`,
      reason: null,
    };
  }

  const selectionObject = asRecord(selectionValue);
  if (!selectionObject) {
    return {
      items: [],
      method: `${label}:selection_not_object`,
      reason: `${label} no devolvió objeto/array`,
    };
  }

  const selectionInfo = inspectObject(selectionObject);
  log(`${label} keys/methods`, {
    keys: selectionInfo.ownKeys,
    methods: selectionInfo.methods,
  });

  const primaryFn = asFunction(selectionObject[primaryMethod]);
  if (primaryFn) {
    try {
      const primaryResult = await Promise.resolve(primaryFn.call(selectionObject));
      log(`${label}.${primaryMethod} resultado`, {
        info: inspectObject(primaryResult),
        raw: primaryResult,
      });

      if (Array.isArray(primaryResult)) {
        return {
          items: primaryResult,
          method: `${label}:${primaryMethod}`,
          reason: null,
        };
      }

      return {
        items: [],
        method: `${label}:${primaryMethod}_not_array`,
        reason: `${label}.${primaryMethod} no devolvió array`,
      };
    } catch (error) {
      return {
        items: [],
        method: `${label}:${primaryMethod}_error`,
        reason: `${label}.${primaryMethod} error: ${toErrorMessage(error)}`,
      };
    }
  }

  const fallbackFn = asFunction(selectionObject[fallbackMethod]);
  if (fallbackFn) {
    try {
      const fallbackResult = await Promise.resolve(fallbackFn.call(selectionObject));
      log(`${label}.${fallbackMethod} resultado`, {
        info: inspectObject(fallbackResult),
        raw: fallbackResult,
      });

      if (Array.isArray(fallbackResult)) {
        return {
          items: fallbackResult,
          method: `${label}:${fallbackMethod}`,
          reason: null,
        };
      }
    } catch (error) {
      return {
        items: [],
        method: `${label}:${fallbackMethod}_error`,
        reason: `${label}.${fallbackMethod} error: ${toErrorMessage(error)}`,
      };
    }
  }

  const propertyValue = selectionObject[arrayProperty];
  if (Array.isArray(propertyValue)) {
    return {
      items: propertyValue,
      method: `${label}:${arrayProperty}_property`,
      reason: null,
    };
  }

  const secondPropertyValue = selectionObject[secondArrayProperty];
  if (Array.isArray(secondPropertyValue)) {
    return {
      items: secondPropertyValue,
      method: `${label}:${secondArrayProperty}_property`,
      reason: null,
    };
  }

  if (directItemPredicate?.(selectionValue)) {
    return {
      items: [selectionValue],
      method: `${label}:selection_single_item`,
      reason: null,
    };
  }

  if (hasMethod(selectionObject, "getProjectItem")) {
    return {
      items: [selectionValue],
      method: `${label}:selection_is_track_item`,
      reason: null,
    };
  }

  return {
    items: [],
    method: `${label}:no_supported_extractor`,
    reason: `${label} sin ${primaryMethod}/${fallbackMethod} ni arrays detectables`,
  };
}

async function buildRuntimeContext({
  source,
  trackItem,
  projectItem,
  premiereModule,
  probe,
  log,
}: BuildContextInput): Promise<SelectedRuntimeContext | null> {
  const projectItemObject = asRecord(projectItem);
  if (!projectItemObject) {
    log("buildRuntimeContext aborted", {
      reason: "projectItem no es objeto",
      raw: projectItem,
    });
    return null;
  }

  const cast = castToClipProjectItem(premiereModule, projectItem);
  probe.clipProjectItemCast.available = cast.available;
  probe.clipProjectItemCast.attempted = cast.attempted;
  probe.clipProjectItemCast.succeeded = cast.clipProjectItem !== null;
  probe.clipProjectItemCast.resultInfo = inspectObject(cast.clipProjectItem);
  probe.clipProjectItemCast.reason = cast.reason;

  log("ClipProjectItem.cast resultado", {
    available: cast.available,
    attempted: cast.attempted,
    succeeded: probe.clipProjectItemCast.succeeded,
    reason: cast.reason,
    info: probe.clipProjectItemCast.resultInfo,
    raw: cast.clipProjectItem,
  });

  const projectItemId =
    asString(callSync(projectItemObject, "getId")) ??
    asString(projectItemObject.id) ??
    asString(projectItemObject.nodeId) ??
    fallbackId();

  const trackItemObject = asRecord(trackItem);
  const clipProjectItemObject = asRecord(cast.clipProjectItem);

  const clipName =
    asString(projectItemObject.name) ??
    asString(await callMethod(projectItemObject, "getName")) ??
    asString(trackItemObject ? await callMethod(trackItemObject, "getName") : null) ??
    "Clip sin nombre";

  const mediaPathResolution = await resolveMediaPath({
    clipProjectItemObject,
    projectItemObject,
    trackItemObject,
    log,
  });
  const mediaPath = mediaPathResolution.mediaPath;
  probe.mediaPathDiagnostics.started = true;
  probe.mediaPathDiagnostics.resolved = Boolean(mediaPathResolution.mediaPath);
  probe.mediaPathDiagnostics.resolvedPath = mediaPathResolution.mediaPath;
  probe.mediaPathDiagnostics.resolvedMethod = mediaPathResolution.method;
  probe.mediaPathDiagnostics.attempts = mediaPathResolution.attempts;
  probe.mediaPathDiagnostics.candidateObjects = mediaPathResolution.candidateObjects;
  probe.mediaPathDiagnostics.bestCandidateObject = mediaPathResolution.bestCandidateObject;

  const durationMs = toDurationMs(
    trackItemObject ? await callMethod(trackItemObject, "getDuration") : null,
  );

  const selectedItem: SelectedPremiereItem = {
    clipId: projectItemId,
    clipName,
    projectItemId,
    mediaPath,
    durationMs,
    selectionSource: source,
    raw: {
      trackItem: trackItemObject ?? null,
      projectItem: projectItemObject,
      clipProjectItem: cast.clipProjectItem ?? null,
    },
  };

  return {
    selectionSource: source,
    selectedItem,
    trackItem,
    projectItem,
    clipProjectItem: cast.clipProjectItem,
  };
}

function castToClipProjectItem(premiereModule: UnknownRecord, projectItem: unknown): CastClipResult {
  const clipProjectItemStatic = asRecord(premiereModule.ClipProjectItem);
  const castFn = asFunction(clipProjectItemStatic?.cast);

  if (!clipProjectItemStatic || !castFn) {
    return {
      available: false,
      attempted: false,
      clipProjectItem: null,
      reason: "ClipProjectItem.cast no disponible",
    };
  }

  try {
    const casted = castFn.call(clipProjectItemStatic, projectItem);
    return {
      available: true,
      attempted: true,
      clipProjectItem: casted ?? null,
      reason: casted ? null : "ClipProjectItem.cast devolvió null/undefined",
    };
  } catch (error) {
    return {
      available: true,
      attempted: true,
      clipProjectItem: null,
      reason: toErrorMessage(error),
    };
  }
}

async function resolveMediaPath(input: {
  clipProjectItemObject: UnknownRecord | null;
  projectItemObject: UnknownRecord;
  trackItemObject: UnknownRecord | null;
  log: SelectionLogger;
}): Promise<MediaPathResolutionResult> {
  const { clipProjectItemObject, projectItemObject, trackItemObject, log } = input;
  const attempts: string[] = [];

  log("media path resolution start", {
    hasClipProjectItem: Boolean(clipProjectItemObject),
    hasProjectItem: Boolean(projectItemObject),
    hasTrackItem: Boolean(trackItemObject),
  });

  interface CandidateObjectRef {
    label: string;
    target: UnknownRecord;
    audit: MediaPathObjectAudit;
    score: number;
  }

  const candidateRefs: CandidateObjectRef[] = [];
  const seenObjects = new WeakSet<object>();

  const registerCandidateObject = (label: string, value: unknown): CandidateObjectRef | null => {
    const target = asRecord(value);
    if (!target) {
      return null;
    }

    if (seenObjects.has(target)) {
      return null;
    }
    seenObjects.add(target);

    const audit = createMediaPathObjectAudit(label, target);
    const score = getMediaPathAuditScore(audit);
    const candidate: CandidateObjectRef = {
      label,
      target,
      audit,
      score,
    };

    candidateRefs.push(candidate);
    log(
      `media path object audit: ${label} | kind=${audit.kind} | ownKeys=${formatListPlainText(
        audit.ownKeys,
      )} | methods=${formatListPlainText(audit.methods)} | staticKeys=${formatListPlainText(
        audit.staticKeys,
      )} | prototypeMethods=${formatListPlainText(
        audit.prototypeMethods,
      )} | keywordMatches=${formatKeywordMatchesPlainText(audit.keywordMatches)}`,
    );

    return candidate;
  };

  registerCandidateObject("projectItem", projectItemObject);
  registerCandidateObject("clipProjectItem", clipProjectItemObject);
  registerCandidateObject("trackItem", trackItemObject);

  const deriveMethodNames = [
    "getProjectItem",
    "getSourceProjectItem",
    "getSource",
    "getMasterClip",
    "getMasterProjectItem",
    "getProxyProjectItem",
    "getMediaSource",
    "getClipProjectItem",
  ];
  const derivePropertyNames = [
    "projectItem",
    "source",
    "sourceItem",
    "sourceProjectItem",
    "masterClip",
    "masterProjectItem",
    "proxyProjectItem",
    "mediaSource",
    "clipProjectItem",
  ];

  const maxDerivedObjects = 12;
  for (let index = 0; index < candidateRefs.length && candidateRefs.length < maxDerivedObjects; index += 1) {
    const candidate = candidateRefs[index];

    for (const methodName of deriveMethodNames) {
      log(`media path candidate method tried: ${candidate.label}.${methodName}() [derive-object]`);
      const derived = await callMethod(candidate.target, methodName);
      log(
        `media path candidate result: ${candidate.label}.${methodName}() [derive-object] => ${
          derived === null || derived === undefined ? "(null)" : "object_or_value"
        } | raw=${describeMediaPathRawValue(derived)}`,
      );
      if (derived === null || derived === undefined) {
        continue;
      }
      registerCandidateObject(`${candidate.label}.${methodName}()`, derived);
      if (candidateRefs.length >= maxDerivedObjects) {
        break;
      }
    }
    if (candidateRefs.length >= maxDerivedObjects) {
      break;
    }

    for (const propertyName of derivePropertyNames) {
      log(`media path candidate method tried: ${candidate.label}.${propertyName} [derive-object]`);
      const derived = safeGetProperty(candidate.target, propertyName);
      log(
        `media path candidate result: ${candidate.label}.${propertyName} [derive-object] => ${
          derived === null || derived === undefined ? "(null)" : "object_or_value"
        } | raw=${describeMediaPathRawValue(derived)}`,
      );
      if (derived === null || derived === undefined) {
        continue;
      }
      registerCandidateObject(`${candidate.label}.${propertyName}`, derived);
      if (candidateRefs.length >= maxDerivedObjects) {
        break;
      }
    }
  }

  const sortedCandidates = candidateRefs.slice().sort((a, b) => b.score - a.score);
  const bestCandidateObject = sortedCandidates[0]?.label ?? null;
  const methodNamesToTry = [
    "getMediaFilePath",
    "getMediaPath",
    "getPath",
    "getOriginalMediaPath",
    "getMediaSourcePath",
    "getMediaSource",
    "getPathString",
    "getFilePath",
    "getSourcePath",
    "getOriginalPath",
    "getLocalPath",
  ];
  const propertyNamesToTry = [
    "mediaFilePath",
    "mediaPath",
    "path",
    "originalMediaPath",
    "mediaSourcePath",
    "mediaSource",
    "filePath",
    "sourcePath",
    "localPath",
  ];

  for (const candidate of sortedCandidates) {
    for (const methodName of methodNamesToTry) {
      log(`media path candidate method tried: ${candidate.label}.${methodName}()`);
      const rawValue = await callMethod(candidate.target, methodName);
      const normalized = normalizeResolvedMediaPath(rawValue);
      attempts.push(`${candidate.label}.${methodName}() => ${normalized ?? "(null)"}`);
      log(
        `media path candidate result: ${candidate.label}.${methodName}() => ${
          normalized ?? "(null)"
        } | raw=${describeMediaPathRawValue(rawValue)}`,
      );

      if (normalized) {
        log("media path resolved", {
          method: `${candidate.label}.${methodName}()`,
          mediaPath: normalized,
          bestCandidateObject: candidate.label,
        });
        return {
          mediaPath: normalized,
          method: `${candidate.label}.${methodName}()`,
          attempts,
          candidateObjects: candidateRefs.map((entry) => entry.audit),
          bestCandidateObject: candidate.label,
        };
      }
    }

    for (const propertyName of propertyNamesToTry) {
      log(`media path candidate method tried: ${candidate.label}.${propertyName}`);
      const rawValue = safeGetProperty(candidate.target, propertyName);
      const normalized = normalizeResolvedMediaPath(rawValue);
      attempts.push(`${candidate.label}.${propertyName} => ${normalized ?? "(null)"}`);
      log(
        `media path candidate result: ${candidate.label}.${propertyName} => ${
          normalized ?? "(null)"
        } | raw=${describeMediaPathRawValue(rawValue)}`,
      );

      if (normalized) {
        log("media path resolved", {
          method: `${candidate.label}.${propertyName}`,
          mediaPath: normalized,
          bestCandidateObject: candidate.label,
        });
        return {
          mediaPath: normalized,
          method: `${candidate.label}.${propertyName}`,
          attempts,
          candidateObjects: candidateRefs.map((entry) => entry.audit),
          bestCandidateObject: candidate.label,
        };
      }
    }
  }

  log("media path unavailable", {
    reason: "No se encontró path utilizable en projectItem/clipProjectItem ni derivados",
    bestCandidateObject,
    attempts,
  });

  return {
    mediaPath: null,
    method: null,
    attempts,
    candidateObjects: candidateRefs.map((entry) => entry.audit),
    bestCandidateObject,
  };
}

async function enrichMediaPathDiagnostics(input: MediaDiagnosticsEnrichmentInput): Promise<void> {
  const {
    premiereModule,
    projectStaticObject,
    activeProjectObject,
    activeSequenceObject,
    enableSubsequenceProbe,
    timelineContext,
    projectPanelContext,
    projectPanelSelections,
    probe,
    log,
  } = input;

  const traversalAudits: MediaPathObjectAudit[] = [];
  const viewAudits: MediaPathObjectAudit[] = [];
  const seenTraversalLabels = new Set<string>();
  const seenViewLabels = new Set<string>();

  const pushTraversalAudit = (label: string, value: unknown): void => {
    const objectValue = asRecord(value);
    if (!objectValue || seenTraversalLabels.has(label)) {
      return;
    }
    seenTraversalLabels.add(label);

    const audit = createMediaPathObjectAudit(label, objectValue);
    traversalAudits.push(audit);
    log(
      `project traversal object: ${label} | methods=${formatListPlainText(
        audit.methods,
      )} | keywordMatches=${formatKeywordMatchesPlainText(audit.keywordMatches)}`,
    );
  };

  const pushViewAudit = (label: string, value: unknown): void => {
    const objectValue = asRecord(value);
    if (!objectValue || seenViewLabels.has(label)) {
      return;
    }
    seenViewLabels.add(label);

    const audit = createMediaPathObjectAudit(label, objectValue);
    viewAudits.push(audit);
    log(
      `project view object: ${label} | methods=${formatListPlainText(
        audit.methods,
      )} | keywordMatches=${formatKeywordMatchesPlainText(audit.keywordMatches)}`,
    );
  };

  const projectMethods = filterNoisyMethodNames(extractMethods(activeProjectObject));
  probe.mediaPathDiagnostics.projectTraversalMethods = projectMethods;
  log(`project traversal methods: ${formatListPlainText(projectMethods)}`);

  const rootItem = await invokeDiagnosticMethodWithLog(
    activeProjectObject,
    "getRootItem",
    "project.getRootItem()",
    log,
  );
  pushTraversalAudit("project.getRootItem()", rootItem);

  const insertionBin = await invokeDiagnosticMethodWithLog(
    activeProjectObject,
    "getInsertionBin",
    "project.getInsertionBin()",
    log,
  );
  pushTraversalAudit("project.getInsertionBin()", insertionBin);

  const sequencesResult = await invokeDiagnosticMethodWithLog(
    activeProjectObject,
    "getSequences",
    "project.getSequences()",
    log,
  );
  pushTraversalAudit("project.getSequences()", sequencesResult);

  const sequences = extractObjectsFromCollection(sequencesResult).slice(0, 4);
  for (let index = 0; index < sequences.length; index += 1) {
    pushTraversalAudit(`project.getSequences()[${index}]`, sequences[index]);
  }

  const sequenceNoArg = await invokeDiagnosticMethodWithLog(
    activeProjectObject,
    "getSequence",
    "project.getSequence()",
    log,
  );
  pushTraversalAudit("project.getSequence()", sequenceNoArg);

  const sequenceZero = await invokeDiagnosticMethodWithLog(
    activeProjectObject,
    "getSequence",
    "project.getSequence(0)",
    log,
    0,
  );
  pushTraversalAudit("project.getSequence(0)", sequenceZero);

  pushTraversalAudit("activeSequence", activeSequenceObject);

  const projectUtilsStatic = asObjectLike(premiereModule.ProjectUtils);
  const projectUtilsMethods = projectUtilsStatic
    ? filterNoisyMethodNames(extractMethods(projectUtilsStatic))
    : [];
  probe.mediaPathDiagnostics.projectUtilsMethods = projectUtilsMethods;
  log(`ProjectUtils methods: ${formatListPlainText(projectUtilsMethods)}`);

  const projectViewIds = new Set<string>();
  if (projectUtilsStatic) {
    const projectViews = await invokeDiagnosticMethodWithLog(
      projectUtilsStatic,
      "getProjectViews",
      "ProjectUtils.getProjectViews()",
      log,
    );
    pushViewAudit("ProjectUtils.getProjectViews()", projectViews);

    for (const viewId of extractProjectViewIds(projectViews)) {
      projectViewIds.add(viewId);
    }

    for (const viewId of projectViewIds) {
      const projectFromView = await invokeDiagnosticMethodWithLog(
        projectUtilsStatic,
        "getProjectFromViewId",
        `ProjectUtils.getProjectFromViewId(${viewId})`,
        log,
        viewId,
      );
      pushViewAudit(`ProjectUtils.getProjectFromViewId(${viewId})`, projectFromView);

      const selectionFromView = await invokeDiagnosticMethodWithLog(
        projectUtilsStatic,
        "getSelectionFromViewId",
        `ProjectUtils.getSelectionFromViewId(${viewId})`,
        log,
        viewId,
      );
      pushViewAudit(`ProjectUtils.getSelectionFromViewId(${viewId})`, selectionFromView);

      const extracted = await extractItemsFromSelectionContainer(selectionFromView, {
        primaryMethod: "getItems",
        fallbackMethod: "getProjectItems",
        arrayProperty: "items",
        secondArrayProperty: "projectItems",
        label: `projectView(${viewId}) selection`,
        log,
      });

      if (extracted.items.length > 0) {
        pushViewAudit(`projectView(${viewId}) firstItem`, extracted.items[0]);
      }
    }
  }

  probe.mediaPathDiagnostics.projectViewIds = Array.from(projectViewIds);

  const firstProjectPanelItem = await resolveFirstProjectPanelItemForDiagnostics(
    projectPanelSelections,
    log,
  );
  const timelineProjectItem = timelineContext?.projectItem ?? null;
  const panelProjectItem = projectPanelContext?.projectItem ?? firstProjectPanelItem;

  const timelineAudit = createAuditIfObject("timeline.projectItem", timelineProjectItem);
  const panelAudit = createAuditIfObject("projectPanel.projectItem", panelProjectItem);

  if (timelineAudit) {
    pushViewAudit("comparison.timeline.projectItem", timelineProjectItem);
  }
  if (panelAudit) {
    pushViewAudit("comparison.projectPanel.projectItem", panelProjectItem);
  }

  const timelineMethods = timelineAudit?.methods ?? [];
  const panelMethods = panelAudit?.methods ?? [];
  const timelineKeywords = timelineAudit
    ? flattenKeywordNamesForDiagnostics(timelineAudit.keywordMatches)
    : [];
  const panelKeywords = panelAudit
    ? flattenKeywordNamesForDiagnostics(panelAudit.keywordMatches)
    : [];
  const timelineScore = timelineAudit ? getMediaPathAuditScore(timelineAudit) : 0;
  const panelScore = panelAudit ? getMediaPathAuditScore(panelAudit) : 0;

  let richerSource: "timeline" | "project_panel" | "equal" | "unknown" = "unknown";
  if (timelineAudit && panelAudit) {
    if (timelineScore > panelScore) {
      richerSource = "timeline";
    } else if (panelScore > timelineScore) {
      richerSource = "project_panel";
    } else {
      richerSource = "equal";
    }
  } else if (timelineAudit) {
    richerSource = "timeline";
  } else if (panelAudit) {
    richerSource = "project_panel";
  }

  probe.mediaPathDiagnostics.comparison = {
    timelineProjectItemMethods: timelineMethods,
    projectPanelItemMethods: panelMethods,
    timelineKeywordMatches: timelineKeywords,
    projectPanelKeywordMatches: panelKeywords,
    richerSource,
  };

  await enrichAudioExportDiagnostics({
    projectStaticObject,
    projectUtilsStatic,
    activeProjectObject,
    activeSequenceObject,
    enableSubsequenceProbe,
    timelineContext,
    projectPanelContext,
    timelineMethods,
    panelMethods,
    probe,
    log,
  });

  probe.mediaPathDiagnostics.projectTraversalObjects = traversalAudits;
  probe.mediaPathDiagnostics.projectViewObjects = viewAudits;

  const allAudits = [
    ...probe.mediaPathDiagnostics.candidateObjects,
    ...traversalAudits,
    ...viewAudits,
  ];
  const pathSignalObjects = allAudits
    .filter((audit) => hasPathLikeSignal(audit))
    .map((audit) => audit.label);
  const hasPathLikeSignals = pathSignalObjects.length > 0;
  probe.mediaPathDiagnostics.pathSignalObjects = dedupeSortedStrings(pathSignalObjects);

  if (probe.mediaPathDiagnostics.resolved) {
    probe.mediaPathDiagnostics.runtimeConclusion = [
      "media path resolved",
      `method=${probe.mediaPathDiagnostics.resolvedMethod ?? "(none)"}`,
    ].join(" | ");
    probe.mediaPathDiagnostics.recommendedNextStep = "Continuar con transcripción real sobre mediaPath resuelto.";
  } else if (!hasPathLikeSignals) {
    probe.mediaPathDiagnostics.runtimeConclusion =
      "timeline selection object does not expose direct file path in this UXP runtime";
    probe.mediaPathDiagnostics.recommendedNextStep =
      "Siguiente estrategia: exportar/renderizar audio temporal desde Premiere (clip/subsecuencia) y transcribir ese archivo.";
  } else {
    probe.mediaPathDiagnostics.runtimeConclusion =
      "Se detectaron objetos relacionados, pero ninguno devolvió mediaPath usable en runtime.";
    probe.mediaPathDiagnostics.recommendedNextStep =
      "Probar flujo de exportación temporal de audio desde Premiere en lugar de buscar file path directo.";
  }

  log(`timeline project item methods: ${formatListPlainText(timelineMethods)}`);
  log(`timeline project item keywordMatches: ${formatListPlainText(timelineKeywords)}`);
  log(`project panel item methods: ${formatListPlainText(panelMethods)}`);
  log(`project panel item keywordMatches: ${formatListPlainText(panelKeywords)}`);
  log(`selection comparison richerSource: ${richerSource}`);
  log(`path/source/master candidates: ${formatListPlainText(probe.mediaPathDiagnostics.pathSignalObjects)}`);
  log(`media path runtime conclusion: ${probe.mediaPathDiagnostics.runtimeConclusion ?? "(none)"}`);
  log(`media path recommended next step: ${probe.mediaPathDiagnostics.recommendedNextStep ?? "(none)"}`);
}

async function enrichAudioExportDiagnostics(input: AudioExportDiagnosticsInput): Promise<void> {
  const {
    projectStaticObject,
    projectUtilsStatic,
    activeProjectObject,
    activeSequenceObject,
    enableSubsequenceProbe,
    timelineContext,
    projectPanelContext,
    timelineMethods,
    panelMethods,
    probe,
    log,
  } = input;

  const diagnostics = probe.mediaPathDiagnostics.audioExportDiagnostics;
  diagnostics.started = true;

  const sequenceMethods = activeSequenceObject
    ? filterNoisyMethodNames(extractMethods(activeSequenceObject))
    : [];
  const projectMethods = filterNoisyMethodNames(extractMethods(activeProjectObject));
  const projectUtilsMethods = projectUtilsStatic
    ? filterNoisyMethodNames(extractMethods(projectUtilsStatic))
    : [];
  const projectStaticMethods = projectStaticObject
    ? filterNoisyMethodNames(extractMethods(projectStaticObject))
    : [];

  const timelineTrackItem = asRecord(timelineContext?.trackItem ?? null);
  const panelTrackItem = asRecord(projectPanelContext?.trackItem ?? null);
  const trackItemMethods = dedupeSortedStrings([
    ...(timelineTrackItem ? filterNoisyMethodNames(extractMethods(timelineTrackItem)) : []),
    ...(panelTrackItem ? filterNoisyMethodNames(extractMethods(panelTrackItem)) : []),
  ]);

  diagnostics.sequenceMethods = sequenceMethods;
  diagnostics.projectMethods = projectMethods;
  diagnostics.projectUtilsMethods = projectUtilsMethods;
  diagnostics.projectStaticMethods = projectStaticMethods;
  diagnostics.trackItemMethods = trackItemMethods;
  diagnostics.timelineProjectItemMethods = timelineMethods;
  diagnostics.projectPanelProjectItemMethods = panelMethods;

  diagnostics.subsequenceProbe = createDefaultSubsequenceProbe();
  if (enableSubsequenceProbe) {
    diagnostics.subsequenceProbe = await runCreateSubsequenceProbe({
      activeSequenceObject,
      activeProjectObject,
      sequenceMethods,
      log,
    });
  } else {
    diagnostics.subsequenceProbe.conclusion =
      "Subsequence probe omitido en flujo normal para evitar crear subsecuencias involuntarias.";
  }

  const methodPairs: Array<{ source: string; method: string }> = [
    ...sequenceMethods.map((method) => ({ source: "Sequence", method })),
    ...projectMethods.map((method) => ({ source: "Project", method })),
    ...projectUtilsMethods.map((method) => ({ source: "ProjectUtils", method })),
    ...projectStaticMethods.map((method) => ({ source: "ProjectStatic", method })),
    ...trackItemMethods.map((method) => ({ source: "TrackItem", method })),
    ...timelineMethods.map((method) => ({ source: "TimelineProjectItem", method })),
    ...panelMethods.map((method) => ({ source: "ProjectPanelItem", method })),
  ];

  const keywordMatches = methodPairs
    .filter((entry) => isAudioExportKeywordMethodName(entry.method))
    .map((entry) => `${entry.source}.${entry.method}`);
  diagnostics.keywordMatches = dedupeSortedStrings(keywordMatches);

  const actionMethods = methodPairs
    .filter((entry) => isAudioActionMethodName(entry.method))
    .map((entry) => `${entry.source}.${entry.method}`);
  diagnostics.actionMethods = dedupeSortedStrings(actionMethods);

  const directExportCandidates = methodPairs
    .filter((entry) => isDirectAudioExportMethodName(entry.method))
    .map((entry) => `${entry.source}.${entry.method}`);
  diagnostics.directExportCandidates = dedupeSortedStrings(directExportCandidates);

  const subsequenceCandidates = methodPairs
    .filter((entry) => /subsequence/i.test(entry.method))
    .map((entry) => `${entry.source}.${entry.method}`);
  if (diagnostics.subsequenceProbe.subsequenceCreated) {
    subsequenceCandidates.push("Sequence.createSubsequence:created");
  }
  diagnostics.subsequenceCandidates = dedupeSortedStrings(subsequenceCandidates);

  const subsequenceExportCandidates = diagnostics.subsequenceProbe.exportCandidatesFromSubsequence;
  if (subsequenceExportCandidates.length > 0) {
    diagnostics.directExportCandidates = dedupeSortedStrings([
      ...diagnostics.directExportCandidates,
      ...subsequenceExportCandidates.map((name) => `Subsequence.${name}`),
    ]);
  }

  const explicitDirectCandidates = dedupeSortedStrings(
    methodPairs
      .filter((entry) => isExplicitDirectExternalMethodName(entry.method))
      .map((entry) => `${entry.source}.${entry.method}`),
  );

  if (diagnostics.directExportCandidates.length > 0) {
    diagnostics.routeStatus = "viable_direct";
    diagnostics.chosenRoute = diagnostics.directExportCandidates[0] ?? null;
    diagnostics.conclusion = [
      "Se detectó ruta directa potencial para export/render de audio en runtime UXP.",
      `candidate=${diagnostics.chosenRoute ?? "(none)"}`,
    ].join(" ");
    diagnostics.recommendedNextStep =
      "Implementar prueba controlada de ese método con output temporal y validar path resultante.";
  } else if (diagnostics.actionMethods.length > 0 || diagnostics.subsequenceCandidates.length > 0) {
    diagnostics.routeStatus = "viable_indirect";
    diagnostics.chosenRoute = diagnostics.subsequenceProbe.subsequenceCreated
      ? "Sequence.createSubsequence"
      : diagnostics.actionMethods[0] ??
        diagnostics.subsequenceCandidates[0] ??
        null;
    diagnostics.conclusion =
      diagnostics.subsequenceProbe.subsequenceCreated
        ? "createSubsequence funciona, pero no expone export directo de audio en el objeto retornado."
        : "No se detectó export directo de audio, pero hay ruta indirecta basada en actions/subsequence.";
    diagnostics.recommendedNextStep = diagnostics.subsequenceProbe.subsequenceCreated
      ? "Usar subsecuencia creada como insumo para workflow externo controlado de render/export temporal."
      : diagnostics.actionMethods.length > 0
        ? "Probar action de export/render en transaction controlada y recuperar archivo temporal de salida."
        : "Probar Sequence.createSubsequence + workflow externo de render/export para producir audio temporal.";
  } else {
    diagnostics.routeStatus = "not_found";
    diagnostics.chosenRoute = null;
    diagnostics.conclusion =
      "No se detectaron métodos export/render/encode de audio en Sequence/Project/TrackItem para este runtime UXP.";
    diagnostics.recommendedNextStep =
      "Usar flujo externo controlado: generar export temporal desde Premiere fuera de UXP directo (subsequence/render queue/Media Encoder) y luego transcribir.";
  }

  if (diagnostics.subsequenceProbe.outputProbeExists === true) {
    diagnostics.routeStatus = "viable_direct";
    diagnostics.chosenRoute = diagnostics.subsequenceProbe.outputProbePath
      ? `runtime_output_path:${diagnostics.subsequenceProbe.outputProbePath}`
      : "Subsequence.createCloneAction:observable_trace";
    diagnostics.conclusion =
      diagnostics.subsequenceProbe.outputProbeConclusion ??
      "Se detectó output/rastro verificable en runtime.";
    diagnostics.recommendedNextStep =
      diagnostics.subsequenceProbe.outputNextRecommendation ??
      "Usar el output verificado como entrada para la siguiente etapa.";
  } else if (diagnostics.subsequenceProbe.outputProbeExists === false) {
    diagnostics.routeStatus = "viable_indirect";
    diagnostics.chosenRoute = "Subsequence.createCloneAction(discarded_no_verifiable_output)";
    diagnostics.conclusion =
      diagnostics.subsequenceProbe.outputProbeConclusion ??
      "No hubo output verificable; la ruta directa se descarta.";
    diagnostics.recommendedNextStep =
      diagnostics.subsequenceProbe.outputNextRecommendation ??
      "Pasar a workflow externo controlado de export/render temporal.";
  }

  const externalRouteProbe = await runExternalRouteProbe({
    activeProjectObject,
    subsequenceProbe: diagnostics.subsequenceProbe,
    explicitDirectCandidates,
    log,
  });
  diagnostics.routeOptions = externalRouteProbe.routeOptions;
  diagnostics.externalRouteTried = externalRouteProbe.externalRouteTried;
  diagnostics.externalRouteReason = externalRouteProbe.externalRouteReason;
  diagnostics.externalRouteResult = externalRouteProbe.externalRouteResult;
  diagnostics.externalRoutePath = externalRouteProbe.externalRoutePath;
  diagnostics.externalRouteExists = externalRouteProbe.externalRouteExists;
  diagnostics.externalRouteConclusion = externalRouteProbe.externalRouteConclusion;
  diagnostics.externalRouteNextRecommendation = externalRouteProbe.externalRouteNextRecommendation;

  if (externalRouteProbe.externalRouteExists === true) {
    diagnostics.routeStatus = "viable_indirect";
    diagnostics.chosenRoute = "ExternalHandoff.SubsequenceManualExport";
    diagnostics.conclusion = externalRouteProbe.externalRouteConclusion;
    diagnostics.recommendedNextStep = externalRouteProbe.externalRouteNextRecommendation;
  } else if (externalRouteProbe.externalRouteExists === false) {
    diagnostics.routeStatus = "not_found";
    diagnostics.chosenRoute = "ExternalHandoff.SubsequenceManualExport(unverified)";
    diagnostics.conclusion = externalRouteProbe.externalRouteConclusion;
    diagnostics.recommendedNextStep = externalRouteProbe.externalRouteNextRecommendation;
  }

  log("audio export diagnostics start", {
    hasSequence: Boolean(activeSequenceObject),
    hasProject: true,
  });
  log(`audio export sequence methods: ${formatListPlainText(sequenceMethods)}`);
  log(`audio export project methods: ${formatListPlainText(projectMethods)}`);
  log(`audio export projectStatic methods: ${formatListPlainText(projectStaticMethods)}`);
  log(`audio export projectUtils methods: ${formatListPlainText(projectUtilsMethods)}`);
  log(`audio export trackItem methods: ${formatListPlainText(trackItemMethods)}`);
  log(`audio export keyword matches: ${formatListPlainText(diagnostics.keywordMatches)}`);
  log(`audio export direct candidates: ${formatListPlainText(diagnostics.directExportCandidates)}`);
  log(`audio export action methods: ${formatListPlainText(diagnostics.actionMethods)}`);
  log(`audio export subsequence candidates: ${formatListPlainText(diagnostics.subsequenceCandidates)}`);
  log(`subsequence probe attempted: ${String(diagnostics.subsequenceProbe.attempted)}`);
  log(`subsequence probe createSubsequence available: ${String(diagnostics.subsequenceProbe.createSubsequenceAvailable)}`);
  log(`subsequence probe invocation tried: ${formatListPlainText(diagnostics.subsequenceProbe.invocationTried)}`);
  log(`subsequence probe invocation used: ${diagnostics.subsequenceProbe.invocationUsed ?? "(none)"}`);
  log(`subsequence probe error: ${diagnostics.subsequenceProbe.invocationError ?? "(none)"}`);
  log(`subsequence probe created: ${String(diagnostics.subsequenceProbe.subsequenceCreated)}`);
  log(`subsequence probe return type: ${diagnostics.subsequenceProbe.subsequenceReturnType}`);
  log(`subsequence probe methods: ${formatListPlainText(diagnostics.subsequenceProbe.subsequenceMethods)}`);
  log(`subsequence probe export candidates: ${formatListPlainText(diagnostics.subsequenceProbe.exportCandidatesFromSubsequence)}`);
  log(`subsequence action probe tried: ${formatListPlainText(diagnostics.subsequenceProbe.actionProbeTried)}`);
  log(`subsequence action probe result: ${diagnostics.subsequenceProbe.actionProbeResult ?? "(none)"}`);
  log(`subsequence action probe error: ${diagnostics.subsequenceProbe.actionProbeError ?? "(none)"}`);
  log(`subsequence action next recommendation: ${diagnostics.subsequenceProbe.actionNextRecommendation ?? "(none)"}`);
  log(`transaction probe tried: ${formatListPlainText(diagnostics.subsequenceProbe.transactionProbeTried)}`);
  log(`transaction probe result: ${diagnostics.subsequenceProbe.transactionProbeResult ?? "(none)"}`);
  log(`transaction probe error: ${diagnostics.subsequenceProbe.transactionProbeError ?? "(none)"}`);
  log(`transaction probe conclusion: ${diagnostics.subsequenceProbe.transactionProbeConclusion ?? "(none)"}`);
  log(`transaction next recommendation: ${diagnostics.subsequenceProbe.transactionNextRecommendation ?? "(none)"}`);
  log(`observable action tried: ${diagnostics.subsequenceProbe.observableActionTried ?? "(none)"}`);
  log(`observable before: ${diagnostics.subsequenceProbe.observableBefore ?? "(none)"}`);
  log(`observable after: ${diagnostics.subsequenceProbe.observableAfter ?? "(none)"}`);
  log(`observable changed: ${String(diagnostics.subsequenceProbe.observableChanged)}`);
  log(`observable conclusion: ${diagnostics.subsequenceProbe.observableConclusion ?? "(none)"}`);
  log(`observable next recommendation: ${diagnostics.subsequenceProbe.observableNextRecommendation ?? "(none)"}`);
  log(`output probe tried: ${formatListPlainText(diagnostics.subsequenceProbe.outputProbeTried)}`);
  log(`output probe result: ${diagnostics.subsequenceProbe.outputProbeResult ?? "(none)"}`);
  log(`output probe error: ${diagnostics.subsequenceProbe.outputProbeError ?? "(none)"}`);
  log(`output probe path: ${diagnostics.subsequenceProbe.outputProbePath ?? "(none)"}`);
  log(`output probe exists: ${String(diagnostics.subsequenceProbe.outputProbeExists)}`);
  log(`output probe conclusion: ${diagnostics.subsequenceProbe.outputProbeConclusion ?? "(none)"}`);
  log(`output next recommendation: ${diagnostics.subsequenceProbe.outputNextRecommendation ?? "(none)"}`);
  log(`external route options viable direct: ${formatListPlainText(diagnostics.routeOptions.viableFromUxpDirect)}`);
  log(`external route options viable indirect: ${formatListPlainText(diagnostics.routeOptions.viableIndirectHandoff)}`);
  log(`external route options not viable: ${formatListPlainText(diagnostics.routeOptions.notViable)}`);
  log(`external route tried: ${diagnostics.externalRouteTried ?? "(none)"}`);
  log(`external route reason: ${diagnostics.externalRouteReason ?? "(none)"}`);
  log(`external route result: ${diagnostics.externalRouteResult ?? "(none)"}`);
  log(`external route path: ${diagnostics.externalRoutePath ?? "(none)"}`);
  log(`external route exists: ${String(diagnostics.externalRouteExists)}`);
  log(`external route conclusion: ${diagnostics.externalRouteConclusion ?? "(none)"}`);
  log(`external route next recommendation: ${diagnostics.externalRouteNextRecommendation ?? "(none)"}`);
  log(`subsequence probe conclusion: ${diagnostics.subsequenceProbe.conclusion ?? "(none)"}`);
  log(`audio export route status: ${diagnostics.routeStatus}`);
  log(`audio export chosen route: ${diagnostics.chosenRoute ?? "(none)"}`);
  log(`audio export conclusion: ${diagnostics.conclusion ?? "(none)"}`);
  log(`audio export recommended next step: ${diagnostics.recommendedNextStep ?? "(none)"}`);
}

function createDefaultSubsequenceProbe(): MediaPathDiagnosticsReport["audioExportDiagnostics"]["subsequenceProbe"] {
  return {
    attempted: false,
    createSubsequenceAvailable: false,
    createSubsequenceArity: null,
    createSubsequenceSignature: null,
    invocationTried: [],
    invocationUsed: null,
    invocationError: null,
    subsequenceCreated: false,
    subsequenceReturnType: "none",
    subsequenceName: null,
    subsequenceId: null,
    subsequenceDurationMs: null,
    subsequenceOwnKeys: [],
    subsequenceMethods: [],
    subsequenceKeywordMatches: [],
    exportCandidatesFromSubsequence: [],
    richerThanActiveSequence: null,
    actionProbeTried: [],
    actionProbeResult: null,
    actionProbeError: null,
    actionNextRecommendation: null,
    transactionProbeTried: [],
    transactionProbeResult: null,
    transactionProbeError: null,
    transactionProbeConclusion: null,
    transactionNextRecommendation: null,
    observableActionTried: null,
    observableBefore: null,
    observableAfter: null,
    observableChanged: null,
    observableConclusion: null,
    observableNextRecommendation: null,
    outputProbeTried: [],
    outputProbeResult: null,
    outputProbeError: null,
    outputProbePath: null,
    outputProbeExists: null,
    outputProbeConclusion: null,
    outputNextRecommendation: null,
    conclusion: null,
  };
}

async function runCreateSubsequenceProbe(input: {
  activeSequenceObject: UnknownRecord | null;
  activeProjectObject: UnknownRecord;
  sequenceMethods: string[];
  log: SelectionLogger;
}): Promise<MediaPathDiagnosticsReport["audioExportDiagnostics"]["subsequenceProbe"]> {
  const { activeSequenceObject, activeProjectObject, sequenceMethods, log } = input;
  const result = createDefaultSubsequenceProbe();

  if (!activeSequenceObject) {
    result.conclusion = "No hay activeSequence disponible para probar createSubsequence.";
    return result;
  }

  const createSubsequenceFn = asFunction(activeSequenceObject.createSubsequence);
  result.createSubsequenceAvailable = Boolean(createSubsequenceFn);
  result.createSubsequenceArity = createSubsequenceFn ? createSubsequenceFn.length : null;
  result.createSubsequenceSignature = createSubsequenceFn
    ? truncateText(safeFunctionSource(createSubsequenceFn), 220)
    : null;

  log("createSubsequence availability", {
    available: result.createSubsequenceAvailable,
    arity: result.createSubsequenceArity,
    signature: result.createSubsequenceSignature,
  });

  if (!createSubsequenceFn) {
    result.conclusion = "activeSequence.createSubsequence no está disponible en runtime.";
    return result;
  }

  result.attempted = true;
  const probeName = `GLIFO_Subsequence_Probe_${Date.now()}`;
  const invocationPlans: Array<{ label: string; args: unknown[] }> = [
    { label: "createSubsequence()", args: [] },
    { label: `createSubsequence(${JSON.stringify(probeName)})`, args: [probeName] },
    { label: `createSubsequence({name:${JSON.stringify(probeName)}})`, args: [{ name: probeName }] },
  ];

  let createdValue: unknown = null;
  for (const plan of invocationPlans) {
    result.invocationTried.push(plan.label);
    log("createSubsequence invocation start", {
      invocation: plan.label,
      argsCount: plan.args.length,
    });

    try {
      const maybeValue = await Promise.resolve(createSubsequenceFn.apply(activeSequenceObject, plan.args));
      log("createSubsequence invocation result", {
        invocation: plan.label,
        summary: describeMediaPathRawValue(maybeValue),
        raw: maybeValue,
      });

      if (maybeValue !== null && maybeValue !== undefined) {
        createdValue = maybeValue;
        result.invocationUsed = plan.label;
        break;
      }
    } catch (error) {
      const message = toErrorMessage(error);
      result.invocationError = message;
      log("createSubsequence invocation error", {
        invocation: plan.label,
        message,
      });
    }
  }

  if (createdValue === null || createdValue === undefined) {
    result.subsequenceCreated = false;
    result.subsequenceReturnType = "null_or_undefined";
    result.conclusion =
      "createSubsequence se invocó pero no devolvió subsecuencia usable con las firmas mínimas probadas.";
    return result;
  }

  result.subsequenceCreated = true;
  result.subsequenceReturnType = describeMediaPathRawValue(createdValue);

  const createdObject = asRecord(createdValue);
  if (!createdObject) {
    result.conclusion =
      "createSubsequence devolvió valor no-objeto; no se puede continuar diagnóstico de export desde subsecuencia.";
    return result;
  }

  result.subsequenceOwnKeys = safeOwnKeys(createdObject);
  result.subsequenceMethods = filterNoisyMethodNames(extractMethods(createdObject));
  result.subsequenceKeywordMatches = flattenKeywordNamesForDiagnostics(
    collectMediaPathKeywordMatches([
      ...result.subsequenceOwnKeys,
      ...result.subsequenceMethods,
    ]),
  );
  result.exportCandidatesFromSubsequence = dedupeSortedStrings(
    result.subsequenceMethods.filter((method) => isAudioExportKeywordMethodName(method)),
  );
  result.subsequenceName =
    asString(await callMethod(createdObject, "getName")) ??
    asString(createdObject.name) ??
    null;
  result.subsequenceId =
    asString(await callMethod(createdObject, "getId")) ??
    asString(createdObject.id) ??
    null;
  result.subsequenceDurationMs = toDurationMs(await callMethod(createdObject, "getDuration"));

  const sequenceSignalCount = sequenceMethods.filter((method) => isAudioExportKeywordMethodName(method)).length;
  const subsequenceSignalCount = result.exportCandidatesFromSubsequence.length;
  result.richerThanActiveSequence = subsequenceSignalCount > sequenceSignalCount;

  const actionProbe = await runSubsequenceActionProbe({
    subsequenceObject: createdObject,
    activeProjectObject,
    log,
    mode: "observable_single",
  });
  result.actionProbeTried = actionProbe.actionProbeTried;
  result.actionProbeResult = actionProbe.actionProbeResult;
  result.actionProbeError = actionProbe.actionProbeError;
  result.actionNextRecommendation = actionProbe.actionNextRecommendation;

  const selectedActionFactory = actionProbe.selectedActionFactory;
  const selectedActionValue = actionProbe.selectedActionValue;
  const projectBeforeSnapshot = await captureProjectSequenceSnapshot(activeProjectObject);
  let transactionProbeOutcome: Awaited<ReturnType<typeof runProjectTransactionProbe>> | null = null;

  if (selectedActionFactory && selectedActionValue) {
    const transactionProbe = await runProjectTransactionProbe({
      activeProjectObject,
      subsequenceObject: createdObject,
      actionFactory: selectedActionFactory,
      actionObject: selectedActionValue,
      log,
    });
    transactionProbeOutcome = transactionProbe;
    result.transactionProbeTried = [transactionProbe.transactionProbeTried];
    result.transactionProbeResult = transactionProbe.transactionProbeResult;
    result.transactionProbeError = transactionProbe.transactionProbeError;
    result.transactionProbeConclusion = transactionProbe.transactionProbeConclusion;
    result.transactionNextRecommendation = transactionProbe.transactionNextRecommendation;
    result.observableActionTried = transactionProbe.observableActionTried;
    result.observableBefore = transactionProbe.observableBefore;
    result.observableAfter = transactionProbe.observableAfter;
    result.observableChanged = transactionProbe.observableChanged;
    result.observableConclusion = transactionProbe.observableConclusion;
    result.observableNextRecommendation = transactionProbe.observableNextRecommendation;
  } else {
    result.transactionProbeTried = [];
    result.transactionProbeResult = null;
    result.transactionProbeError = "No se obtuvo action utilizable para executeTransaction.";
    result.transactionProbeConclusion = "No se ejecutó transaction probe porque no hubo action válida.";
    result.transactionNextRecommendation =
      "Confirmar firma de createCloneAction/createSet* y volver a intentar generación de action.";
    result.observableActionTried = null;
    result.observableBefore = null;
    result.observableAfter = null;
    result.observableChanged = null;
    result.observableConclusion =
      "No se pudo ejecutar acción observable porque no se generó action válida.";
    result.observableNextRecommendation =
      "Probar la próxima action priorizada disponible: createSetInPointAction, createSetOutPointAction, createSetZeroPointAction o createSetSettingsAction.";
  }

  const outputProbe = await runOutputMaterializationProbe({
    activeProjectObject,
    activeSequenceObject,
    subsequenceObject: createdObject,
    actionFactory: selectedActionFactory,
    transactionProbe: transactionProbeOutcome,
    projectBeforeSnapshot,
    log,
  });
  result.outputProbeTried = outputProbe.outputProbeTried;
  result.outputProbeResult = outputProbe.outputProbeResult;
  result.outputProbeError = outputProbe.outputProbeError;
  result.outputProbePath = outputProbe.outputProbePath;
  result.outputProbeExists = outputProbe.outputProbeExists;
  result.outputProbeConclusion = outputProbe.outputProbeConclusion;
  result.outputNextRecommendation = outputProbe.outputNextRecommendation;

  if (outputProbe.outputProbeExists !== null) {
    result.conclusion = outputProbe.outputProbeConclusion;
  } else if (result.exportCandidatesFromSubsequence.length > 0) {
    result.conclusion = [
      "createSubsequence creó una Sequence usable con candidatos de export/render:",
      formatListPlainText(result.exportCandidatesFromSubsequence),
    ].join(" ");
  } else {
    result.conclusion =
      "createSubsequence funcionó, pero la subsecuencia no expone métodos directos adicionales de export/render/audio.";
  }

  return result;
}

async function runSubsequenceActionProbe(input: {
  subsequenceObject: UnknownRecord;
  activeProjectObject: UnknownRecord;
  log: SelectionLogger;
  mode?: "default" | "fallback_single" | "observable_single";
}): Promise<{
  actionProbeTried: string[];
  actionProbeResult: string | null;
  actionProbeError: string | null;
  actionNextRecommendation: string | null;
  selectedActionFactory: string | null;
  selectedActionValue: UnknownRecord | null;
}> {
  const {
    subsequenceObject,
    activeProjectObject,
    log,
    mode = "default",
  } = input;
  const actionProbeTried: string[] = [];
  let actionProbeError: string | null = null;

  const inPoint = await callMethod(subsequenceObject, "getInPoint");
  const outPoint = await callMethod(subsequenceObject, "getOutPoint");
  const zeroPoint = await callMethod(subsequenceObject, "getZeroPoint");
  const currentSettings = await callMethod(subsequenceObject, "getSettings");
  const hasInPoint = inPoint !== null && inPoint !== undefined;
  const hasOutPoint = outPoint !== null && outPoint !== undefined;
  const hasZeroPoint = zeroPoint !== null && zeroPoint !== undefined;

  const defaultPlans: Array<{ methodName: string; args: unknown[]; label: string }> = [
    { methodName: "createCloneAction", args: [], label: "createCloneAction()" },
    {
      methodName: "createSetInPointAction",
      args: hasInPoint ? [inPoint] : [],
      label: hasInPoint ? "createSetInPointAction(getInPoint())" : "createSetInPointAction()",
    },
    {
      methodName: "createSetOutPointAction",
      args: hasOutPoint ? [outPoint] : [],
      label: hasOutPoint ? "createSetOutPointAction(getOutPoint())" : "createSetOutPointAction()",
    },
    {
      methodName: "createSetZeroPointAction",
      args: hasZeroPoint ? [zeroPoint] : [],
      label: hasZeroPoint ? "createSetZeroPointAction(getZeroPoint())" : "createSetZeroPointAction()",
    },
    {
      methodName: "createSetSettingsAction",
      args: asRecord(currentSettings) ? [currentSettings] : [{}],
      label: asRecord(currentSettings)
        ? "createSetSettingsAction(getSettings())"
        : "createSetSettingsAction({})",
    },
  ];

  const observablePriorityPlans: Array<{ methodName: string; args: unknown[]; label: string }> = [
    {
      methodName: "createSetInPointAction",
      args: hasInPoint ? [inPoint] : [],
      label: hasInPoint ? "createSetInPointAction(getInPoint())" : "createSetInPointAction()",
    },
    {
      methodName: "createSetOutPointAction",
      args: hasOutPoint ? [outPoint] : [],
      label: hasOutPoint ? "createSetOutPointAction(getOutPoint())" : "createSetOutPointAction()",
    },
    {
      methodName: "createSetZeroPointAction",
      args: hasZeroPoint ? [zeroPoint] : [],
      label: hasZeroPoint ? "createSetZeroPointAction(getZeroPoint())" : "createSetZeroPointAction()",
    },
    {
      methodName: "createSetSettingsAction",
      args: asRecord(currentSettings) ? [currentSettings] : [{}],
      label: asRecord(currentSettings)
        ? "createSetSettingsAction(getSettings())"
        : "createSetSettingsAction({})",
    },
  ];

  let plans = defaultPlans;
  if (mode === "observable_single") {
    const firstObservable = observablePriorityPlans.find((plan) => {
      const factory = asFunction(subsequenceObject[plan.methodName]);
      if (!factory) {
        return false;
      }

      if (
        (plan.methodName === "createSetInPointAction" && !hasInPoint) ||
        (plan.methodName === "createSetOutPointAction" && !hasOutPoint)
      ) {
        return false;
      }

      return true;
    });
    plans = firstObservable ? [firstObservable] : [];
  }

  if (mode === "fallback_single") {
    const fallbackPlans = observablePriorityPlans;
    const firstAvailableFallback = fallbackPlans.find((plan) => asFunction(subsequenceObject[plan.methodName]));
    plans = firstAvailableFallback ? [firstAvailableFallback] : [];
  }

  for (const plan of plans) {
    const actionFactory = asFunction(subsequenceObject[plan.methodName]);
    if (!actionFactory) {
      actionProbeTried.push(`${plan.label}:unavailable`);
      continue;
    }

    actionProbeTried.push(plan.label);
    log("subsequence action probe start", {
      action: plan.label,
    });

    try {
      const actionValue = await Promise.resolve(actionFactory.apply(subsequenceObject, plan.args));
      if (actionValue === null || actionValue === undefined) {
        actionProbeError = `${plan.label} devolvió null/undefined`;
        log("subsequence action probe null result", {
          action: plan.label,
          message: actionProbeError,
        });
        continue;
      }

      const actionObject = asRecord(actionValue);
      if (!actionObject) {
        actionProbeError = `${plan.label} devolvió valor no-objeto (${typeof actionValue})`;
        log("subsequence action probe non-object result", {
          action: plan.label,
          message: actionProbeError,
          returned: describeMediaPathRawValue(actionValue),
        });
        continue;
      }

      const actionMethods = actionObject ? filterNoisyMethodNames(extractMethods(actionObject)) : [];
      const actionOwnKeys = actionObject ? safeOwnKeys(actionObject) : [];
      const hasExecuteTransaction = hasMethod(activeProjectObject, "executeTransaction");
      const looksCompoundAction = actionMethods.some((name) => /(compound|add|append|merge|actions)/i.test(name));
      const looksExecutableAction = actionMethods.some((name) => /(execute|perform|run|apply|commit)/i.test(name));

      const actionProbeResult = [
        `factory=${plan.methodName}`,
        `returned=${describeMediaPathRawValue(actionValue)}`,
        `actionOwnKeys=${formatListPlainText(actionOwnKeys)}`,
        `actionMethods=${formatListPlainText(actionMethods)}`,
        `projectExecuteTransaction=${String(hasExecuteTransaction)}`,
        `looksCompound=${String(looksCompoundAction)}`,
        `looksExecutable=${String(looksExecutableAction)}`,
      ].join(" | ");

      let actionNextRecommendation: string;
      if (hasExecuteTransaction) {
        actionNextRecommendation =
          "Siguiente paso: probar ejecución controlada dentro de project.executeTransaction, sin backend ni import final.";
      } else {
        actionNextRecommendation =
          "No se detecta executeTransaction en project; falta mecanismo de ejecución explícita de actions en runtime.";
      }

      log("subsequence action probe result", {
        action: plan.label,
        actionProbeResult,
        actionNextRecommendation,
      });

      actionProbeError = null;
      return {
        actionProbeTried,
        actionProbeResult,
        actionProbeError,
        actionNextRecommendation,
        selectedActionFactory: plan.methodName,
        selectedActionValue: actionObject,
      };
    } catch (error) {
      actionProbeError = toErrorMessage(error);
      log("subsequence action probe error", {
        action: plan.label,
        message: actionProbeError,
      });
    }
  }

  return {
    actionProbeTried,
    actionProbeResult: null,
    actionProbeError,
    actionNextRecommendation:
      "Ninguna action factory pudo ejecutarse con firma mínima. Revisar firma real de createCloneAction/createSet* antes de intentar executeTransaction.",
    selectedActionFactory: null,
    selectedActionValue: null,
  };
}

async function runProjectTransactionProbe(input: {
  activeProjectObject: UnknownRecord;
  subsequenceObject: UnknownRecord;
  actionFactory: string;
  actionObject: UnknownRecord;
  log: SelectionLogger;
}): Promise<{
  transactionProbeTried: string;
  transactionProbeResult: string | null;
  transactionProbeError: string | null;
  transactionProbeConclusion: string | null;
  transactionNextRecommendation: string | null;
  observableActionTried: string;
  observableBefore: string;
  observableAfter: string;
  observableChanged: boolean | null;
  observableConclusion: string;
  observableNextRecommendation: string;
  success: boolean;
}> {
  const {
    activeProjectObject,
    subsequenceObject,
    actionFactory,
    actionObject,
    log,
  } = input;

  const beforeSnapshot = await captureObservableSequenceSnapshot(subsequenceObject);

  const executeTransactionFn = asFunction(activeProjectObject.executeTransaction);
  if (!executeTransactionFn) {
    return {
      transactionProbeTried: "project.executeTransaction:unavailable",
      transactionProbeResult: null,
      transactionProbeError: "project.executeTransaction no está disponible en runtime.",
      transactionProbeConclusion:
        "No se pudo ejecutar la action porque falta executeTransaction en el project activo.",
      transactionNextRecommendation:
        "Buscar mecanismo alternativo de ejecución de acciones en runtime UXP.",
      observableActionTried: actionFactory,
      observableBefore: beforeSnapshot.summary,
      observableAfter: beforeSnapshot.summary,
      observableChanged: false,
      observableConclusion:
        "No se pudo validar cambio observable porque executeTransaction no está disponible.",
      observableNextRecommendation:
        "Resolver ejecución de transacciones antes de medir efecto observable de la acción.",
      success: false,
    };
  }

  const executeArity = executeTransactionFn.length;
  const executeSignature = truncateText(safeFunctionSource(executeTransactionFn), 180);
  const invocationLabel = executeArity >= 2
    ? "project.executeTransaction(label, callback)"
    : "project.executeTransaction(callback)";

  let callbackInvoked = false;
  let callbackArgSummary = "none";
  let callbackArgMethodsSummary = "none";
  let compoundApplyMethod: string | null = null;
  let compoundApplyError: string | null = null;
  let compoundApplySucceeded = false;

  const callback = (transactionArg: unknown): unknown => {
    callbackInvoked = true;
    const transactionObject = asRecord(transactionArg);
    callbackArgSummary = describeMediaPathRawValue(transactionArg);
    callbackArgMethodsSummary = transactionObject
      ? formatListPlainText(filterNoisyMethodNames(extractMethods(transactionObject)))
      : "(none)";

    if (transactionObject) {
      const compoundMethodCandidates = [
        "addAction",
        "appendAction",
        "insertAction",
        "pushAction",
        "add",
        "append",
      ];
      for (const methodName of compoundMethodCandidates) {
        const compoundMethod = asFunction(transactionObject[methodName]);
        if (!compoundMethod) {
          continue;
        }

        compoundApplyMethod = methodName;
        try {
          compoundMethod.call(transactionObject, actionObject);
          compoundApplySucceeded = true;
        } catch (error) {
          compoundApplyError = toErrorMessage(error);
        }
        break;
      }
    }

    // Fallback seguro: devolver la action para runtimes que consumen retorno del callback.
    return actionObject;
  };

  log("transaction probe start", {
    actionFactory,
    invocation: invocationLabel,
    executeArity,
    executeSignature,
  });

  let transactionResult: unknown = null;
  let transactionProbeError: string | null = null;
  try {
    transactionResult = executeArity >= 2
      ? await Promise.resolve(
          executeTransactionFn.call(
            activeProjectObject,
            `GLIFO transaction probe ${new Date().toISOString()}`,
            callback,
          ),
        )
      : await Promise.resolve(executeTransactionFn.call(activeProjectObject, callback));
  } catch (error) {
    transactionProbeError = toErrorMessage(error);
  }

  if (transactionProbeError) {
    const afterSnapshot = await captureObservableSequenceSnapshot(subsequenceObject);
    return {
      transactionProbeTried: `${invocationLabel} | action=${actionFactory}`,
      transactionProbeResult: null,
      transactionProbeError,
      transactionProbeConclusion:
        "executeTransaction lanzó error al intentar aplicar la action sobre subsecuencia.",
      transactionNextRecommendation:
        "Revisar firma real de executeTransaction y formato de action esperado por el callback/compound.",
      observableActionTried: actionFactory,
      observableBefore: beforeSnapshot.summary,
      observableAfter: afterSnapshot.summary,
      observableChanged: beforeSnapshot.comparable !== afterSnapshot.comparable,
      observableConclusion:
        "La transacción falló; no hay señal confiable de efecto observable aplicado.",
      observableNextRecommendation:
        "Corregir ejecución de transaction/callback y reintentar una sola acción observable.",
      success: false,
    };
  }

  const afterSnapshot = await captureObservableSequenceSnapshot(subsequenceObject);
  const observableChanged = beforeSnapshot.comparable !== afterSnapshot.comparable;

  const transactionProbeResult = [
    `actionFactory=${actionFactory}`,
    `invocation=${invocationLabel}`,
    `executeArity=${executeArity}`,
    `executeReturn=${describeMediaPathRawValue(transactionResult)}`,
    `callbackInvoked=${String(callbackInvoked)}`,
    `callbackArg=${callbackArgSummary}`,
    `callbackArgMethods=${callbackArgMethodsSummary}`,
    `compoundApplyMethod=${compoundApplyMethod ?? "(none)"}`,
    `compoundApplySucceeded=${String(compoundApplySucceeded)}`,
    `compoundApplyError=${compoundApplyError ?? "(none)"}`,
  ].join(" | ");

  const success = callbackInvoked && (compoundApplySucceeded || transactionResult !== false);

  const transactionProbeConclusion = success
    ? "executeTransaction se ejecutó sin error y hay señales de aceptación de la action."
    : callbackInvoked
      ? "executeTransaction invocó callback, pero no hay señal fuerte de aceptación de la action."
      : "executeTransaction no invocó callback; la action no parece haberse aplicado.";

  const transactionNextRecommendation = success
    ? "Próximo paso: validar efecto observable mínimo y luego diseñar acción hacia export/render temporal."
    : "Probar variante de callback/compound action antes de avanzar a flujo de export.";

  const observableConclusion = observableChanged
    ? "Se detectó diferencia observable en la subsecuencia luego de ejecutar la acción."
    : "La acción fue aceptada, pero no se detectó cambio observable en los campos inspeccionados.";
  const observableNextRecommendation = observableChanged
    ? "Usar esta acción como base para diseñar un flujo mínimo hacia export/render temporal."
    : "Probar otra action priorizada (SetIn/SetOut/SetZero/SetSettings) o ampliar métricas observables.";

  return {
    transactionProbeTried: `${invocationLabel} | action=${actionFactory}`,
    transactionProbeResult,
    transactionProbeError: null,
    transactionProbeConclusion,
    transactionNextRecommendation,
    observableActionTried: actionFactory,
    observableBefore: beforeSnapshot.summary,
    observableAfter: afterSnapshot.summary,
    observableChanged,
    observableConclusion,
    observableNextRecommendation,
    success,
  };
}

async function captureProjectSequenceSnapshot(projectObject: UnknownRecord): Promise<{
  available: boolean;
  count: number;
  entries: Array<{ id: string; name: string }>;
  comparable: string;
  summary: string;
  reason: string | null;
}> {
  const getSequences = asFunction(projectObject.getSequences);
  if (!getSequences) {
    return {
      available: false,
      count: 0,
      entries: [],
      comparable: safeJsonStringify({ available: false }),
      summary: "project.getSequences unavailable",
      reason: "project.getSequences unavailable",
    };
  }

  let rawSequences: unknown = null;
  try {
    rawSequences = await Promise.resolve(getSequences.call(projectObject));
  } catch (error) {
    const reason = `project.getSequences error: ${toErrorMessage(error)}`;
    return {
      available: false,
      count: 0,
      entries: [],
      comparable: safeJsonStringify({ available: false, reason }),
      summary: reason,
      reason,
    };
  }

  const sequenceValues = extractObjectsFromCollection(rawSequences);
  const entries: Array<{ id: string; name: string }> = [];
  for (let index = 0; index < sequenceValues.length; index += 1) {
    const sequenceObject = asRecord(sequenceValues[index]);
    if (!sequenceObject) {
      continue;
    }

    const id =
      asString(await callMethod(sequenceObject, "getId")) ??
      asString(sequenceObject.id) ??
      `index_${index}`;
    const name =
      asString(await callMethod(sequenceObject, "getName")) ??
      asString(sequenceObject.name) ??
      "(unnamed)";
    entries.push({ id, name });
  }

  const count = entries.length;
  return {
    available: true,
    count,
    entries,
    comparable: safeJsonStringify({
      count,
      ids: entries.map((entry) => entry.id),
      names: entries.map((entry) => entry.name),
    }),
    summary: [
      "project.getSequences ok",
      `count=${count}`,
      `ids=${formatListPlainText(entries.map((entry) => entry.id).slice(0, 12))}`,
    ].join(" | "),
    reason: null,
  };
}

async function runOutputMaterializationProbe(input: {
  activeProjectObject: UnknownRecord;
  activeSequenceObject: UnknownRecord | null;
  subsequenceObject: UnknownRecord;
  actionFactory: string | null;
  transactionProbe: Awaited<ReturnType<typeof runProjectTransactionProbe>> | null;
  projectBeforeSnapshot: Awaited<ReturnType<typeof captureProjectSequenceSnapshot>>;
  log: SelectionLogger;
}): Promise<{
  outputProbeTried: string[];
  outputProbeResult: string | null;
  outputProbeError: string | null;
  outputProbePath: string | null;
  outputProbeExists: boolean;
  outputProbeConclusion: string;
  outputNextRecommendation: string;
}> {
  const {
    activeProjectObject,
    activeSequenceObject,
    subsequenceObject,
    actionFactory,
    transactionProbe,
    projectBeforeSnapshot,
    log,
  } = input;

  const outputProbeTried: string[] = [];
  let outputProbeError: string | null = null;
  let outputProbePath: string | null = null;
  let outputProbeExists = false;

  outputProbeTried.push("project.getSequences before/after");
  const projectAfterSnapshot = await captureProjectSequenceSnapshot(activeProjectObject);
  const beforeIds = new Set(projectBeforeSnapshot.entries.map((entry) => entry.id));
  const addedEntries = projectAfterSnapshot.entries.filter((entry) => !beforeIds.has(entry.id));
  const sequenceTraceChanged =
    projectBeforeSnapshot.available &&
    projectAfterSnapshot.available &&
    projectBeforeSnapshot.comparable !== projectAfterSnapshot.comparable;

  if (sequenceTraceChanged) {
    outputProbeExists = true;
    const addedIds = addedEntries.map((entry) => entry.id);
    const addedNames = addedEntries.map((entry) => entry.name);
    const outputProbeResult = [
      `trace=project_sequences_changed`,
      `before=${projectBeforeSnapshot.count}`,
      `after=${projectAfterSnapshot.count}`,
      `addedIds=${formatListPlainText(addedIds)}`,
      `addedNames=${formatListPlainText(addedNames)}`,
      `actionFactory=${actionFactory ?? "(none)"}`,
    ].join(" | ");

    log("output probe trace changed", {
      outputProbeResult,
      beforeSummary: projectBeforeSnapshot.summary,
      afterSummary: projectAfterSnapshot.summary,
    });

    return {
      outputProbeTried,
      outputProbeResult,
      outputProbeError: null,
      outputProbePath: null,
      outputProbeExists,
      outputProbeConclusion:
        "Se detectó rastro verificable en project.getSequences luego de ejecutar la ruta de subsecuencia.",
      outputNextRecommendation:
        "Tomar esa nueva secuencia como insumo y mover el render/export temporal a un workflow externo controlado.",
    };
  }

  outputProbeTried.push("direct_output_method:skipped_by_external_strategy");
  outputProbeError = "Direct output probe omitido para no reintentar ruta directa descartada.";

  const transactionStatus = transactionProbe
    ? `transactionSuccess=${String(transactionProbe.success)}`
    : "transactionSuccess=false";

  const outputProbeResult = [
    `trace=none`,
    `before=${projectBeforeSnapshot.summary}`,
    `after=${projectAfterSnapshot.summary}`,
    transactionStatus,
    `actionFactory=${actionFactory ?? "(none)"}`,
  ].join(" | ");

  if (transactionProbe?.transactionProbeError && !outputProbeError) {
    outputProbeError = transactionProbe.transactionProbeError;
  }

  return {
    outputProbeTried,
    outputProbeResult,
    outputProbeError,
    outputProbePath,
    outputProbeExists: false,
    outputProbeConclusion:
      "No se creó output/archivo/rastro verificable con la ruta probada; se descarta como vía directa desde UXP.",
    outputNextRecommendation:
      "Siguiente estrategia: workflow externo controlado de render/export desde Premiere o Media Encoder y luego transcribir.",
  };
}

async function runExternalRouteProbe(input: {
  activeProjectObject: UnknownRecord;
  subsequenceProbe: MediaPathDiagnosticsReport["audioExportDiagnostics"]["subsequenceProbe"];
  explicitDirectCandidates: string[];
  log: SelectionLogger;
}): Promise<{
  routeOptions: {
    viableFromUxpDirect: string[];
    viableIndirectHandoff: string[];
    notViable: string[];
  };
  externalRouteTried: string;
  externalRouteReason: string;
  externalRouteResult: string;
  externalRoutePath: string | null;
  externalRouteExists: boolean;
  externalRouteConclusion: string;
  externalRouteNextRecommendation: string;
}> {
  const { activeProjectObject, subsequenceProbe, explicitDirectCandidates, log } = input;

  const routeOptions = {
    viableFromUxpDirect: explicitDirectCandidates,
    viableIndirectHandoff: [] as string[],
    notViable: [] as string[],
  };

  if (subsequenceProbe.subsequenceCreated) {
    routeOptions.viableIndirectHandoff.push("Sequence.createSubsequence -> Export Media/Queue (manual)");
  }

  if (subsequenceProbe.transactionProbeResult) {
    routeOptions.viableIndirectHandoff.push("project.executeTransaction accepted action on subsequence");
  }

  if (subsequenceProbe.outputProbeExists === false) {
    routeOptions.notViable.push("DirectOutputProbe(discarded_no_verifiable_output)");
  }

  if (explicitDirectCandidates.length === 0) {
    routeOptions.notViable.push("No runtime method for direct export/render materialization");
  }

  const dedupedRouteOptions = {
    viableFromUxpDirect: dedupeSortedStrings(routeOptions.viableFromUxpDirect),
    viableIndirectHandoff: dedupeSortedStrings(routeOptions.viableIndirectHandoff),
    notViable: dedupeSortedStrings(routeOptions.notViable),
  };

  const externalRouteTried = "manual_handoff:subsequence_to_export_media_or_ame";
  const externalRouteReason = [
    "La materialización directa desde UXP ya fue descartada por falta de output verificable.",
    "La subsecuencia sí se crea y queda como rastro verificable para handoff externo.",
  ].join(" ");

  const projectSnapshot = await captureProjectSequenceSnapshot(activeProjectObject);
  const matchedById = subsequenceProbe.subsequenceId
    ? projectSnapshot.entries.find((entry) => entry.id === subsequenceProbe.subsequenceId)
    : null;
  const matchedByName = !matchedById && subsequenceProbe.subsequenceName
    ? projectSnapshot.entries.find((entry) => entry.name === subsequenceProbe.subsequenceName)
    : null;
  const matchedEntry = matchedById ?? matchedByName ?? null;
  const externalRouteExists = Boolean(matchedEntry);
  const externalRoutePath = matchedById
    ? `sequence://${matchedById.id}`
    : matchedByName
      ? `sequence://name/${matchedByName.name}`
      : null;

  const externalRouteResult = [
    `strategy=${externalRouteTried}`,
    `projectSequencesCount=${projectSnapshot.count}`,
    `subsequenceId=${subsequenceProbe.subsequenceId ?? "(none)"}`,
    `subsequenceName=${subsequenceProbe.subsequenceName ?? "(none)"}`,
    `matchedBy=${matchedById ? "id" : matchedByName ? "name" : "none"}`,
    `manualExportRequired=true`,
  ].join(" | ");

  log("external route probe", {
    externalRouteTried,
    externalRouteReason,
    externalRouteResult,
    externalRoutePath,
    externalRouteExists,
    routeOptions: dedupedRouteOptions,
  });

  if (externalRouteExists) {
    return {
      routeOptions: dedupedRouteOptions,
      externalRouteTried,
      externalRouteReason,
      externalRouteResult,
      externalRoutePath,
      externalRouteExists,
      externalRouteConclusion:
        "Ruta externa viable: la subsecuencia quedó verificable en el proyecto y puede exportarse/encolarse manualmente.",
      externalRouteNextRecommendation:
        "Abrir Export Media o Queue to Adobe Media Encoder sobre esa subsecuencia y obtener archivo temporal verificable (WAV/MP4) para backend STT.",
    };
  }

  return {
    routeOptions: dedupedRouteOptions,
    externalRouteTried,
    externalRouteReason,
    externalRouteResult,
    externalRoutePath: null,
    externalRouteExists: false,
    externalRouteConclusion:
      "No se pudo verificar rastro de subsecuencia en project.getSequences; la ruta externa no queda confirmada en este intento.",
    externalRouteNextRecommendation:
      "Reintentar createSubsequence y confirmar aparición en el proyecto antes de pasar a export/queue manual.",
  };
}

function isExplicitDirectExternalMethodName(methodName: string): boolean {
  const normalized = methodName.toLowerCase();
  const hasVerb = /(export|render|encode|mediaencoder|queue|output|bounce)/i.test(methodName);
  if (!hasVerb) {
    return false;
  }

  if (normalized.includes("action")) {
    return false;
  }

  if (normalized.startsWith("create")) {
    return false;
  }

  return true;
}

function selectOutputMaterializationMethodCandidate(input: {
  subsequenceObject: UnknownRecord;
  activeSequenceObject: UnknownRecord | null;
  activeProjectObject: UnknownRecord;
}): {
  objectLabel: string;
  object: UnknownRecord;
  methodName: string;
  arity: number;
} | null {
  const { subsequenceObject, activeSequenceObject, activeProjectObject } = input;
  const methodCandidates: Array<{
    objectLabel: string;
    object: UnknownRecord;
    methodName: string;
    arity: number;
    score: number;
  }> = [];

  const sources: Array<{ label: string; value: UnknownRecord | null }> = [
    { label: "Subsequence", value: subsequenceObject },
    { label: "Sequence", value: activeSequenceObject },
    { label: "Project", value: activeProjectObject },
  ];

  for (const source of sources) {
    const objectValue = source.value;
    if (!objectValue) {
      continue;
    }

    const methods = filterNoisyMethodNames(extractMethods(objectValue));
    for (const methodName of methods) {
      if (!isOutputMaterializationMethodName(methodName)) {
        continue;
      }

      const methodValue = asFunction(objectValue[methodName]);
      if (!methodValue) {
        continue;
      }

      methodCandidates.push({
        objectLabel: source.label,
        object: objectValue,
        methodName,
        arity: methodValue.length,
        score: scoreOutputMaterializationMethodName(methodName),
      });
    }
  }

  methodCandidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }

    const sourcePriority = ["Subsequence", "Sequence", "Project"];
    const sourceScore = sourcePriority.indexOf(a.objectLabel) - sourcePriority.indexOf(b.objectLabel);
    if (sourceScore !== 0) {
      return sourceScore;
    }

    return a.methodName.localeCompare(b.methodName);
  });

  if (methodCandidates.length === 0) {
    return null;
  }

  const winner = methodCandidates[0];
  return {
    objectLabel: winner.objectLabel,
    object: winner.object,
    methodName: winner.methodName,
    arity: winner.arity,
  };
}

function isOutputMaterializationMethodName(methodName: string): boolean {
  const normalized = methodName.toLowerCase();
  const hasVerb = /(export|render|encode|mediaencoder|output|bounce)/i.test(methodName);
  if (!hasVerb) {
    return false;
  }

  if (normalized.includes("action")) {
    return false;
  }

  if (normalized.startsWith("create")) {
    return false;
  }

  return true;
}

function scoreOutputMaterializationMethodName(methodName: string): number {
  const normalized = methodName.toLowerCase();
  let score = 0;

  if (normalized.includes("audio")) {
    score += 40;
  }
  if (normalized.includes("export")) {
    score += 30;
  }
  if (normalized.includes("render")) {
    score += 25;
  }
  if (normalized.includes("encode")) {
    score += 20;
  }
  if (normalized.includes("output")) {
    score += 15;
  }
  if (normalized.includes("file")) {
    score += 10;
  }

  return score;
}

function buildOutputProbeArgs(arity: number, tempOutputPath: string): unknown[] {
  if (arity <= 0) {
    return [];
  }

  if (arity === 1) {
    return [tempOutputPath];
  }

  if (arity === 2) {
    return [tempOutputPath, {}];
  }

  return [tempOutputPath, {}, {}];
}

function buildTemporaryAudioOutputPath(): string {
  const fallbackDir = "/tmp";
  const fileName = `glifo-output-probe-${Date.now()}.wav`;
  const requireFn = asFunction((globalThis as UnknownRecord).require);
  if (!requireFn) {
    return `${fallbackDir}/${fileName}`;
  }

  let tmpDir = fallbackDir;
  try {
    const osModule = asRecord(requireFn("os"));
    const tmpdirFn = osModule ? asFunction(osModule.tmpdir) : null;
    const candidate = tmpdirFn ? asString(tmpdirFn.call(osModule)) : null;
    if (candidate) {
      tmpDir = candidate;
    }
  } catch {
    tmpDir = fallbackDir;
  }

  try {
    const pathModule = asRecord(requireFn("path"));
    const joinFn = pathModule ? asFunction(pathModule.join) : null;
    if (joinFn) {
      const joined = joinFn.call(pathModule, tmpDir, fileName);
      const asJoined = asString(joined);
      if (asJoined) {
        return asJoined;
      }
    }
  } catch {
    return `${tmpDir}/${fileName}`;
  }

  return `${tmpDir}/${fileName}`;
}

function extractOutputPathCandidate(value: unknown): string | null {
  const direct = asString(value);
  if (direct && looksLikePathValue(direct)) {
    return direct;
  }

  const normalized = normalizeResolvedMediaPath(value);
  if (normalized && looksLikePathValue(normalized)) {
    return normalized;
  }

  const valueObject = asRecord(value);
  if (!valueObject) {
    return null;
  }

  const preferredKeys = [
    "outputPath",
    "exportPath",
    "filePath",
    "path",
    "destinationPath",
    "audioPath",
    "mediaPath",
    "tempPath",
  ];

  for (const key of preferredKeys) {
    const candidate = asString(safeGetProperty(valueObject, key));
    if (candidate && looksLikePathValue(candidate)) {
      return candidate;
    }
  }

  for (const key of safeOwnKeys(valueObject).slice(0, 20)) {
    if (!/(path|file|output|destination|temp|audio|media)/i.test(key)) {
      continue;
    }

    const candidate = asString(safeGetProperty(valueObject, key));
    if (candidate && looksLikePathValue(candidate)) {
      return candidate;
    }
  }

  return null;
}

function looksLikePathValue(value: string): boolean {
  if (value.trim().length === 0) {
    return false;
  }

  return (
    value.includes("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("~")
  );
}

function checkHostPathExists(pathValue: string): {
  exists: boolean;
  strategy: string;
  error: string | null;
} {
  const requireFn = asFunction((globalThis as UnknownRecord).require);
  if (!requireFn) {
    return {
      exists: false,
      strategy: "require_unavailable",
      error: "globalThis.require no disponible para verificar archivo",
    };
  }

  try {
    const fsModule = asRecord(requireFn("fs"));
    if (!fsModule) {
      return {
        exists: false,
        strategy: "fs_unavailable",
        error: "require('fs') devolvió valor no-objeto",
      };
    }

    const existsSync = asFunction(fsModule.existsSync);
    if (existsSync) {
      return {
        exists: Boolean(existsSync.call(fsModule, pathValue)),
        strategy: "fs.existsSync",
        error: null,
      };
    }

    const statSync = asFunction(fsModule.statSync);
    if (statSync) {
      try {
        statSync.call(fsModule, pathValue);
        return {
          exists: true,
          strategy: "fs.statSync",
          error: null,
        };
      } catch (error) {
        return {
          exists: false,
          strategy: "fs.statSync",
          error: toErrorMessage(error),
        };
      }
    }

    return {
      exists: false,
      strategy: "fs_no_exists_checker",
      error: "fs no expone existsSync/statSync",
    };
  } catch (error) {
    return {
      exists: false,
      strategy: "fs_require_error",
      error: toErrorMessage(error),
    };
  }
}

async function captureObservableSequenceSnapshot(sequenceObject: UnknownRecord): Promise<{
  summary: string;
  comparable: string;
}> {
  const inPoint = await callMethod(sequenceObject, "getInPoint");
  const outPoint = await callMethod(sequenceObject, "getOutPoint");
  const zeroPoint = await callMethod(sequenceObject, "getZeroPoint");
  const endTime = await callMethod(sequenceObject, "getEndTime");
  const frameSize = await callMethod(sequenceObject, "getFrameSize");
  const duration = await callMethod(sequenceObject, "getDuration");

  const comparableObject = {
    inPoint: toObservableComparableValue(inPoint),
    outPoint: toObservableComparableValue(outPoint),
    zeroPoint: toObservableComparableValue(zeroPoint),
    endTime: toObservableComparableValue(endTime),
    frameSize: toObservableComparableValue(frameSize),
    duration: toObservableComparableValue(duration),
  };

  const summary = [
    `inPoint=${describeObservableValue(inPoint)}`,
    `outPoint=${describeObservableValue(outPoint)}`,
    `zeroPoint=${describeObservableValue(zeroPoint)}`,
    `endTime=${describeObservableValue(endTime)}`,
    `frameSize=${describeObservableValue(frameSize)}`,
    `duration=${describeObservableValue(duration)}`,
  ].join(" | ");

  return {
    summary,
    comparable: safeJsonStringify(comparableObject),
  };
}

function describeObservableValue(value: unknown): string {
  const comparable = toObservableComparableValue(value);
  if (typeof comparable === "string") {
    return comparable;
  }

  return safeJsonStringify(comparable);
}

function toObservableComparableValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => toObservableComparableValue(entry));
  }

  const valueObject = asRecord(value);
  if (!valueObject) {
    return describeMediaPathRawValue(value);
  }

  const preferredKeys = [
    "seconds",
    "ticks",
    "frames",
    "timecode",
    "value",
    "width",
    "height",
    "x",
    "y",
  ];

  const output: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    const entry = safeGetProperty(valueObject, key);
    if (entry === undefined) {
      continue;
    }

    const normalized = toObservableComparableValue(entry);
    if (normalized !== null && normalized !== undefined) {
      output[key] = normalized;
    }
  }

  if (Object.keys(output).length === 0) {
    const keys = safeOwnKeys(valueObject).slice(0, 8);
    for (const key of keys) {
      const entry = safeGetProperty(valueObject, key);
      if (typeof entry === "function") {
        continue;
      }

      output[key] = toObservableComparableValue(entry);
    }
  }

  return output;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function resolveFirstProjectPanelItemForDiagnostics(
  projectPanelSelections: ProjectPanelSelectionsResolution | null,
  log: SelectionLogger,
): Promise<unknown | null> {
  if (!projectPanelSelections || projectPanelSelections.entries.length === 0) {
    return null;
  }

  for (const entry of projectPanelSelections.entries) {
    const extracted = await extractItemsFromSelectionContainer(entry.value, {
      primaryMethod: "getItems",
      fallbackMethod: "getProjectItems",
      arrayProperty: "items",
      secondArrayProperty: "projectItems",
      directItemPredicate: (value) => asRecord(value) !== null,
      label: `diagnostic project panel entry (${entry.label})`,
      log,
    });

    if (extracted.items.length > 0) {
      return extracted.items[0];
    }
  }

  return null;
}

function createAuditIfObject(label: string, value: unknown): MediaPathObjectAudit | null {
  const objectValue = asRecord(value);
  if (!objectValue) {
    return null;
  }

  return createMediaPathObjectAudit(label, objectValue);
}

function hasPathLikeSignal(audit: MediaPathObjectAudit): boolean {
  if (audit.keywordMatches.some((match) => ["media", "path", "file", "source"].includes(match.keyword))) {
    return true;
  }

  const names = [
    ...audit.ownKeys,
    ...audit.methods,
    ...audit.staticKeys,
    ...audit.prototypeMethods,
  ];

  return names.some((name) => /(media|path|file|source|original|master)/i.test(name));
}

function isAudioExportKeywordMethodName(methodName: string): boolean {
  return /(export|render|mediaencoder|encoder|encode|audio|subsequence|output|file|action|bounce)/i.test(
    methodName,
  );
}

function isDirectAudioExportMethodName(methodName: string): boolean {
  const normalized = methodName.toLowerCase();

  const hasExportRenderVerb = [
    "export",
    "render",
    "encode",
    "mediaencoder",
    "encoder",
    "bounce",
    "output",
  ].some((token) => normalized.includes(token));
  const hasAudioTarget = ["audio", "media", "file", "clip", "sequence"].some((token) => normalized.includes(token));

  return hasExportRenderVerb && hasAudioTarget;
}

function isAudioActionMethodName(methodName: string): boolean {
  const normalized = methodName.toLowerCase();
  if (!normalized.includes("action")) {
    return false;
  }

  return [
    "export",
    "render",
    "encode",
    "output",
    "subsequence",
    "audio",
    "media",
  ].some((token) => normalized.includes(token));
}

function extractObjectsFromCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  const collected: unknown[] = [];
  const candidates: unknown[] = [
    valueObject.items,
    valueObject.sequences,
    callSync(valueObject, "getItems"),
    callSync(valueObject, "getSequences"),
    callSync(valueObject, "toArray"),
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        collected.push(item);
      }
    }
  }

  if (collected.length === 0) {
    collected.push(value);
  }

  return collected;
}

async function invokeDiagnosticMethodWithLog(
  target: UnknownRecord,
  methodName: string,
  label: string,
  log: SelectionLogger,
  ...args: unknown[]
): Promise<unknown> {
  const method = asFunction(target[methodName]);
  if (!method) {
    log(`${label} unavailable`);
    return null;
  }

  log(`${label} start`, {
    args,
  });

  try {
    const result = await Promise.resolve(method.apply(target, args));
    log(`${label} result`, {
      raw: result,
      summary: describeMediaPathRawValue(result),
    });
    return result;
  } catch (error) {
    log(`${label} error`, {
      message: toErrorMessage(error),
    });
    return null;
  }
}

function createInitialProbe(): SelectionProbeReport {
  return {
    createdAt: new Date().toISOString(),
    moduleAccess: {
      hasRequirePremierePro: false,
      premiereModuleLoaded: false,
      requireError: null,
      premiereModuleKeys: [],
    },
    projectInfo: {
      projectStaticInfo: null,
      hasGetActiveProject: false,
      activeProjectResolved: false,
      activeProjectInfo: null,
      resolutionPath: null,
    },
    sequenceInfo: {
      hasGetActiveSequence: false,
      sequenceResolved: false,
      sequenceInfo: null,
      resolutionPath: null,
    },
    timelineSelection: {
      hasMethod: false,
      objectInfo: null,
      rawResultInfo: null,
      extractionMethod: null,
      count: 0,
    },
    projectPanelSelection: {
      hasMethod: false,
      objectInfo: null,
      rawResultInfo: null,
      extractionMethod: null,
      count: 0,
    },
    candidateTrackItems: [],
    candidateProjectItems: [],
    clipProjectItemCast: {
      available: false,
      attempted: false,
      succeeded: false,
      resultInfo: null,
      reason: null,
    },
    chosenResult: {
      source: null,
      selectedClipInfo: null,
    },
    entrypointSummary: {
      promisingCandidate: null,
      projectCandidatesTried: 0,
      sequenceCandidatesTried: 0,
      selectionCandidatesTried: 0,
    },
    mediaPathDiagnostics: {
      started: false,
      resolved: false,
      resolvedPath: null,
      resolvedMethod: null,
      attempts: [],
      candidateObjects: [],
      bestCandidateObject: null,
      projectTraversalMethods: [],
      projectTraversalObjects: [],
      projectUtilsMethods: [],
      projectViewIds: [],
      projectViewObjects: [],
      pathSignalObjects: [],
      comparison: {
        timelineProjectItemMethods: [],
        projectPanelItemMethods: [],
        timelineKeywordMatches: [],
        projectPanelKeywordMatches: [],
        richerSource: "unknown",
      },
      runtimeConclusion: null,
      recommendedNextStep: null,
      audioExportDiagnostics: {
        started: false,
        sequenceMethods: [],
        projectMethods: [],
        projectUtilsMethods: [],
        projectStaticMethods: [],
        trackItemMethods: [],
        timelineProjectItemMethods: [],
        projectPanelProjectItemMethods: [],
        keywordMatches: [],
        actionMethods: [],
        directExportCandidates: [],
        subsequenceCandidates: [],
        routeOptions: {
          viableFromUxpDirect: [],
          viableIndirectHandoff: [],
          notViable: [],
        },
        routeStatus: "not_found",
        chosenRoute: null,
        conclusion: null,
        recommendedNextStep: null,
        externalRouteTried: null,
        externalRouteReason: null,
        externalRouteResult: null,
        externalRoutePath: null,
        externalRouteExists: null,
        externalRouteConclusion: null,
        externalRouteNextRecommendation: null,
        subsequenceProbe: {
          attempted: false,
          createSubsequenceAvailable: false,
          createSubsequenceArity: null,
          createSubsequenceSignature: null,
          invocationTried: [],
          invocationUsed: null,
          invocationError: null,
          subsequenceCreated: false,
          subsequenceReturnType: "none",
          subsequenceName: null,
          subsequenceId: null,
          subsequenceDurationMs: null,
          subsequenceOwnKeys: [],
          subsequenceMethods: [],
        subsequenceKeywordMatches: [],
        exportCandidatesFromSubsequence: [],
        richerThanActiveSequence: null,
        actionProbeTried: [],
        actionProbeResult: null,
        actionProbeError: null,
        actionNextRecommendation: null,
        transactionProbeTried: [],
        transactionProbeResult: null,
        transactionProbeError: null,
        transactionProbeConclusion: null,
        transactionNextRecommendation: null,
        observableActionTried: null,
        observableBefore: null,
        observableAfter: null,
        observableChanged: null,
        observableConclusion: null,
        observableNextRecommendation: null,
        outputProbeTried: [],
        outputProbeResult: null,
        outputProbeError: null,
        outputProbePath: null,
        outputProbeExists: null,
        outputProbeConclusion: null,
        outputNextRecommendation: null,
        conclusion: null,
      },
      },
    },
    failureReason: null,
  };
}

function toSelectedClipInfo(item: SelectedPremiereItem): SelectedClipInfo {
  return {
    clipId: item.clipId,
    clipName: item.clipName,
    projectItemId: item.projectItemId,
    mediaPath: item.mediaPath,
    durationMs: item.durationMs,
  };
}

function inspectModuleExports(premiereModule: UnknownRecord): ModuleExportProbe[] {
  const keys = safeOwnKeys(premiereModule);

  return keys.map((name) => {
    const value = safeGetProperty(premiereModule, name);
    return {
      name,
      kind: detectValueKind(value),
      info: inspectObject(value),
    };
  });
}

function summarizeRelevantExports(inventory: ModuleExportProbe[]): Array<{
  name: string;
  kind: ModuleExportProbe["kind"];
  ownKeys: string[];
  methods: string[];
}> {
  return inventory
    .filter((entry) => RELEVANT_EXPORTS.includes(entry.name as (typeof RELEVANT_EXPORTS)[number]))
    .map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      ownKeys: entry.info.ownKeys,
      methods: entry.info.methods,
    }));
}

function inspectRelevantExportsDeep(premiereModule: UnknownRecord): RelevantExportInspection[] {
  return TARGETED_RELEVANT_EXPORTS.map((exportName) => {
    const value = safeGetProperty(premiereModule, exportName);
    return inspectSingleRelevantExport(exportName, value);
  });
}

function inspectSingleRelevantExport(name: string, value: unknown): RelevantExportInspection {
  const kind = detectValueKind(value);
  const objectLike = asObjectLike(value);
  const ownKeys = objectLike ? safeOwnKeys(objectLike) : [];
  const methods = objectLike ? extractMethods(objectLike) : [];

  const staticPropertyNames = getOwnPropertyNamesSafe(objectLike);
  const staticMethodNames = staticPropertyNames
    .filter((propName) => typeof safeGetPropertyFromObjectLike(objectLike, propName) === "function")
    .sort();

  const prototypeObject = resolvePrototypeObject(value);
  const prototypePropertyNames = getOwnPropertyNamesSafe(prototypeObject);
  const prototypeMethodNames = prototypePropertyNames
    .filter((propName) => typeof safeGetPropertyFromObjectLike(prototypeObject, propName) === "function")
    .sort();

  const keywordMatches = collectKeywordMatches([
    ...ownKeys,
    ...methods,
    ...staticPropertyNames,
    ...staticMethodNames,
    ...prototypePropertyNames,
    ...prototypeMethodNames,
  ]);

  const accessibleStaticMembers = inspectAccessibleStaticMembers({
    exportName: name,
    exportObject: objectLike,
    staticPropertyNames,
  });

  return {
    name,
    exists: value !== null && value !== undefined,
    kind,
    ownKeys,
    methods,
    staticPropertyNames,
    staticMethodNames,
    prototypePropertyNames,
    prototypeMethodNames,
    accessibleStaticMembers,
    keywordMatches,
  };
}

function inspectAccessibleStaticMembers(input: {
  exportName: string;
  exportObject: UnknownRecord | null;
  staticPropertyNames: string[];
}): SubObjectInspection[] {
  const { exportName, exportObject, staticPropertyNames } = input;
  const members: SubObjectInspection[] = [];

  for (const propertyName of staticPropertyNames) {
    if (isNoisyFunctionStatic(propertyName)) {
      continue;
    }

    const memberValue = safeGetPropertyFromObjectLike(exportObject, propertyName);
    const memberObject = asObjectLike(memberValue);
    if (!memberObject) {
      continue;
    }

    const memberOwnKeys = safeOwnKeys(memberObject);
    const memberMethods = extractMethods(memberObject);
    const keywordMatches = collectKeywordMatches([
      propertyName,
      ...memberOwnKeys,
      ...memberMethods,
    ]);

    if (keywordMatches.length === 0) {
      continue;
    }

    members.push({
      path: `${exportName}.${propertyName}`,
      kind: detectValueKind(memberValue),
      ownKeys: memberOwnKeys,
      methods: memberMethods,
      keywordMatches,
    });
  }

  return members;
}

function summarizeRelevantExportInspection(
  inspection: RelevantExportInspection[],
): Array<{
  name: string;
  kind: ExportValueKind;
  methods: string[];
  staticMethods: string[];
  prototypeMethods: string[];
  keywordMatches: KeywordMatch[];
  subObjects: string[];
}> {
  return inspection.map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    methods: filterNoisyMethodNames(entry.methods),
    staticMethods: filterNoisyMethodNames(
      entry.staticMethodNames.filter((name) => !isNoisyFunctionStatic(name)),
    ),
    prototypeMethods: filterNoisyMethodNames(entry.prototypeMethodNames),
    keywordMatches: entry.keywordMatches,
    subObjects: entry.accessibleStaticMembers.map((member) => member.path),
  }));
}

function summarizeCandidateResults(
  candidates: EntrypointCandidateReport[],
): Array<{
  path: string;
  accessType: EntrypointAccessType;
  available: boolean;
  resolved: boolean;
  error: string | null;
  note: string | null;
}> {
  return candidates.map((candidate) => ({
    path: candidate.path,
    accessType: candidate.accessType,
    available: candidate.available,
    resolved: candidate.resolved,
    error: candidate.error,
    note: candidate.note,
  }));
}

function appendDynamicDefinitions(input: {
  destination: CandidateDefinition[];
  seen: Set<string>;
  root: UnknownRecord;
  rootPath: string[];
  matcher: (methodName: string) => boolean;
  propertyMatcher: (propertyName: string) => boolean;
  note: string;
}): void {
  const { destination, seen, root, rootPath, matcher, propertyMatcher, note } = input;

  const append = (definition: CandidateDefinition): void => {
    const key = `${definition.accessType}:${definition.path.join(".")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    destination.push(definition);
  };

  const roots = rootPath.length === 0
    ? safeOwnKeys(root)
    : [rootPath[rootPath.length - 1] ?? ""];

  if (rootPath.length === 0) {
    for (const rootKey of roots) {
      if (!isRelevantRootKey(rootKey)) {
        continue;
      }

      const value = safeGetProperty(root, rootKey);
      const objectValue = asRecord(value);
      if (!objectValue) {
        continue;
      }

      const methods = extractMethods(objectValue);
      for (const methodName of methods) {
        if (!matcher(methodName)) {
          continue;
        }

        append({
          name: `${rootKey}.${methodName}`,
          accessType: "method",
          path: [rootKey, methodName],
          note,
        });
      }

      const props = safeOwnKeys(objectValue);
      for (const propertyName of props) {
        if (!propertyMatcher(propertyName)) {
          continue;
        }

        append({
          name: `${rootKey}.${propertyName}`,
          accessType: "property",
          path: [rootKey, propertyName],
          note,
        });
      }
    }

    return;
  }

  const methods = extractMethods(root);
  for (const methodName of methods) {
    if (!matcher(methodName)) {
      continue;
    }

    append({
      name: [...rootPath, methodName].join("."),
      accessType: "method",
      path: [...rootPath, methodName],
      note,
    });
  }

  const properties = safeOwnKeys(root);
  for (const propertyName of properties) {
    if (!propertyMatcher(propertyName)) {
      continue;
    }

    append({
      name: [...rootPath, propertyName].join("."),
      accessType: "property",
      path: [...rootPath, propertyName],
      note,
    });
  }
}

function appendDynamicEntryCandidates(input: {
  target: Array<{
    root: unknown;
    rootLabel: string;
    category: EntrypointCategory;
    definition: CandidateDefinition;
  }>;
  root: UnknownRecord;
  rootLabel: string;
  category: EntrypointCategory;
  matcher: (methodName: string) => boolean;
  propertyMatcher: (propertyName: string) => boolean;
  note: string;
  selectionKind?: SelectionCandidateKind;
  onlyRelevantRoots?: boolean;
}): void {
  const {
    target,
    root,
    rootLabel,
    category,
    matcher,
    propertyMatcher,
    note,
    selectionKind,
    onlyRelevantRoots,
  } = input;

  const append = (definition: CandidateDefinition): void => {
    target.push({
      root,
      rootLabel,
      category,
      definition,
    });
  };

  if (onlyRelevantRoots) {
    for (const rootKey of safeOwnKeys(root)) {
      if (!isRelevantRootKey(rootKey)) {
        continue;
      }

      const childObject = asRecord(safeGetProperty(root, rootKey));
      if (!childObject) {
        continue;
      }

      for (const methodName of extractMethods(childObject)) {
        if (!matcher(methodName)) {
          continue;
        }

        append({
          name: `${rootKey}.${methodName}`,
          accessType: "method",
          path: [rootKey, methodName],
          note,
          selectionKind,
        });
      }

      for (const propertyName of safeOwnKeys(childObject)) {
        if (!propertyMatcher(propertyName)) {
          continue;
        }

        append({
          name: `${rootKey}.${propertyName}`,
          accessType: "property",
          path: [rootKey, propertyName],
          note,
          selectionKind,
        });
      }
    }

    return;
  }

  for (const methodName of extractMethods(root)) {
    if (!matcher(methodName)) {
      continue;
    }

    append({
      name: `${rootLabel}.${methodName}`,
      accessType: "method",
      path: [methodName],
      note,
      selectionKind,
    });
  }

  for (const propertyName of safeOwnKeys(root)) {
    if (!propertyMatcher(propertyName)) {
      continue;
    }

    append({
      name: `${rootLabel}.${propertyName}`,
      accessType: "property",
      path: [propertyName],
      note,
      selectionKind,
    });
  }
}

function dedupeEntryCandidates(
  entries: Array<{
    root: unknown;
    rootLabel: string;
    category: EntrypointCategory;
    definition: CandidateDefinition;
  }>,
): Array<{
  root: unknown;
  rootLabel: string;
  category: EntrypointCategory;
  definition: CandidateDefinition;
}> {
  const seen = new Set<string>();
  const deduped: typeof entries = [];

  for (const entry of entries) {
    const key = [
      entry.rootLabel,
      entry.definition.accessType,
      entry.definition.path.join("."),
      entry.definition.selectionKind ?? "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function isRelevantRootKey(rootKey: string): boolean {
  return RELEVANT_EXPORTS.includes(rootKey as (typeof RELEVANT_EXPORTS)[number]);
}

function isProjectMethodName(methodName: string): boolean {
  return /project|document/i.test(methodName) && /get|active|current/i.test(methodName);
}

function isProjectPropertyName(propertyName: string): boolean {
  return /project|document/i.test(propertyName);
}

function isSequenceMethodName(methodName: string): boolean {
  return /sequence|timeline/i.test(methodName) && /get|active|current/i.test(methodName);
}

function isSequencePropertyName(propertyName: string): boolean {
  return /sequence|timeline/i.test(propertyName);
}

function isSelectionMethodName(methodName: string): boolean {
  return /selection|selected|select/i.test(methodName);
}

function isSelectionPropertyName(propertyName: string): boolean {
  return /selection|selected|items|trackSelection/i.test(propertyName);
}

function safeGetPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;

  for (const segment of path) {
    const currentObject = asRecord(current);
    if (!currentObject) {
      return undefined;
    }

    try {
      current = currentObject[segment];
    } catch {
      return undefined;
    }
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

function safeGetProperty(target: UnknownRecord, key: string): unknown {
  try {
    return target[key];
  } catch {
    return undefined;
  }
}

function safeGetPropertyFromObjectLike(target: UnknownRecord | null, key: string): unknown {
  if (!target) {
    return undefined;
  }

  try {
    return target[key];
  } catch {
    return undefined;
  }
}

function getOwnPropertyNamesSafe(target: UnknownRecord | null): string[] {
  if (!target) {
    return [];
  }

  try {
    return Object.getOwnPropertyNames(target).sort();
  } catch {
    return [];
  }
}

function resolvePrototypeObject(value: unknown): UnknownRecord | null {
  if (typeof value === "function") {
    const functionObject = value as unknown as UnknownRecord;
    const functionPrototype = safeGetPropertyFromObjectLike(functionObject, "prototype");
    return asObjectLike(functionPrototype);
  }

  const objectLike = asObjectLike(value);
  if (!objectLike) {
    return null;
  }

  try {
    return asObjectLike(Object.getPrototypeOf(objectLike));
  } catch {
    return null;
  }
}

function collectKeywordMatches(names: string[]): KeywordMatch[] {
  return collectKeywordMatchesByKeywords(names, ENTRYPOINT_SEARCH_KEYWORDS);
}

function collectMediaPathKeywordMatches(names: string[]): KeywordMatch[] {
  return collectKeywordMatchesByKeywords(names, MEDIA_PATH_SEARCH_KEYWORDS);
}

function collectKeywordMatchesByKeywords(
  names: string[],
  keywords: readonly string[],
): KeywordMatch[] {
  const normalized = dedupeSortedStrings(names);

  return keywords.map((keyword) => {
    const matches = normalized.filter((name) => name.toLowerCase().includes(keyword));
    return {
      keyword,
      names: matches,
    };
  }).filter((entry) => entry.names.length > 0);
}

function dedupeSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isNoisyFunctionStatic(name: string): boolean {
  return ["length", "name", "prototype", "arguments", "caller"].includes(name);
}

function filterNoisyMethodNames(names: string[]): string[] {
  return dedupeSortedStrings(names.filter((name) => !NOISY_METHOD_NAMES.has(name)));
}

function formatListPlainText(values: string[]): string {
  const filtered = dedupeSortedStrings(values);
  if (filtered.length === 0) {
    return "(none)";
  }

  return filtered.join(", ");
}

function formatKeywordMatchesPlainText(matches: KeywordMatch[]): string {
  if (matches.length === 0) {
    return "(none)";
  }

  return matches
    .map((match) => `${match.keyword}: ${formatListPlainText(match.names)}`)
    .join(" | ");
}

function flattenKeywordNamesForDiagnostics(matches: KeywordMatch[]): string[] {
  const names = matches.flatMap((match) => match.names);
  return dedupeSortedStrings(names);
}

function createMediaPathObjectAudit(label: string, target: UnknownRecord): MediaPathObjectAudit {
  const ownKeys = safeOwnKeys(target);
  const methods = filterNoisyMethodNames(extractMethods(target));
  const staticKeys = getOwnPropertyNamesSafe(target)
    .filter((name) => !isNoisyFunctionStatic(name))
    .sort();
  const prototypeObject = resolvePrototypeObject(target);
  const prototypeMethods = getOwnPropertyNamesSafe(prototypeObject)
    .filter((name) => typeof safeGetPropertyFromObjectLike(prototypeObject, name) === "function")
    .filter((name) => name !== "constructor")
    .filter((name) => !NOISY_METHOD_NAMES.has(name))
    .sort();
  const keywordMatches = collectMediaPathKeywordMatches([
    ...ownKeys,
    ...methods,
    ...staticKeys,
    ...prototypeMethods,
  ]);

  return {
    label,
    exists: true,
    kind: detectValueKind(target),
    ownKeys,
    methods,
    staticKeys,
    prototypeMethods,
    keywordMatches,
  };
}

function getMediaPathAuditScore(audit: MediaPathObjectAudit): number {
  const methodSignals = countNameSignals(audit.methods);
  const keySignals = countNameSignals(audit.ownKeys);
  const staticSignals = countNameSignals(audit.staticKeys);
  const prototypeSignals = countNameSignals(audit.prototypeMethods);
  const keywordSignals = audit.keywordMatches.reduce(
    (total, entry) => total + entry.names.length,
    0,
  );

  let bonus = 0;
  const normalizedLabel = audit.label.toLowerCase();
  if (normalizedLabel.includes("clipprojectitem")) {
    bonus += 5;
  }
  if (normalizedLabel.includes("projectitem")) {
    bonus += 4;
  }
  if (normalizedLabel.includes("master")) {
    bonus += 2;
  }
  if (normalizedLabel.includes("source")) {
    bonus += 2;
  }

  return methodSignals * 3 + keySignals * 2 + staticSignals + prototypeSignals + keywordSignals + bonus;
}

function countNameSignals(names: string[]): number {
  const mediaSignalRegex = /(media|path|file|source|original|master|clip|projectitem)/i;
  return names.reduce((total, name) => (mediaSignalRegex.test(name) ? total + 1 : total), 0);
}

function describeMediaPathRawValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null_or_undefined";
  }

  if (typeof value === "string") {
    const preview = value.length > 140 ? `${value.slice(0, 140)}...` : value;
    return `string(${JSON.stringify(preview)})`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return `${typeof value}(${String(value)})`;
  }

  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }

  const objectValue = asRecord(value);
  if (!objectValue) {
    return `type=${typeof value}`;
  }

  const keys = safeOwnKeys(objectValue).slice(0, 12);
  return `object(keys=${keys.join(", ") || "(none)"})`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function detectValueKind(value: unknown): ModuleExportProbe["kind"] {
  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "function") {
    const fnSource = safeFunctionSource(value);
    if (/^class\s/.test(fnSource)) {
      return "class";
    }

    return "function";
  }

  if (typeof value === "object" && value !== null) {
    return "object";
  }

  return "primitive";
}

function safeFunctionSource(value: unknown): string {
  if (typeof value !== "function") {
    return "";
  }

  try {
    return Function.prototype.toString.call(value);
  } catch {
    return "";
  }
}

function logEntrypointsDiagnostics(diagnostics: PremiereEntrypointsDiagnostics): void {
  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed("[PluginSubs][Selection] premierepro entrypoints diagnostics");
  } else {
    console.info("[PluginSubs][Selection] premierepro entrypoints diagnostics");
  }

  const relevantSummary = summarizeRelevantExportInspection(diagnostics.relevantExportInspection);

  console.info(
    `[PluginSubs][Selection] moduleAccess: ${JSON.stringify(diagnostics.moduleAccess)}`,
  );
  console.info(
    `[PluginSubs][Selection] exports relevantes: ${JSON.stringify(
      summarizeRelevantExports(diagnostics.exportInventory),
    )}`,
  );

  for (const exportName of TARGETED_RELEVANT_EXPORTS) {
    const inspected = diagnostics.relevantExportInspection.find((entry) => entry.name === exportName);
    const summarized = relevantSummary.find((entry) => entry.name === exportName);

    const methods = summarized?.methods ?? [];
    const staticKeys = inspected
      ? inspected.staticPropertyNames.filter((name) => !isNoisyFunctionStatic(name))
      : [];
    const prototypeMethods = summarized?.prototypeMethods ?? [];
    const keywordMatches = inspected?.keywordMatches ?? [];

    console.info(`[PluginSubs][Selection] ${exportName}: methods ${formatListPlainText(methods)}`);
    console.info(`[PluginSubs][Selection] ${exportName}: staticKeys ${formatListPlainText(staticKeys)}`);
    console.info(
      `[PluginSubs][Selection] ${exportName}: prototypeMethods ${formatListPlainText(prototypeMethods)}`,
    );
    console.info(
      `[PluginSubs][Selection] ${exportName}: keywordMatches ${formatKeywordMatchesPlainText(
        keywordMatches,
      )}`,
    );
  }

  for (const entry of relevantSummary) {
    console.info(
      `[PluginSubs][Selection] ${entry.name}: summary ${JSON.stringify({
        kind: entry.kind,
        methods: entry.methods,
        staticMethods: entry.staticMethods,
        prototypeMethods: entry.prototypeMethods,
        subObjects: entry.subObjects,
      })}`,
    );
  }
  console.info(
    `[PluginSubs][Selection] exports relevantes (resumen profundo): ${JSON.stringify(relevantSummary)}`,
  );
  console.info(
    `[PluginSubs][Selection] exports relevantes (detalle completo): ${JSON.stringify(
      diagnostics.relevantExportInspection,
    )}`,
  );
  console.info(
    `[PluginSubs][Selection] projectCandidates: ${JSON.stringify(
      summarizeCandidateResults(diagnostics.projectCandidates),
    )}`,
  );
  console.info(
    `[PluginSubs][Selection] sequenceCandidates: ${JSON.stringify(
      summarizeCandidateResults(diagnostics.sequenceCandidates),
    )}`,
  );
  console.info(
    `[PluginSubs][Selection] selectionCandidates: ${JSON.stringify(
      summarizeCandidateResults(diagnostics.selectionCandidates),
    )}`,
  );
  console.info(`[PluginSubs][Selection] promisingCandidate: ${diagnostics.promisingCandidate ?? "(none)"}`);
  console.info(`[PluginSubs][Selection] failureReason: ${diagnostics.failureReason ?? "(none)"}`);

  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}

function createSelectionLogger(enabled: boolean): SelectionLogger {
  return (step: string, details?: unknown) => {
    if (!enabled) {
      return;
    }

    if (details === undefined) {
      console.info(`[PluginSubs][Selection] ${step}`);
      return;
    }

    console.info(`[PluginSubs][Selection] ${step}`, details);
  };
}

function createEntrypointLogger(enabled: boolean): SelectionLogger {
  return (step: string, details?: unknown) => {
    if (!enabled) {
      return;
    }

    if (details === undefined) {
      console.info(`[PluginSubs][Selection][Entrypoints] ${step}`);
      return;
    }

    console.info(`[PluginSubs][Selection][Entrypoints] ${step}`, details);
  };
}

async function safeInvokeMethod(
  target: UnknownRecord,
  methodName: string,
  log: SelectionLogger,
  label: string,
): Promise<unknown> {
  const method = asFunction(target[methodName]);
  if (!method) {
    return null;
  }

  try {
    return await Promise.resolve(method.call(target));
  } catch (error) {
    log(`${label} error`, {
      message: toErrorMessage(error),
    });
    return null;
  }
}

async function callMethod(target: UnknownRecord, methodName: string, ...args: unknown[]): Promise<unknown> {
  const method = asFunction(target[methodName]);
  if (!method) {
    return null;
  }

  try {
    return await Promise.resolve(method.apply(target, args));
  } catch {
    return null;
  }
}

function callSync(target: UnknownRecord, methodName: string, ...args: unknown[]): unknown {
  const method = asFunction(target[methodName]);
  if (!method) {
    return null;
  }

  try {
    return method.apply(target, args);
  } catch {
    return null;
  }
}

function inspectObject(value: unknown): ObjectInspection {
  if (Array.isArray(value)) {
    return {
      exists: true,
      jsType: "array",
      isArray: true,
      arrayLength: value.length,
      ownKeys: Object.keys(value),
      methods: [],
    };
  }

  const objectValue = asRecord(value);
  if (!objectValue) {
    return {
      exists: false,
      jsType: typeof value,
      isArray: false,
      arrayLength: null,
      ownKeys: [],
      methods: [],
    };
  }

  return {
    exists: true,
    jsType: "object",
    isArray: false,
    arrayLength: null,
    ownKeys: safeOwnKeys(objectValue),
    methods: extractMethods(objectValue),
  };
}

function extractMethods(value: UnknownRecord): string[] {
  const ownMethods = safeOwnKeys(value).filter((key) => typeof safeGetProperty(value, key) === "function");

  let protoMethods: string[] = [];
  try {
    const proto = Object.getPrototypeOf(value) as UnknownRecord | null;
    if (proto) {
      protoMethods = Object.getOwnPropertyNames(proto).filter((name) => {
        if (name === "constructor") {
          return false;
        }

        return typeof safeGetProperty(value, name) === "function";
      });
    }
  } catch {
    protoMethods = [];
  }

  return Array.from(new Set([...ownMethods, ...protoMethods])).sort();
}

function safeOwnKeys(value: UnknownRecord): string[] {
  try {
    return Object.keys(value).sort();
  } catch {
    return [];
  }
}

function hasMethod(target: UnknownRecord | null, methodName: string): boolean {
  if (!target) {
    return false;
  }

  try {
    return typeof target[methodName] === "function";
  } catch {
    return false;
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value === "object" && value !== null) {
    return value as UnknownRecord;
  }

  return null;
}

function asObjectLike(value: unknown): UnknownRecord | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    return value as unknown as UnknownRecord;
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

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function toDurationMs(tickTime: unknown): number | null {
  const tickTimeObject = asRecord(tickTime);
  if (!tickTimeObject) {
    return null;
  }

  const seconds = asNumber(tickTimeObject.seconds);
  if (seconds === null) {
    return null;
  }

  return Math.round(seconds * 1000);
}

function normalizeResolvedMediaPath(value: unknown): string | null {
  const direct = asString(value);
  if (direct) {
    return direct;
  }

  if (typeof value === "object" && value !== null) {
    const maybePathObject = value as UnknownRecord;
    return (
      asString(maybePathObject.path) ??
      asString(maybePathObject.filePath) ??
      asString(maybePathObject.mediaPath) ??
      null
    );
  }

  return null;
}

function fallbackId(): string {
  return `clip-${Date.now()}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
