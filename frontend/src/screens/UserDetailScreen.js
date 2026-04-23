import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getProfileByAlumniId } from '../api/profiles';
import { sendContactRequest } from '../api/connections';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  GradientButton,
  GlowCard,
  GradientAvatar,
  Tag,
  ContentWrapper,
} from '../components/AnimatedComponents';

export default function UserDetailScreen({ route, navigation }) {
  const { alumniId } = route.params;
  const toast = useToast();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestMessage, setRequestMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { loadProfile(); }, [alumniId]);

  const loadProfile = async () => {
    try {
      const { data } = await getProfileByAlumniId(alumniId);
      setProfile(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load profile.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setSending(true);
    try {
      await sendContactRequest(alumniId, requestMessage);
      toast.success('Contact request sent successfully!');
      setRequestMessage('');
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        const msg = Object.values(data).flat().join(' ');
        if (msg.toLowerCase().includes('already')) {
          toast.warn('You already have a pending request to this user.');
        } else {
          toast.error(msg);
        }
      } else {
        toast.error('Failed to send request.');
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><Text style={styles.loadingText}>Loading...</Text></View>;
  }
  if (!profile) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%', paddingHorizontal: spacing.xl }]} showsVerticalScrollIndicator={false}>
      <ContentWrapper style={isWide ? { maxWidth: '100%' } : undefined}>
        {/* Hero */}
        <FadeIn>
          <LinearGradient
            colors={colors.gradientHero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <GradientAvatar name={profile.name} size={88} />
            <Text style={styles.heroName}>{profile.name || 'Alumni'}</Text>
            <View style={styles.idBadge}>
              <Text style={styles.alumniId}>{profile.alumni_id}</Text>
            </View>
            {profile.current_role ? <Text style={styles.heroRole}>{profile.current_role}</Text> : null}
            {profile.degree ? (
              <Text style={styles.heroDegree}>{profile.degree} • {profile.graduation_year || ''}</Text>
            ) : null}
          </LinearGradient>
        </FadeIn>

        {/* About */}
        <FadeIn delay={150}>
          <GlowCard style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <DetailRow label="Degree" value={profile.degree} />
            <DetailRow label="Graduation Year" value={profile.graduation_year} />
            <DetailRow label="Industry" value={profile.industry} />
            <DetailRow label="Current Role" value={profile.current_role} />
            {profile.bio ? <DetailRow label="Bio" value={profile.bio} /> : null}
          </GlowCard>
        </FadeIn>

        {/* Expertise */}
        {profile.expertise?.length > 0 && (
          <FadeIn delay={250}>
            <GlowCard style={styles.section}>
              <Text style={styles.sectionTitle}>Expertise</Text>
              <View style={styles.tagRow}>
                {profile.expertise.map(e => <Tag key={e} label={e} variant="primary" />)}
              </View>
            </GlowCard>
          </FadeIn>
        )}

        {/* Interests */}
        {profile.interests?.length > 0 && (
          <FadeIn delay={350}>
            <GlowCard style={styles.section}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.tagRow}>
                {profile.interests.map(i => <Tag key={i} label={i} variant="accent" />)}
              </View>
            </GlowCard>
          </FadeIn>
        )}

        {/* Connect */}
        <FadeIn delay={450}>
          <GlowCard style={styles.section}>
            <Text style={styles.sectionTitle}>Connect</Text>
            <Text style={styles.connectHint}>Send a contact request to connect and start messaging</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.messageInput}
                placeholder="Add a personal note (optional)"
                placeholderTextColor={colors.textMuted}
                value={requestMessage}
                onChangeText={setRequestMessage}
                multiline
              />
            </View>
            <GradientButton
              title={sending ? 'Sending...' : 'Send Contact Request'}
              onPress={handleConnect}
              disabled={sending}
              colors={colors.gradientAccent}
              style={{ marginTop: spacing.md }}
            />
          </GlowCard>
        </FadeIn>
      </ContentWrapper>
    </ScrollView>
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
  sectionTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  connectHint: { fontSize: fonts.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageInput: {
    padding: 14,
    fontSize: fonts.md,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.textPrimary,
  },
});
