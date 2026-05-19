import { resolveActivePremiereContextForAudioExport } from "./audioExport";
import type { CaptionSegment } from "../types/transcribe";

export type MarkerCreationErrorCode =
  | "caption_segments_missing"
  | "sequence_in_missing"
  | "premiere_runtime_unavailable"
  | "active_project_missing"
  | "markers_api_unavailable"
  | "tick_time_unavailable"
  | "transaction_unavailable"
  | "marker_action_failed";

export interface CreateCaptionMarkersInput {
  captionSegments: CaptionSegment[];
  sequenceInMs: number | null | undefined;
}

export interface CreateCaptionMarkersResult {
  createdMarkers: number;
  duplicateWarning: string;
}

export class MarkerCreationError extends Error {
  readonly code: MarkerCreationErrorCode;
  readonly details: unknown;

  constructor(code: MarkerCreationErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "MarkerCreationError";
    this.code = code;
    this.details = details;
  }
}

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;
type MarkerCandidateKind = "collection_method" | "collection_property" | "direct_action";

const MARKER_NAME = "GLIFO";
const MARKER_TYPE = "Comment";
const MARKER_COMMENT_PREFIX = "[GLIFO]";
const PREMIERE_TICKS_PER_SECOND = 254_016_000_000;

interface MarkerObjectInspection {
  valueKind: string;
  enumerableKeys: string[];
  propertyNames: string[];
  methods: string[];
  markerRelatedKeys: string[];
  markerRelatedMethods: string[];
}

interface MarkerApiDiagnostics {
  topLevelKeys: string[];
  topLevelPropertyNames: string[];
  markerRelatedTopLevelKeys: string[];
  documentedApi: MarkerDocumentedApiDiagnostics;
  Markers: MarkerObjectInspection;
  Marker: MarkerObjectInspection;
  Project: MarkerObjectInspection;
  Constants: MarkerObjectInspection;
  TickTime: MarkerObjectInspection;
  EventManager: MarkerObjectInspection;
  app: MarkerObjectInspection;
  project: MarkerObjectInspection;
  activeProject: MarkerObjectInspection;
  activeSequence: MarkerObjectInspection;
}

interface MarkerDocumentedApiDiagnostics {
  pproMarkersTypeof: string;
  pproMarkersGetMarkersTypeof: string;
  pproMarkersOwnPropertyNames: string[];
  pproMarkersPrototypeOwnPropertyNames: string[];
  pproMarkersOwnKeys: string[];
  pproMarkersPrototypeOwnKeys: string[];
  pproMarkerTypeof: string;
  pproMarkerOwnPropertyNames: string[];
  pproMarkerPrototypeOwnPropertyNames: string[];
  sequenceGetMarkersTypeof: string;
  sequenceMarkersTypeof: string;
  activeProjectExecuteTransactionTypeof: string;
  pproCompoundActionTypeof: string;
  pproTickTimeCreateWithSecondsTypeof: string;
}

interface MarkerCandidateDefinition {
  name: string;
  kind: MarkerCandidateKind;
  parent: unknown;
  methodName?: string;
  propertyName?: string;
  args?: unknown[];
  includeSequenceInActionArgs?: boolean;
}

interface MarkerCandidateReport {
  name: string;
  kind: MarkerCandidateKind;
  available: boolean;
  invoked: boolean;
  resolved: boolean;
  error: string | null;
  valueKind: string;
  keys: string[];
  methods: string[];
}

interface MarkerActionFactory {
  source: string;
  createAction: (input: {
    activeSequence: UnknownRecord;
    name: string;
    markerType: unknown;
    startTime: unknown;
    duration: unknown;
    comments: string;
  }) => Promise<unknown>;
}

interface MarkerActionFactoryResolution {
  factories: MarkerActionFactory[];
  reports: MarkerCandidateReport[];
}

export function isMarkerCreationError(value: unknown): value is MarkerCreationError {
  return value instanceof MarkerCreationError;
}

