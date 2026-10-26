import { Platform } from 'react-native';

export const Palette = {
  navy900: '#020912',
  navy800: '#060f20',
  navy700: '#091828',
  navy600: '#0f2240',
  navy500: '#142030',
  amber500: '#f5a623',
  amber400: '#ffd54f',
  amber300: '#ffd740',
  gold100: '#fff8ed',
  sand200: '#f8f0d8',
  sand100: '#ede3c8',
  cream50: '#faf6ef',
  brown700: '#6b4e20',
  brown500: '#b8882e',
  white95: 'rgba(255,255,255,0.95)',
  white80: 'rgba(255,255,255,0.80)',
  white60: 'rgba(255,255,255,0.60)',
  white40: 'rgba(255,255,255,0.40)',
  white20: 'rgba(255,255,255,0.20)',
  white10: 'rgba(255,255,255,0.10)',
  error: '#e74c3c',
} as const;

const tintColorLight = Palette.amber500;
const tintColorDark  = Palette.amber400;

export const Colors = {
  light: {
    text: '#11181C',
    background: Palette.cream50,
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: Palette.white95,
    background: Palette.navy800,
    tint: tintColorDark,
    icon: Palette.white60,
    tabIconDefault: Palette.white40,
    tabIconSelected: Palette.amber400,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
