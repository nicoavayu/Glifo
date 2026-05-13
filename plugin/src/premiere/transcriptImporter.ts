import { getSelectedClipInfo, getSelectedRuntimeContext } from "./selection";
import {
  collectPremiereRuntimeDiagnostics,
  getPremiereTranscriptCapabilities,
  logPremiereRuntimeDiagnostics,
} from "./runtimeDiagnostics";
import {
  exportExistingTranscriptToJson,
  prepareExternalTranscriptImport,
} from "./transcript";
import type { PreparedTranscriptImportResult } from "../types/premiere";
import type { TranscriptResult } from "../types/transcript";

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

interface ImportOptions {
  diagnosticMode?: boolean;
}

const DEFAULT_DIAGNOSTIC_MODE = true;
let hasEmittedDiagnosticProbe = false;

/**
 * Punto de integración final para importar transcript a Premiere.
 * Aplica detección de capacidades y reporta errores accionables por estado.
 */
export async function importTranscriptIntoPremiere(
  transcript: TranscriptResult,
  options: ImportOptions = {},
): Promise<void> {
  const diagnosticMode = options.diagnosticMode ?? DEFAULT_DIAGNOSTIC_MODE;

  if (diagnosticMode && !hasEmittedDiagnosticProbe) {
    await runPremiereTranscriptDiagnostics(transcript);
    hasEmittedDiagnosticProbe = true;
  }

  if (!Array.isArray(transcript.segments) || transcript.segments.length === 0) {
    logImporterError("transcript_vacio", "El transcript recibido no contiene segmentos");
    return;
  }

  const selectedItem = await getSelectedClipInfo();
  if (!selectedItem) {
    logImporterError("no_hay_seleccion", "Seleccioná un clip o project item antes de importar");
    return;
  }

  if (!selectedItem.projectItemId) {
    logImporterError("seleccion_invalida", "La selección no expone un projectItemId válido");
    return;
  }

  const capabilities = await getPremiereTranscriptCapabilities();
  if (!capabilities.hasTranscriptClass || !capabilities.canCreateImportTextSegmentsAction) {
    logImporterError(
      "runtime_sin_soporte",
      `Runtime sin soporte de importación: ${capabilities.missingRequirements.join("; ")}`,
      capabilities,
    );
    return;
  }

  const preparation = await prepareExternalTranscriptImport(selectedItem, transcript);
  if (preparation.status !== "ok") {
    handlePreparationFailure(preparation);
    return;
  }

  const preparedImport = preparation.preparedImport;
  if (!preparedImport || !preparedImport.importAction) {
    logImporterError(
      "import_no_soportado",
      "No se pudo preparar un Action de importación en este runtime",
      preparation,
    );
    return;
  }

  const executionResult = await executePreparedImportAction(preparedImport.importAction);
  if (!executionResult.ok) {
    logImporterError("import_no_soportado", executionResult.reason, executionResult.details);
    return;
  }

  console.info("[PluginSubs][TranscriptImporter] Importación ejecutada correctamente", {
    clipId: selectedItem.clipId,
    clipName: selectedItem.clipName,
    importedSegments: preparedImport.textSegments.length,
  });
}

/**
 * Modo diagnóstico temporal: imprime selección, capabilities, métodos y resultados
 * de export/import usando el runtime real actual.
 */
export async function runPremiereTranscriptDiagnostics(transcript: TranscriptResult): Promise<void> {
  const diagnostics = await collectPremiereRuntimeDiagnostics();
  logPremiereRuntimeDiagnostics(diagnostics, "Runtime Transcript Probe");

  const selectedItem = await getSelectedClipInfo();
  if (!selectedItem) {
    console.info("[PluginSubs][Diagnostics] No hay selección activa para pruebas export/import");
    return;
  }

  const exportResult = await exportExistingTranscriptToJson(selectedItem);
  const importPreparation = await prepareExternalTranscriptImport(selectedItem, transcript);

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed("[PluginSubs] Transcript Import/Export Diagnostic Results");
  }

  console.info("selection", selectedItem);
  console.info("capabilities", diagnostics.capabilities);
  console.info("exportResult", exportResult);
  console.info(
    "importPreparation",
    importPreparation.status === "ok"
      ? {
          ...importPreparation,
          preparedImport: {
            ...importPreparation.preparedImport,
            importAction: importPreparation.preparedImport?.importAction ? "[Action object]" : null,
            textSegmentsHandle: importPreparation.preparedImport?.textSegmentsHandle
              ? "[TextSegments handle]"
              : null,
          },
        }
      : importPreparation,
  );

  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}