export async function createMarkersFromCaptionSegments(
  input: CreateCaptionMarkersInput,
): Promise<CreateCaptionMarkersResult> {
  const captionSegments = validateCaptionSegments(input.captionSegments);
  const sequenceInMs = validateSequenceInMs(input.sequenceInMs);

  const requireFn = getRuntimeRequire();
  const premiereModule = loadPremiereModule(requireFn);
  const { activeProject, activeSequence } =
    await resolveActivePremiereContextForAudioExport(premiereModule);

  if (!activeProject) {
    throw new MarkerCreationError(
      "active_project_missing",
      "No se pudo resolver el proyecto activo para crear markers.",
    );
  }

  const markerActions = await createMarkerActions({
    premiereModule,
    activeProject,
    activeSequence,
    captionSegments,
    sequenceInMs,
  });

  executeMarkerTransaction({
    activeProject,
    markerActions,
  });

  return {
    createdMarkers: markerActions.length,
    duplicateWarning: "GLIFO agrega markers nuevos; si repetis la accion se pueden duplicar.",
  };
}

function validateCaptionSegments(captionSegments: CaptionSegment[]): CaptionSegment[] {
  const validSegments = captionSegments.filter((segment) => {
    return Number.isFinite(segment.startMs) &&
      Number.isFinite(segment.endMs) &&
      segment.startMs >= 0 &&
      segment.endMs > segment.startMs &&
      segment.text.trim().length > 0;
  });

  if (validSegments.length === 0) {
    throw new MarkerCreationError(
      "caption_segments_missing",
      "No hay captionSegments disponibles para crear markers.",
    );
  }

  return validSegments;
}

function validateSequenceInMs(sequenceInMs: number | null | undefined): number {
  if (typeof sequenceInMs !== "number" || !Number.isFinite(sequenceInMs) || sequenceInMs < 0) {
    throw new MarkerCreationError(
      "sequence_in_missing",
      "No hay sequenceInMs disponible. Los markers solo se pueden crear desde Fase 2.",
    );
  }

  return Math.round(sequenceInMs);
}

async function createMarkerActions(input: {
  premiereModule: UnknownRecord;
  activeProject: UnknownRecord;
  activeSequence: UnknownRecord;
  captionSegments: CaptionSegment[];
  sequenceInMs: number;
}): Promise<unknown[]> {
  const diagnostics = createMarkerApiDiagnostics({
    premiereModule: input.premiereModule,
    activeProject: input.activeProject,
    activeSequence: input.activeSequence,
  });
  console.info("[GLIFO] markers:runtime-diagnostics", diagnostics);

  const resolution = await resolveMarkerActionFactories(input);
  console.info("[GLIFO] markers:candidate-reports", resolution.reports);

  if (resolution.factories.length === 0) {
    throw new MarkerCreationError(
      "markers_api_unavailable",
      createMarkersApiUnavailableMessage(diagnostics, resolution.reports),
      {
        diagnostics,
        candidates: resolution.reports,
      },
    );
  }

  const markerType = getMarkerType(input.premiereModule);
  const failedFactories: Array<{ source: string; error: string }> = [];
  for (const factory of resolution.factories) {
    try {
      const actions: unknown[] = [];
      for (const segment of input.captionSegments) {
        const startTime = createTickTime(input.premiereModule, input.sequenceInMs + segment.startMs);
        const duration = createTickTime(
          input.premiereModule,
          segment.endMs - segment.startMs,
        );
        const comments = `${MARKER_COMMENT_PREFIX} ${segment.text}`;
        const action = await factory.createAction({
          activeSequence: input.activeSequence,
          name: MARKER_NAME,
          markerType,
          startTime,
          duration,
          comments,
        });

        if (!action) {
          throw new Error("createAddMarkerAction no devolvio Action");
        }

        actions.push(action);
      }

      console.info("[GLIFO] markers:api-selected", {
        source: factory.source,
        actions: actions.length,
      });
      return actions;
    } catch (error) {
      const message = toErrorMessage(error);
      failedFactories.push({ source: factory.source, error: message });
      console.warn("[GLIFO] markers:factory-failed", {
        source: factory.source,
        error: message,
      });
    }
  }

  throw new MarkerCreationError(
    "marker_action_failed",
    [
      "Se detectaron APIs de markers, pero ninguna pudo crear acciones de marker.",
      `Fallos: ${formatList(failedFactories.map((factory) => `${factory.source}:${factory.error}`))}`,
      createMarkerEntrypointSummary(diagnostics, resolution.reports),
    ].join(" "),
    {
      diagnostics,
      candidates: resolution.reports,
      failedFactories,
    },
  );
}

