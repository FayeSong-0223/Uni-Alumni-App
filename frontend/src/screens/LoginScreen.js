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
import { FadeIn, GradientButton, PressableScale, ContentWrapper } from '../components/AnimatedComponents';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) { toast.warn('Please enter your username.'); return; }
    if (!password.trim()) { toast.warn('Please enter your password.'); return; }
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (result?.requires_2fa) {
        navigation.navigate('TwoFactor');
        return;
      }
      toast.success('Welcome back!');
    } catch (err) {
      const errStatus = err.response?.status;
      const detail = err.response?.data?.detail;
      if (errStatus === 401 || detail) {
        toast.error(detail || 'Incorrect username or password.');
      } else {
        toast.error('Unable to connect. Please try again.');
      }
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
            {/* Decorative gradient orb */}
            <View style={styles.orbWrap}>
              <LinearGradient
                colors={['rgba(108,92,231,0.25)', 'rgba(253,121,168,0.08)', 'transparent']}
                style={styles.orb}
              />
            </View>

            <FadeIn>
              <Text style={styles.logo}>AU</Text>
              <Text style={styles.logoSub}>Alumni Network</Text>
            </FadeIn>

            <FadeIn delay={150}>
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to connect with your alumni community</Text>
            </FadeIn>

            <FadeIn delay={300} style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Enter your username"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                  >
                    <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={350}>
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </FadeIn>

            <FadeIn delay={450}>
              <GradientButton
                title={loading ? 'Signing in...' : 'Sign In'}
                onPress={handleLogin}
                disabled={loading}
                style={{ marginTop: spacing.xl }}
              />
            </FadeIn>

            <FadeIn delay={600}>
              <PressableScale onPress={() => navigation.navigate('Register')}>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>Don't have an account? </Text>
                  <Text style={styles.linkBold}>Create one</Text>
                </View>
              </PressableScale>
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
  logo: {
    fontSize: fonts.hero,
    fontWeight: '900',
    color: colors.primaryLight,
    textAlign: 'center',
    letterSpacing: 6,
  },
  logoSub: {
    fontSize: fonts.xs,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: 8,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  heading: {
    fontSize: fonts.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xxxl,
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
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  eyeText: { fontSize: 18 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: spacing.xs },
  forgotText: { fontSize: fonts.sm, color: colors.primaryLight, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
  },
  linkText: { fontSize: fonts.md, color: colors.textSecondary },
  linkBold: { fontSize: fonts.md, color: colors.primaryLight, fontWeight: '700' },
});
