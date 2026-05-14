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

    const candidate = [...pending, word];
    if (shouldSplitBeforeWord(candidate, maxCharsTotal, resolvedOptions)) {
      const splitIndex = chooseSplitIndex(pending);
      if (splitIndex < pending.length - 1) {
        flushPending(captions, pending.slice(0, splitIndex + 1));
        pending = pending.slice(splitIndex + 1);
      } else {
        flushPending(captions, pending);
        pending = [];
      }
    }

    pending.push(word);

    if (shouldFlushAfterWord(pending, maxCharsTotal, resolvedOptions)) {
      flushPending(captions, pending);
      pending = [];
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

function shouldSplitBeforeWord(
  words: CaptionWord[],
  maxCharsTotal: number,
  options: CaptionSegmentationOptions,
): boolean {
  if (words.length <= 1) {
    return false;
  }

  return getDurationMs(words) > options.maxDurationMs ||
    joinWords(words).length > maxCharsTotal;
}

function shouldFlushAfterWord(
  words: CaptionWord[],
  maxCharsTotal: number,
  options: CaptionSegmentationOptions,
): boolean {
  if (words.length <= 1) {
    return false;
  }

  const durationMs = getDurationMs(words);
  const textLength = joinWords(words).length;
  if (durationMs > options.maxDurationMs || textLength > maxCharsTotal) {
    return true;
  }

  if (!endsWithNaturalPunctuation(words[words.length - 1]?.word ?? "")) {
    return false;
  }

  if (durationMs < options.minDurationMs) {
    return false;
  }

  return durationMs >= options.maxDurationMs * 0.6 ||
    textLength >= maxCharsTotal * 0.45 ||
    endsWithTerminalPunctuation(words[words.length - 1]?.word ?? "");
}

function chooseSplitIndex(words: CaptionWord[]): number {
  if (words.length <= 1) {
    return words.length - 1;
  }

  for (let index = words.length - 2; index >= 1; index -= 1) {
    if (endsWithNaturalPunctuation(words[index]?.word ?? "")) {
      return index;
    }
  }

  return words.length - 1;
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

function endsWithNaturalPunctuation(value: string): boolean {
  return /[.,?!¿¡]$/.test(value.trim());
}

function endsWithTerminalPunctuation(value: string): boolean {
  return /[.?!]$/.test(value.trim());
}