async function resolveMarkerActionFactories(input: {
  premiereModule: UnknownRecord;
  activeProject: UnknownRecord;
  activeSequence: UnknownRecord;
}): Promise<MarkerActionFactoryResolution> {
  const reports: MarkerCandidateReport[] = [];
  const factories: MarkerActionFactory[] = [];

  const documentedResolution = await resolveDocumentedMarkersGetMarkersFactory(input);
  reports.push(documentedResolution.report);
  if (documentedResolution.factory) {
    factories.push(documentedResolution.factory);
  }

  const definitions = buildMarkerCandidateDefinitions(input);
  for (const definition of definitions) {
    const report = createMarkerCandidateReport(definition);
    reports.push(report);

    const parent = asRecord(definition.parent);
    if (!parent) {
      continue;
    }

    try {
      if (definition.kind === "collection_property") {
        const collection = safeGetProperty(parent, definition.propertyName ?? "");
        report.available = collection !== undefined && collection !== null;
        report.valueKind = getValueKind(collection);

        const collectionObject = asRecord(collection);
        if (collectionObject) {
          updateReportObjectDetails(report, collectionObject);
          const createAddMarkerAction = asFunction(
            safeGetProperty(collectionObject, "createAddMarkerAction"),
          );
          if (createAddMarkerAction) {
            report.resolved = true;
            factories.push(createCollectionMarkerFactory({
              source: definition.name,
              markersObject: collectionObject,
              createAddMarkerAction,
            }));
          }
        }

        continue;
      }

      const method = asFunction(safeGetProperty(parent, definition.methodName ?? "createAddMarkerAction"));
      report.available = Boolean(method);
      if (!method) {
        continue;
      }

      if (definition.kind === "direct_action") {
        updateReportObjectDetails(report, parent);
        report.resolved = true;
        factories.push(createDirectMarkerFactory({
          source: definition.name,
          target: parent,
          createAddMarkerAction: method,
          includeSequenceInActionArgs: Boolean(definition.includeSequenceInActionArgs),
        }));
        continue;
      }

      report.invoked = true;
      const markersObject = asRecord(await Promise.resolve(
        method.call(parent, ...(definition.args ?? [])),
      ));
      report.valueKind = getValueKind(markersObject);
      if (!markersObject) {
        continue;
      }

      updateReportObjectDetails(report, markersObject);
      const createAddMarkerAction = asFunction(
        safeGetProperty(markersObject, "createAddMarkerAction"),
      );
      if (!createAddMarkerAction) {
        continue;
      }

      report.resolved = true;
      factories.push(createCollectionMarkerFactory({
        source: definition.name,
        markersObject,
        createAddMarkerAction,
      }));
    } catch (error) {
      report.error = toErrorMessage(error);
    }
  }

  return { factories, reports };
}

