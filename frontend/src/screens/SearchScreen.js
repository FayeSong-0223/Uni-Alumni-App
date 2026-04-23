import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { enhancedSearchProfiles, getAutocompleteSuggestions } from '../api/profiles';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  StaggerItem,
  GlowCard,
  GradientAvatar,
  Tag,
  GradientButton,
  Dropdown,
  TagPicker,
  ContentWrapper,
  Pagination,
  PressableScale,
} from '../components/AnimatedComponents';
import {
  DEGREES,
  GRADUATION_YEARS,
  INDUSTRIES,
  HOBBIES,
  PROFESSIONAL_INTERESTS,
} from '../data/options';

// Grouped autocomplete renderer. Items come as { label, slug?, type, meta? }.
// Skips rendering entirely when the group has no items so we don't show empty
// section headers.
function SuggestionGroup({ title, items, onPress }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.suggestionGroup}>
      <Text style={styles.suggestionGroupTitle}>{title}</Text>
      {items.map((item, idx) => {
        const label = item.label || item.name || String(item);
        const meta = item.meta || item.subtitle || null;
        return (
          <TouchableOpacity
            key={`${title}-${item.slug || label}-${idx}`}
            style={styles.suggestionItem}
            onPress={() => onPress(item)}
          >
            <Text style={styles.suggestionText}>{label}</Text>
            {meta ? <Text style={styles.suggestionMeta}>{meta}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SearchScreen({ navigation }) {
  const toast = useToast();
  const { isDesktop, isTablet, columns, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Autocomplete now returns grouped results: professional_interests, companies, other.
  // We keep `suggestions` as a flat list of { label, type, slug? } objects so the
  // existing render path still works, but also expose grouped form for section headers.
  const [suggestionsGrouped, setSuggestionsGrouped] = useState({
    professional_interests: [],
    companies: [],
    other: [],
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    industry: '',
    expertise: '',
    graduation_year: '',
    degree: '',
    hobbies: '',
    professional_interests: '',
  });

  const fetchProfiles = async (pageNum = 1) => {
    setLoading(true);
    try {
      const params = { page: pageNum };
      if (searchText.trim()) params.search = searchText.trim();
      if (filters.industry) params.industry = filters.industry;
      if (filters.expertise) params.expertise = filters.expertise;
      if (filters.graduation_year) params.graduation_year = filters.graduation_year;
      if (filters.degree) params.degree = filters.degree;
      if (filters.hobbies) params.hobbies = filters.hobbies;
      if (filters.professional_interests) {
        params.professional_interests = filters.professional_interests;
      }
      // NOTE: companies is intentionally never sent as a filter — only as free-text
      // search in `searchText`, per product spec.
      const { data } = await enhancedSearchProfiles(params);
      setResults(data.results || data);
      const count = data.count || (data.results || data).length;
      const pageSize = 10;
      setTotalPages(Math.max(1, Math.ceil(count / pageSize)));
      setPage(pageNum);
    } catch {
      toast.error('Failed to search profiles.');
    } finally {
      setLoading(false);
    }
  };

  const emptyGroups = { professional_interests: [], companies: [], other: [] };

  const fetchSuggestions = async (query) => {
    if (!query || query.length < 2) {
      setSuggestionsGrouped(emptyGroups);
      setShowSuggestions(false);
      return;
    }
    try {
      const { data } = await getAutocompleteSuggestions(query);
      // Backwards-compat: if the API still returns a flat array, wrap it.
      if (Array.isArray(data)) {
        setSuggestionsGrouped({
          professional_interests: [],
          companies: [],
          other: data.map((s) => ({ label: s, type: 'other' })),
        });
      } else {
        setSuggestionsGrouped({
          professional_interests: data.professional_interests || [],
          companies: data.companies || [],
          other: data.other || [],
        });
      }
      setShowSuggestions(true);
    } catch {
      setSuggestionsGrouped(emptyGroups);
      setShowSuggestions(false);
    }
  };

  const handleSearchTextChange = (text) => {
    setSearchText(text);
    fetchSuggestions(text);
  };

  const handleSuggestionPress = (suggestion) => {
    // Suggestions now come as objects. For professional interests we could
    // also set the filter automatically, but per product direction the search
    // bar path is the unified discovery entry point, so we just drop the label
    // into the query and search.
    const text = suggestion.label || suggestion;
    setSearchText(text);
    setShowSuggestions(false);
    setSuggestionsGrouped(emptyGroups);
    setTimeout(() => fetchProfiles(1), 100);
  };

  const hasAnySuggestions =
    suggestionsGrouped.professional_interests.length > 0 ||
    suggestionsGrouped.companies.length > 0 ||
    suggestionsGrouped.other.length > 0;

  useFocusEffect(useCallback(() => { fetchProfiles(1); }, []));

  const handleSearch = () => fetchProfiles(1);
  const handlePageChange = (p) => fetchProfiles(p);

  const clearFilters = () => {
    setFilters({
      industry: '',
      expertise: '',
      graduation_year: '',
      degree: '',
      hobbies: '',
      professional_interests: '',
    });
    setSearchText('');
    fetchProfiles(1);
  };

  const activeFilterCount =
    Object.values(filters).filter(Boolean).length + (searchText.trim() ? 1 : 0);

  // Label lookup for professional interest slugs
  const profInterestLabel = (slug) =>
    PROFESSIONAL_INTERESTS.find((o) => o.slug === slug)?.label || slug;

  const renderItem = ({ item, index }) => (
    <StaggerItem index={index}>
      <GlowCard
        style={[styles.card, isDesktop && styles.cardDesktop]}
        onPress={() => navigation.navigate('UserDetail', { alumniId: item.alumni_id })}
      >
        <View style={styles.cardRow}>
          <GradientAvatar name={item.name} size={isWide ? 56 : 52} />
          <View style={styles.cardContent}>
            <Text style={[styles.cardName, isWide && styles.cardNameWide]}>{item.name || 'Unnamed Alumni'}</Text>
            <Text style={styles.cardRole}>{item.current_role || item.degree || '—'}</Text>
            <View style={styles.tagRow}>
              {item.industry ? <Tag label={item.industry} variant="info" /> : null}
              {item.graduation_year ? <Tag label={String(item.graduation_year)} variant="warning" /> : null}
            </View>
            {item.expertise?.length > 0 && (
              <View style={styles.tagRow}>
                {item.expertise.slice(0, 3).map(skill => (
                  <Tag key={skill} label={skill} variant="primary" />
                ))}
                {item.expertise.length > 3 && (
                  <Tag label={`+${item.expertise.length - 3}`} variant="primary" />
                )}
              </View>
            )}
            {isWide && (item.hobbies?.length > 0 || item.interests?.length > 0) && (
              <View style={styles.tagRow}>
                {(item.hobbies || item.interests).slice(0, 3).map(i => (
                  <Tag key={i} label={i} variant="accent" />
                ))}
              </View>
            )}
            {isWide && item.professional_interests?.length > 0 && (
              <View style={styles.tagRow}>
                {item.professional_interests.slice(0, 2).map(slug => (
                  <Tag key={slug} label={profInterestLabel(slug)} variant="primary" />
                ))}
              </View>
            )}
            {isWide && item.companies?.length > 0 && (
              <View style={styles.tagRow}>
                {item.companies.slice(0, 2).map(c => (
                  <Tag key={c} label={c} variant="info" />
                ))}
              </View>
            )}
          </View>
        </View>
      </GlowCard>
    </StaggerItem>
  );

  // Desktop: side-by-side layout with filters panel on the left
  if (isWide) {
    return (
      <View style={styles.container}>
        <View style={[styles.desktopLayout, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}>
          {/* Left sidebar — search + filters always visible.
              The sidebar is its own scroll container so the filter block
              (six fields + buttons) stays reachable when it exceeds the
              viewport height. Without this ScrollView the bottom of the
              filters gets clipped and users can't scroll to see/use them. */}
          <ScrollView
            style={styles.sidebar}
            contentContainerStyle={styles.sidebarScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FadeIn>
              <GlowCard style={styles.sidebarCard}>
                <Text style={styles.sidebarTitle}>Search Alumni</Text>
                <View style={styles.searchInputContainer}>
                  <View style={styles.searchInputWrap}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Name, degree, skills..."
                      placeholderTextColor={colors.textMuted}
                      value={searchText}
                      onChangeText={handleSearchTextChange}
                      onSubmitEditing={handleSearch}
                      onFocus={() => {
                        if (searchText.length >= 2) {
                          fetchSuggestions(searchText);
                        }
                      }}
                      onBlur={() => {
                        // Delay hiding suggestions to allow tap
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      returnKeyType="search"
                    />
                  </View>

                  {/* Grouped autocomplete suggestions */}
                  {showSuggestions && hasAnySuggestions && (
                    <View style={styles.suggestionsDropdownDesktop}>
                      <SuggestionGroup
                        title="Professional Interests"
                        items={suggestionsGrouped.professional_interests}
                        onPress={handleSuggestionPress}
                      />
                      <SuggestionGroup
                        title="Companies"
                        items={suggestionsGrouped.companies}
                        onPress={handleSuggestionPress}
                      />
                      <SuggestionGroup
                        title="Other"
                        items={suggestionsGrouped.other}
                        onPress={handleSuggestionPress}
                      />
                    </View>
                  )}
                </View>

                <View style={styles.sidebarDivider} />
                <Text style={styles.sidebarSectionLabel}>Filters</Text>

                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Industry</Text>
                  <Dropdown
                    label="Industry"
                    value={filters.industry}
                    options={INDUSTRIES}
                    onSelect={v => setFilters({ ...filters, industry: v })}
                    placeholder="Any"
                  />
                </View>
                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Graduation Year</Text>
                  <Dropdown
                    label="Graduation Year"
                    value={filters.graduation_year}
                    options={GRADUATION_YEARS}
                    onSelect={v => setFilters({ ...filters, graduation_year: v })}
                    placeholder="Any"
                  />
                </View>
                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Degree</Text>
                  <Dropdown
                    label="Degree"
                    value={filters.degree}
                    options={DEGREES}
                    onSelect={v => setFilters({ ...filters, degree: v })}
                    placeholder="Any"
                  />
                </View>
                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Hobbies</Text>
                  <Dropdown
                    label="Hobbies"
                    value={filters.hobbies}
                    options={HOBBIES}
                    onSelect={v => setFilters({ ...filters, hobbies: v })}
                    placeholder="Any"
                  />
                </View>
                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Professional Interests</Text>
                  <Dropdown
                    label="Professional Interests"
                    value={filters.professional_interests}
                    // Dropdown renders strings — show the label but map back to
                    // slug on select so the backend receives the canonical key.
                    options={PROFESSIONAL_INTERESTS.map(o => o.label)}
                    displayValue={profInterestLabel(filters.professional_interests)}
                    onSelect={(label) => {
                      const match = PROFESSIONAL_INTERESTS.find(o => o.label === label);
                      setFilters({ ...filters, professional_interests: match?.slug || '' });
                    }}
                    placeholder="Any"
                  />
                </View>
                {/* NOTE: `companies` is never rendered as a filter by product
                    spec — it's discoverable only via the top search bar's
                    autocomplete. Do not add a Companies dropdown here. */}
                <View style={styles.filterItemDesktop}>
                  <Text style={styles.filterLabel}>Expertise</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.filterInput}
                      value={filters.expertise}
                      onChangeText={v => setFilters({ ...filters, expertise: v })}
                      placeholder="e.g. React, Python..."
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <GradientButton title="Search" onPress={handleSearch} />
                  </View>
                  {activeFilterCount > 0 && (
                    <PressableScale onPress={clearFilters} style={{ justifyContent: 'center' }}>
                      <Text style={styles.clearText}>Clear</Text>
                    </PressableScale>
                  )}
                </View>
              </GlowCard>
            </FadeIn>
          </ScrollView>

          {/* Right content — results */}
          <View style={styles.mainContent}>
            <FlatList
              data={results}
              keyExtractor={item => item.alumni_id}
              renderItem={renderItem}
              numColumns={isDesktop ? 1 : 1}
              contentContainerStyle={styles.listDesktop}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={styles.resultsCount}>
                  {results.length > 0 ? `${results.length} alumni found` : ''}
                </Text>
              }
              ListFooterComponent={
                <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>🔍</Text>
                  <Text style={styles.emptyTitle}>
                    {loading ? 'Searching...' : 'No alumni found'}
                  </Text>
                  {!loading && <Text style={styles.emptySub}>Try different search terms or filters</Text>}
                </View>
              }
            />
          </View>
        </View>
      </View>
    );
  }

  // Mobile layout
  // The search/filter block used to sit in a ContentWrapper *above* the
  // FlatList. When the filter panel opened it grew tall enough to push its
  // bottom (including the Apply button) below the viewport, but only the
  // FlatList scrolled — so users couldn't reach the rest of the panel.
  // Fix: render the whole block as the FlatList's ListHeaderComponent so
  // the filter panel scrolls together with the results.
  const renderMobileHeader = () => (
    <ContentWrapper>
      <FadeIn>
        <View style={styles.searchBar}>
          <View style={styles.searchInputWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, degree, skills..."
              placeholderTextColor={colors.textMuted}
              value={searchText}
              onChangeText={handleSearchTextChange}
              onSubmitEditing={handleSearch}
              onFocus={() => {
                if (searchText.length >= 2) {
                  fetchSuggestions(searchText);
                }
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              returnKeyType="search"
            />
          </View>
          <GradientButton title="Search" onPress={handleSearch} style={styles.searchBtn} />
        </View>

        {/* Mobile autocomplete — grouped by source (professional interests,
            companies, other free-text matches). */}
        {showSuggestions && hasAnySuggestions && (
          <View style={styles.suggestionsDropdownMobile}>
            <SuggestionGroup
              title="Professional Interests"
              items={suggestionsGrouped.professional_interests}
              onPress={handleSuggestionPress}
            />
            <SuggestionGroup
              title="Companies"
              items={suggestionsGrouped.companies}
              onPress={handleSuggestionPress}
            />
            <SuggestionGroup
              title="Other"
              items={suggestionsGrouped.other}
              onPress={handleSuggestionPress}
            />
          </View>
        )}
      </FadeIn>

      <FadeIn delay={100}>
        <View style={styles.filterToggleRow}>
          <PressableScale onPress={() => setShowFilters(!showFilters)}>
            <View style={styles.filterToggle}>
              <Text style={styles.filterToggleText}>
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </Text>
              <Text style={styles.filterArrow}>{showFilters ? '▴' : '▾'}</Text>
            </View>
          </PressableScale>
          {activeFilterCount > 0 && (
            <PressableScale onPress={clearFilters}>
              <Text style={styles.clearText}>Clear all</Text>
            </PressableScale>
          )}
        </View>
      </FadeIn>

      {showFilters && (
        <FadeIn duration={250}>
          <GlowCard style={styles.filterPanel}>
            <View style={styles.filterGrid}>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Industry</Text>
                <Dropdown
                  label="Industry"
                  value={filters.industry}
                  options={INDUSTRIES}
                  onSelect={v => setFilters({ ...filters, industry: v })}
                  placeholder="Any"
                />
              </View>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Graduation Year</Text>
                <Dropdown
                  label="Graduation Year"
                  value={filters.graduation_year}
                  options={GRADUATION_YEARS}
                  onSelect={v => setFilters({ ...filters, graduation_year: v })}
                  placeholder="Any"
                />
              </View>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Degree</Text>
                <Dropdown
                  label="Degree"
                  value={filters.degree}
                  options={DEGREES}
                  onSelect={v => setFilters({ ...filters, degree: v })}
                  placeholder="Any"
                />
              </View>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Hobbies</Text>
                <Dropdown
                  label="Hobbies"
                  value={filters.hobbies}
                  options={HOBBIES}
                  onSelect={v => setFilters({ ...filters, hobbies: v })}
                  placeholder="Any"
                />
              </View>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Professional Interests</Text>
                <Dropdown
                  label="Professional Interests"
                  value={filters.professional_interests}
                  options={PROFESSIONAL_INTERESTS.map(o => o.label)}
                  displayValue={profInterestLabel(filters.professional_interests)}
                  onSelect={(label) => {
                    const match = PROFESSIONAL_INTERESTS.find(o => o.label === label);
                    setFilters({ ...filters, professional_interests: match?.slug || '' });
                  }}
                  placeholder="Any"
                />
              </View>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Expertise</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.expertise}
                    onChangeText={v => setFilters({ ...filters, expertise: v })}
                    placeholder="e.g. React, Python..."
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            </View>
            <GradientButton
              title="Apply Filters"
              onPress={() => {
                handleSearch();
                setShowFilters(false);
              }}
              style={{ marginTop: spacing.md }}
            />
          </GlowCard>
        </FadeIn>
      )}
    </ContentWrapper>
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.mobileList}
        data={results}
        keyExtractor={item => item.alumni_id}
        renderItem={renderItem}
        ListHeaderComponent={renderMobileHeader}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <ContentWrapper>
            <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          </ContentWrapper>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Searching...' : 'No alumni found'}
            </Text>
            {!loading && <Text style={styles.emptySub}>Try different search terms or filters</Text>}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ── Desktop layout ──
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  sidebar: {
    // ScrollView on react-native-web defaults to `flex: 1` (which includes
    // `flex-basis: 0%`) and that silently overrides a plain `width`. We need
    // explicit flexGrow:0 + flexBasis to pin the sidebar to a fixed column
    // width instead of letting it eat the whole row.
    width: 280,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 280,
  },
  sidebarScrollContent: {
    // Bottom padding keeps the last filter/button from crowding the screen edge
    // when the sidebar scrolls all the way down.
    paddingBottom: spacing.xl,
  },
  sidebarCard: {
    // `sticky` used to pin the card to the top, but inside a scrolling sidebar
    // it prevents the content from scrolling at all on web. The sidebar itself
    // is now the scroll container, so the card just sits normally.
    overflow: 'visible',
  },
  sidebarTitle: {
    fontSize: fonts.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.lg,
  },
  sidebarSectionLabel: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  filterItemDesktop: { marginBottom: spacing.md, zIndex: 1 },
  mainContent: { flex: 1 },
  listDesktop: { paddingBottom: spacing.xl },
  resultsCount: {
    fontSize: fonts.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    fontWeight: '500',
  },
  cardDesktop: { marginBottom: spacing.md },
  cardNameWide: { fontSize: fonts.lg },

  // ── Mobile layout ──
  searchBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, padding: 14, fontSize: fonts.md, color: colors.textPrimary },
  searchBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md },

  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  filterToggleText: { color: colors.primaryLight, fontSize: fonts.sm, fontWeight: '600' },
  filterArrow: { color: colors.primaryLight, fontSize: 12 },
  clearText: { color: colors.danger, fontSize: fonts.sm, fontWeight: '500' },

  filterPanel: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterGrid: { gap: spacing.md },
  filterItem: {},
  filterLabel: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterInput: { padding: 14, fontSize: fonts.md, color: colors.textPrimary },

  // flex:1 gives the FlatList a defined height on web so its internal scroll
  // actually works. Without this the list has no height and the whole page
  // (header + filters + results) feels frozen.
  mobileList: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2, maxWidth: 800, alignSelf: 'center', width: '100%' },
  card: { marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardContent: { flex: 1, marginLeft: spacing.md },
  cardName: { fontSize: fonts.lg, fontWeight: '600', color: colors.textPrimary },
  cardRole: { fontSize: fonts.sm, color: colors.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },

  // ── Autocomplete suggestions ──
  searchInputContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  suggestionsDropdownDesktop: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    maxHeight: 200,
    overflow: 'hidden',
    zIndex: 1000,
  },
  suggestionsDropdown: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionsDropdownMobile: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionText: {
    fontSize: fonts.sm,
    color: colors.textPrimary,
  },
  suggestionMeta: {
    fontSize: fonts.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  suggestionGroup: {
    paddingTop: spacing.xs,
  },
  suggestionGroupTitle: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },

  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fonts.lg, color: colors.textSecondary, fontWeight: '600' },
  emptySub: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 4 },
});
