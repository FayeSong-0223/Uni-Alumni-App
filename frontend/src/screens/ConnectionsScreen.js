import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  getReceivedRequests,
  getSentRequests,
  getConnections,
  respondToRequest,
} from '../api/connections';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  FadeIn,
  StaggerItem,
  PressableScale,
  GlowCard,
  GradientAvatar,
} from '../components/AnimatedComponents';

export default function ConnectionsScreen({ navigation }) {
  const { user } = useAuth();
  const toast = useToast();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  const [tab, setTab] = useState('received');
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recvRes, sentRes, connRes] = await Promise.all([
        getReceivedRequests(), getSentRequests(), getConnections(),
      ]);
      setReceived(recvRes.data.results || recvRes.data);
      setSent(sentRes.data.results || sentRes.data);
      setConnections(connRes.data.results || connRes.data);
    } catch {
      toast.error('Failed to load connections.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleRespond = async (id, status) => {
    try {
      await respondToRequest(id, status);
      toast.success(status === 'accepted' ? 'Request accepted!' : 'Request declined.');
      loadData();
    } catch {
      toast.error('Failed to respond.');
    }
  };

  const getOtherUser = (item) => {
    return item.from_user.alumni_id === user?.alumni_id ? item.to_user : item.from_user;
  };

  const renderReceived = ({ item, index }) => (
    <StaggerItem index={index}>
      <GlowCard style={styles.card}>
        <View style={styles.cardRow}>
          <GradientAvatar name={item.from_user.name} size={48} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.from_user.name}</Text>
            <Text style={styles.cardSub}>{item.from_user.alumni_id}</Text>
            {item.message ? <Text style={styles.cardMsg}>"{item.message}"</Text> : null}
          </View>
        </View>
        <View style={styles.actionRow}>
          <PressableScale onPress={() => handleRespond(item.id, 'accepted')} style={{ flex: 1 }}>
            <View style={styles.acceptBtn}>
              <Text style={styles.acceptText}>Accept</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => handleRespond(item.id, 'rejected')} style={{ flex: 1 }}>
            <View style={styles.declineBtn}>
              <Text style={styles.declineText}>Decline</Text>
            </View>
          </PressableScale>
        </View>
      </GlowCard>
    </StaggerItem>
  );

  const renderSent = ({ item, index }) => {
    const sc = {
      pending: { bg: colors.warningBg, text: colors.warning, border: 'rgba(255,217,61,0.2)' },
      accepted: { bg: colors.successBg, text: colors.success, border: 'rgba(0,210,160,0.2)' },
      rejected: { bg: colors.dangerBg, text: colors.danger, border: 'rgba(255,107,107,0.2)' },
    }[item.status] || { bg: colors.warningBg, text: colors.warning, border: 'rgba(255,217,61,0.2)' };

    return (
      <StaggerItem index={index}>
        <GlowCard style={styles.card}>
          <View style={styles.cardRow}>
            <GradientAvatar name={item.to_user.name} size={48} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.to_user.name}</Text>
              <Text style={styles.cardSub}>{item.to_user.alumni_id}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>{item.status}</Text>
            </View>
          </View>
        </GlowCard>
      </StaggerItem>
    );
  };

  const renderConnection = ({ item, index }) => {
    const other = getOtherUser(item);
    return (
      <StaggerItem index={index}>
        <GlowCard style={styles.card}>
          <View style={styles.cardRow}>
            <GradientAvatar name={other.name} size={48} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{other.name}</Text>
              <Text style={styles.cardSub}>{other.alumni_id}</Text>
            </View>
            <View style={styles.btnGroup}>
              <PressableScale onPress={() => navigation.navigate('UserDetail', { alumniId: other.alumni_id })}>
                <View style={styles.outlineBtn}>
                  <Text style={styles.outlineBtnText}>View</Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  // Push Conversation onto the CURRENT (Connect) stack so
                  // the back button returns to the Connected list. Jumping
                  // to the Messages tab via getParent().navigate would leave
                  // the user stranded on InboxList when they hit back.
                  navigation.navigate('Conversation', {
                    alumniId: other.alumni_id,
                    name: other.name,
                  });
                }}
              >
                <LinearGradient colors={colors.gradientPrimary} style={styles.msgBtn}>
                  <Text style={styles.msgBtnText}>Message</Text>
                </LinearGradient>
              </PressableScale>
            </View>
          </View>
        </GlowCard>
      </StaggerItem>
    );
  };

  const tabs = [
    { key: 'received', label: 'Received', count: received.length },
    { key: 'sent', label: 'Sent', count: sent.length },
    { key: 'connections', label: 'Connected', count: connections.length },
  ];

  const dataMap = { received, sent, connections };
  const rendererMap = { received: renderReceived, sent: renderSent, connections: renderConnection };

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={[styles.tabBar, isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}>
        {tabs.map(t => (
          <PressableScale key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1 }}>
            <View style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabActiveText]}>
                {t.label}
              </Text>
              {t.count > 0 && (
                <View style={[styles.tabBadge, tab === t.key && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, tab === t.key && styles.tabBadgeActiveText]}>
                    {t.count}
                  </Text>
                </View>
              )}
            </View>
          </PressableScale>
        ))}
      </View>

      <FlatList
        data={dataMap[tab]}
        keyExtractor={item => String(item.id)}
        renderItem={rendererMap[tab]}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{tab === 'connections' ? '🤝' : '📬'}</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Loading...' : 'Nothing here yet'}
            </Text>
            <Text style={styles.emptySub}>
              {tab === 'received' ? 'No pending requests to review' :
               tab === 'sent' ? 'You haven\'t sent any requests yet' :
               'Connect with alumni from the search page'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  tabBar: {
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: fonts.sm, color: colors.textMuted, fontWeight: '500' },
  tabActiveText: { color: colors.primaryLight, fontWeight: '700' },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(108,92,231,0.25)' },
  tabBadgeText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  tabBadgeActiveText: { color: colors.primaryLight },

  list: {
    padding: spacing.lg,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },

  card: { marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: spacing.md },
  cardName: { fontSize: fonts.md, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: fonts.xs, color: colors.textMuted, marginTop: 1 },
  cardMsg: { fontSize: fonts.sm, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  acceptBtn: {
    backgroundColor: colors.successBg,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,210,160,0.25)',
  },
  acceptText: { color: colors.success, fontWeight: '700', fontSize: fonts.sm },
  declineBtn: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.25)',
  },
  declineText: { color: colors.danger, fontWeight: '700', fontSize: fonts.sm },

  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusText: { fontSize: fonts.xs, fontWeight: '700', textTransform: 'capitalize' },

  btnGroup: { flexDirection: 'row', gap: 6 },
  outlineBtn: {
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlineBtnText: { color: colors.textSecondary, fontSize: fonts.sm, fontWeight: '600' },
  msgBtn: { borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  msgBtnText: { color: colors.white, fontSize: fonts.sm, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fonts.lg, color: colors.textSecondary, fontWeight: '600' },
  emptySub: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
});