function buildMarkerCandidateDefinitions(input: {
  premiereModule: UnknownRecord;
  activeProject: UnknownRecord;
  activeSequence: UnknownRecord;
}): MarkerCandidateDefinition[] {
  const premiereModule = input.premiereModule;
  const activeProject = input.activeProject;
  const appObject = asRecord(safeGetProperty(premiereModule, "app")) ??
    asRecord(safeGetProperty(premiereModule, "App"));
  const appProject = appObject
    ? safeGetProperty(appObject, "project") ?? safeGetProperty(appObject, "Project")
    : undefined;

  return [
    {
      name: "premierepro.markers.getMarkers(sequence)",
      kind: "collection_method",
      parent: safeGetProperty(premiereModule, "markers"),
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "premierepro.Marker.getMarkers(sequence)",
      kind: "collection_method",
      parent: safeGetProperty(premiereModule, "Marker"),
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "sequence.getMarkers()",
      kind: "collection_method",
      parent: input.activeSequence,
      methodName: "getMarkers",
      args: [],
    },
    {
      name: "sequence.getMarkerCollection()",
      kind: "collection_method",
      parent: input.activeSequence,
      methodName: "getMarkerCollection",
      args: [],
    },
    {
      name: "sequence.markers",
      kind: "collection_property",
      parent: input.activeSequence,
      propertyName: "markers",
    },
    {
      name: "sequence.Markers",
      kind: "collection_property",
      parent: input.activeSequence,
      propertyName: "Markers",
    },
    {
      name: "sequence.markerCollection",
      kind: "collection_property",
      parent: input.activeSequence,
      propertyName: "markerCollection",
    },
    {
      name: "project.getMarkers(sequence)",
      kind: "collection_method",
      parent: activeProject,
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "project.getMarkers()",
      kind: "collection_method",
      parent: activeProject,
      methodName: "getMarkers",
      args: [],
    },
    {
      name: "project.getMarkerCollection(sequence)",
      kind: "collection_method",
      parent: activeProject,
      methodName: "getMarkerCollection",
      args: [input.activeSequence],
    },
    {
      name: "project.getMarkerCollection()",
      kind: "collection_method",
      parent: activeProject,
      methodName: "getMarkerCollection",
      args: [],
    },
    {
      name: "project.markers",
      kind: "collection_property",
      parent: activeProject,
      propertyName: "markers",
    },
    {
      name: "project.Markers",
      kind: "collection_property",
      parent: activeProject,
      propertyName: "Markers",
    },
    {
      name: "premierepro.Project.getMarkers(sequence)",
      kind: "collection_method",
      parent: safeGetProperty(premiereModule, "Project"),
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "premierepro.project.getMarkers(sequence)",
      kind: "collection_method",
      parent: safeGetProperty(premiereModule, "project"),
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "app.project.getMarkers(sequence)",
      kind: "collection_method",
      parent: appProject,
      methodName: "getMarkers",
      args: [input.activeSequence],
    },
    {
      name: "premierepro.Markers.createAddMarkerAction(...)",
      kind: "direct_action",
      parent: safeGetProperty(premiereModule, "Markers"),
      methodName: "createAddMarkerAction",
    },
    {
      name: "premierepro.Markers.createAddMarkerAction(sequence, ...)",
      kind: "direct_action",
      parent: safeGetProperty(premiereModule, "Markers"),
      methodName: "createAddMarkerAction",
      includeSequenceInActionArgs: true,
    },
    {
      name: "premierepro.Marker.createAddMarkerAction(...)",
      kind: "direct_action",
      parent: safeGetProperty(premiereModule, "Marker"),
      methodName: "createAddMarkerAction",
    },
    {
      name: "premierepro.Marker.createAddMarkerAction(sequence, ...)",
      kind: "direct_action",
      parent: safeGetProperty(premiereModule, "Marker"),
      methodName: "createAddMarkerAction",
      includeSequenceInActionArgs: true,
    },
    {
      name: "premierepro.markers.createAddMarkerAction(...)",
      kind: "direct_action",
      parent: safeGetProperty(premiereModule, "markers"),
      methodName: "createAddMarkerAction",
    },
    {
      name: "sequence.createAddMarkerAction(...)",
      kind: "direct_action",
      parent: input.activeSequence,
      methodName: "createAddMarkerAction",
    },
    {
      name: "project.createAddMarkerAction(...)",
      kind: "direct_action",
      parent: activeProject,
      methodName: "createAddMarkerAction",
    },
  ];
}

