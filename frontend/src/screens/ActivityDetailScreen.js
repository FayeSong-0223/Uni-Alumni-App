import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getActivity, bookActivity, cancelBooking } from '../api/activities';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  GlowCard,
  Tag,
  GradientButton,
  ContentWrapper,
} from '../components/AnimatedComponents';

export default function ActivityDetailScreen({ navigation, route }) {
  const { activityId } = route.params;
  const { user } = useAuth();
  const toast = useToast();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingData, setBookingData] = useState({
    name: '',
    email: '',
    notes: '',
  });

  const loadActivity = async () => {
    setLoading(true);
    try {
      const { data } = await getActivity(activityId);
      setActivity(data);
      
      // Pre-fill booking form with user data if available
      setBookingData({
        name: user?.profile?.name || '',
        email: user?.email || '',
        notes: '',
      });
    } catch {
      toast.error('Failed to load activity.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadActivity(); }, [activityId]));

  const handleBookActivity = async () => {
    if (!bookingData.name.trim() || !bookingData.email.trim()) {
      toast.error('Please fill in your name and email.');
      return;
    }

    setBooking(true);
    try {
      await bookActivity(activityId, bookingData);
      toast.success('Booking successful!');
      setShowBookingForm(false);
      loadActivity(); // Refresh activity data
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to book activity.';
      toast.error(message);
    } finally {
      setBooking(false);
    }
  };

  // Cross-platform confirm. Alert.alert is a no-op on web, so cancel button
  // used to do nothing in the web build. Use window.confirm on web, Alert on
  // native.
  const confirmCancel = (onConfirm) => {
    const message = 'Are you sure you want to cancel your booking for this activity?';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) onConfirm();
      return;
    }
    Alert.alert(
      'Cancel Booking',
      message,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: onConfirm },
      ],
    );
  };

  const handleCancelBooking = () => {
    confirmCancel(async () => {
      setCancelling(true);
      try {
        await cancelBooking(activityId);
        toast.success('Booking cancelled successfully!');
        loadActivity(); // Refresh activity data
      } catch (error) {
        const message = error.response?.data?.error || 'Failed to cancel booking.';
        toast.error(message);
      } finally {
        setCancelling(false);
      }
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  const formatDuration = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const duration = (endDate - startDate) / (1000 * 60 * 60); // hours
    return `${duration.toFixed(1)} hours`;
  };

  if (loading || !activity) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading activity...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ContentWrapper>
          <FadeIn>
            <GlowCard style={styles.headerCard}>
              {/* Hero image — admin-uploaded banner for this activity. Uses a
                  placeholder when the activity has no image so the card still
                  reads as visual on both web and mobile. */}
              {activity.image ? (
                <Image
                  source={{ uri: activity.image }}
                  style={[styles.heroImage, isWide && styles.heroImageWide]}
                  resizeMode="cover"
                  accessibilityLabel={`${activity.title} banner image`}
                />
              ) : (
                <View style={[styles.heroImage, styles.heroImagePlaceholder, isWide && styles.heroImageWide]}>
                  <Text style={styles.heroImagePlaceholderText}>🎉</Text>
                </View>
              )}

              <View style={styles.titleRow}>
                <Text style={[styles.title, isWide && styles.titleWide]}>
                  {activity.title}
                </Text>
                <View style={styles.tagRow}>
                  {activity.spots_available ? (
                    <Tag label="Available" variant="success" />
                  ) : (
                    <Tag label="Full" variant="warning" />
                  )}
                </View>
              </View>
              
              <Text style={styles.description}>{activity.description}</Text>
              
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>📅</Text>
                  <View style={styles.metaContent}>
                    <Text style={styles.metaLabel}>Start</Text>
                    <Text style={styles.metaValue}>{formatDate(activity.start_time)}</Text>
                  </View>
                </View>
                
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>⏰</Text>
                  <View style={styles.metaContent}>
                    <Text style={styles.metaLabel}>Duration</Text>
                    <Text style={styles.metaValue}>{formatDuration(activity.start_time, activity.end_time)}</Text>
                  </View>
                </View>

                {activity.location && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaIcon}>📍</Text>
                    <View style={styles.metaContent}>
                      <Text style={styles.metaLabel}>Location</Text>
                      <Text style={styles.metaValue}>{activity.location}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>👥</Text>
                  <View style={styles.metaContent}>
                    <Text style={styles.metaLabel}>Participants</Text>
                    <Text style={styles.metaValue}>
                      {activity.current_participants_count}
                      {activity.max_participants && ` / ${activity.max_participants}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>👨‍💼</Text>
                  <View style={styles.metaContent}>
                    <Text style={styles.metaLabel}>Organizer</Text>
                    <Text style={styles.metaValue}>{activity.organizer_name || 'Unknown'}</Text>
                  </View>
                </View>
              </View>
            </GlowCard>
          </FadeIn>

          {!showBookingForm ? (
            <FadeIn delay={100}>
              <View style={styles.actionSection}>
                {activity.user_booking_status === 'confirmed' ? (
                  // User has a currently active (confirmed) booking
                  <View style={styles.bookedSection}>
                    <View style={styles.bookedCard}>
                      <Text style={styles.bookedIcon}>✅</Text>
                      <Text style={styles.bookedText}>You have booked this activity</Text>
                    </View>
                    <GradientButton
                      title={cancelling ? "Cancelling..." : "Cancel Booking"}
                      onPress={handleCancelBooking}
                      variant="outline"
                      loading={cancelling}
                    />
                  </View>
                ) : activity.spots_available ? (
                  // No active booking (either never booked or previously cancelled)
                  // AND capacity is available → allow (re-)booking. Per product
                  // spec, cancellation history never blocks a new booking —
                  // only full capacity does.
                  <View style={styles.bookedSection}>
                    {activity.user_booking_status === 'cancelled' && (
                      <View style={styles.cancelledCard}>
                        <Text style={styles.cancelledText}>
                          You previously cancelled this booking. You can book again.
                        </Text>
                      </View>
                    )}
                    <GradientButton
                      title={activity.user_booking_status === 'cancelled' ? 'Book Again' : 'Book This Activity'}
                      onPress={() => setShowBookingForm(true)}
                    />
                  </View>
                ) : (
                  // Activity is full — the only state that blocks booking
                  <View style={styles.fullCard}>
                    <Text style={styles.fullText}>This activity is currently full</Text>
                  </View>
                )}
              </View>
            </FadeIn>
          ) : (
            <FadeIn delay={100}>
              <GlowCard style={styles.bookingCard}>
                <Text style={styles.bookingTitle}>Book Your Spot</Text>
                <Text style={styles.bookingSubtitle}>
                  Please provide your details to complete the booking
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Full Name *</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      value={bookingData.name}
                      onChangeText={(text) => setBookingData({ ...bookingData, name: text })}
                      placeholder="Enter your full name"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Email Address *</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      value={bookingData.email}
                      onChangeText={(text) => setBookingData({ ...bookingData, email: text })}
                      placeholder="Enter your email"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Additional Notes (Optional)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={bookingData.notes}
                      onChangeText={(text) => setBookingData({ ...bookingData, notes: text })}
                      placeholder="Any special requirements or comments..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </View>

                <View style={styles.buttonRow}>
                  <GradientButton
                    title={booking ? "Booking..." : "Confirm Booking"}
                    onPress={handleBookActivity}
                    loading={booking}
                    style={{ flex: 1 }}
                  />
                  <GradientButton
                    title="Cancel"
                    onPress={() => setShowBookingForm(false)}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                </View>
              </GlowCard>
            </FadeIn>
          )}
        </ContentWrapper>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: fonts.md, color: colors.textMuted },

  scrollContent: { paddingVertical: spacing.lg },

  headerCard: { marginBottom: spacing.lg, overflow: 'hidden' },

  // ── Hero image ──
  // Mobile: 16:9 banner. Web/tablet: a bit taller so it reads like a proper
  // hero. Rounded top corners match the enclosing GlowCard; overflow:hidden
  // on headerCard clips the image to the card radius.
  heroImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.bgInput,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    marginTop: -spacing.lg,
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.md,
    // Width: the GlowCard has horizontal padding, so we negative-margin to
    // make the image bleed edge-to-edge. Use calc() on web to stay exact.
    ...Platform.select({
      web: { width: `calc(100% + ${spacing.lg * 2}px)` },
      default: {},
    }),
  },
  heroImageWide: {
    height: 320,
  },
  heroImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImagePlaceholderText: {
    fontSize: 64,
    opacity: 0.4,
  },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: fonts.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: spacing.md,
  },
  titleWide: { fontSize: fonts.xxl },
  
  description: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },

  metaGrid: { gap: spacing.md },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: { fontSize: 18, marginRight: spacing.md, width: 24 },
  metaContent: { flex: 1 },
  metaLabel: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: fonts.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  actionSection: { marginBottom: spacing.lg },
  
  bookedSection: { gap: spacing.md },
  bookedCard: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,210,160,0.2)',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bookedIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  bookedText: {
    fontSize: fonts.md,
    color: colors.success,
    fontWeight: '600',
  },
  
  cancelledCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.2)',
  },
  cancelledText: {
    fontSize: fonts.md,
    color: colors.danger,
    fontWeight: '600',
  },
  
  fullCard: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,217,61,0.2)',
  },
  fullText: {
    fontSize: fonts.md,
    color: colors.warning,
    fontWeight: '600',
  },

  bookingCard: { marginBottom: spacing.lg },
  bookingTitle: {
    fontSize: fonts.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  bookingSubtitle: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  formGroup: { marginBottom: spacing.lg },
  formLabel: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    padding: spacing.md,
    fontSize: fonts.md,
    color: colors.textPrimary,
  },
  textArea: {
    height: 80,
    paddingTop: spacing.md,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});