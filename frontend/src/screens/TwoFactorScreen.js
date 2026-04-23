import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius } from '../theme';
import { FadeIn, GradientButton, ContentWrapper } from '../components/AnimatedComponents';

export default function TwoFactorScreen({ navigation }) {
  const { verify2FA } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.warn('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      await verify2FA(code);
      toast.success('Welcome back!');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.bg, '#0E0E1F', colors.bg]} style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ContentWrapper style={styles.inner}>
            <View style={styles.orbWrap}>
              <LinearGradient
                colors={['rgba(108,92,231,0.25)', 'rgba(253,121,168,0.08)', 'transparent']}
                style={styles.orb}
              />
            </View>

            <FadeIn>
              <Text style={styles.icon}>🔐</Text>
              <Text style={styles.heading}>Two-Factor Authentication</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code from your authenticator app
              </Text>
            </FadeIn>

            <FadeIn delay={200} style={styles.form}>
              <View style={styles.codeWrap}>
                <TextInput
                  style={styles.codeInput}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handleVerify}
                />
              </View>
            </FadeIn>

            <FadeIn delay={350}>
              <GradientButton
                title={loading ? 'Verifying...' : 'Verify Code'}
                onPress={handleVerify}
                disabled={loading}
                style={{ marginTop: spacing.xl }}
              />
            </FadeIn>

            <FadeIn delay={500}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Text style={styles.backText}>← Back to login</Text>
              </TouchableOpacity>
            </FadeIn>
          </ContentWrapper>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    paddingVertical: 60,
  },
  inner: { maxWidth: 440, alignSelf: 'center', width: '100%' },
  orbWrap: { position: 'absolute', top: -100, right: -80, width: 320, height: 320 },
  orb: { width: 320, height: 320, borderRadius: 160 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: spacing.lg },
  heading: {
    fontSize: fonts.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  form: { marginTop: spacing.xxl },
  codeWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    padding: 20,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 12,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
  },
  backText: {
    fontSize: fonts.md,
    color: colors.primaryLight,
    fontWeight: '600',
  },
});