async function resolveDocumentedMarkersGetMarkersFactory(input: {
  premiereModule: UnknownRecord;
  activeSequence: UnknownRecord;
}): Promise<{
  factory: MarkerActionFactory | null;
  report: MarkerCandidateReport;
}> {
  const markersStatic = safeGetProperty(input.premiereModule, "Markers");
  const getMarkers = asFunction(safeGetProperty(markersStatic, "getMarkers"));
  const report: MarkerCandidateReport = {
    name: "ppro.Markers?.getMarkers?.(sequence)",
    kind: "collection_method",
    available: Boolean(getMarkers),
    invoked: false,
    resolved: false,
    error: null,
    valueKind: getValueKind(markersStatic),
    keys: safePropertyNames(markersStatic),
    methods: extractMethods(markersStatic),
  };

  console.info("[GLIFO] markers:documented-api-direct-check", {
    markersTypeof: typeof markersStatic,
    getMarkersTypeof: typeof safeGetProperty(markersStatic, "getMarkers"),
    ownPropertyNames: safeOwnPropertyNames(markersStatic),
    prototypeOwnPropertyNames: safeOwnPropertyNames(safeGetProperty(markersStatic, "prototype") ?? {}),
    ownKeys: safeReflectOwnKeys(markersStatic),
    prototypeOwnKeys: safeReflectOwnKeys(safeGetProperty(markersStatic, "prototype") ?? {}),
  });

  const markersContext = asRecord(markersStatic);
  if (!markersContext || !getMarkers) {
    return { factory: null, report };
  }

  try {
    report.invoked = true;
    const markersCollection = await Promise.resolve(
      getMarkers.call(markersContext, input.activeSequence),
    );
    const markersCollectionObject = asRecord(markersCollection);
    const createAddMarkerAction = asFunction(
      safeGetProperty(markersCollectionObject, "createAddMarkerAction"),
    );

    report.valueKind = getValueKind(markersCollection);
    updateReportObjectDetails(report, markersCollection);

    console.info("[GLIFO] markers:documented-getMarkers-result", {
      collectionTypeof: typeof markersCollection,
      collectionValueKind: getValueKind(markersCollection),
      collectionOwnPropertyNames: safeOwnPropertyNames(markersCollection),
      collectionOwnKeys: safeReflectOwnKeys(markersCollection),
      createAddMarkerActionTypeof: typeof safeGetProperty(
        markersCollectionObject,
        "createAddMarkerAction",
      ),
    });

    if (!markersCollectionObject || !createAddMarkerAction) {
      return { factory: null, report };
    }

    report.resolved = true;
    return {
      factory: createCollectionMarkerFactory({
        source: report.name,
        markersObject: markersCollectionObject,
        createAddMarkerAction,
      }),
      report,
    };
  } catch (error) {
    report.error = toErrorMessage(error);
    return { factory: null, report };
  }
}

function createCollectionMarkerFactory(input: {
  source: string;
  markersObject: UnknownRecord;
  createAddMarkerAction: UnknownFn;
}): MarkerActionFactory {
  return {
    source: input.source,
    createAction: async ({ name, markerType, startTime, duration, comments }) => Promise.resolve(
      input.createAddMarkerAction.call(
        input.markersObject,
        name,
        markerType,
        startTime,
        duration,
        comments,
      ),
    ),
  };
}

function createDirectMarkerFactory(input: {
  source: string;
  target: UnknownRecord;
  createAddMarkerAction: UnknownFn;
  includeSequenceInActionArgs: boolean;
}): MarkerActionFactory {
  return {
    source: input.source,
    createAction: async ({
      activeSequence,
      name,
      markerType,
      startTime,
      duration,
      comments,
    }) => {
      const args = input.includeSequenceInActionArgs
        ? [activeSequence, name, markerType, startTime, duration, comments]
        : [name, markerType, startTime, duration, comments];

      return Promise.resolve(input.createAddMarkerAction.call(input.target, ...args));
    },
  };
}

function createMarkerApiDiagnostics(input: {
  premiereModule: UnknownRecord;
  activeProject: UnknownRecord;
  activeSequence: UnknownRecord;
}): MarkerApiDiagnostics {
  const premiereModule = input.premiereModule;
  const appObject = safeGetProperty(premiereModule, "app") ??
    safeGetProperty(premiereModule, "App");
  const projectObject = resolveKnownProjectObject(premiereModule) ?? input.activeProject;

  return {
    topLevelKeys: safeEnumerableKeys(premiereModule),
    topLevelPropertyNames: safePropertyNames(premiereModule),
    markerRelatedTopLevelKeys: findMarkerRelatedKeys(premiereModule),
    documentedApi: createDocumentedApiDiagnostics({
      premiereModule,
      activeProject: input.activeProject,
      activeSequence: input.activeSequence,
    }),
    Markers: inspectObject(safeGetProperty(premiereModule, "Markers")),
    Marker: inspectObject(safeGetProperty(premiereModule, "Marker")),
    Project: inspectObject(safeGetProperty(premiereModule, "Project")),
    Constants: inspectObject(safeGetProperty(premiereModule, "Constants")),
    TickTime: inspectObject(safeGetProperty(premiereModule, "TickTime")),
    EventManager: inspectObject(safeGetProperty(premiereModule, "EventManager")),
    app: inspectObject(appObject),
    project: inspectObject(projectObject),
    activeProject: inspectObject(input.activeProject),
    activeSequence: inspectObject(input.activeSequence),
  };
}

