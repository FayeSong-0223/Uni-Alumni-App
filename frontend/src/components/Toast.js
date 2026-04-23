import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet, Platform } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

const ToastContext = createContext(null);
const useNative = Platform.OS !== 'web';

const TOAST_DURATION = 3500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const show = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  const success = useCallback((msg) => show(msg, 'success'), [show]);
  const error = useCallback((msg) => show(msg, 'error'), [show]);
  const info = useCallback((msg) => show(msg, 'info'), [show]);
  const warn = useCallback((msg) => show(msg, 'warning'), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, info, warn }}>
      {children}
      <View style={[styles.toastContainer, { pointerEvents: 'none' }]}>
        {toasts.map((toast, index) => (
          <ToastItem key={toast.id} toast={toast} index={index} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, index }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: useNative }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: useNative }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: useNative }),
        Animated.timing(translateY, { toValue: -20, duration: 250, useNativeDriver: useNative }),
      ]).start();
    }, TOAST_DURATION - 400);

    return () => clearTimeout(timer);
  }, []);

  const typeStyles = {
    success: { bg: colors.success, icon: '✓' },
    error: { bg: colors.danger, icon: '✕' },
    warning: { bg: colors.warning, icon: '!' },
    info: { bg: colors.primary, icon: 'i' },
  };
  const s = typeStyles[toast.type] || typeStyles.info;

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.toastIcon, { backgroundColor: s.bg }]}>
        <Text style={styles.toastIconText}>{s.icon}</Text>
      </View>
      <Text style={styles.toastMessage}>{toast.message}</Text>
    </Animated.View>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 24 : 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing.sm,
    maxWidth: 480,
    width: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      },
    }),
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toastIconText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  toastMessage: { color: colors.textPrimary, fontSize: fonts.sm, flex: 1, lineHeight: 18 },
});