async function executePreparedImportAction(
  importAction: unknown,
): Promise<{ ok: boolean; reason: string; details?: unknown }> {
  const selectedContext = await getSelectedRuntimeContext();
  if (!selectedContext) {
    return {
      ok: false,
      reason: "No se pudo resolver la selección activa en runtime",
    };
  }

  const projectItemObject = asRecord(selectedContext.projectItem);
  const clipProjectItemObject = asRecord(selectedContext.clipProjectItem);

  const project = await resolveParentProject(projectItemObject, clipProjectItemObject);
  const projectObject = asRecord(project);
  if (!projectObject) {
    return {
      ok: false,
      reason: "No se pudo resolver el proyecto padre para ejecutar la transacción",
    };
  }

  const executeTransactionFn = asFunction(projectObject.executeTransaction);
  if (!executeTransactionFn) {
    return {
      ok: false,
      reason: "Project.executeTransaction no está disponible en runtime",
      details: {
        availableKeys: Object.keys(projectObject).sort(),
      },
    };
  }

  try {
    const executed = executeTransactionFn.call(
      projectObject,
      (compoundAction: unknown) => {
        const compoundActionObject = asRecord(compoundAction);
        const addActionFn = asFunction(compoundActionObject?.addAction);
        if (!addActionFn || !compoundActionObject) {
          throw new Error("CompoundAction.addAction no está disponible");
        }

        addActionFn.call(compoundActionObject, importAction);
      },
      "Import External Transcript",
    );

    if (executed !== true) {
      return {
        ok: false,
        reason: "executeTransaction devolvió false al importar transcript",
      };
    }

    return {
      ok: true,
      reason: "ok",
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Error desconocido al ejecutar import action",
    };
  }
}

async function resolveParentProject(
  projectItemObject: UnknownRecord | null,
  clipProjectItemObject: UnknownRecord | null,
): Promise<unknown> {
  const itemGetProjectFn = asFunction(projectItemObject?.getProject);
  if (projectItemObject && itemGetProjectFn) {
    try {
      return await Promise.resolve(itemGetProjectFn.call(projectItemObject));
    } catch {
      // seguimos con fallback clipProjectItem
    }
  }

  const clipGetProjectFn = asFunction(clipProjectItemObject?.getProject);
  if (clipProjectItemObject && clipGetProjectFn) {
    try {
      return await Promise.resolve(clipGetProjectFn.call(clipProjectItemObject));
    } catch {
      return null;
    }
  }

  return null;
}

function handlePreparationFailure(preparation: PreparedTranscriptImportResult): void {
  switch (preparation.status) {
    case "no_selection":
      logImporterError(
        "no_hay_seleccion",
        preparation.reason ?? "No hay selección activa para importar transcript",
        preparation,
      );
      break;
    case "empty_transcript":
      logImporterError(
        "transcript_vacio",
        preparation.reason ?? "No hay segmentos válidos para importar",
        preparation,
      );
      break;
    case "unsupported_in_runtime":
      logImporterError(
        "runtime_sin_soporte",
        preparation.reason ?? "El runtime no soporta importación de transcript",
        preparation,
      );
      break;
    case "selection_invalid":
      logImporterError(
        "seleccion_invalida",
        preparation.reason ?? "La selección no es compatible con importación",
        preparation,
      );
      break;
    default:
      logImporterError(
        "import_no_soportado",
        preparation.reason ?? "No se pudo preparar la importación",
        preparation,
      );
      break;
  }
}

function logImporterError(code: string, message: string, details?: unknown): void {
  console.error(`[PluginSubs][TranscriptImporter][${code}] ${message}`);

  if (details !== undefined) {
    console.error("[PluginSubs][TranscriptImporter][details]", details);
  }
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
