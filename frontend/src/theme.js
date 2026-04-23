import { Dimensions, Platform, useWindowDimensions as useRNWindowDimensions } from 'react-native';

export const colors = {
  // Core — deep indigo/violet
  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  primaryDark: '#5A4BD1',
  primaryGhost: 'rgba(108, 92, 231, 0.08)',

  // Accent — coral / warm
  accent: '#FD79A8',
  accentLight: '#FDCB6E',

  // Backgrounds
  bg: '#0A0A14',
  bgCard: '#141422',
  bgCardHover: '#1C1C32',
  bgInput: '#111120',
  bgSurface: '#0E0E1A',
  bgElevated: '#18182C',

  // Text
  textPrimary: '#F0F0FF',
  textSecondary: '#9090B0',
  textMuted: '#55557A',
  textInverse: '#0A0A14',

  // Status
  success: '#00D2A0',
  successBg: 'rgba(0, 210, 160, 0.12)',
  danger: '#FF6B6B',
  dangerBg: 'rgba(255, 107, 107, 0.12)',
  warning: '#FFD93D',
  warningBg: 'rgba(255, 217, 61, 0.12)',
  info: '#74B9FF',
  infoBg: 'rgba(116, 185, 255, 0.12)',

  // Gradients
  gradientPrimary: ['#6C5CE7', '#8B7CF6'],
  gradientAccent: ['#FD79A8', '#FF9A9E'],
  gradientDark: ['#0A0A14', '#141422'],
  gradientHero: ['rgba(108,92,231,0.4)', 'rgba(253,121,168,0.15)', '#141422'],

  // Borders
  border: 'rgba(108, 92, 231, 0.15)',
  borderLight: 'rgba(255, 255, 255, 0.04)',
  borderFocus: 'rgba(108, 92, 231, 0.5)',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.6)',
};

export const fonts = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  hero: 48,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999,
};

// Responsive helpers — ensures content doesn't stretch to full width on large screens
export const getContentWidth = () => {
  const { width } = Dimensions.get('window');
  if (Platform.OS !== 'web') return '100%';
  if (width >= 1200) return 900;
  if (width >= 768) return 700;
  return '100%';
};

export const isWideScreen = () => {
  if (Platform.OS !== 'web') return false;
  return Dimensions.get('window').width >= 768;
};

// Responsive hook — returns layout helpers based on current window width
export const useResponsive = () => {
  if (Platform.OS !== 'web') {
    return { isDesktop: false, isTablet: false, isMobile: true, width: 400, contentWidth: '100%', columns: 1 };
  }
  const { width } = useRNWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;
  const contentWidth = isDesktop ? 960 : isTablet ? 720 : '100%';
  const columns = isDesktop ? 2 : 1;
  return { isDesktop, isTablet, isMobile, width, contentWidth, columns };
};
