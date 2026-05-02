const MUSIC_KEY = 'bubby:music';

export const MUSIC_MASTER_VOLUME = 0.12;

export interface MusicOption {
  id: 'mute' | 'classic_bubby_8bit';
  label: string;
  name: string;
  src: string | null;
  volumeMultiplier?: number;
}

export const MUSIC_OPTIONS: MusicOption[] = [
  {
    id: 'mute',
    label: 'mute',
    name: 'mute',
    src: null,
  },
  {
    id: 'classic_bubby_8bit',
    label: '1',
    name: 'classic bubby 8-bit',
    src: '/assets/music/classic-bubby-8bit.mp3',
    volumeMultiplier: 1,
  },
];

function getStorage(): Storage | null {
  return globalThis.localStorage ?? null;
}

export function getMusicOption(id: string | null | undefined): MusicOption {
  return MUSIC_OPTIONS.find((option) => option.id === id) ?? MUSIC_OPTIONS[0];
}

export function getActiveMusicOption(): MusicOption {
  return getMusicOption(getStorage()?.getItem(MUSIC_KEY));
}

export function setActiveMusicOption(id: string): MusicOption {
  const option = getMusicOption(id);
  getStorage()?.setItem(MUSIC_KEY, option.id);
  return option;
}

export function volumeForMusicOption(option: MusicOption): number {
  if (!option.src) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, MUSIC_MASTER_VOLUME * (option.volumeMultiplier ?? 1)),
  );
}
