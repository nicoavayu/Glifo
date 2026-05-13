import { getPremiereModuleAccess, getSelectedRuntimeContext } from "./selection";
import type {
  PremiereTranscriptCapabilities,
  SelectedClipInfo,
  SelectionSource,
} from "../types/premiere";

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

interface ObjectMethodSummary {
  exists: boolean;
  ownKeys: string[];
  methods: string[];
}

export interface PremiereRuntimeMethodInventory {
  premiereModuleKeys: string[];
  transcript: ObjectMethodSummary;
  textSegments: ObjectMethodSummary;
  clipProjectItem: ObjectMethodSummary;
  project: ObjectMethodSummary;
  projectUtils: ObjectMethodSummary;
}

export interface PremiereSelectedItemDiagnostics {
  found: boolean;
  selectionSource: SelectionSource | "none";
  clipInfo: SelectedClipInfo | null;
  trackItem: ObjectMethodSummary;
  projectItem: ObjectMethodSummary;
  clipProjectItem: ObjectMethodSummary;
}

export interface PremiereRuntimeDiagnosticsReport {
  createdAt: string;
  moduleAccess: {
    hasRequirePremierePro: boolean;
    premiereModuleLoaded: boolean;
    requireError: string | null;
    premiereModuleKeys: string[];
  };
  capabilities: PremiereTranscriptCapabilities;
  methodInventory: PremiereRuntimeMethodInventory;
  selectedItem: PremiereSelectedItemDiagnostics;
}

/**
 * Feature detection para saber qué capacidades de transcript están disponibles
 * en el runtime actual de Premiere/UXP.
 */
export async function getPremiereTranscriptCapabilities(): Promise<PremiereTranscriptCapabilities> {
  const moduleAccess = getPremiereModuleAccess();
  const base: PremiereTranscriptCapabilities = {
    hasRequirePremierePro: moduleAccess.hasRequirePremierePro,
    premiereModuleLoaded: moduleAccess.premiereModuleLoaded,
    hasTranscriptClass: false,
    hasClipProjectItem: false,
    canReadSelection: false,
    canExportTranscript: false,
    canImportTranscript: false,
    canCreateImportTextSegmentsAction: false,
    canExecuteTransaction: false,
    missingRequirements: [],
  };

  if (!moduleAccess.hasRequirePremierePro) {
    return {
      ...base,
      missingRequirements: [
        "globalThis.require no está disponible",
      ],
    };
  }

  if (!moduleAccess.premiereModuleLoaded || !moduleAccess.premiereModule) {
    return {
      ...base,
      missingRequirements: [
        moduleAccess.requireError ?? "No se pudo cargar require('premierepro')",
      ],
    };
  }

  const premiereModule = moduleAccess.premiereModule;
  const transcriptStatic = asRecord(premiereModule.Transcript);
  const clipProjectItemStatic = asRecord(premiereModule.ClipProjectItem);
  const projectStatic = asRecord(premiereModule.Project);
  const projectUtilsStatic = asRecord(premiereModule.ProjectUtils);

  const hasTranscriptClass = transcriptStatic !== null;
  const hasClipProjectItem = clipProjectItemStatic !== null && hasMethod(clipProjectItemStatic, "cast");
  const canExportTranscript = hasMethod(transcriptStatic, "exportToJSON");
  const canImportTranscript = hasMethod(transcriptStatic, "importFromJSON");
  const canCreateImportTextSegmentsAction = hasMethod(
    transcriptStatic,
    "createImportTextSegmentsAction",
  );

  let canExecuteTransaction = false;
  let canReadSelection = false;

  const getActiveProjectFn = asFunction(projectStatic?.getActiveProject);
  const hasProjectUtilsSelection = hasMethod(projectUtilsStatic, "getSelection");

  if (projectStatic && getActiveProjectFn) {
    const activeProject = await safeCall(projectStatic, getActiveProjectFn);
    const projectObject = asRecord(activeProject);

    if (projectObject) {
      canExecuteTransaction = hasMethod(projectObject, "executeTransaction");
      const hasGetActiveSequence = hasMethod(projectObject, "getActiveSequence");
      canReadSelection = hasGetActiveSequence || hasProjectUtilsSelection;
    }
  }

  if (!canReadSelection) {
    // Fallback: si hay contexto seleccionado, confirmamos que el runtime pudo leer selección.
    const selectedContext = await getSelectedRuntimeContext();
    canReadSelection = selectedContext !== null;
  }

  const missingRequirements: string[] = [];
  if (!hasTranscriptClass) {
    missingRequirements.push("Transcript no está expuesto en runtime");
  }
  if (!hasClipProjectItem) {
    missingRequirements.push("ClipProjectItem.cast no está disponible");
  }
  if (!canReadSelection) {
    missingRequirements.push("No se pudo leer selección activa");
  }
  if (!canExportTranscript) {
    missingRequirements.push("Transcript.exportToJSON no disponible");
  }
  if (!canImportTranscript) {
    missingRequirements.push("Transcript.importFromJSON no disponible");
  }
  if (!canCreateImportTextSegmentsAction) {
    missingRequirements.push("Transcript.createImportTextSegmentsAction no disponible");
  }
  if (!canExecuteTransaction) {
    missingRequirements.push("Project.executeTransaction no disponible");
  }

  return {
    hasRequirePremierePro: true,
    premiereModuleLoaded: true,
    hasTranscriptClass,
    hasClipProjectItem,
    canReadSelection,
    canExportTranscript,
    canImportTranscript,
    canCreateImportTextSegmentsAction,
    canExecuteTransaction,
    missingRequirements,
  };
}

