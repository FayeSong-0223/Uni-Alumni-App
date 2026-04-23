import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { getConversation, sendMessage } from '../api/messaging';
import { colors, fonts, spacing, radius } from '../theme';
import { FadeIn, PressableScale, ContentWrapper } from '../components/AnimatedComponents';

export default function ConversationScreen({ route }) {
  const { alumniId } = route.params;
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => { loadMessages(); }, [alumniId]);

  const loadMessages = async () => {
    try {
      const { data } = await getConversation(alumniId);
      const msgs = data.results || data;
      setMessages([...msgs].reverse());
    } catch {
      toast.error('Failed to load conversation.');
    }
  };

  const handleSend = async () => {
    if (!body.trim()) { toast.warn('Please type a message.'); return; }
    setSending(true);
    try {
      await sendMessage(alumniId, body.trim());
      setBody('');
      toast.success('Message sent!');
      await loadMessages();
    } catch (err) {
      const data = err.response?.data;
      const msg = data ? Object.values(data).flat().join(' ') : 'Failed to send.';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item, index }) => {
    const isMine = item.sender.alumni_id === user?.alumni_id;
    const prevItem = index > 0 ? messages[index - 1] : null;
    const nextItem = index < messages.length - 1 ? messages[index + 1] : null;
    const sameSenderAsPrev = prevItem && prevItem.sender.alumni_id === item.sender.alumni_id;
    const sameSenderAsNext = nextItem && nextItem.sender.alumni_id === item.sender.alumni_id;
    const isLastInGroup = !sameSenderAsNext;

    // Tighter spacing within a group, normal spacing between groups
    const rowStyle = { marginBottom: sameSenderAsNext ? 2 : spacing.md };

    // Adjust bubble corners for grouped messages (WhatsApp-style)
    const groupedCorners = isMine
      ? {
          borderTopRightRadius: sameSenderAsPrev ? 4 : radius.lg,
          borderBottomRightRadius: sameSenderAsNext ? 4 : 4,
          borderTopLeftRadius: radius.lg,
          borderBottomLeftRadius: radius.lg,
        }
      : {
          borderTopLeftRadius: sameSenderAsPrev ? 4 : radius.lg,
          borderBottomLeftRadius: sameSenderAsNext ? 4 : 4,
          borderTopRightRadius: radius.lg,
          borderBottomRightRadius: radius.lg,
        };

    return (
      <FadeIn delay={index * 40} duration={250}>
        <View style={[styles.bubbleRow, isMine ? styles.myRow : styles.theirRow, rowStyle]}>
          {isMine ? (
            <LinearGradient
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, groupedCorners]}
            >
              <Text style={[styles.bubbleBody, styles.myBodyText]}>{item.body}</Text>
              {isLastInGroup && (
                <Text style={[styles.bubbleTime, styles.myTimeText]}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              )}
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.theirBubble, groupedCorners]}>
              <Text style={styles.bubbleBody}>{item.body}</Text>
              {isLastInGroup && (
                <Text style={styles.bubbleTime}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              )}
            </View>
          )}
        </View>
      </FadeIn>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👋</Text>
            <Text style={styles.emptyTitle}>Start the conversation!</Text>
            <Text style={styles.emptySub}>Send a message below</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <ContentWrapper>
          <View style={styles.messageRow}>
            <View style={styles.messageWrap}>
              <TextInput
                style={styles.messageInput}
                placeholder="Type a message..."
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={setBody}
                multiline
              />
            </View>
            <PressableScale onPress={handleSend} disabled={sending}>
              <LinearGradient
                colors={sending ? [colors.textMuted, colors.textMuted] : colors.gradientPrimary}
                style={styles.sendBtn}
              >
                <Text style={styles.sendText}>↑</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        </ContentWrapper>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },

  bubbleRow: {},
  myRow: { alignItems: 'flex-end' },
  theirRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, padding: 14 },
  theirBubble: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleBody: { fontSize: fonts.md, color: colors.textPrimary, lineHeight: 22 },
  myBodyText: { color: colors.white },
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'right' },
  myTimeText: { color: 'rgba(255,255,255,0.4)' },

  inputBar: {
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.md,
  },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  messageWrap: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  messageInput: { padding: 12, fontSize: fonts.md, maxHeight: 80, color: colors.textPrimary },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: colors.white, fontSize: 20, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 100 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fonts.lg, color: colors.textSecondary, fontWeight: '600' },
  emptySub: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 4 },
});
