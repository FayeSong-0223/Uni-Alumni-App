import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Platform, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import UserDetailScreen from '../screens/UserDetailScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import InboxScreen from '../screens/InboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import TwoFactorScreen from '../screens/TwoFactorScreen';
import TwoFactorSetupScreen from '../screens/TwoFactorSetupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ActivitiesScreen from '../screens/ActivitiesScreen';
import ActivityDetailScreen from '../screens/ActivityDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const headerStyle = {
  headerStyle: { backgroundColor: colors.bgSurface },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: '600', fontSize: fonts.lg },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

function SearchStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="SearchList" component={SearchScreen} options={{ title: 'Discover Alumni' }} />
      <Stack.Screen
        name="UserDetail"
        component={UserDetailScreen}
        options={({ route }) => ({ title: route.params?.name || 'Alumni Profile' })}
      />
    </Stack.Navigator>
  );
}

function MessagingStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="InboxList" component={InboxScreen} options={{ title: 'Messages' }} />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({
          title: route.params?.name || 'Conversation',
          // Default native-stack back (goBack) — pops to whichever screen
          // pushed Conversation in this stack (InboxList here).
        })}
      />
    </Stack.Navigator>
  );
}

function ConnectionsStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="ConnectionsList" component={ConnectionsScreen} options={{ title: 'Connections' }} />
      <Stack.Screen
        name="UserDetail"
        component={UserDetailScreen}
        options={({ route }) => ({ title: route.params?.name || 'Alumni Profile' })}
      />
      {/*
        Conversation is registered here too so that tapping "Message" on a
        Connected card pushes the chat onto the CURRENT (Connect) stack.
        This way the back button goes back to the Connected list — matching
        standard stack navigation behaviour — instead of jumping to the
        Messages tab and stranding the user there.
      */}
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({ title: route.params?.name || 'Conversation' })}
      />
    </Stack.Navigator>
  );
}

function ActivitiesStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="ActivitiesList" component={ActivitiesScreen} options={{ title: 'Activities' }} />
      <Stack.Screen
        name="ActivityDetail"
        component={ActivityDetailScreen}
        options={({ route }) => ({ title: route.params?.title || 'Activity Details' })}
      />
      <Stack.Screen
        name="UserDetail"
        component={UserDetailScreen}
        options={({ route }) => ({ title: route.params?.name || 'Alumni Profile' })}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="TwoFactorSetup" component={TwoFactorSetupScreen} options={{ title: '2FA Setup' }} />
    </Stack.Navigator>
  );
}

const TAB_ICONS = { Search: '🔍', Activities: '🎉', Connect: '🤝', Messages: '💬', Profile: '👤' };

function MainTabs() {
  return (
    <Tab.Navigator
      // Activities is the post-login landing screen and the leftmost tab.
      initialRouteName="Activities"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
            {TAB_ICONS[route.name] || ''}
          </Text>
        ),
        tabBarLabel: route.name,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabelStyle,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      {/* Order matters — this is the bottom-nav order, left → right */}
      <Tab.Screen name="Activities" component={ActivitiesStack} />
      <Tab.Screen name="Search" component={SearchStack} />
      <Tab.Screen name="Connect" component={ConnectionsStack} />
      <Tab.Screen name="Messages" component={MessagingStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return user ? <MainTabs /> : <AuthStack />;
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgSurface,
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    height: Platform.OS === 'web' ? 60 : 85,
    paddingBottom: Platform.OS === 'web' ? 4 : 20,
    paddingTop: 6,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  tabLabelStyle: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 0,
    includeFontPadding: false,
  },
});