/**
 * Reúne un diagnóstico serializable con módulo, métodos detectados,
 * capacidades y datos útiles de la selección actual.
 */
export async function collectPremiereRuntimeDiagnostics(): Promise<PremiereRuntimeDiagnosticsReport> {
  const moduleAccess = getPremiereModuleAccess();
  const capabilities = await getPremiereTranscriptCapabilities();

  const methodInventory = collectMethodInventory(moduleAccess.premiereModule);
  const selectedItem = await collectSelectedItemDiagnostics();

  return {
    createdAt: new Date().toISOString(),
    moduleAccess: {
      hasRequirePremierePro: moduleAccess.hasRequirePremierePro,
      premiereModuleLoaded: moduleAccess.premiereModuleLoaded,
      requireError: moduleAccess.requireError,
      premiereModuleKeys: moduleAccess.premiereModuleKeys,
    },
    capabilities,
    methodInventory,
    selectedItem,
  };
}

/**
 * Log estructurado y compacto del diagnóstico para depuración en Premiere.
 */
export function logPremiereRuntimeDiagnostics(
  diagnostics: PremiereRuntimeDiagnosticsReport,
  contextLabel = "Premiere Transcript Diagnostics",
): void {
  const groupTitle = `[PluginSubs] ${contextLabel}`;

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(groupTitle);
  } else {
    console.info(groupTitle);
  }

  console.info("moduleAccess", diagnostics.moduleAccess);
  console.info("capabilities", diagnostics.capabilities);
  console.info("selectedItem", diagnostics.selectedItem);
  console.info("methodInventory", diagnostics.methodInventory);

  if (diagnostics.moduleAccess.requireError) {
    console.warn("require('premierepro') error:", diagnostics.moduleAccess.requireError);
  }

  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}

async function collectSelectedItemDiagnostics(): Promise<PremiereSelectedItemDiagnostics> {
  const context = await getSelectedRuntimeContext();
  if (!context) {
    return {
      found: false,
      selectionSource: "none",
      clipInfo: null,
      trackItem: summarizeObject(null),
      projectItem: summarizeObject(null),
      clipProjectItem: summarizeObject(null),
    };
  }

  return {
    found: true,
    selectionSource: context.selectionSource,
    clipInfo: {
      clipId: context.selectedItem.clipId,
      clipName: context.selectedItem.clipName,
      projectItemId: context.selectedItem.projectItemId,
      mediaPath: context.selectedItem.mediaPath,
      durationMs: context.selectedItem.durationMs,
    },
    trackItem: summarizeObject(context.trackItem),
    projectItem: summarizeObject(context.projectItem),
    clipProjectItem: summarizeObject(context.clipProjectItem),
  };
}

function collectMethodInventory(premiereModule: UnknownRecord | null): PremiereRuntimeMethodInventory {
  return {
    premiereModuleKeys: premiereModule ? Object.keys(premiereModule).sort() : [],
    transcript: summarizeObject(asRecord(premiereModule?.Transcript)),
    textSegments: summarizeObject(asRecord(premiereModule?.TextSegments)),
    clipProjectItem: summarizeObject(asRecord(premiereModule?.ClipProjectItem)),
    project: summarizeObject(asRecord(premiereModule?.Project)),
    projectUtils: summarizeObject(asRecord(premiereModule?.ProjectUtils)),
  };
}

function summarizeObject(target: unknown): ObjectMethodSummary {
  const targetObject = asRecord(target);
  if (!targetObject) {
    return {
      exists: false,
      ownKeys: [],
      methods: [],
    };
  }

  return {
    exists: true,
    ownKeys: Object.keys(targetObject).sort(),
    methods: getMethodNames(targetObject),
  };
}

function getMethodNames(target: UnknownRecord): string[] {
  const ownMethodNames = Object.keys(target).filter((key) => typeof target[key] === "function");

  const proto = Object.getPrototypeOf(target);
  const protoMethodNames = proto
    ? Object.getOwnPropertyNames(proto).filter(
        (name) => name !== "constructor" && typeof (target as UnknownRecord)[name] === "function",
      )
    : [];

  return Array.from(new Set([...ownMethodNames, ...protoMethodNames])).sort();
}

async function safeCall(target: UnknownRecord, fn: UnknownFn): Promise<unknown> {
  try {
    return await Promise.resolve(fn.call(target));
  } catch {
    return null;
  }
}

function hasMethod(target: UnknownRecord | null, methodName: string): boolean {
  return Boolean(target && typeof target[methodName] === "function");
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
