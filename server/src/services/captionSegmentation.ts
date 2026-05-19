export interface CaptionWord {
  startMs: number;
  endMs: number;
  word: string;
}

export interface CaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CaptionSegmentationOptions {
  maxCharsPerLine: number;
  maxLines: number;
  maxDurationMs: number;
  minDurationMs: number;
  maxGapMs: number;
}

export const DEFAULT_CAPTION_SEGMENTATION_OPTIONS: CaptionSegmentationOptions = {
  maxCharsPerLine: 32,
  maxLines: 2,
  maxDurationMs: 3500,
  minDurationMs: 800,
  maxGapMs: 600,
};

const MAX_DURATION_EXTENSION_RATIO = 1.2;
const MAX_CHARS_EXTENSION_RATIO = 1.15;
const MIN_EXTRA_CHARS_BEFORE_FORCED_SPLIT = 8;

const BAD_CAPTION_END_WORDS = new Set([
  "de",
  "con",
  "que",
  "un",
  "una",
  "el",
  "la",
  "los",
  "las",
  "y",
  "o",
  "para",
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

const BAD_CAPTION_START_WORDS = new Set([
  "de",
  "con",
  "que",
  "un",
  "una",
  "el",
  "la",
  "los",
  "las",
  "y",
  "o",
  "para",
]);

const NATURAL_PHRASE_START_WORDS = new Set([
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

export function buildCaptionSegments(
  words: CaptionWord[],
  options: Partial<CaptionSegmentationOptions> = {},
): CaptionSegment[] {
  const resolvedOptions = {
    ...DEFAULT_CAPTION_SEGMENTATION_OPTIONS,
    ...options,
  };
  const maxCharsTotal = resolvedOptions.maxCharsPerLine * resolvedOptions.maxLines;
  const normalizedWords = normalizeWordsForCaptioning(words);
  const captions: CaptionSegment[] = [];
  let pending: CaptionWord[] = [];

  for (const word of normalizedWords) {
    if (pending.length === 0) {
      pending.push(word);
      continue;
    }

    const previousWord = pending[pending.length - 1];
    const gapMs = previousWord ? word.startMs - previousWord.endMs : 0;
    if (gapMs > resolvedOptions.maxGapMs && shouldFlushForPause(pending, resolvedOptions)) {
      flushPending(captions, pending);
      pending = [word];
      continue;
    }

    pending.push(word);

    const splitIndex = chooseSplitIndex(pending, maxCharsTotal, resolvedOptions);
    if (splitIndex !== null) {
      flushPending(captions, pending.slice(0, splitIndex + 1));
      pending = pending.slice(splitIndex + 1);
    }
  }

  flushPending(captions, pending);
  return captions;
}

function normalizeWordsForCaptioning(words: CaptionWord[]): CaptionWord[] {
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
  words: CaptionWord[],
  options: CaptionSegmentationOptions,
): boolean {
  if (words.length > 1) {
    return true;
  }

  return getDurationMs(words) >= options.minDurationMs;
}

function chooseSplitIndex(
  words: CaptionWord[],
  maxCharsTotal: number,
  options: CaptionSegmentationOptions,
): number | null {
  if (words.length <= 1) {
    return null;
  }

  const durationMs = getDurationMs(words);
  const textLength = joinWords(words).length;
  const lastWord = words[words.length - 1]?.word ?? "";

  if (endsWithTerminalPunctuation(lastWord) && durationMs >= options.minDurationMs) {
    return words.length - 1;
  }

  if (
    endsWithNaturalPunctuation(lastWord) &&
    durationMs >= options.minDurationMs &&
    (
      durationMs >= options.maxDurationMs * 0.6 ||
      textLength >= maxCharsTotal * 0.45
    )
  ) {
    return words.length - 1;
  }

  const exceedsDuration = durationMs > options.maxDurationMs;
  const exceedsChars = textLength > maxCharsTotal;
  if (!exceedsDuration && !exceedsChars) {
    return null;
  }

  const hardDurationExceeded = durationMs > options.maxDurationMs * MAX_DURATION_EXTENSION_RATIO;
  const hardCharsExceeded = textLength > getHardMaxChars(maxCharsTotal);
  const bestSplitIndex = chooseBestInternalSplitIndex(words, maxCharsTotal, options);
  if (bestSplitIndex !== null) {
    if (
      isAwkwardSplit(words, bestSplitIndex) &&
      !hardDurationExceeded &&
      !hardCharsExceeded
    ) {
      return null;
    }

    return bestSplitIndex;
  }

  if (
    !hardDurationExceeded &&
    !hardCharsExceeded &&
    isBadCaptionEnd(lastWord)
  ) {
    return null;
  }

  return words.length - 1;
}

function chooseBestInternalSplitIndex(
  words: CaptionWord[],
  maxCharsTotal: number,
  options: CaptionSegmentationOptions,
): number | null {
  let bestIndex: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < words.length - 1; index += 1) {
    const score = scoreSplitIndex(words, index, maxCharsTotal, options);
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return bestIndex;
}

function scoreSplitIndex(
  words: CaptionWord[],
  index: number,
  maxCharsTotal: number,
  options: CaptionSegmentationOptions,
): number {
  const firstPart = words.slice(0, index + 1);
  const firstDurationMs = getDurationMs(firstPart);
  const firstTextLength = joinWords(firstPart).length;
  const splitWord = words[index]?.word ?? "";
  const nextWord = words[index + 1]?.word ?? "";
  const gapMs = getGapAfterIndex(words, index);
  const targetDurationMs = Math.min(options.maxDurationMs * 0.85, getDurationMs(words) * 0.65);
  const targetChars = Math.min(maxCharsTotal * 0.85, joinWords(words).length * 0.65);

  let score = 0;
  score += Math.abs(firstDurationMs - targetDurationMs) / 25;
  score += Math.abs(firstTextLength - targetChars) * 3;
  score += Math.max(0, firstDurationMs - options.maxDurationMs) / 5;
  score += Math.max(0, firstTextLength - maxCharsTotal) * 25;

  if (firstDurationMs < options.minDurationMs && firstPart.length <= 1) {
    score += 500;
  }

  if (endsWithTerminalPunctuation(splitWord)) {
    score -= 1000;
  } else if (endsWithNaturalPunctuation(splitWord)) {
    score -= 420;
  }

  score -= Math.min(Math.max(0, gapMs), options.maxGapMs) / 2;

  if (isBadCaptionEnd(splitWord)) {
    score += 650;
  }

  if (isBadCaptionStart(nextWord)) {
    score += 520;
  }

  if (isNaturalPhraseStart(nextWord) && firstDurationMs >= options.minDurationMs) {
    score -= 140;
  }

  return score;
}

function isAwkwardSplit(words: CaptionWord[], index: number): boolean {
  const splitWord = words[index]?.word ?? "";
  const nextWord = words[index + 1]?.word ?? "";

  return isBadCaptionEnd(splitWord) || isBadCaptionStart(nextWord);
}

function flushPending(captions: CaptionSegment[], words: CaptionWord[]): void {
  if (words.length === 0) {
    return;
  }

  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  if (!firstWord || !lastWord) {
    return;
  }

  const text = joinWords(words);
  if (!text) {
    return;
  }

  captions.push({
    startMs: firstWord.startMs,
    endMs: lastWord.endMs,
    text,
  });
}

function getDurationMs(words: CaptionWord[]): number {
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  if (!firstWord || !lastWord) {
    return 0;
  }

  return lastWord.endMs - firstWord.startMs;
}

function joinWords(words: CaptionWord[]): string {
  return words.map((word) => word.word).join(" ").replace(/\s+/g, " ").trim();
}

function getHardMaxChars(maxCharsTotal: number): number {
  return maxCharsTotal + Math.max(
    MIN_EXTRA_CHARS_BEFORE_FORCED_SPLIT,
    Math.round(maxCharsTotal * (MAX_CHARS_EXTENSION_RATIO - 1)),
  );
}

function getGapAfterIndex(words: CaptionWord[], index: number): number {
  const current = words[index];
  const next = words[index + 1];
  if (!current || !next) {
    return 0;
  }

  return next.startMs - current.endMs;
}

function isBadCaptionEnd(value: string): boolean {
  return BAD_CAPTION_END_WORDS.has(normalizeWordForBoundary(value));
}

function isBadCaptionStart(value: string): boolean {
  return BAD_CAPTION_START_WORDS.has(normalizeWordForBoundary(value));
}

function isNaturalPhraseStart(value: string): boolean {
  return NATURAL_PHRASE_START_WORDS.has(normalizeWordForBoundary(value));
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
