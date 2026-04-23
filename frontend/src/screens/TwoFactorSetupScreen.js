import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius } from '../theme';
import {
  FadeIn,
  GradientButton,
  GlowCard,
  ContentWrapper,
} from '../components/AnimatedComponents';

export default function TwoFactorSetupScreen({ navigation }) {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchSetup();
  }, []);

  const fetchSetup = async () => {
    try {
      const { data } = await api.get('/auth/2fa/setup/');
      setSetupData(data);
    } catch (err) {
      toast.error('Failed to generate 2FA setup.');
      navigation.goBack();
    } finally {
      setFetching(false);
    }
  };

  const handleEnable = async () => {
    if (code.length !== 6) {
      toast.warn('Please enter the 6-digit code from your authenticator.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/2fa/enable/', { totp_code: code });
      await refreshUser();
      toast.success('Two-factor authentication enabled!');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Generating 2FA setup...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ContentWrapper>
        <FadeIn>
          <GlowCard style={styles.section}>
            <Text style={styles.stepNum}>Step 1</Text>
            <Text style={styles.stepTitle}>Scan QR Code</Text>
            <Text style={styles.stepDesc}>
              Open your authenticator app (Google Authenticator, Authy, etc.) and scan the QR code below.
            </Text>

            {setupData?.qr_code_base64 && (
              <View style={styles.qrWrap}>
                <Image
                  source={{ uri: `data:image/png;base64,${setupData.qr_code_base64}` }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
            )}
          </GlowCard>
        </FadeIn>

        <FadeIn delay={150}>
          <GlowCard style={styles.section}>
            <Text style={styles.stepNum}>Manual Entry</Text>
            <Text style={styles.stepDesc}>
              If you can't scan the QR code, enter this secret key manually in your authenticator app:
            </Text>
            <View style={styles.secretWrap}>
              <Text style={styles.secretText} selectable>{setupData?.secret}</Text>
            </View>
          </GlowCard>
        </FadeIn>

        <FadeIn delay={300}>
          <GlowCard style={styles.section}>
            <Text style={styles.stepNum}>Step 2</Text>
            <Text style={styles.stepTitle}>Verify Code</Text>
            <Text style={styles.stepDesc}>
              Enter the 6-digit code shown in your authenticator app to confirm setup.
            </Text>

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
                returnKeyType="go"
                onSubmitEditing={handleEnable}
              />
            </View>

            <GradientButton
              title={loading ? 'Verifying...' : 'Enable 2FA'}
              onPress={handleEnable}
              disabled={loading}
              style={{ marginTop: spacing.lg }}
            />
          </GlowCard>
        </FadeIn>

        <FadeIn delay={450}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </FadeIn>
      </ContentWrapper>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  loadingText: { color: colors.textSecondary, fontSize: fonts.md, marginTop: spacing.md },

  section: { marginBottom: spacing.lg },
  stepNum: {
    fontSize: fonts.xs,
    fontWeight: '700',
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  stepTitle: {
    fontSize: fonts.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepDesc: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },

  qrWrap: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    alignSelf: 'center',
  },
  qrImage: {
    width: 200,
    height: 200,
  },

  secretWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: 'center',
  },
  secretText: {
    fontSize: fonts.md,
    fontWeight: '700',
    color: colors.primaryLight,
    letterSpacing: 2,
    fontFamily: Platform?.OS === 'web' ? 'monospace' : undefined,
  },

  codeWrap: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    padding: 18,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 10,
  },

  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  cancelText: {
    fontSize: fonts.md,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
