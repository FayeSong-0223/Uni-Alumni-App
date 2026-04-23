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

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim()) { toast.warn('Please enter your full name.'); return; }
    if (!username.trim()) { toast.warn('Please choose a username.'); return; }
    if (!email.trim()) { toast.warn('Please enter your email.'); return; }
    if (!password) { toast.warn('Please create a password.'); return; }
    if (password.length < 8) { toast.warn('Password must be at least 8 characters.'); return; }
    if (password !== passwordConfirm) { toast.error('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password, passwordConfirm, fullName.trim());
      toast.success('Account created! Welcome to the network.');
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        // Parse specific field errors
        if (data.username) {
          toast.error(Array.isArray(data.username) ? data.username[0] : data.username);
        } else if (data.email) {
          toast.error(Array.isArray(data.email) ? data.email[0] : data.email);
        } else if (data.password) {
          toast.error(Array.isArray(data.password) ? data.password[0] : data.password);
        } else {
          const msg = Object.values(data).flat().join('\n');
          toast.error(msg || 'Registration failed.');
        }
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
            <View style={styles.orbWrap}>
              <LinearGradient
                colors={['rgba(253,121,168,0.2)', 'rgba(108,92,231,0.1)', 'transparent']}
                style={styles.orb}
              />
            </View>

            <FadeIn>
              <Text style={styles.heading}>Join the Network</Text>
              <Text style={styles.subtitle}>Create your Adelaide University alumni account</Text>
            </FadeIn>

            <FadeIn delay={150} style={styles.form}>
              {/* Full Name */}
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Your full name"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Username */}
              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Choose a username"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={styles.hint}>Case-sensitive. Choose carefully.</Text>
              </View>

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@adelaide.edu.au"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Min 8 characters"
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

              {/* Confirm Password */}
              <View style={styles.field}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={passwordConfirm}
                    onChangeText={setPasswordConfirm}
                    secureTextEntry={!showPassword}
                    placeholder="Repeat your password"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={400}>
              <GradientButton
                title={loading ? 'Creating account...' : 'Create Account'}
                onPress={handleRegister}
                disabled={loading}
                colors={colors.gradientAccent}
                style={{ marginTop: spacing.lg }}
              />
            </FadeIn>

            <FadeIn delay={550}>
              <PressableScale onPress={() => navigation.goBack()}>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>Already have an account? </Text>
                  <Text style={styles.linkBold}>Sign In</Text>
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
    paddingVertical: 40,
  },
  inner: { maxWidth: 440, alignSelf: 'center', width: '100%' },
  orbWrap: { position: 'absolute', top: -60, left: -60, width: 280, height: 280 },
  orb: { width: 280, height: 280, borderRadius: 140 },
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
  },
  form: { marginTop: spacing.xxl },
  field: { marginBottom: spacing.md },
  label: {
    fontSize: fonts.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: fonts.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  inputWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { padding: 14, fontSize: fonts.md, color: colors.textPrimary, flex: 1 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  eyeText: { fontSize: 18 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  linkText: { fontSize: fonts.md, color: colors.textSecondary },
  linkBold: { fontSize: fonts.md, color: colors.accent, fontWeight: '700' },
});
