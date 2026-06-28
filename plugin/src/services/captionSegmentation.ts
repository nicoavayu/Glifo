import type {
  CaptionSegment,
  SttWord,
} from "../types/transcribe";

export type CaptionSegmentationMode = "natural" | "short" | "word-by-word";
export type CaptionLanguageProfile = "es-rioplatense";

export interface CaptionEditorSettings {
  mode: CaptionSegmentationMode;
  maxLines: 1 | 2;
  maxCharsPerLine: number;
  maxDurationMs: number;
  minPauseMs: number;
  languageProfile: CaptionLanguageProfile;
}

export const DEFAULT_CAPTION_EDITOR_SETTINGS: CaptionEditorSettings = {
  mode: "natural",
  maxLines: 2,
  maxCharsPerLine: 32,
  maxDurationMs: 3500,
  minPauseMs: 600,
  languageProfile: "es-rioplatense",
};

export const CAPTION_EDITOR_LIMITS = {
  maxCharsPerLine: {
    min: 1,
    max: 42,
  },
  maxDurationMs: {
    min: 500,
    max: 4000,
  },
  minPauseMs: {
    min: 200,
    max: 1000,
  },
} as const;

interface InternalSegmentationConfig extends CaptionEditorSettings {
  maxCharsTotal: number;
  minDurationMs: number;
}

const NATURAL_MAX_DURATION_EXTENSION_RATIO = 1.2;
const SHORT_MAX_DURATION_EXTENSION_RATIO = 1.08;

const BAD_CAPTION_END_WORDS_ES_RIOPLATENSE = new Set([
  "de",
  "del",
  "que",
  "con",
  "para",
  "en",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "te",
  "me",
  "se",
  "mi",
  "tu",
  "su",
  "mis",
  "tus",
  "sus",
]);

const BAD_CAPTION_START_WORDS_ES_RIOPLATENSE = new Set([
  "de",
  "del",
  "que",
  "con",
  "para",
  "en",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
]);

const NATURAL_PHRASE_START_WORDS_ES_RIOPLATENSE = new Set([
  "te",
  "me",
  "se",
  "nos",
  "yo",
  "vos",
  "tu",
  "usted",
  "ustedes",
]);

export function resolveCaptionEditorSettings(
  settings: Partial<CaptionEditorSettings> = {},
): CaptionEditorSettings {
  const mode = isCaptionSegmentationMode(settings.mode)
    ? settings.mode
    : DEFAULT_CAPTION_EDITOR_SETTINGS.mode;
  const languageProfile = settings.languageProfile === "es-rioplatense"
    ? settings.languageProfile
    : DEFAULT_CAPTION_EDITOR_SETTINGS.languageProfile;

  return {
    mode,
    languageProfile,
    maxLines: settings.maxLines === 1 ? 1 : 2,
    maxCharsPerLine: clampInteger(
      settings.maxCharsPerLine,
      CAPTION_EDITOR_LIMITS.maxCharsPerLine.min,
      CAPTION_EDITOR_LIMITS.maxCharsPerLine.max,
      DEFAULT_CAPTION_EDITOR_SETTINGS.maxCharsPerLine,
    ),
    maxDurationMs: clampInteger(
      settings.maxDurationMs,
      CAPTION_EDITOR_LIMITS.maxDurationMs.min,
      CAPTION_EDITOR_LIMITS.maxDurationMs.max,
      DEFAULT_CAPTION_EDITOR_SETTINGS.maxDurationMs,
    ),
    minPauseMs: clampInteger(
      settings.minPauseMs,
      CAPTION_EDITOR_LIMITS.minPauseMs.min,
      CAPTION_EDITOR_LIMITS.minPauseMs.max,
      DEFAULT_CAPTION_EDITOR_SETTINGS.minPauseMs,
    ),
  };
}

export function buildCaptionSegmentsFromWords(
  words: SttWord[],
  settings: Partial<CaptionEditorSettings> = {},
): CaptionSegment[] {
  const resolvedSettings = resolveCaptionEditorSettings(settings);
  const normalizedWords = normalizeWordsForCaptioning(words);

  if (resolvedSettings.mode === "word-by-word") {
    return normalizedWords.map((word) => ({
      startMs: word.startMs,
      endMs: word.endMs,
      text: word.word,
    }));
  }

  const config = createInternalSegmentationConfig(resolvedSettings);
  const captions: CaptionSegment[] = [];
  let pending: SttWord[] = [];

  for (const word of normalizedWords) {
    if (pending.length === 0) {
      pending.push(word);
      continue;
    }

    const previousWord = pending[pending.length - 1];
    const gapMs = previousWord ? word.startMs - previousWord.endMs : 0;
    if (gapMs >= config.minPauseMs && shouldFlushForPause(pending, config)) {
      flushPending(captions, pending, config);
      pending = [word];
      continue;
    }

    pending.push(word);

    const splitIndex = chooseSplitIndex(pending, config);
    if (splitIndex !== null) {
      flushPending(captions, pending.slice(0, splitIndex + 1), config);
      pending = pending.slice(splitIndex + 1);
    }
  }

  flushPending(captions, pending, config);
  return captions;
}

