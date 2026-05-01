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
  variables?: Partial<Record<`--${string}`, string>>;
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
  {
    id: 'dark_mint',
    name: 'dark mint',
    backgroundImage: 'none',
    bezelColor: '#4e5b56',
    bezelLight: '#8cb7a0',
    bezelDark: '#202827',
    caseInk: '#bdf5cf',
    variables: {
      '--app-outside-bg': '#0f1113',
      '--case-color-1': '#1c2022',
      '--case-color-2': '#272d2f',
      '--case-color-3': '#42584c',
      '--case-color-4': '#5c8a70',
      '--case-color-5': '#56635f',
      '--case-color-6': '#2f3838',
      '--case-surface': '#1e2325',
      '--case-cloud-strong': 'rgba(226, 241, 230, 0.08)',
      '--case-cloud-soft': 'rgba(226, 241, 230, 0.06)',
      '--wordmark-color': '#bdf5cf',
      '--wordmark-shadow': '0 1px 0 rgba(0, 0, 0, 0.38)',
      '--header-button-border': 'rgba(189, 245, 207, 0.34)',
      '--header-button-bg': 'rgba(38, 45, 47, 0.78)',
      '--header-button-color': '#bdf5cf',
      '--theme-picker-border': 'rgba(189, 245, 207, 0.22)',
      '--theme-picker-bg': 'rgba(30, 36, 38, 0.8)',
      '--theme-picker-shadow': '0 10px 24px rgba(0, 0, 0, 0.28)',
      '--theme-swatch-border': 'rgba(232, 240, 232, 0.36)',
      '--theme-swatch-glow': 'rgba(189, 245, 207, 0.16)',
      '--vital-panel-bg': 'rgba(35, 41, 43, 0.52)',
      '--vital-box-border': 'rgba(189, 245, 207, 0.22)',
      '--vital-box-bg': 'rgba(30, 36, 38, 0.74)',
      '--vital-label-color': '#ccefd8',
      '--vital-value-color': '#bdf5cf',
      '--vital-track-border': 'rgba(189, 245, 207, 0.22)',
      '--vital-track-bg': 'rgba(220, 230, 222, 0.82)',
      '--vital-fill': '#2a3b34',
      '--messages-border': 'rgba(189, 245, 207, 0.16)',
      '--messages-bg': 'rgba(12, 15, 16, 0.58)',
      '--messages-scrollbar': 'rgba(189, 245, 207, 0.34)',
      '--bubby-bubble-border': 'rgba(189, 245, 207, 0.28)',
      '--bubby-bubble-bg': '#e4ece4',
      '--bubby-bubble-text': '#25302c',
      '--user-bubble-border': 'rgba(189, 245, 207, 0.26)',
      '--user-bubble-bg': '#526a5d',
      '--user-bubble-text': '#f6fff8',
      '--chat-bar-border': 'rgba(189, 245, 207, 0.18)',
      '--chat-bar-bg': 'rgba(27, 32, 34, 0.78)',
      '--chat-bar-color': '#bdf5cf',
      '--chat-input-border': 'rgba(189, 245, 207, 0.24)',
      '--chat-input-bg': 'rgba(225, 234, 224, 0.88)',
      '--chat-input-text': '#27342e',
      '--chat-input-active-text': '#1f2d27',
      '--chat-input-placeholder': '#577060',
      '--chat-icon-border': 'rgba(189, 245, 207, 0.26)',
      '--chat-icon-bg': 'rgba(228, 236, 228, 0.88)',
      '--chat-icon-color': '#3b5b49',
      '--send-button-muted': 'rgba(189, 245, 207, 0.45)',
      '--send-button-active': '#bdf5cf',
      '--attachment-border': 'rgba(189, 245, 207, 0.26)',
      '--attachment-remove-border': 'rgba(189, 245, 207, 0.22)',
      '--attachment-remove-bg': 'rgba(228, 236, 228, 0.92)',
      '--attachment-remove-color': '#3b5b49',
    },
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
