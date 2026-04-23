import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  getRecommendedActivities,
  searchActivities,
  getDiscoverActivities,
  getActivityAutocomplete,
  getBookedCalendar,
  getCategories,
} from '../api/activities';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  StaggerItem,
  GlowCard,
  Tag,
  ContentWrapper,
  PressableScale,
  DateRangePicker,
} from '../components/AnimatedComponents';

// ── Screen modes ─────────────────────────────────────────────────────────
// Two top-level views:
//   'discover' — personalized feed + search; excludes already-booked items
//   'booked'   — calendar view of the user's confirmed bookings
const MODE_DISCOVER = 'discover';
const MODE_BOOKED = 'booked';

// ── Date helpers ─────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
}

// Kept in sync with the backend's STOPWORDS list + MIN_MEANINGFUL_CHARS
// in activities/views.py. We mirror the logic here purely so the UI can
// decide *before* hitting the server whether the query is too short to
// yield useful results — the actual filtering still happens server-side.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
  'for', 'from', 'has', 'have', 'he', 'i', 'if', 'in', 'is',
  'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our',
  'she', 'so', 'that', 'the', 'their', 'them', 'these', 'they',
  'this', 'those', 'to', 'was', 'we', 'were', 'will', 'with',
  'you', 'your',
]);
const MIN_MEANINGFUL_CHARS = 3;

// True when the query has at least one token that: isn't a stopword, and
// is >= MIN_MEANINGFUL_CHARS long. False queries never fire the main
// search — the user is either mid-word ("mo") or typed only noise ("is
// the"). Autocomplete dropdown is unaffected — it runs at 1+ chars so
// users still get feedback while typing.
function hasMeaningfulQuery(text) {
  if (!text) return false;
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter(Boolean);
  return tokens.some(
    (t) => !STOPWORDS.has(t) && t.length >= MIN_MEANINGFUL_CHARS,
  );
}

// ── Date-range presets ───────────────────────────────────────────────────
// Each helper returns { from, to } in 'YYYY-MM-DD' format. Mirrors the
// presets that consumer event apps (Eventbrite, Meetup, Ticketmaster) offer
// as one-tap filters — by far the most common way users narrow by time.
// Custom ranges are handled separately via the calendar picker.
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

function presetToday() {
  const iso = isoDate(new Date());
  return { from: iso, to: iso };
}

function presetTomorrow() {
  const iso = isoDate(addDays(new Date(), 1));
  return { from: iso, to: iso };
}

// "This weekend" = upcoming Saturday + Sunday. If today is already Sat/Sun,
// we return the current weekend (including today). Anchoring to Sat/Sun
// matches how users think about weekends regardless of local week-start.
function presetThisWeekend() {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sun … 6 = Sat
  let sat;
  if (dow === 6) sat = today;                    // today is Sat
  else if (dow === 0) sat = addDays(today, -1);  // today is Sun
  else sat = addDays(today, 6 - dow);            // next Sat
  const sun = addDays(sat, 1);
  return { from: isoDate(sat), to: isoDate(sun) };
}

// "This week" = today → upcoming Sunday (end of week). Treats weeks as
// ending on Sunday, which is the ISO/localised convention users expect.
function presetThisWeek() {
  const today = new Date();
  const dow = today.getDay();
  const daysToSun = dow === 0 ? 0 : 7 - dow;
  const end = addDays(today, daysToSun);
  return { from: isoDate(today), to: isoDate(end) };
}

// "This month" = today → last day of the current month.
function presetThisMonth() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: isoDate(today), to: isoDate(end) };
}

// Pretty-format an ISO date for chip labels — e.g. "Apr 19". Year omitted
// to keep the chip compact; if the range spans years we'll show both.
function formatChipDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Human label for the active range chip. Collapses same-day ranges to a
// single date, and includes the year if the range crosses a year boundary.
function formatRangeLabel(from, to) {
  if (!from && !to) return '';
  if (from && to) {
    if (from === to) return formatChipDate(from);
    const [fy] = from.split('-');
    const [ty] = to.split('-');
    if (fy !== ty) {
      return `${formatChipDate(from)} ${fy} – ${formatChipDate(to)} ${ty}`;
    }
    return `${formatChipDate(from)} – ${formatChipDate(to)}`;
  }
  if (from) return `From ${formatChipDate(from)}`;
  return `Until ${formatChipDate(to)}`;
}

