import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getInbox, getSentMessages } from '../api/messaging';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing, radius, useResponsive } from '../theme';
import {
  StaggerItem,
  PressableScale,
  GlowCard,
  GradientAvatar,
} from '../components/AnimatedComponents';

export default function InboxScreen({ navigation }) {
  const toast = useToast();
  const { isDesktop, isTablet, contentWidth } = useResponsive();
  const isWide = isDesktop || isTablet;
  const [tab, setTab] = useState('inbox');
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inboxRes, sentRes] = await Promise.all([getInbox(), getSentMessages()]);
      setInbox(inboxRes.data.results || inboxRes.data);
      setSent(sentRes.data.results || sentRes.data);
    } catch {
      toast.error('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const renderMessage = ({ item, index }) => {
    const other = tab === 'inbox' ? item.sender : item.recipient;
    const isUnread = tab === 'inbox' && !item.is_read;

    return (
      <StaggerItem index={index}>
        <GlowCard
          style={[styles.card, isUnread && styles.unreadCard]}
          onPress={() => navigation.navigate('Conversation', {
            alumniId: other.alumni_id,
            name: other.name,
          })}
        >
          <View style={styles.cardRow}>
            <GradientAvatar name={other.name} size={48} />
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardName, isUnread && styles.unreadName]} numberOfLines={1}>
                  {other.name}
                </Text>
                <Text style={styles.cardTime}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.cardSubject, isUnread && styles.unreadSubject]} numberOfLines={1}>
                {item.subject}
              </Text>
              <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
            </View>
            {isUnread && <View style={styles.unreadDot} />}
          </View>
        </GlowCard>
      </StaggerItem>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.tabBar, isWide && { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}>
        {[
          { key: 'inbox', label: 'Inbox', count: inbox.filter(m => !m.is_read).length },
          { key: 'sent', label: 'Sent', count: 0 },
        ].map(t => (
          <PressableScale key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1 }}>
            <View style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabActiveText]}>
                {t.label}
              </Text>
              {t.count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{t.count}</Text>
                </View>
              )}
            </View>
          </PressableScale>
        ))}
      </View>

      <FlatList
        data={tab === 'inbox' ? inbox : sent}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Loading...' : 'No messages yet'}
            </Text>
            <Text style={styles.emptySub}>
              {tab === 'inbox'
                ? 'Messages from your connections will appear here'
                : 'Messages you send will appear here'}
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
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadBadgeText: { fontSize: 11, color: colors.white, fontWeight: '700' },

  list: {
    padding: spacing.lg,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },

  card: { marginBottom: spacing.sm },
  unreadCard: { borderColor: 'rgba(108,92,231,0.3)' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardContent: { flex: 1, marginLeft: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: fonts.md, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  unreadName: { fontWeight: '700', color: colors.textPrimary },
  cardTime: { fontSize: fonts.xs, color: colors.textMuted, marginLeft: spacing.sm },
  cardSubject: { fontSize: fonts.sm, color: colors.textSecondary, marginTop: 3 },
  unreadSubject: { fontWeight: '600', color: colors.primaryLight },
  cardBody: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
  },

  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fonts.lg, color: colors.textSecondary, fontWeight: '600' },
  emptySub: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
});
