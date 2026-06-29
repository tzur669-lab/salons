declare global {
  /** Non-standard browser API — not in lib.dom.d.ts. */
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }

  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export {};
