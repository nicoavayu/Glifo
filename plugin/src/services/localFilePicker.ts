export interface PickedMediaFile {
  name: string;
  nativePath: string;
}

export interface PickedMogrtFile {
  name: string;
  nativePath: string;
}

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

const SUPPORTED_MEDIA_TYPES = [
  "wav",
  "mp4",
  "m4a",
  "mp3",
  "mpeg",
  "mpga",
  "webm",
  "flac",
  "ogg",
];

export async function pickExportedMediaFile(): Promise<PickedMediaFile | null> {
  return pickLocalFile({
    types: SUPPORTED_MEDIA_TYPES,
    unavailableMessage: "UXP require no está disponible para abrir el selector de archivos",
    fileSystemMessage: "UXP localFileSystem.getFileForOpening no está disponible",
    pathMessage: "El archivo seleccionado no expone nativePath",
    fallbackName: "archivo seleccionado",
  });
}

export async function pickMogrtFile(): Promise<PickedMogrtFile | null> {
  return pickLocalFile({
    types: ["mogrt"],
    unavailableMessage: "UXP require no está disponible para seleccionar un MOGRT",
    fileSystemMessage: "UXP localFileSystem.getFileForOpening no está disponible",
    pathMessage: "El MOGRT seleccionado no expone nativePath",
    fallbackName: "caption-template.mogrt",
  });
}

async function pickLocalFile(input: {
  types: string[];
  unavailableMessage: string;
  fileSystemMessage: string;
  pathMessage: string;
  fallbackName: string;
}): Promise<PickedMediaFile | PickedMogrtFile | null> {
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new Error(input.unavailableMessage);
  }

  const uxpModule = asRecord((requireFn as UnknownFn)("uxp"));
  const storage = asRecord(uxpModule?.storage);
  const localFileSystem = asRecord(storage?.localFileSystem);
  const getFileForOpening = asFunction(localFileSystem?.getFileForOpening);

  if (!getFileForOpening || !localFileSystem) {
    throw new Error(input.fileSystemMessage);
  }

  const selected = await Promise.resolve(
    getFileForOpening.call(localFileSystem, {
      types: input.types,
      allowMultiple: false,
    }),
  );

  const file = Array.isArray(selected) ? selected[0] : selected;
  const fileObject = asRecord(file);
  if (!fileObject) {
    return null;
  }

  const nativePath = await Promise.resolve(fileObject.nativePath);
  if (typeof nativePath !== "string" || nativePath.trim().length === 0) {
    throw new Error(input.pathMessage);
  }

  const name =
    typeof fileObject.name === "string" && fileObject.name.trim().length > 0
      ? fileObject.name
      : nativePath.split(/[\\/]/).pop() ?? input.fallbackName;

  return {
    name,
    nativePath,
  };
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