// Identify which preset (if any) a given {from,to} matches — used to
// visually highlight the active chip. Falls back to 'custom' when the
// range doesn't line up with any preset (e.g. user picked a custom range,
// or a preset that's drifted past midnight).
function detectActivePreset(from, to) {
  if (!from && !to) return null;
  const table = {
    today: presetToday(),
    tomorrow: presetTomorrow(),
    weekend: presetThisWeekend(),
    week: presetThisWeek(),
    month: presetThisMonth(),
  };
  for (const [key, range] of Object.entries(table)) {
    if (range.from === from && range.to === to) return key;
  }
  return 'custom';
}

export default function ActivitiesScreen({ navigation }) {
  const toast = useToast();
  const { user } = useAuth();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;

  // View state ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState(MODE_DISCOVER);
  const [loading, setLoading] = useState(false);

  // Discover state
  const [activities, setActivities] = useState([]);
  const [recs, setRecs] = useState([]); // personalized recommendations strip
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]); // [{id, title}]
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dateFrom, setDateFrom] = useState(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState('');
  // Calendar-picker modal for custom date ranges. Opens via the "Custom" chip.
  const [pickerVisible, setPickerVisible] = useState(false);
  // Tracks whether the search input is focused so we can apply a highlighted
  // border/shadow — small affordance that makes the bar feel responsive and
  // reinforces the primary colour as the interaction accent.
  const [searchFocused, setSearchFocused] = useState(false);
  // Category-filter chips. Replaces the older free-form tag-chip UI: we
  // moved to a controlled taxonomy (Activity.CATEGORY_CHOICES) because
  // free-form tags proliferate as admins add more activities and the
  // chip row stops being usable past ~20 entries. The category list is
  // finite (8 choices), predictable, and can't drift. Tags are still
  // displayed on individual activity cards — they're just no longer a
  // filter target.
  //   availableCategories: [{ key, label, count }] — from /categories/
  //   selectedCategories:  [key, ...] — sent to the backend as `categories`
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Booked (calendar) state
  const [calMonth, setCalMonth] = useState(new Date()); // a Date within the viewed month
  const [calDays, setCalDays] = useState({}); // { 'YYYY-MM-DD': [booking, ...] }
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' | null

  // Debounce autocomplete
  const suggestTimer = useRef(null);

  // ── Data fetching ─────────────────────────────────────────────────
  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      // Fire recs + discover list in parallel. Recs is secondary — don't fail
      // the whole screen if that endpoint hiccups.
      const params = {};
      // Only send `q` to the server if the query has something meaningful
      // in it — a bare "mo" or "is the" wouldn't produce useful results
      // and just creates churn in the list as the user is still typing.
      if (searchText.trim() && hasMeaningfulQuery(searchText)) {
        params.q = searchText.trim();
      }
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      // Categories travel as an array → axios serialises as
      // ?categories=a&categories=b (see paramsSerializer in api/client.js).
      if (selectedCategories.length) params.categories = selectedCategories;

      // Hit the smart-search endpoint only when at least one filter is
      // actually engaged. Date/category filters alone are enough; a too-short
      // `q` alone still falls through to the Discover feed.
      const hasActiveFilter =
        !!params.q || !!dateFrom || !!dateTo || selectedCategories.length > 0;
      const [discoverRes, recsRes] = await Promise.allSettled([
        hasActiveFilter
          ? searchActivities(params)
          : getDiscoverActivities({}),
        getRecommendedActivities({}),
      ]);

      if (discoverRes.status === 'fulfilled') {
        const data = discoverRes.value.data;
        setActivities(data.results || data || []);
      } else {
        setActivities([]);
        toast.error('Failed to load activities.');
      }

      if (recsRes.status === 'fulfilled') {
        const data = recsRes.value.data;
        setRecs((data.results || data || []).slice(0, 8));
      } else {
        setRecs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [searchText, dateFrom, dateTo, selectedCategories, toast]);

  const loadCalendar = useCallback(async (monthDate) => {
    setLoading(true);
    try {
      const key = monthKey(monthDate);
      const { data } = await getBookedCalendar(key);
      setCalDays(data.days || {});
    } catch {
      setCalDays({});
      toast.error('Failed to load calendar.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // On focus, refresh whichever view is active
  useFocusEffect(
    useCallback(() => {
      if (mode === MODE_DISCOVER) loadDiscover();
      else loadCalendar(calMonth);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode])
  );

  // Fetch category list once — the taxonomy is fixed (8 choices) and
  // counts shift slowly, so no need to refresh on every screen focus.
  // If the fetch fails we render no chips (graceful degrade — the feed
  // still works without the category filter).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getCategories();
        if (!cancelled) setAvailableCategories(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAvailableCategories([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch whenever the category selection changes. This keeps the feed
  // in sync with the chip row as the user toggles chips — no explicit
  // Apply needed.
  useEffect(() => {
    if (mode === MODE_DISCOVER) loadDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories]);

  // Same instant-apply pattern for the date presets. Tapping "Today" or
  // picking a custom range should refresh the feed immediately without
  // requiring a separate Apply button — matches how Eventbrite/Meetup
  // behave and removes a redundant tap.
  useEffect(() => {
    if (mode === MODE_DISCOVER) loadDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const toggleCategory = (key) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // ── Date preset handlers ─────────────────────────────────────────
  // Tapping the same preset that's already active clears the filter —
  // this matches the toggle-off behaviour users expect from chip rows
  // (tap to apply, tap again to remove) and removes the need for a
  // separate "clear date" control for the common case.
  const activePreset = detectActivePreset(dateFrom, dateTo);

  const applyPreset = (key, range) => {
    if (activePreset === key) {
      setDateFrom('');
      setDateTo('');
    } else {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const clearDateRange = () => {
    setDateFrom('');
    setDateTo('');
  };

  const openPicker = () => setPickerVisible(true);
  const closePicker = () => setPickerVisible(false);
  const onPickerApply = (fromISO, toISO) => {
    setDateFrom(fromISO || '');
    setDateTo(toISO || '');
    setPickerVisible(false);
  };

  // ── Autocomplete ─────────────────────────────────────────────────
  const fetchSuggestions = (q) => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const { data } = await getActivityAutocomplete(q);
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 180);
  };

  const onSearchChange = (text) => {
    setSearchText(text);
    fetchSuggestions(text);
  };

  const applySearch = () => {
    setShowSuggestions(false);
    loadDiscover();
  };

  const pickSuggestion = (s) => {
    setSearchText(s.title || s);
    setShowSuggestions(false);
    setTimeout(() => loadDiscover(), 50);
  };

  const clearSearch = () => {
    setSearchText('');
    setDateFrom('');
    setDateTo('');
    setSelectedCategories([]);
    setShowSuggestions(false);
    setTimeout(() => loadDiscover(), 0);
  };

  // ── Calendar helpers ────────────────────────────────────────────
  const calendarGrid = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Six weeks × seven days grid. Pad leading blanks so weekday aligns.
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(year, month, d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);

  const goMonth = (delta) => {
    const d = new Date(calMonth);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setCalMonth(d);
    setSelectedDay(null);
    loadCalendar(d);
  };

  const selectedBookings = selectedDay ? (calDays[selectedDay] || []) : [];

  // ── Renderers ────────────────────────────────────────────────────
  const renderMatchReasons = (item) => {
    const reasons = item.match_reasons || [];
    if (!reasons.length) return null;
    return (
      <View style={styles.tagRow}>
        {reasons.slice(0, 3).map((r) => (
          <Tag key={r} label={`✨ ${r}`} variant="accent" />
        ))}
      </View>
    );
  };

  const renderStatusTag = (item) => {
    // Card status reflects only (a) the user's *current* booking and
    // (b) remaining capacity. A previously cancelled booking is irrelevant
    // to availability — users may freely re-book as long as there are spots,
    // so we never render a 'Cancelled' tag here.
    if (item.user_booking_status === 'confirmed') return <Tag label="Booked" variant="primary" />;
    if (item.spots_available) return <Tag label="Available" variant="success" />;
    return <Tag label="Full" variant="warning" />;
  };

  const renderActivityCard = ({ item, index }) => (
    <StaggerItem index={index}>
      <GlowCard
        style={[styles.card, isDesktop && styles.cardDesktop]}
        onPress={() => navigation.navigate('ActivityDetail', { activityId: item.id, title: item.title })}
      >
        {/* Thin gradient accent bar on the left edge — anchors every card to
            the primary colour and gives the list a unified rhythm without
            adding heavy chrome. */}
        <LinearGradient
          colors={colors.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.cardAccent}
          pointerEvents="none"
        />
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={styles.cardImagePlaceholderText}>🎉</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, isWide && styles.cardTitleWide]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.tagRow}>{renderStatusTag(item)}</View>
          </View>

          {renderMatchReasons(item)}

          {!!item.description && (
            <Text style={styles.cardDescription} numberOfLines={isWide ? 2 : 2}>
              {item.description}
            </Text>
          )}

          {item.tags?.length > 0 && (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 4).map((t) => (
                <Tag key={t} label={t} variant="info" />
              ))}
            </View>
          )}

          <View style={styles.cardMeta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>📅</Text>
              <Text style={styles.metaText}>{formatDateTime(item.start_time)}</Text>
            </View>
            {item.location ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaIcon}>📍</Text>
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>👤</Text>
              <Text style={styles.metaText}>
                {item.current_participants_count}
                {item.max_participants ? ` / ${item.max_participants}` : ''} going
              </Text>
            </View>
          </View>
        </View>
      </GlowCard>
    </StaggerItem>
  );

  // Compact card for the horizontal recommendation strip
  const renderRecCard = ({ item }) => (
    <PressableScale
      onPress={() => navigation.navigate('ActivityDetail', { activityId: item.id, title: item.title })}
      style={styles.recCard}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.recImage} resizeMode="cover" />
      ) : (
        <View style={[styles.recImage, styles.cardImagePlaceholder]}>
          <Text style={styles.cardImagePlaceholderText}>🎉</Text>
        </View>
      )}
      <View style={{ padding: spacing.sm }}>
        <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.recMeta} numberOfLines={1}>{formatDateTime(item.start_time)}</Text>
        {item.match_reasons?.length > 0 && (
          <Text style={styles.recWhy} numberOfLines={1}>
            ✨ {item.match_reasons[0]}
          </Text>
        )}
      </View>
    </PressableScale>
  );

  // ── Top bar: mode toggle ────────────────────────────────────────
  const ModeToggle = () => (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        onPress={() => { setMode(MODE_DISCOVER); }}
        style={[styles.toggleBtn, mode === MODE_DISCOVER && styles.toggleBtnActive]}
      >
        <Text style={[styles.toggleText, mode === MODE_DISCOVER && styles.toggleTextActive]}>
          Discover
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { setMode(MODE_BOOKED); loadCalendar(calMonth); }}
        style={[styles.toggleBtn, mode === MODE_BOOKED && styles.toggleBtnActive]}
      >
        <Text style={[styles.toggleText, mode === MODE_BOOKED && styles.toggleTextActive]}>
          Booked
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Discover view ────────────────────────────────────────────────
  // The search/filter/recs block used to live in a separate ContentWrapper
  // *above* the FlatList. That made the FlatList the only scrollable region,
  // so on web (and any viewport where the filters+recs block was tall) users
  // could not scroll the page at all — the filter block ate the viewport and
  // the FlatList had no room. Moving the whole block into the FlatList's
  // ListHeaderComponent lets the entire screen scroll as one.
  const renderDiscoverHeader = () => (
    <ContentWrapper>
      <FadeIn>
        {/* Filter panel. Grouping the search bar, category chips and date
            presets inside a single translucent card with a subtle primary
            tint gives the filter controls a clear visual home and stops
            them from feeling like a stack of disconnected rows. */}
        <View style={styles.filterPanel}>
          {/* Search */}
          <View style={styles.searchContainer}>
            <View
              style={[
                styles.searchInputWrap,
                searchFocused && styles.searchInputWrapFocused,
              ]}
            >
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search activities by name, tag, location..."
                placeholderTextColor={colors.textMuted}
                value={searchText}
                onChangeText={onSearchChange}
                onSubmitEditing={applySearch}
                onFocus={() => {
                  setSearchFocused(true);
                  if (searchText.length >= 2) fetchSuggestions(searchText);
                }}
                onBlur={() => {
                  setSearchFocused(false);
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                returnKeyType="search"
              />
              {!!searchText && (
                <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.suggestionsDropdown}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={`${s.id || i}-${s.title}`}
                    style={styles.suggestionItem}
                    onPress={() => pickSuggestion(s)}
                  >
                    <Text style={styles.suggestionText}>{s.title || s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

        {/* Date filter — preset chips + calendar picker. Users rarely want
            to type a raw YYYY-MM-DD; consumer event apps (Eventbrite, Meetup,
            Ticketmaster) all converge on one-tap presets for the 95% case
            plus a calendar for custom ranges. Chips toggle off when retapped.
            Selections apply instantly — no Apply button — via the useEffect
            on [dateFrom, dateTo]. */}
        <View style={styles.dateFilterWrap}>
          <Text style={styles.dateFilterLabel}>When</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateChipScroll}
            keyboardShouldPersistTaps="handled"
          >
            {[
              { key: 'today',    label: 'Today',        make: presetToday },
              { key: 'tomorrow', label: 'Tomorrow',     make: presetTomorrow },
              { key: 'weekend',  label: 'This weekend', make: presetThisWeekend },
              { key: 'week',     label: 'This week',    make: presetThisWeek },
              { key: 'month',    label: 'This month',   make: presetThisMonth },
            ].map(({ key, label, make }) => {
              const isActive = activePreset === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => applyPreset(key, make())}
                  style={[styles.tagChip, isActive && styles.tagChipActive]}
                >
                  <Text
                    style={[styles.tagChipText, isActive && styles.tagChipTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {/* Custom chip opens the calendar picker modal. Highlighted when
                the current range isn't a preset so users see their custom
                choice reflected in the chip row. */}
            <TouchableOpacity
              onPress={openPicker}
              style={[
                styles.tagChip,
                activePreset === 'custom' && styles.tagChipActive,
              ]}
            >
              <Text
                style={[
                  styles.tagChipText,
                  activePreset === 'custom' && styles.tagChipTextActive,
                ]}
              >
                📅 Custom
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Active-range summary chip. Shows the selected dates in a
              human-readable form with a × button to clear them in one tap.
              Only visible when a range is set. */}
          {(dateFrom || dateTo) && (
            <View style={styles.dateSummaryRow}>
              <TouchableOpacity
                onPress={activePreset === 'custom' ? openPicker : clearDateRange}
                style={styles.dateSummaryChip}
                activeOpacity={0.7}
              >
                <Text style={styles.dateSummaryText}>
                  {formatRangeLabel(dateFrom, dateTo)}
                </Text>
                <TouchableOpacity
                  onPress={clearDateRange}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.dateSummaryClear}
                >
                  <Text style={styles.dateSummaryClearText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Category filter chips. We use a controlled taxonomy (8 fixed
            choices on the Activity model) rather than free-form tags so
            the chip row stays short, predictable, and doesn't grow
            unbounded as admins add more activities — this is the pattern
            Eventbrite / Meetup / LinkedIn Events all use. Multi-select:
            tapping multiple chips is OR across categories. Tags still
            exist on individual cards but are no longer a filter target. */}
        {availableCategories.length > 0 && (
          <View style={styles.tagFilterWrap}>
            <Text style={styles.tagFilterLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagFilterScroll}
              keyboardShouldPersistTaps="handled"
            >
              {availableCategories.map(({ key, label, count }) => {
                const active = selectedCategories.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleCategory(key)}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                  >
                    <Text
                      style={[styles.tagChipText, active && styles.tagChipTextActive]}
                    >
                      {label}
                      {count ? ` · ${count}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        </View>
      </FadeIn>

      {/* Personalized recommendations strip */}
      {recs.length > 0 && !searchText && !dateFrom && !dateTo && !selectedCategories.length && (
        <FadeIn delay={80}>
          <View style={styles.recsSection}>
            <Text style={styles.sectionTitle}>Recommended for you</Text>
            <Text style={styles.sectionSub}>Based on your hobbies, interests & companies</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recsScroll}
            >
              {recs.map((item, i) => (
                <View key={`rec-${item.id}-${i}`}>{renderRecCard({ item })}</View>
              ))}
            </ScrollView>
          </View>
        </FadeIn>
      )}

      <FadeIn delay={120}>
        <Text style={styles.sectionTitle}>
          {searchText || dateFrom || dateTo || selectedCategories.length
            ? 'Search results'
            : 'Upcoming activities'}
        </Text>
        {user?.is_staff && (
          <Text style={styles.adminHint}>
            Admin: tap an activity to manage details or upload an image.
          </Text>
        )}
      </FadeIn>
    </ContentWrapper>
  );

  // Use a plain ScrollView (not FlatList) here. FlatList's ListHeaderComponent
  // wraps the header in its own VirtualizedList cell, and on every state
  // change (e.g. each keystroke in the date inputs) that cell's contents get
  // torn down and rebuilt — which unmounts the TextInput and kills focus. By
  // rendering the filter block and the cards directly as ScrollView children,
  // React's normal reconciliation preserves the TextInput DOM node across
  // renders so typing a whole date in one go works.
  const renderDiscover = () => (
    <ScrollView
      style={styles.discoverList}
      contentContainerStyle={[
        styles.list,
        isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%' },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {renderDiscoverHeader()}
      {activities.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>
            {loading
              ? 'Loading activities...'
              : searchText || dateFrom || dateTo || selectedCategories.length
                ? 'No activities match your search'
                : 'No activities available right now'}
          </Text>
          {/* Short-query hint — only when the user has typed something but
              it doesn't contain a meaningful term yet. Avoids the
              misleading "no matches" feeling when the real issue is that
              the query is too ambiguous to run. */}
          {!loading && searchText && !hasMeaningfulQuery(searchText) && (
            <Text style={styles.emptySub}>
              Type at least {MIN_MEANINGFUL_CHARS} characters to search — common words like "is" and "the" are ignored.
            </Text>
          )}
          {!loading && (searchText || dateFrom || dateTo || selectedCategories.length > 0) && (
            <TouchableOpacity onPress={clearSearch} style={{ marginTop: spacing.md }}>
              <Text style={styles.clearText}>Clear search</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        activities.map((item, index) => (
          <View key={String(item.id)}>
            {renderActivityCard({ item, index })}
          </View>
        ))
      )}
    </ScrollView>
  );

  // ── Booked (calendar) view ───────────────────────────────────────
  const renderBooked = () => {
    const totalThisMonth = Object.values(calDays).reduce((n, arr) => n + arr.length, 0);
    return (
      // ScrollView is required here: the Booked view has a calendar plus a
      // bookings list that can easily exceed the viewport on both web and
      // mobile. Without this wrapper, content below the fold gets clipped.
      // (Discover uses its own ScrollView.)
      <ScrollView
        style={styles.bookedScroll}
        contentContainerStyle={styles.bookedScrollContent}
        showsVerticalScrollIndicator={false}
      >
      <ContentWrapper>
        <FadeIn>
          <GlowCard style={styles.calCard}>
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={() => goMonth(-1)} style={styles.calNavBtn}>
                <Text style={styles.calNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calTitle}>
                {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
              </Text>
              <TouchableOpacity onPress={() => goMonth(1)} style={styles.calNavBtn}>
                <Text style={styles.calNavText}>›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.calSub}>
              {totalThisMonth === 0
                ? 'No bookings this month'
                : `${totalThisMonth} booking${totalThisMonth === 1 ? '' : 's'} this month`}
            </Text>

            {/* Weekday header */}
            <View style={styles.weekRow}>
              {WEEK_LABELS.map((w) => (
                <Text key={w} style={styles.weekLabel}>{w}</Text>
              ))}
            </View>

            {/* 7-col day grid */}
            <View style={styles.calGrid}>
              {calendarGrid.map((cell, idx) => {
                if (!cell) {
                  return <View key={`blank-${idx}`} style={styles.calCell} />;
                }
                const iso = isoDate(cell);
                const dayBookings = calDays[iso] || [];
                const isSelected = selectedDay === iso;
                const isToday = iso === isoDate(new Date());
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[
                      styles.calCell,
                      isSelected && styles.calCellActive,
                      isToday && styles.calCellToday,
                    ]}
                    onPress={() => setSelectedDay(isSelected ? null : iso)}
                  >
                    <Text style={[
                      styles.calCellDate,
                      isSelected && styles.calCellDateActive,
                    ]}>{cell.getDate()}</Text>
                    {dayBookings.length > 0 && (
                      <View style={styles.calDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlowCard>
        </FadeIn>

        {/* Selected-day list */}
        <FadeIn delay={80}>
          <Text style={styles.sectionTitle}>
            {selectedDay
              ? new Date(selectedDay).toLocaleDateString('en-AU', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })
              : 'All bookings this month'}
          </Text>
          {(selectedDay
            ? selectedBookings
            : Object.entries(calDays)
                .sort(([a], [b]) => a.localeCompare(b))
                .flatMap(([, arr]) => arr)
          ).length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🗓️</Text>
              <Text style={styles.emptyTitle}>
                {loading ? 'Loading calendar...' : 'No bookings to show'}
              </Text>
              {!loading && (
                <Text style={styles.emptySub}>Book an activity from the Discover tab</Text>
              )}
            </View>
          ) : (
            (selectedDay
              ? selectedBookings
              : Object.entries(calDays)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .flatMap(([, arr]) => arr)
            ).map((b, i) => (
              <PressableScale
                key={`${b.id}-${i}`}
                onPress={() => navigation.navigate('ActivityDetail', {
                  activityId: b.activity,
                  title: b.activity_title,
                })}
                style={styles.bookingRow}
              >
                {b.activity_image ? (
                  <Image
                    source={{ uri: b.activity_image }}
                    style={styles.bookingImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.bookingImg, styles.cardImagePlaceholder]}>
                    <Text style={styles.cardImagePlaceholderText}>🎉</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.bookingTitle} numberOfLines={2}>
                    {b.activity_title || 'Activity'}
                  </Text>
                  <Text style={styles.bookingMeta}>
                    📅 {formatDateTime(b.activity_start_time)}
                  </Text>
                  <Tag label={b.status === 'confirmed' ? 'Confirmed' : b.status} variant="success" />
                </View>
              </PressableScale>
            ))
          )}
        </FadeIn>
      </ContentWrapper>
      </ScrollView>
    );
  };

  // ── Screen ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Ambient hero gradient behind the page title. Tints the top ~180px
          of the screen with a soft wash of the primary colour so the
          Activities page feels anchored and branded without adding any
          hard chrome or taking vertical space from the content. */}
      <LinearGradient
        colors={['rgba(108,92,231,0.18)', 'rgba(108,92,231,0.04)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.heroGlow}
        pointerEvents="none"
      />
      <ContentWrapper>
        <FadeIn>
          <View style={styles.header}>
            <Text style={styles.headerEyebrow}>✨ Explore</Text>
            <Text style={styles.headerTitle}>Activities</Text>
            <Text style={styles.headerSub}>Discover, join, and track events at Adelaide Uni</Text>
            <ModeToggle />
          </View>
        </FadeIn>
      </ContentWrapper>

      {mode === MODE_DISCOVER ? renderDiscover() : renderBooked()}

      {/* Custom date-range picker modal. Mounted at the screen root so its
          overlay sits above the scroll content and the bottom tab bar. */}
      <DateRangePicker
        visible={pickerVisible}
        initialFrom={dateFrom}
        initialTo={dateTo}
        onCancel={closePicker}
        onApply={onPickerApply}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ── Hero gradient ──
  // Positioned absolutely behind all content. Height chosen to cover the
  // page title + mode toggle; fades to transparent so the rest of the
  // screen still reads against the bg colour.
  heroGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    zIndex: 0,
  },

  // ── Scroll containers for each mode ──
  // flex:1 lets them claim remaining vertical space after the header + toggle;
  // the bottom padding keeps the last row above the bottom tab bar.
  // Without flex:1, on web the FlatList/ScrollView has no defined height and
  // its internal content can't scroll — you get a dead page.
  bookedScroll: { flex: 1 },
  bookedScrollContent: {
    paddingBottom: spacing.xl * 2,
  },
  discoverList: { flex: 1 },

  // ── Header ──
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  // Small, wide-tracked "eyebrow" label above the page title — a common
  // editorial pattern (Apple, Stripe, Linear) that adds a dash of the
  // primary colour at the very top of the page without competing with
  // the main title for attention.
  headerEyebrow: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.primaryLight,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: fonts.xxxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },

  // ── Mode toggle (Discover / Booked segmented control) ──
  // Rounded pill with a solid primary "thumb" under the active tab.
  // Mirrors the iOS segmented control shape but with our primary colour
  // as the active fill so the top of the screen has a single, clear
  // accent.
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.full,
    padding: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  toggleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 10px rgba(108,92,231,0.35)',
      },
    }),
  },
  toggleText: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleTextActive: { color: '#fff', fontWeight: '700' },

  // ── Filter panel (groups search + category + date) ──
  // Slightly-tinted translucent card around the three filter controls
  // gives them a single visual home. The primary-ghost bg + soft border
  // reads as "interactive zone" without shouting.
  filterPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(108,92,231,0.04)',
    paddingBottom: spacing.md,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      },
    }),
  },

  // ── Search ──
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    position: 'relative',
    zIndex: 100,
  },
  searchInputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
  },
  // Focus ring: primary border + subtle purple shadow (web) when the
  // search input has keyboard focus. Small detail, but reinforces the
  // primary colour as *the* interactive accent across the screen.
  searchInputWrapFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.bgCard,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 4px rgba(108,92,231,0.18)',
      },
    }),
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: {
    flex: 1,
    padding: 14,
    fontSize: fonts.md,
    color: colors.textPrimary,
    // Remove the browser's default focus outline on web; we render our
    // own via searchInputWrapFocused (no grey rectangle, no jank).
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  clearBtn: { padding: 10 },
  clearBtnText: { color: colors.textMuted, fontSize: 14 },
  suggestionsDropdown: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '100%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 1000,
  },
  suggestionItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionText: { fontSize: fonts.sm, color: colors.textPrimary },

  // ── Date filter (preset chip row + active-range summary) ──
  dateFilterWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  dateFilterLabel: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dateChipScroll: {
    gap: 8,
    paddingBottom: 4,
    paddingRight: spacing.md,
  },
  // Active-range pill — sits under the preset row and echoes the primary
  // colour at a lower weight so it complements, rather than competes with,
  // the filled active preset chip.
  dateSummaryRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingRight: spacing.md,
  },
  dateSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.full,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.borderFocus,
  },
  dateSummaryText: {
    color: colors.primaryLight,
    fontSize: fonts.sm,
    fontWeight: '700',
    marginRight: 4,
    letterSpacing: 0.2,
  },
  dateSummaryClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108,92,231,0.18)',
  },
  dateSummaryClearText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Filter chips (shared by category + date-preset rows) ──
  // Label + horizontal scroller wrap.
  tagFilterWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  tagFilterLabel: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tagFilterScroll: {
    gap: 8,
    paddingBottom: 4,
    paddingRight: spacing.md,
  },
  // Inactive chip — slightly lighter than the bg so the chip reads as a
  // "tap target" rather than part of the panel. Subtle border gives
  // definition without competing with the active state.
  tagChip: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  // Active chip — solid primary fill with a faint outer glow on web. The
  // contrast jump between inactive and active states makes the current
  // selection unmistakable at a glance.
  tagChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 12px rgba(108,92,231,0.35)',
      },
    }),
  },
  tagChipText: {
    color: colors.textSecondary,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  // ── Recommendations strip ──
  recsSection: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  recsScroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fonts.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 4,
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: fonts.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  adminHint: {
    fontSize: fonts.xs,
    color: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    fontStyle: 'italic',
  },
  recCard: {
    width: 230,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginRight: spacing.md,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      },
    }),
  },
  recImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.bgInput,
  },
  recTitle: {
    fontSize: fonts.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  recMeta: { fontSize: fonts.xs, color: colors.textMuted },
  recWhy: {
    fontSize: fonts.xs,
    color: colors.accent,
    marginTop: 6,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Activity cards ──
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl * 2,
  },
  // Cards now carry a 4px gradient bar on the left edge (see cardAccent).
  // extra left padding on the card itself gives the bar room to sit and
  // the content room to breathe.
  card: {
    marginBottom: spacing.md,
    overflow: 'hidden',
    paddingLeft: spacing.lg,
    borderRadius: radius.lg,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      },
    }),
  },
  cardDesktop: { marginBottom: spacing.lg },
  // Absolute gradient bar on the card's left edge. Height stretches via
  // bottom:0. Sits above the card's border via zIndex.
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    zIndex: 2,
  },
  cardImage: {
    width: '100%',
    height: 180,
    backgroundColor: colors.bgInput,
    marginBottom: spacing.md,
    borderRadius: radius.md,
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108,92,231,0.08)',
  },
  cardImagePlaceholderText: { fontSize: 44, opacity: 0.5 },
  cardBody: {},
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: fonts.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  cardTitleWide: { fontSize: fonts.xl },
  cardDescription: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  cardMeta: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaIcon: { fontSize: 14, marginRight: spacing.xs },
  metaText: { fontSize: fonts.sm, color: colors.textMuted, flex: 1 },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.xs,
  },

  // ── Calendar ──
  calCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calTitle: {
    fontSize: fonts.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  calSub: {
    fontSize: fonts.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  calNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.bgInput,
  },
  calNavText: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
    lineHeight: 22,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: fonts.xs,
    color: colors.textMuted,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  calCellActive: { backgroundColor: colors.primary },
  calCellToday: { borderWidth: 1, borderColor: colors.primaryLight },
  calCellDate: { fontSize: fonts.sm, color: colors.textPrimary, fontWeight: '500' },
  calCellDateActive: { color: '#fff', fontWeight: '700' },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 2,
  },

  // ── Booking rows (beneath calendar) ──
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bookingImg: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.bgInput,
  },
  bookingTitle: {
    fontSize: fonts.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  bookingMeta: {
    fontSize: fonts.xs,
    color: colors.textMuted,
    marginBottom: 4,
  },

  // ── Empty state ──
  // Card-style empty panel with a soft primary tint so "no results" feels
  // like an intentional state, not a broken screen.
  empty: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(108,92,231,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md, opacity: 0.8 },
  emptyTitle: {
    fontSize: fonts.lg,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  clearText: {
    color: colors.primaryLight,
    fontSize: fonts.sm,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