function createDocumentedApiDiagnostics(input: {
  premiereModule: UnknownRecord;
  activeProject: UnknownRecord;
  activeSequence: UnknownRecord;
}): MarkerDocumentedApiDiagnostics {
  const markersStatic = safeGetProperty(input.premiereModule, "Markers");
  const markersPrototype = safeGetProperty(markersStatic, "prototype") ?? {};
  const markerStatic = safeGetProperty(input.premiereModule, "Marker");
  const markerPrototype = safeGetProperty(markerStatic, "prototype") ?? {};
  const tickTimeStatic = safeGetProperty(input.premiereModule, "TickTime");

  return {
    pproMarkersTypeof: typeof markersStatic,
    pproMarkersGetMarkersTypeof: typeof safeGetProperty(markersStatic, "getMarkers"),
    pproMarkersOwnPropertyNames: safeOwnPropertyNames(markersStatic),
    pproMarkersPrototypeOwnPropertyNames: safeOwnPropertyNames(markersPrototype),
    pproMarkersOwnKeys: safeReflectOwnKeys(markersStatic),
    pproMarkersPrototypeOwnKeys: safeReflectOwnKeys(markersPrototype),
    pproMarkerTypeof: typeof markerStatic,
    pproMarkerOwnPropertyNames: safeOwnPropertyNames(markerStatic),
    pproMarkerPrototypeOwnPropertyNames: safeOwnPropertyNames(markerPrototype),
    sequenceGetMarkersTypeof: typeof safeGetProperty(input.activeSequence, "getMarkers"),
    sequenceMarkersTypeof: typeof safeGetProperty(input.activeSequence, "markers"),
    activeProjectExecuteTransactionTypeof: typeof safeGetProperty(
      input.activeProject,
      "executeTransaction",
    ),
    pproCompoundActionTypeof: typeof safeGetProperty(input.premiereModule, "CompoundAction"),
    pproTickTimeCreateWithSecondsTypeof: typeof safeGetProperty(
      tickTimeStatic,
      "createWithSeconds",
    ),
  };
}

function resolveKnownProjectObject(premiereModule: UnknownRecord): unknown {
  const appObject = asRecord(safeGetProperty(premiereModule, "app")) ??
    asRecord(safeGetProperty(premiereModule, "App"));

  return safeGetProperty(premiereModule, "project") ??
    safeGetProperty(premiereModule, "activeProject") ??
    (appObject ? safeGetProperty(appObject, "project") : undefined) ??
    (appObject ? safeGetProperty(appObject, "activeProject") : undefined) ??
    undefined;
}

function createMarkerCandidateReport(definition: MarkerCandidateDefinition): MarkerCandidateReport {
  return {
    name: definition.name,
    kind: definition.kind,
    available: false,
    invoked: false,
    resolved: false,
    error: null,
    valueKind: getValueKind(definition.parent),
    keys: [],
    methods: [],
  };
}

function updateReportObjectDetails(report: MarkerCandidateReport, value: unknown): void {
  report.valueKind = getValueKind(value);
  report.keys = safePropertyNames(value);
  report.methods = extractMethods(value);
}

function inspectObject(value: unknown): MarkerObjectInspection {
  const propertyNames = safePropertyNames(value);
  const methods = extractMethods(value);

  return {
    valueKind: getValueKind(value),
    enumerableKeys: safeEnumerableKeys(value),
    propertyNames,
    methods,
    markerRelatedKeys: propertyNames.filter((key) => key.toLowerCase().includes("marker")),
    markerRelatedMethods: methods.filter((key) => key.toLowerCase().includes("marker")),
  };
}

function findMarkerRelatedKeys(value: unknown): string[] {
  return safePropertyNames(value).filter((key) => key.toLowerCase().includes("marker"));
}