function isCaptionSegmentationMode(value: unknown): value is CaptionSegmentationMode {
  return value === "natural" || value === "short" || value === "word-by-word";
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function createInternalSegmentationConfig(
  settings: CaptionEditorSettings,
): InternalSegmentationConfig {
  return {
    ...settings,
    maxCharsTotal: settings.maxCharsPerLine * settings.maxLines,
    minDurationMs: settings.mode === "short" ? 450 : 800,
  };
}

function normalizeWordsForCaptioning(words: SttWord[]): SttWord[] {
  return words
    .filter((word) => {
      return Number.isFinite(word.startMs) &&
        Number.isFinite(word.endMs) &&
        word.startMs >= 0 &&
        word.endMs > word.startMs &&
        word.word.trim().length > 0;
    })
    .map((word) => ({
      startMs: Math.round(word.startMs),
      endMs: Math.round(word.endMs),
      word: word.word.trim(),
    }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
}

function shouldFlushForPause(
  words: SttWord[],
  config: InternalSegmentationConfig,
): boolean {
  if (config.mode === "short") {
    return true;
  }

  if (words.length > 1) {
    return true;
  }

  return getDurationMs(words) >= config.minDurationMs;
}

function chooseSplitIndex(
  words: SttWord[],
  config: InternalSegmentationConfig,
): number | null {
  if (words.length <= 1) {
    return null;
  }

  const durationMs = getDurationMs(words);
  const textLength = joinWords(words).length;
  const lastWord = words[words.length - 1]?.word ?? "";

  if (config.mode === "short") {
    if (
      endsWithTerminalPunctuation(lastWord) &&
      durationMs >= config.minDurationMs &&
      textLength <= getHardMaxChars(config)
    ) {
      return words.length - 1;
    }

    if (
      endsWithNaturalPunctuation(lastWord) &&
      durationMs >= config.minDurationMs &&
      textLength <= config.maxCharsTotal
    ) {
      return words.length - 1;
    }

    if (
      durationMs >= config.maxDurationMs * 0.72 &&
      textLength >= config.maxCharsTotal * 0.55 &&
      !isBadCaptionEnd(lastWord, config)
    ) {
      return words.length - 1;
    }
  } else {
    if (
      endsWithTerminalPunctuation(lastWord) &&
      durationMs >= config.minDurationMs &&
      textLength <= config.maxCharsTotal
    ) {
      return words.length - 1;
    }

    if (
      endsWithNaturalPunctuation(lastWord) &&
      durationMs >= config.minDurationMs &&
      textLength <= config.maxCharsTotal &&
      (
        durationMs >= config.maxDurationMs * 0.6 ||
        textLength >= config.maxCharsTotal * 0.45
      )
    ) {
      return words.length - 1;
    }
  }

  const exceedsDuration = durationMs > config.maxDurationMs;
  const exceedsChars = textLength > config.maxCharsTotal;
  if (!exceedsDuration && !exceedsChars) {
    return null;
  }

  const hardDurationExceeded = durationMs > getHardMaxDurationMs(config);
  const hardCharsExceeded = textLength > getHardMaxChars(config);
  const bestSplitIndex = chooseBestInternalSplitIndex(words, config);
  if (bestSplitIndex !== null) {
    if (
      config.mode === "natural" &&
      isAwkwardSplit(words, bestSplitIndex, config) &&
      !hardDurationExceeded &&
      !hardCharsExceeded
    ) {
      return null;
    }

    return bestSplitIndex;
  }

  if (
    config.mode === "natural" &&
    !hardDurationExceeded &&
    !hardCharsExceeded &&
    isBadCaptionEnd(lastWord, config)
  ) {
    return null;
  }

  return words.length - 1;
}

function chooseBestInternalSplitIndex(
  words: SttWord[],
  config: InternalSegmentationConfig,
): number | null {
  let bestIndex: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < words.length - 1; index += 1) {
    const score = scoreSplitIndex(words, index, config);
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return bestIndex;
}

function scoreSplitIndex(
  words: SttWord[],
  index: number,
  config: InternalSegmentationConfig,
): number {
  const firstPart = words.slice(0, index + 1);
  const firstDurationMs = getDurationMs(firstPart);
  const firstTextLength = joinWords(firstPart).length;
  const splitWord = words[index]?.word ?? "";
  const nextWord = words[index + 1]?.word ?? "";
  const gapMs = getGapAfterIndex(words, index);
  const totalDurationMs = getDurationMs(words);
  const totalTextLength = joinWords(words).length;
  const targetDurationRatio = config.mode === "short" ? 0.5 : 0.65;
  const targetMaxDurationRatio = config.mode === "short" ? 0.62 : 0.85;
  const targetCharsRatio = config.mode === "short" ? 0.5 : 0.65;
  const targetMaxCharsRatio = config.mode === "short" ? 0.68 : 0.85;
  const targetDurationMs = Math.min(
    config.maxDurationMs * targetMaxDurationRatio,
    totalDurationMs * targetDurationRatio,
  );
  const targetChars = Math.min(
    config.maxCharsTotal * targetMaxCharsRatio,
    totalTextLength * targetCharsRatio,
  );

  let score = 0;
  score += Math.abs(firstDurationMs - targetDurationMs) / 25;
  score += Math.abs(firstTextLength - targetChars) * 3;
  score += Math.max(0, firstDurationMs - config.maxDurationMs) / 5;
  score += Math.max(0, firstTextLength - config.maxCharsTotal) * 25;

  if (
    config.mode === "natural" &&
    firstDurationMs < config.minDurationMs &&
    firstPart.length <= 1
  ) {
    score += 500;
  }

  if (endsWithTerminalPunctuation(splitWord)) {
    score -= 1000;
  } else if (endsWithNaturalPunctuation(splitWord)) {
    score -= config.mode === "short" ? 620 : 420;
  }

  score -= Math.min(Math.max(0, gapMs), config.minPauseMs) / 2;

  if (isBadCaptionEnd(splitWord, config)) {
    score += config.mode === "short" ? 220 : 650;
  }

  if (isBadCaptionStart(nextWord, config)) {
    score += config.mode === "short" ? 160 : 520;
  }

  if (
    config.mode === "natural" &&
    isNaturalPhraseStart(nextWord, config) &&
    firstDurationMs >= config.minDurationMs
  ) {
    score -= 140;
  }

  return score;
}

function isAwkwardSplit(
  words: SttWord[],
  index: number,
  config: InternalSegmentationConfig,
): boolean {
  const splitWord = words[index]?.word ?? "";
  const nextWord = words[index + 1]?.word ?? "";

  return isBadCaptionEnd(splitWord, config) || isBadCaptionStart(nextWord, config);
}

function flushPending(
  captions: CaptionSegment[],
  words: SttWord[],
  config: InternalSegmentationConfig,
): void {
  if (words.length === 0) {
    return;
  }

  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  if (!firstWord || !lastWord) {
    return;
  }

  const text = wrapCaptionWords(words, config);
  if (!text) {
    return;
  }

  captions.push({
    startMs: firstWord.startMs,
    endMs: lastWord.endMs,
    text,
  });
}

function wrapCaptionWords(words: SttWord[], config: InternalSegmentationConfig): string {
  const rawWords = words.map((word) => word.word);
  if (config.maxLines <= 1) {
    return rawWords.join(" ").replace(/\s+/g, " ").trim();
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of rawWords) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    const candidate = `${currentLine} ${word}`;
    if (candidate.length <= config.maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= config.maxLines) {
    return lines.join("\n").trim();
  }

  return rawWords.join(" ").replace(/\s+/g, " ").trim();
}

function getDurationMs(words: SttWord[]): number {
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  if (!firstWord || !lastWord) {
    return 0;
  }

  return lastWord.endMs - firstWord.startMs;
}

function joinWords(words: SttWord[]): string {
  return words.map((word) => word.word).join(" ").replace(/\s+/g, " ").trim();
}

function getHardMaxDurationMs(config: InternalSegmentationConfig): number {
  const ratio = config.mode === "short"
    ? SHORT_MAX_DURATION_EXTENSION_RATIO
    : NATURAL_MAX_DURATION_EXTENSION_RATIO;
  return config.maxDurationMs * ratio;
}

function getHardMaxChars(config: InternalSegmentationConfig): number {
  if (config.maxCharsTotal <= 8) {
    return config.maxCharsTotal + 2;
  }

  if (config.mode === "short") {
    return config.maxCharsTotal + Math.max(2, Math.round(config.maxCharsTotal * 0.15));
  }

  return config.maxCharsTotal + Math.max(8, Math.round(config.maxCharsTotal * 0.15));
}

function getGapAfterIndex(words: SttWord[], index: number): number {
  const current = words[index];
  const next = words[index + 1];
  if (!current || !next) {
    return 0;
  }

  return next.startMs - current.endMs;
}

function isBadCaptionEnd(value: string, config: InternalSegmentationConfig): boolean {
  if (config.languageProfile !== "es-rioplatense") {
    return false;
  }

  return BAD_CAPTION_END_WORDS_ES_RIOPLATENSE.has(normalizeWordForBoundary(value));
}

function isBadCaptionStart(value: string, config: InternalSegmentationConfig): boolean {
  if (config.languageProfile !== "es-rioplatense") {
    return false;
  }

  return BAD_CAPTION_START_WORDS_ES_RIOPLATENSE.has(normalizeWordForBoundary(value));
}

function isNaturalPhraseStart(value: string, config: InternalSegmentationConfig): boolean {
  if (config.languageProfile !== "es-rioplatense") {
    return false;
  }

  return NATURAL_PHRASE_START_WORDS_ES_RIOPLATENSE.has(normalizeWordForBoundary(value));
}

function normalizeWordForBoundary(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .replace(/^[¿¡"“”'()[\]]+/, "")
    .replace(/[.,?!¿¡:;"“”'()[\]]+$/g, "");
}

function endsWithNaturalPunctuation(value: string): boolean {
  return /[.,?!¿¡]$/.test(value.trim());
}

function endsWithTerminalPunctuation(value: string): boolean {
  return /[.?!]$/.test(value.trim());
}
