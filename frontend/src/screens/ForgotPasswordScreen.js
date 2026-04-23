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
import api from '../api/client';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius } from '../theme';
import { FadeIn, GradientButton, ContentWrapper } from '../components/AnimatedComponents';

export default function ForgotPasswordScreen({ navigation }) {
  const toast = useToast();
  const [phase, setPhase] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!email.trim()) {
      toast.warn('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password-reset/', { email: email.trim() });
      toast.success('Reset code sent! Check your email.');
      setPhase('code');
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (code.length !== 6) {
      toast.warn('Please enter the 6-digit code.');
      return;
    }
    if (newPassword.length < 8) {
      toast.warn('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warn('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password-reset/confirm/', {
        email: email.trim(),
        code,
        new_password: newPassword,
      });
      toast.success('Password reset successfully! Please sign in.');
      navigation.navigate('Login');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to reset password.');
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

            {phase === 'email' ? (
              <>
                <FadeIn>
                  <Text style={styles.icon}>📧</Text>
                  <Text style={styles.heading}>Forgot Password?</Text>
                  <Text style={styles.subtitle}>
                    Enter your email address and we'll send you a 6-digit reset code.
                  </Text>
                </FadeIn>

                <FadeIn delay={200} style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Email Address</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        placeholder="your.email@example.com"
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="go"
                        onSubmitEditing={handleSendCode}
                      />
                    </View>
                  </View>
                </FadeIn>

                <FadeIn delay={350}>
                  <GradientButton
                    title={loading ? 'Sending...' : 'Send Reset Code'}
                    onPress={handleSendCode}
                    disabled={loading}
                    style={{ marginTop: spacing.md }}
                  />
                </FadeIn>
              </>
            ) : (
              <>
                <FadeIn>
                  <Text style={styles.icon}>🔑</Text>
                  <Text style={styles.heading}>Reset Password</Text>
                  <Text style={styles.subtitle}>
                    Enter the 6-digit code sent to {email} and your new password.
                  </Text>
                </FadeIn>

                <FadeIn delay={200} style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Reset Code</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={[styles.input, styles.codeInput]}
                        value={code}
                        onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        placeholder="000000"
                        placeholderTextColor={colors.textMuted}
                        textAlign="center"
                        autoFocus
                      />
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>New Password</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showPassword}
                        placeholder="Min. 8 characters"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}
                      >
                        <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={styles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showPassword}
                        placeholder="Re-enter new password"
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="go"
                        onSubmitEditing={handleResetPassword}
                      />
                    </View>
                  </View>
                </FadeIn>

                <FadeIn delay={350}>
                  <GradientButton
                    title={loading ? 'Resetting...' : 'Reset Password'}
                    onPress={handleResetPassword}
                    disabled={loading}
                    style={{ marginTop: spacing.md }}
                  />
                </FadeIn>

                <FadeIn delay={450}>
                  <TouchableOpacity onPress={() => setPhase('email')} style={styles.resendBtn}>
                    <Text style={styles.resendText}>Didn't receive a code? Send again</Text>
                  </TouchableOpacity>
                </FadeIn>
              </>
            )}

            <FadeIn delay={500}>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backBtn}>
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
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    padding: 16,
    fontSize: fonts.md,
    color: colors.textPrimary,
    flex: 1,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  eyeText: { fontSize: 18 },
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
  resendBtn: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resendText: {
    fontSize: fonts.sm,
    color: colors.textMuted,
  },
});