function getMarkerType(premiereModule: UnknownRecord): unknown {
  const constants = asRecord(safeGetProperty(premiereModule, "Constants")) ??
    asRecord(safeGetProperty(premiereModule, "constants"));
  const markerTypeConstants = asRecord(constants?.MarkerType) ??
    asRecord(constants?.markerType) ??
    asRecord(constants?.markers);

  if (markerTypeConstants) {
    for (const key of ["Comment", "COMMENT", "comment"]) {
      const value = safeGetProperty(markerTypeConstants, key);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }

  return MARKER_TYPE;
}

function createMarkersApiUnavailableMessage(
  diagnostics: MarkerApiDiagnostics,
  reports: MarkerCandidateReport[],
): string {
  return [
    "Markers API documentada por Adobe no esta expuesta en este runtime UXP.",
    createMarkerEntrypointSummary(diagnostics, reports),
  ].join(" ");
}

function createMarkerEntrypointSummary(
  diagnostics: MarkerApiDiagnostics,
  reports: MarkerCandidateReport[],
): string {
  return [
    `Entry points detectados: topLevel=[${formatList(diagnostics.topLevelPropertyNames)}]`,
    `documentedApi=${formatDocumentedApiDiagnostics(diagnostics.documentedApi)}`,
    `markerKeys=[${formatList(diagnostics.markerRelatedTopLevelKeys)}]`,
    `Markers.methods=[${formatList(diagnostics.Markers.methods)}]`,
    `sequence.methods=[${formatList(diagnostics.activeSequence.methods)}]`,
    `sequence.markerKeys=[${formatList(diagnostics.activeSequence.markerRelatedKeys)}]`,
    `project.methods=[${formatList(diagnostics.activeProject.methods)}]`,
    `project.markerKeys=[${formatList(diagnostics.activeProject.markerRelatedKeys)}]`,
    `candidates=[${formatList(summarizeMarkerCandidateReports(reports))}]`,
  ].join("; ");
}

function formatDocumentedApiDiagnostics(diagnostics: MarkerDocumentedApiDiagnostics): string {
  return [
    `typeof ppro.Markers=${diagnostics.pproMarkersTypeof}`,
    `typeof ppro.Markers?.getMarkers=${diagnostics.pproMarkersGetMarkersTypeof}`,
    `Markers.ownPropertyNames=[${formatList(diagnostics.pproMarkersOwnPropertyNames)}]`,
    `Markers.prototype.ownPropertyNames=[${formatList(diagnostics.pproMarkersPrototypeOwnPropertyNames)}]`,
    `Markers.ownKeys=[${formatList(diagnostics.pproMarkersOwnKeys)}]`,
    `Markers.prototype.ownKeys=[${formatList(diagnostics.pproMarkersPrototypeOwnKeys)}]`,
    `typeof ppro.Marker=${diagnostics.pproMarkerTypeof}`,
    `Marker.ownPropertyNames=[${formatList(diagnostics.pproMarkerOwnPropertyNames)}]`,
    `Marker.prototype.ownPropertyNames=[${formatList(diagnostics.pproMarkerPrototypeOwnPropertyNames)}]`,
    `typeof sequence.getMarkers=${diagnostics.sequenceGetMarkersTypeof}`,
    `typeof sequence.markers=${diagnostics.sequenceMarkersTypeof}`,
    `typeof activeProject.executeTransaction=${diagnostics.activeProjectExecuteTransactionTypeof}`,
    `typeof ppro.CompoundAction=${diagnostics.pproCompoundActionTypeof}`,
    `typeof ppro.TickTime?.createWithSeconds=${diagnostics.pproTickTimeCreateWithSecondsTypeof}`,
  ].join(", ");
}

function summarizeMarkerCandidateReports(reports: MarkerCandidateReport[]): string[] {
  return reports
    .filter((report) => report.available || report.invoked || report.resolved || report.error)
    .map((report) => {
      if (report.resolved) {
        return `${report.name}:resolved`;
      }

      if (report.error) {
        return `${report.name}:error:${report.error}`;
      }

      if (report.invoked) {
        return `${report.name}:invoked`;
      }

      return `${report.name}:available`;
    });
}

function formatList(values: string[], maxItems = 24): string {
  if (values.length === 0) {
    return "(none)";
  }

  const visible = values.slice(0, maxItems);
  const suffix = values.length > visible.length ? `, ... +${values.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function createTickTime(premiereModule: UnknownRecord, ms: number): unknown {
  const tickTimeStatic = asRecord(premiereModule.TickTime);
  const createWithSeconds = asFunction(tickTimeStatic?.createWithSeconds);
  if (tickTimeStatic && createWithSeconds) {
    return createWithSeconds.call(tickTimeStatic, ms / 1000);
  }

  const createWithTicks = asFunction(tickTimeStatic?.createWithTicks);
  if (tickTimeStatic && createWithTicks) {
    const ticks = Math.round((ms / 1000) * PREMIERE_TICKS_PER_SECOND);
    return createWithTicks.call(tickTimeStatic, String(ticks));
  }

  throw new MarkerCreationError(
    "tick_time_unavailable",
    "Premiere UXP no expone TickTime.createWithSeconds/createWithTicks.",
    {
      tickTimeKeys: tickTimeStatic ? Object.keys(tickTimeStatic).sort() : [],
    },
  );
}

function executeMarkerTransaction(input: {
  activeProject: UnknownRecord;
  markerActions: unknown[];
}): void {
  const executeTransaction = asFunction(input.activeProject.executeTransaction);
  if (!executeTransaction) {
    throw new MarkerCreationError(
      "transaction_unavailable",
      "Project.executeTransaction no esta disponible para crear markers.",
      {
        projectKeys: Object.keys(input.activeProject).sort(),
      },
    );
  }

  try {
    const executed = executeTransaction.call(
      input.activeProject,
      (compoundAction: unknown) => {
        const compoundActionObject = asRecord(compoundAction);
        const addAction = asFunction(compoundActionObject?.addAction);
        if (!compoundActionObject || !addAction) {
          throw new Error("CompoundAction.addAction no esta disponible");
        }

        for (const action of input.markerActions) {
          const added = addAction.call(compoundActionObject, action);
          if (added === false) {
            throw new Error("CompoundAction.addAction devolvio false");
          }
        }
      },
      "Create GLIFO Markers",
    );

    if (executed !== true) {
      throw new Error("Project.executeTransaction devolvio false");
    }
  } catch (error) {
    throw new MarkerCreationError(
      "marker_action_failed",
      `No se pudo ejecutar la transaccion de markers: ${toErrorMessage(error)}`,
    );
  }
}

function getRuntimeRequire(): UnknownFn {
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new MarkerCreationError(
      "premiere_runtime_unavailable",
      "Premiere UXP runtime no esta disponible.",
    );
  }

  return requireFn as UnknownFn;
}

function loadPremiereModule(requireFn: UnknownFn): UnknownRecord {
  try {
    const premiereModule = asRecord(requireFn("premierepro"));
    if (!premiereModule) {
      throw new Error("require('premierepro') devolvio un valor invalido");
    }

    return premiereModule;
  } catch (error) {
    throw new MarkerCreationError(
      "premiere_runtime_unavailable",
      `No se pudo cargar premierepro: ${toErrorMessage(error)}`,
      { cause: error },
    );
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

function safeOwnPropertyNames(value: unknown): string[] {
  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  try {
    return Object.getOwnPropertyNames(valueObject).sort();
  } catch {
    return [];
  }
}

function safeReflectOwnKeys(value: unknown): string[] {
  const valueObject = asRecord(value);
  if (!valueObject) {
    return [];
  }

  try {
    return Reflect.ownKeys(valueObject).map(String).sort();
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
    // Native UXP objects can reject reflection; continue with what we can read.
  }

  try {
    for (const key of Object.getOwnPropertyNames(valueObject)) {
      names.add(key);
    }
  } catch {
    // Keep the keys collected from Object.keys.
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
    // Own methods are enough for diagnostics when prototype reflection fails.
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

function asRecord(value: unknown): UnknownRecord | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    return value as UnknownRecord;
  }

  return null;
}

function asFunction(value: unknown): UnknownFn | null {
  return typeof value === "function" ? value as UnknownFn : null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
