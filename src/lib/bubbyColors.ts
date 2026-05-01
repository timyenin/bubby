export interface BubbyColorOption {
  id: string;
  name: string;
  fillColor: string | null;
}

export const DEFAULT_BUBBY_COLOR_ID = 'default';

export const BUBBY_COLOR_OPTIONS: BubbyColorOption[] = [
  { id: DEFAULT_BUBBY_COLOR_ID, name: 'clear', fillColor: null },
  { id: 'pastel_pink', name: 'pink', fillColor: '#f8bfd6' },
  { id: 'pastel_lavender', name: 'lavender', fillColor: '#d7c5ff' },
  { id: 'pastel_mint', name: 'mint', fillColor: '#bdf5cf' },
  { id: 'pastel_baby_blue', name: 'baby blue', fillColor: '#bfe4ff' },
  { id: 'pastel_peach', name: 'peach', fillColor: '#ffd0b8' },
  { id: 'pastel_yellow', name: 'yellow', fillColor: '#fff2a8' },
  { id: 'pastel_cream', name: 'cream', fillColor: '#fff5dd' },
  { id: 'pastel_aqua', name: 'aqua', fillColor: '#aeeeed' },
  { id: 'pastel_berry', name: 'berry', fillColor: '#ef9fc5' },
];

export function getBubbyColorOption(
  colorId: string | null | undefined,
): BubbyColorOption {
  return (
    BUBBY_COLOR_OPTIONS.find((colorOption) => colorOption.id === colorId) ??
    BUBBY_COLOR_OPTIONS[0]
  );
}

export function getNextBubbyColorId(
  currentColorId: string | null | undefined,
): string {
  const currentIndex = BUBBY_COLOR_OPTIONS.findIndex(
    (colorOption) => colorOption.id === currentColorId,
  );
  const nextIndex =
    currentIndex >= 0 ? (currentIndex + 1) % BUBBY_COLOR_OPTIONS.length : 1;

  return BUBBY_COLOR_OPTIONS[nextIndex].id;
}
