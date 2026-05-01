const THEME_KEY = 'bubby:theme';
const DEFAULT_THEME_ID = 'pink_stars';

export interface CaseTheme {
  id: string;
  name: string;
  backgroundImage: string;
  bezelColor: string;
  bezelLight: string;
  bezelDark: string;
  caseInk: string;
}

export const THEMES: CaseTheme[] = [
  {
    id: 'pink_stars',
    name: 'pink stars',
    backgroundImage: '/assets/themes/pink_stars.png',
    bezelColor: '#a98bc2',
    bezelLight: '#c4a8d8',
    bezelDark: '#7e65a8',
    caseInk: '#7d65ba',
  },
  {
    id: 'rainbow',
    name: 'rainbow',
    backgroundImage: 'none',
    bezelColor: '#b99bd8',
    bezelLight: '#d7b8ee',
    bezelDark: '#8f72bd',
    caseInk: '#7d65ba',
  },
];

function getStorage(): Storage | null {
  return globalThis.localStorage ?? null;
}

function findTheme(id: string | null): CaseTheme | undefined {
  return THEMES.find((theme) => theme.id === id);
}

function defaultTheme(): CaseTheme {
  return THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ?? THEMES[0];
}

export function getActiveTheme(): CaseTheme {
  const savedThemeId = getStorage()?.getItem(THEME_KEY) ?? null;
  return findTheme(savedThemeId) ?? defaultTheme();
}

export function setActiveTheme(id: string): CaseTheme {
  const theme = findTheme(id) ?? defaultTheme();
  getStorage()?.setItem(THEME_KEY, theme.id);
  return theme;
}
