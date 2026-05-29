import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  Platform,
  Pressable,
  Image,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, fonts, spacing, getContentWidth } from '../theme';

const useNative = Platform.OS !== 'web';

// ── Fade-in wrapper ──
export function FadeIn({ delay = 0, duration = 450, style, children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: useNative }),
      Animated.timing(translateY, { toValue: 0, duration, delay, useNativeDriver: useNative }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ── Stagger animation for list items ──
export function StaggerItem({ index, children, style }) {
  return (
    <FadeIn delay={index * 60} duration={350} style={style}>
      {children}
    </FadeIn>
  );
}

// ── Pressable with spring scale ──
export function PressableScale({ onPress, disabled, style, children }) {
  const scale = useRef(new Animated.Value(1)).current;
  const flatStyle = StyleSheet.flatten(style) || {};
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, minWidth, maxWidth, ...innerStyle } = flatStyle;
  const outerStyle = {};
  if (flex !== undefined) outerStyle.flex = flex;
  if (flexGrow !== undefined) outerStyle.flexGrow = flexGrow;
  if (flexShrink !== undefined) outerStyle.flexShrink = flexShrink;
  if (flexBasis !== undefined) outerStyle.flexBasis = flexBasis;
  if (alignSelf !== undefined) outerStyle.alignSelf = alignSelf;
  if (width !== undefined) outerStyle.width = width;
  if (minWidth !== undefined) outerStyle.minWidth = minWidth;
  if (maxWidth !== undefined) outerStyle.maxWidth = maxWidth;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: useNative }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, friction: 3, tension: 120, useNativeDriver: useNative }).start()}
      activeOpacity={1}
      style={outerStyle}
    >
      <Animated.View style={[{ transform: [{ scale }] }, innerStyle]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Gradient button ──
export function GradientButton({
  onPress,
  disabled,
  title,
  colors: gradColors = colors.gradientPrimary,
  style,
  textStyle,
  icon,
}) {
  return (
    <PressableScale onPress={onPress} disabled={disabled}>
      <LinearGradient
        colors={disabled ? [colors.textMuted, colors.textMuted] : gradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradientBtn, style]}
      >
        {icon && <Text style={styles.btnIcon}>{icon}</Text>}
        <Text style={[styles.gradientBtnText, textStyle]}>{title}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

// ── Card with subtle glow ──
export function GlowCard({ style, children, onPress }) {
  const content = (
    <View style={[styles.glowCard, style]}>
      {children}
    </View>
  );
  if (onPress) return <PressableScale onPress={onPress}>{content}</PressableScale>;
  return content;
}

// ── Avatar with gradient ring (supports uploaded image) ──
export function GradientAvatar({ name, size = 48, imageUrl }) {
  const letter = (name || '?')[0].toUpperCase();
  const ring = size + 4;
  return (
    <LinearGradient
      colors={colors.gradientAccent}
      style={[styles.avatarGradient, { width: ring, height: ring, borderRadius: ring / 2 }]}
    >
      <View style={[styles.avatarInner, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>
        {imageUrl ? (
          // eslint-disable-next-line react-native/no-inline-styles
          <Image
            source={{ uri: imageUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{letter}</Text>
        )}
      </View>
    </LinearGradient>
  );
}

// ── Tag chip ──
export function Tag({ label, variant = 'primary', onRemove }) {
  const tagStyles = {
    primary: { bg: 'rgba(108,92,231,0.12)', text: colors.primaryLight },
    accent: { bg: 'rgba(253,121,168,0.12)', text: colors.accent },
    success: { bg: colors.successBg, text: colors.success },
    warning: { bg: colors.warningBg, text: colors.warning },
    info: { bg: colors.infoBg, text: colors.info },
  };
  const s = tagStyles[variant] || tagStyles.primary;
  return (
    <View style={[styles.tag, { backgroundColor: s.bg }]}>
      <Text style={[styles.tagText, { color: s.text }]}>{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.tagRemove}>
          <Text style={[styles.tagRemoveText, { color: s.text }]}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Dropdown / Picker ──
// Dropdown renders a single-select modal picker.
//   value        — the stored canonical value (may be a slug/id)
//   displayValue — optional human label to display instead of `value` (used
//                  when the canonical value is an opaque slug)
//   options      — array of option strings (what we match selection against)
export function Dropdown({ label, value, displayValue, options, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const shown = displayValue || value;

  return (
    <View>
      <PressableScale onPress={() => setOpen(true)}>
        <View style={styles.dropdownTrigger}>
          <Text style={shown ? styles.dropdownValue : styles.dropdownPlaceholder}>
            {shown || placeholder || `Select ${label}`}
          </Text>
          <Text style={styles.dropdownArrow}>▾</Text>
        </View>
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          {/* Inner Pressable absorbs taps inside the card so the FlatList/ScrollView
              actually receives scroll events on web — without this, the outer
              overlay swallows them and the list cannot scroll. */}
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {options.map((item) => {
                // `value` might be a slug while option strings are human labels;
                // match by displayValue (= label) when provided.
                const isActive = displayValue ? displayValue === item : value === item;
                return (
                  <TouchableOpacity
                    key={String(item)}
                    style={[styles.modalItem, isActive && styles.modalItemActive]}
                    onPress={() => { onSelect(item); setOpen(false); }}
                  >
                    <Text style={[styles.modalItemText, isActive && styles.modalItemActiveText]}>
                      {item}
                    </Text>
                    {isActive && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Multi-select tag picker (shows as clickable tags) ──
// `renderLabel(item)` lets callers store slugs/ids while showing human labels.
export function TagPicker({ label, selected = [], options, onChange, renderLabel }) {
  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter(s => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };
  const displayFor = (item) => (renderLabel ? renderLabel(item) : item);

  return (
    <View style={styles.tagPickerWrap}>
      {options.map(item => {
        const active = selected.includes(item);
        return (
          <TouchableOpacity
            key={item}
            onPress={() => toggle(item)}
            style={[styles.tagPickerItem, active && styles.tagPickerItemActive]}
          >
            <Text style={[styles.tagPickerText, active && styles.tagPickerTextActive]}>
              {displayFor(item)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Responsive content wrapper ──
export function ContentWrapper({ children, style }) {
  return (
    <View style={[styles.contentWrapper, style]}>
      {children}
    </View>
  );
}

// ── Date range picker (modal) ──
// A month-grid calendar with two-tap range selection. Used by the
// Activities screen's "Custom" date filter. Reuses the same visual
// language as the Booked-view calendar so the app feels consistent.
//
// Usage:
//   <DateRangePicker
//     visible={open}
//     initialFrom="2026-04-19"     // optional, ISO yyyy-mm-dd
//     initialTo="2026-04-25"       // optional
//     onCancel={() => setOpen(false)}
//     onApply={(from, to) => {     // ISO strings or '' when cleared
//       setDateFrom(from);
//       setDateTo(to);
//       setOpen(false);
//     }}
//   />
const _pad2 = (n) => String(n).padStart(2, '0');
const _isoDate = (d) =>
  `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
const _parseISO = (s) => {
  if (!s) return null;
  // new Date('YYYY-MM-DD') parses as UTC; build locally to avoid TZ drift
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const _MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateRangePicker({
  visible,
  initialFrom,
  initialTo,
  onCancel,
  onApply,
}) {
  const [from, setFrom] = useState(() => _parseISO(initialFrom));
  const [to, setTo] = useState(() => _parseISO(initialTo));
  // Month the calendar is currently showing. Start at the 'from' date if
  // one is set, else today.
  const [viewMonth, setViewMonth] = useState(() => {
    const seed = _parseISO(initialFrom) || new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  // Re-seed state whenever the modal opens so reopening doesn't show
  // stale selections from a previous invocation.
  useEffect(() => {
    if (visible) {
      setFrom(_parseISO(initialFrom));
      setTo(_parseISO(initialTo));
      const seed = _parseISO(initialFrom) || new Date();
      setViewMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
    }
  }, [visible, initialFrom, initialTo]);

  const cells = (() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(y, m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  })();

  const goMonth = (delta) => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + delta);
    setViewMonth(d);
  };

  // Tap behaviour:
  //  - no selection yet        → set `from`
  //  - `from` set, no `to`     → set `to` (swap if earlier than from)
  //  - both set                → start a new range (from = tapped, to = null)
  const onDayPress = (day) => {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
      return;
    }
    if (day < from) {
      setTo(from);
      setFrom(day);
    } else {
      setTo(day);
    }
  };

  const isInRange = (day) => {
    if (!from) return false;
    const end = to || from;
    return day >= from && day <= end;
  };
  const isRangeStart = (day) => !!from && _isoDate(day) === _isoDate(from);
  const isRangeEnd = (day) => !!to && _isoDate(day) === _isoDate(to);

  const clear = () => { setFrom(null); setTo(null); };
  const applyRange = () => {
    if (!from) {
      onApply('', '');
      return;
    }
    onApply(_isoDate(from), to ? _isoDate(to) : _isoDate(from));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={drpStyles.overlay} onPress={onCancel}>
        {/* Inner Pressable swallows taps so tapping inside the card
            doesn't dismiss the modal. */}
        <Pressable style={drpStyles.card} onPress={() => {}}>
          <View style={drpStyles.header}>
            <TouchableOpacity onPress={() => goMonth(-1)} style={drpStyles.navBtn}>
              <Text style={drpStyles.navText}>‹</Text>
            </TouchableOpacity>
            <Text style={drpStyles.title}>
              {_MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => goMonth(1)} style={drpStyles.navBtn}>
              <Text style={drpStyles.navText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={drpStyles.weekRow}>
            {_WEEK_LABELS.map((w) => (
              <Text key={w} style={drpStyles.weekLabel}>{w}</Text>
            ))}
          </View>

          <View style={drpStyles.grid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={`b-${idx}`} style={drpStyles.cell} />;
              const inRange = isInRange(cell);
              const isStart = isRangeStart(cell);
              const isEnd = isRangeEnd(cell);
              const isEndpoint = isStart || isEnd;
              return (
                <TouchableOpacity
                  key={_isoDate(cell)}
                  style={[
                    drpStyles.cell,
                    inRange && !isEndpoint && drpStyles.cellInRange,
                    isEndpoint && drpStyles.cellEndpoint,
                  ]}
                  onPress={() => onDayPress(cell)}
                >
                  <Text style={[
                    drpStyles.cellText,
                    inRange && drpStyles.cellTextInRange,
                    isEndpoint && drpStyles.cellTextEndpoint,
                  ]}>{cell.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={drpStyles.helper}>
            {from && to
              ? `${_isoDate(from)} → ${_isoDate(to)}`
              : from
                ? `Start: ${_isoDate(from)} — tap an end date`
                : 'Tap a start date'}
          </Text>

          <View style={drpStyles.actionRow}>
            <TouchableOpacity onPress={clear} style={drpStyles.actionBtnGhost}>
              <Text style={drpStyles.actionTextGhost}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={drpStyles.actionBtnGhost}>
              <Text style={drpStyles.actionTextGhost}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={applyRange} style={drpStyles.actionBtnPrimary}>
              <Text style={drpStyles.actionTextPrimary}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const drpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 380,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navBtn: {
    width: 34, height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.bgInput,
    alignItems: 'center', justifyContent: 'center',
  },
  navText: { fontSize: 20, color: colors.textPrimary, fontWeight: '700', lineHeight: 20 },
  title: { fontSize: fonts.md, fontWeight: '700', color: colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: {
    flex: 1, textAlign: 'center', fontSize: fonts.xs,
    color: colors.textMuted, fontWeight: '600', paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellInRange: { backgroundColor: 'rgba(108,92,231,0.18)' },
  cellEndpoint: { backgroundColor: colors.primary },
  cellText: { fontSize: fonts.sm, color: colors.textPrimary, fontWeight: '500' },
  cellTextInRange: { color: colors.primaryLight, fontWeight: '600' },
  cellTextEndpoint: { color: '#fff', fontWeight: '700' },
  helper: {
    marginTop: 10,
    fontSize: fonts.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    justifyContent: 'flex-end',
  },
  actionBtnGhost: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  actionBtnPrimary: {
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  actionTextGhost: { color: colors.textMuted, fontWeight: '600' },
  actionTextPrimary: { color: '#fff', fontWeight: '700' },
});

// ── Pagination controls ──
export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);

  return (
    <View style={styles.paginationRow}>
      <PressableScale onPress={() => onPageChange(page - 1)} disabled={page <= 1}>
        <View style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}>
          <Text style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>‹ Prev</Text>
        </View>
      </PressableScale>

      <View style={styles.pageNumbers}>
        {pages.map(p => (
          <PressableScale key={p} onPress={() => onPageChange(p)}>
            <View style={[styles.pageNum, p === page && styles.pageNumActive]}>
              <Text style={[styles.pageNumText, p === page && styles.pageNumTextActive]}>{p}</Text>
            </View>
          </PressableScale>
        ))}
      </View>

      <PressableScale onPress={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        <View style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}>
          <Text style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>Next ›</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientBtn: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnIcon: { fontSize: 16 },
  gradientBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  glowCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  avatarGradient: { justifyContent: 'center', alignItems: 'center' },
  avatarInner: { backgroundColor: colors.bgCard, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.primaryLight, fontWeight: '700' },
  tag: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagText: { fontSize: 12, fontWeight: '600' },
  tagRemove: { marginLeft: 4 },
  tagRemoveText: { fontSize: 16, fontWeight: '700' },

  // Dropdown
  dropdownTrigger: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownValue: { color: colors.textPrimary, fontSize: fonts.md },
  dropdownPlaceholder: { color: colors.textMuted, fontSize: fonts.md },
  dropdownArrow: { color: colors.textMuted, fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    padding: 8,
    // Flex column so the title + Cancel button stay pinned and the list
    // region in between can shrink and scroll instead of pushing them off-screen.
    flexDirection: 'column',
    flexShrink: 1,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: fonts.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    padding: 16,
    paddingBottom: 8,
  },
  // flexShrink lets the list collapse when there isn't enough vertical room,
  // which is what triggers the inner scroll. Without it the list keeps its
  // intrinsic height and overflows under the Cancel button.
  modalList: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  modalListContent: { paddingBottom: 4 },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemActive: { backgroundColor: colors.primaryGhost },
  modalItemText: { color: colors.textSecondary, fontSize: fonts.md },
  modalItemActiveText: { color: colors.primaryLight, fontWeight: '600' },
  modalCheck: { color: colors.primaryLight, fontSize: 16, fontWeight: '700' },
  modalClose: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight },
  modalCloseText: { color: colors.textMuted, fontSize: fonts.md, fontWeight: '600' },

  // TagPicker
  tagPickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPickerItem: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tagPickerItemActive: {
    backgroundColor: 'rgba(108,92,231,0.15)',
    borderColor: colors.primary,
  },
  tagPickerText: { color: colors.textMuted, fontSize: fonts.sm, fontWeight: '500' },
  tagPickerTextActive: { color: colors.primaryLight, fontWeight: '600' },

  // ContentWrapper
  contentWrapper: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 8,
  },
  pageBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageBtnDisabled: { opacity: 0.3 },
  pageBtnText: { color: colors.primaryLight, fontSize: fonts.sm, fontWeight: '600' },
  pageBtnTextDisabled: { color: colors.textMuted },
  pageNumbers: { flexDirection: 'row', gap: 4 },
  pageNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNumActive: { backgroundColor: colors.primary },
  pageNumText: { color: colors.textMuted, fontSize: fonts.sm, fontWeight: '500' },
  pageNumTextActive: { color: colors.white, fontWeight: '700' },
});
