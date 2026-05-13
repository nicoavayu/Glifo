declare global {
  interface Window {
    ppro?: {
      project?: {
        getSelection?: () => unknown[];
        getActiveSequence?: () => {
          getSelection?: () => unknown[];
        } | null;
        activeSequence?: {
          getSelection?: () => unknown[];
        } | null;
      };
    };

    Transcript?: new (...args: unknown[]) => unknown;
  }
}

export {};
