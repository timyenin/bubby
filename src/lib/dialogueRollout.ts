export const DIALOGUE_CHARACTER_DELAY_MS = 25;
export const DIALOGUE_NEWLINE_DELAY_MS = 80;

export function getRevealedDialogueText(text: string, revealedLength: number): string {
  return text.slice(0, Math.max(0, revealedLength));
}

export function getDialogueRolloutDelay(text: string, revealedLength: number): number {
  return text[revealedLength - 1] === '\n'
    ? DIALOGUE_NEWLINE_DELAY_MS
    : DIALOGUE_CHARACTER_DELAY_MS;
}
