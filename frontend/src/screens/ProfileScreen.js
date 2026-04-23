import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  getProfessionalInterestOptions,
  getCompanyAutocomplete,
} from '../api/profiles';
import api from '../api/client';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  GradientButton,
  GlowCard,
  GradientAvatar,
  Tag,
  PressableScale,
  Dropdown,
  TagPicker,
  ContentWrapper,
} from '../components/AnimatedComponents';
import {
  DEGREES,
  GRADUATION_YEARS,
  INDUSTRIES,
  HOBBIES,
  PROFESSIONAL_INTERESTS,
  CURRENT_ROLES,
} from '../data/options';

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  // Professional interests dropdown options (server-authoritative, falls back to local list)
  const [profOptions, setProfOptions] = useState(PROFESSIONAL_INTERESTS);
  // Company autocomplete state
  const [companyInput, setCompanyInput] = useState('');
  const [companyMatches, setCompanyMatches] = useState([]);
  const companyDebounceRef = useRef(null);
  const webFileInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    getProfessionalInterestOptions()
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) setProfOptions(data);
      })
      .catch(() => {
        /* fallback to local list already in state */
      });
  }, []);

  const handleDisable2FA = async () => {
    if (!disablePassword.trim()) {
      toast.warn('Please enter your password to disable 2FA.');
      return;
    }
    try {
      await api.post('/auth/2fa/disable/', { password: disablePassword });
      await refreshUser();
      setShowDisable2FA(false);
      setDisablePassword('');
      toast.success('Two-factor authentication disabled.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to disable 2FA.');
    }
  };

  const loadProfile = async () => {
    try {
      const { data } = await getMyProfile();
      setProfile(data);
      setForm({
        name: data.name || '',
        degree: data.degree || '',
        graduation_year: data.graduation_year ? String(data.graduation_year) : '',
        industry: data.industry || '',
        expertise: data.expertise?.join(', ') || '',
        // Renamed from `interests`. Backwards compat: if the API ever returns
        // the old key during rollout, fall back to it so the form still loads.
        hobbies: data.hobbies ?? data.interests ?? [],
        professional_interests: data.professional_interests || [],
        companies: data.companies || [],
        current_role: data.current_role || '',
        bio: data.bio || '',
      });
      setCompanyInput('');
      setCompanyMatches([]);
    } catch {
      toast.error('Failed to load profile.');
    }
  };

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        degree: form.degree,
        graduation_year: form.graduation_year ? parseInt(form.graduation_year, 10) : null,
        industry: form.industry,
        expertise: form.expertise.split(',').map(s => s.trim()).filter(Boolean),
        hobbies: form.hobbies,
        professional_interests: form.professional_interests,
        companies: form.companies,
        current_role: form.current_role,
        bio: form.bio,
      };
      const { data } = await updateMyProfile(payload);
      setProfile(data);
      setEditing(false);
      toast.success('Profile saved successfully!');
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : 'Update failed.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // -- Avatar upload ---------------------------------------------------------
  const handleAvatarPick = () => {
    if (Platform.OS === 'web') {
      webFileInputRef.current?.click();
    } else {
      // Native picker requires `expo-image-picker`. Guarded so app doesn't
      // crash if that package isn't installed yet. Ask the user to add it:
      //   npx expo install expo-image-picker
      toast.warn('Install expo-image-picker to enable mobile avatar upload.');
    }
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { data } = await uploadAvatar(file);
      setProfile(data);
      toast.success('Avatar updated.');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Avatar upload failed.';
      toast.error(msg);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // -- Company autocomplete --------------------------------------------------
  const handleCompanyInputChange = (value) => {
    setCompanyInput(value);
    if (companyDebounceRef.current) clearTimeout(companyDebounceRef.current);
    if (!value.trim()) {
      setCompanyMatches([]);
      return;
    }
    companyDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await getCompanyAutocomplete(value.trim());
        setCompanyMatches(Array.isArray(data) ? data : []);
      } catch {
        setCompanyMatches([]);
      }
    }, 180);
  };

  const addCompany = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const next = Array.isArray(form.companies) ? [...form.companies] : [];
    const key = trimmed.toLowerCase();
    if (next.some((c) => c.toLowerCase() === key)) return; // dedupe
    next.push(trimmed);
    setForm({ ...form, companies: next });
    setCompanyInput('');
    setCompanyMatches([]);
  };

  const removeCompany = (name) => {
    const next = (form.companies || []).filter((c) => c !== name);
    setForm({ ...form, companies: next });
  };

  const togglePrivacy = async (field, value) => {
    try {
      await api.patch('/auth/me/', { [field]: value });
      await refreshUser();
      toast.success('Privacy setting updated.');
    } catch {
      toast.error('Failed to update setting.');
    }
  };

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%', paddingHorizontal: spacing.xl }]} showsVerticalScrollIndicator={false}>
      {Platform.OS === 'web' && (
        // Hidden file input used by the avatar picker on web. Uses native
        // DOM element (not a react-native component) — only rendered on web.
        // eslint-disable-next-line react/forbid-elements
        React.createElement('input', {
          type: 'file',
          accept: 'image/*',
          ref: webFileInputRef,
          style: { display: 'none' },
          onChange: (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleAvatarFile(file);
            e.target.value = '';
          },
        })
      )}
      {isWide ? (
        <View style={styles.desktopProfileGrid}>
          {/* Left column — hero + privacy + security */}
          <View style={styles.profileLeftCol}>
            <FadeIn>
              <LinearGradient
                colors={colors.gradientHero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <TouchableOpacity onPress={handleAvatarPick} activeOpacity={0.8} accessibilityLabel="Change avatar">
              <GradientAvatar
                name={profile.name || user?.username}
                size={96}
                imageUrl={profile.profile_picture || undefined}
              />
              <Text style={styles.avatarEditHint}>
                {uploadingAvatar ? 'Uploading…' : 'Change avatar'}
              </Text>
            </TouchableOpacity>
                <Text style={styles.heroName}>{profile.name || user?.username || 'Set your name'}</Text>
                <View style={styles.idBadge}>
                  <Text style={styles.alumniId}>{profile.alumni_id}</Text>
                </View>
                {profile.current_role ? <Text style={styles.heroRole}>{profile.current_role}</Text> : null}
                {profile.degree ? <Text style={styles.heroDegree}>{profile.degree} • {profile.graduation_year || ''}</Text> : null}
              </LinearGradient>
            </FadeIn>
            <FadeIn delay={100}>
              <GlowCard style={styles.section}>
                <Text style={styles.sectionTitle}>Privacy Settings</Text>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Visible in search</Text>
                    <Text style={styles.switchHint}>Other alumni can find your profile</Text>
                  </View>
                  <Switch value={user?.is_profile_public ?? true} onValueChange={v => togglePrivacy('is_profile_public', v)} trackColor={{ false: colors.textMuted, true: colors.primary }} thumbColor={colors.white} />
                </View>
                <View style={[styles.switchRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Accept contact requests</Text>
                    <Text style={styles.switchHint}>Allow others to connect with you</Text>
                  </View>
                  <Switch value={user?.allow_contact ?? true} onValueChange={v => togglePrivacy('allow_contact', v)} trackColor={{ false: colors.textMuted, true: colors.primary }} thumbColor={colors.white} />
                </View>
              </GlowCard>
            </FadeIn>
            <FadeIn delay={150}>
              <GlowCard style={styles.section}>
                <Text style={styles.sectionTitle}>Security</Text>
                <View style={[styles.switchRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Two-Factor Authentication</Text>
                    <Text style={styles.switchHint}>{user?.is_2fa_enabled ? 'Enabled — using authenticator app' : 'Add extra security to your account'}</Text>
                  </View>
                  {user?.is_2fa_enabled ? (
                    <TouchableOpacity onPress={() => setShowDisable2FA(!showDisable2FA)} style={styles.disableToggle}>
                      <Text style={styles.disableToggleText}>{showDisable2FA ? 'Cancel' : 'Disable'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <PressableScale onPress={() => navigation.navigate('TwoFactorSetup')}>
                      <LinearGradient colors={colors.gradientPrimary} style={styles.editBadge}><Text style={styles.editBadgeText}>Setup</Text></LinearGradient>
                    </PressableScale>
                  )}
                </View>
                {showDisable2FA && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={styles.fieldLabel}>Enter your password to confirm</Text>
                    <View style={styles.inputWrap}><TextInput style={styles.input} value={disablePassword} onChangeText={setDisablePassword} secureTextEntry placeholder="Your password" placeholderTextColor={colors.textMuted} returnKeyType="go" onSubmitEditing={handleDisable2FA} /></View>
                    <GradientButton title="Confirm Disable" onPress={handleDisable2FA} colors={[colors.danger, '#FF4757']} style={{ marginTop: spacing.md }} />
                  </View>
                )}
              </GlowCard>
            </FadeIn>
            <FadeIn delay={200}>
              <PressableScale onPress={logout}>
                <View style={styles.logoutBtn}><Text style={styles.logoutText}>Sign Out</Text></View>
              </PressableScale>
            </FadeIn>
          </View>
          {/* Right column — profile details */}
          <View style={styles.profileRightCol}>
            <FadeIn delay={100}>
              <GlowCard style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Profile Details</Text>
                  {!editing && (
                    <PressableScale onPress={() => setEditing(true)}>
                      <LinearGradient colors={colors.gradientPrimary} style={styles.editBadge}><Text style={styles.editBadgeText}>Edit</Text></LinearGradient>
                    </PressableScale>
                  )}
                </View>
                {editing ? renderEditForm() : renderProfileView()}
              </GlowCard>
            </FadeIn>
          </View>
        </View>
      ) : (
      <ContentWrapper>
        {/* Hero Card */}
        <FadeIn>
          <LinearGradient
            colors={colors.gradientHero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <TouchableOpacity onPress={handleAvatarPick} activeOpacity={0.8} accessibilityLabel="Change avatar">
              <GradientAvatar
                name={profile.name || user?.username}
                size={80}
                imageUrl={profile.profile_picture || undefined}
              />
              <Text style={styles.avatarEditHint}>
                {uploadingAvatar ? 'Uploading…' : 'Change avatar'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.heroName}>{profile.name || user?.username || 'Set your name'}</Text>
            <View style={styles.idBadge}>
              <Text style={styles.alumniId}>{profile.alumni_id}</Text>
            </View>
            {profile.current_role ? <Text style={styles.heroRole}>{profile.current_role}</Text> : null}
            {profile.degree ? <Text style={styles.heroDegree}>{profile.degree} • {profile.graduation_year || ''}</Text> : null}
          </LinearGradient>
        </FadeIn>

        {/* Privacy Settings */}
        <FadeIn delay={150}>
          <GlowCard style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy Settings</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Visible in search</Text>
                <Text style={styles.switchHint}>Other alumni can find your profile</Text>
              </View>
              <Switch
                value={user?.is_profile_public ?? true}
                onValueChange={v => togglePrivacy('is_profile_public', v)}
                trackColor={{ false: colors.textMuted, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
            <View style={[styles.switchRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Accept contact requests</Text>
                <Text style={styles.switchHint}>Allow others to connect with you</Text>
              </View>
              <Switch
                value={user?.allow_contact ?? true}
                onValueChange={v => togglePrivacy('allow_contact', v)}
                trackColor={{ false: colors.textMuted, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          </GlowCard>
        </FadeIn>

        {/* Security / 2FA */}
        <FadeIn delay={225}>
          <GlowCard style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>
            <View style={[styles.switchRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Two-Factor Authentication</Text>
                <Text style={styles.switchHint}>
                  {user?.is_2fa_enabled
                    ? 'Enabled — using authenticator app'
                    : 'Add extra security to your account'}
                </Text>
              </View>
              {user?.is_2fa_enabled ? (
                <TouchableOpacity
                  onPress={() => setShowDisable2FA(!showDisable2FA)}
                  style={styles.disableToggle}
                >
                  <Text style={styles.disableToggleText}>
                    {showDisable2FA ? 'Cancel' : 'Disable'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <PressableScale onPress={() => navigation.navigate('TwoFactorSetup')}>
                  <LinearGradient colors={colors.gradientPrimary} style={styles.editBadge}>
                    <Text style={styles.editBadgeText}>Setup</Text>
                  </LinearGradient>
                </PressableScale>
              )}
            </View>
            {showDisable2FA && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.fieldLabel}>Enter your password to confirm</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={disablePassword}
                    onChangeText={setDisablePassword}
                    secureTextEntry
                    placeholder="Your password"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="go"
                    onSubmitEditing={handleDisable2FA}
                  />
                </View>
                <GradientButton
                  title="Confirm Disable"
                  onPress={handleDisable2FA}
                  colors={[colors.danger, '#FF4757']}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            )}
          </GlowCard>
        </FadeIn>

        {/* Profile Details */}
        <FadeIn delay={300}>
          <GlowCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Profile Details</Text>
              {!editing && (
                <PressableScale onPress={() => setEditing(true)}>
                  <LinearGradient colors={colors.gradientPrimary} style={styles.editBadge}>
                    <Text style={styles.editBadgeText}>Edit</Text>
                  </LinearGradient>
                </PressableScale>
              )}
            </View>

            {editing ? renderEditForm() : renderProfileView()}
          </GlowCard>
        </FadeIn>

        {/* Sign Out */}
        <FadeIn delay={450}>
          <PressableScale onPress={logout}>
            <View style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Sign Out</Text>
            </View>
          </PressableScale>
        </FadeIn>
      </ContentWrapper>
      )}
    </ScrollView>
  );

  function renderEditForm() {
    return (
      <>
        <FieldBlock label="Full Name">
          <View style={styles.inputWrap}><TextInput style={styles.input} value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="Your full name" placeholderTextColor={colors.textMuted} /></View>
        </FieldBlock>
        <FieldBlock label="Degree">
          <Dropdown label="Degree" value={form.degree} options={DEGREES} onSelect={v => setForm({ ...form, degree: v })} placeholder="Select your degree" />
        </FieldBlock>
        <FieldBlock label="Graduation Year">
          <Dropdown label="Graduation Year" value={form.graduation_year} options={GRADUATION_YEARS} onSelect={v => setForm({ ...form, graduation_year: v })} placeholder="Select year" />
        </FieldBlock>
        <FieldBlock label="Industry">
          <Dropdown
                    label="Industry"
                    value={form.industry}
                    options={INDUSTRIES}
                    onSelect={v => setForm({ ...form, industry: v })}
                    placeholder="Any"
                  />
        </FieldBlock>
        <FieldBlock label="Expertise" hint="Comma-separated (e.g. React, Cloud, Python)">
          <View style={styles.inputWrap}><TextInput style={styles.input} value={form.expertise} onChangeText={v => setForm({ ...form, expertise: v })} placeholder="Type your skills" placeholderTextColor={colors.textMuted} /></View>
        </FieldBlock>
        <FieldBlock label="Hobbies" hint="Tap to select/deselect — personal/leisure only">
          <TagPicker
            label="Hobbies"
            selected={form.hobbies}
            options={HOBBIES}
            onChange={v => setForm({ ...form, hobbies: v })}
          />
        </FieldBlock>
        <FieldBlock label="Professional Interests" hint="Choose from the list — drives recommendations">
          <TagPicker
            label="Professional Interests"
            selected={form.professional_interests}
            options={profOptions.map(o => o.slug)}
            onChange={v => setForm({ ...form, professional_interests: v })}
            renderLabel={(slug) => profOptions.find(o => o.slug === slug)?.label || slug}
          />
        </FieldBlock>
        <FieldBlock label="Companies" hint="Free text — where you've worked. Used for search autocomplete.">
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={companyInput}
              onChangeText={handleCompanyInputChange}
              placeholder="Type a company and press +"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={() => addCompany(companyInput)}
            />
          </View>
          {companyMatches.length > 0 && (
            <View style={styles.autocompleteBox}>
              {companyMatches.map((m) => (
                <TouchableOpacity
                  key={m.name_display}
                  style={styles.autocompleteItem}
                  onPress={() => addCompany(m.name_display)}
                >
                  <Text style={styles.autocompleteItemText}>{m.name_display}</Text>
                  <Text style={styles.autocompleteItemMeta}>
                    {m.use_count > 0 ? `Used by ${m.use_count}` : 'New'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {companyInput.trim() !== '' && (
            <TouchableOpacity
              onPress={() => addCompany(companyInput)}
              style={styles.addCompanyBtn}
            >
              <Text style={styles.addCompanyBtnText}>+ Add "{companyInput.trim()}"</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.tagRow, { marginTop: spacing.sm }]}>
            {(form.companies || []).map((c) => (
              <TouchableOpacity key={c} onPress={() => removeCompany(c)}>
                <View style={styles.companyChip}>
                  <Text style={styles.companyChipText}>{c}</Text>
                  <Text style={styles.companyChipClose}>  ×</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </FieldBlock>
        <FieldBlock label="Current Role">
          <Dropdown label="Current Role" value={form.current_role} options={CURRENT_ROLES} onSelect={v => setForm({ ...form, current_role: v })} placeholder="Select your role" />
        </FieldBlock>
        <FieldBlock label="Bio">
          <View style={styles.inputWrap}><TextInput style={[styles.input, styles.textArea]} value={form.bio} onChangeText={v => setForm({ ...form, bio: v })} placeholder="Tell others about yourself..." placeholderTextColor={colors.textMuted} multiline numberOfLines={3} /></View>
        </FieldBlock>
        <View style={styles.buttonRow}>
          <PressableScale onPress={() => { setEditing(false); loadProfile(); }} style={{ flex: 1 }}>
            <View style={styles.cancelBtn}><Text style={styles.cancelBtnText}>Cancel</Text></View>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <GradientButton title={saving ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={saving} />
          </View>
        </View>
      </>
    );
  }

  function renderProfileView() {
    const hobbies = profile.hobbies ?? profile.interests ?? [];
    const prof = profile.professional_interests || [];
    const companies = profile.companies || [];
    return (
      <>
        <DetailRow label="Degree" value={profile.degree} />
        <DetailRow label="Graduation Year" value={profile.graduation_year} />
        <DetailRow label="Industry" value={profile.industry} />
        {profile.expertise?.length > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expertise</Text>
            <View style={styles.tagRow}>{profile.expertise.map(e => <Tag key={e} label={e} variant="primary" />)}</View>
          </View>
        )}
        {hobbies.length > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Hobbies</Text>
            <View style={styles.tagRow}>{hobbies.map(i => <Tag key={i} label={i} variant="accent" />)}</View>
          </View>
        )}
        {prof.length > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Professional Interests</Text>
            <View style={styles.tagRow}>
              {prof.map((slug) => {
                const opt = profOptions.find(o => o.slug === slug);
                return <Tag key={slug} label={opt?.label || slug} variant="primary" />;
              })}
            </View>
          </View>
        )}
        {companies.length > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Companies</Text>
            <View style={styles.tagRow}>
              {companies.map((c) => <Tag key={c} label={c} variant="accent" />)}
            </View>
          </View>
        )}
        <DetailRow label="Current Role" value={profile.current_role} />
        <DetailRow label="Bio" value={profile.bio} />
      </>
    );
  }
}

function FieldBlock({ label, hint, children }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      {children}
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  loadingText: { color: colors.textSecondary, fontSize: fonts.md },

  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroName: { fontSize: fonts.xl, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  idBadge: {
    backgroundColor: 'rgba(108,92,231,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  alumniId: { fontSize: fonts.sm, color: colors.primaryLight, fontWeight: '600' },
  heroRole: { fontSize: fonts.md, color: colors.textSecondary, marginTop: spacing.sm },
  heroDegree: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 4 },

  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  editBadge: { borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 7, marginBottom: spacing.sm },
  editBadgeText: { color: colors.white, fontSize: fonts.sm, fontWeight: '700' },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  switchLabel: { fontSize: fonts.md, color: colors.textPrimary, fontWeight: '500' },
  switchHint: { fontSize: fonts.xs, color: colors.textMuted, marginTop: 2 },

  fieldLabel: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: { fontSize: fonts.xs, color: colors.textMuted, marginBottom: spacing.sm },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { padding: 14, fontSize: fonts.md, color: colors.textPrimary },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  detailRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  detailLabel: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: { fontSize: fonts.md, color: colors.textPrimary, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },

  buttonRow: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  cancelBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.textSecondary, fontSize: fonts.md, fontWeight: '600' },
  disableToggle: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: spacing.sm,
  },
  disableToggleText: {
    color: colors.danger,
    fontSize: fonts.sm,
    fontWeight: '700',
  },
  desktopProfileGrid: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  profileLeftCol: {
    width: 340,
    flexShrink: 0,
  },
  profileRightCol: {
    flex: 1,
  },
  logoutBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
    backgroundColor: colors.dangerBg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  logoutText: { color: colors.danger, fontSize: fonts.md, fontWeight: '600' },

  avatarEditHint: {
    marginTop: 6,
    fontSize: fonts.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  autocompleteBox: {
    marginTop: 6,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  autocompleteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  autocompleteItemText: { color: colors.textPrimary, fontSize: fonts.sm },
  autocompleteItemMeta: { color: colors.textMuted, fontSize: fonts.xs },
  addCompanyBtn: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(108,92,231,0.08)',
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  addCompanyBtnText: { color: colors.primaryLight, fontSize: fonts.sm, fontWeight: '600' },
  companyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(253,121,168,0.12)',
    borderRadius: radius.full,
    marginRight: 6,
    marginBottom: 6,
  },
  companyChipText: { color: colors.accent, fontSize: fonts.xs, fontWeight: '600' },
  companyChipClose: { color: colors.accent, fontSize: fonts.sm, fontWeight: '700' },
});
