/**
 * AppNavigator — root navigator for authenticated users.
 *
 * Structure:
 *   AppStack (createNativeStackNavigator)
 *   ├── Tabs  — 5-tab bottom navigator (the main shell)
 *   │   ├── Home       → HomeStack  (FeedScreen → PostDetailScreen…)
 *   │   ├── Explore    → ExploreStack
 *   │   ├── Messages   → MessagesStack
 *   │   ├── Notifications → NotificationsStack
 *   │   └── Profile    → ProfileStack
 *   │   [FAB — floating compose button rendered over all tab screens]
 *   └── ComposeModal   — full-screen modal (no bottom bar)
 *
 * The ComposeModal sits OUTSIDE the tab navigator so it can be presented
 * as a true full-screen modal without the tab bar showing through.
 * The FAB lives inside TabNavigator as an absolutely-positioned overlay.
 *
 * Custom SVG icons are rendered inline using react-native-svg so no
 * third-party icon font library is required.
 */
import React, { useCallback, useEffect } from 'react'
import { TouchableOpacity, StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import type { NavigationProp } from '@react-navigation/native'
import { useNavigationState } from '@react-navigation/native'
import { Home, Compass, MessageCircle, Bell, User, Plus, PenLine } from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { colors } from '../theme/tokens'
import { useAuthStore } from '../stores/authStore'
import { registerPushToken } from '../utils/registerPushToken'
import { LanguageProvider } from '../i18n/LanguageContext'
import { DrawerProvider } from '../i18n/DrawerContext'
import { SideDrawer } from '../components/ui/SideDrawer'

// ─── Foreground notification handler (module-level) ─────────────────────────
//
// Called once at startup. Tells expo-notifications how to behave when a push
// arrives while the app is in the foreground. Must be set before any component
// mounts — placing it at module level satisfies that requirement.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// ─── Screen imports ─────────────────────────────────────────────────────────
import { FeedScreen } from '../screens/home/FeedScreen'
import { PostDetailScreen } from '../screens/home/PostDetailScreen'
import { ExploreScreen } from '../screens/explore/ExploreScreen'
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { EditProfileScreen } from '../screens/profile/EditProfileScreen'
import { SettingsScreen } from '../screens/settings/SettingsScreen'
import { AdminScreen } from '../screens/admin/AdminScreen'
import { ComposeScreen } from '../screens/compose/ComposeScreen'
import { OrgProfileScreen } from '../screens/orgs/OrgProfileScreen'
import { MessagesScreen } from '../screens/messages/MessagesScreen'
import { ConversationScreen } from '../screens/messages/ConversationScreen'
import type { MessagesStackParamList } from '../screens/messages/MessagesScreen'

// ─── Param-list types ────────────────────────────────────────────────────────

export type AppStackParamList = {
  /** Hosts the bottom tab bar */
  Tabs: undefined
  /** Full-screen compose modal — no bottom tab bar */
  ComposeModal: undefined
}

export type AppTabParamList = {
  Home: undefined
  Explore: undefined
  Messages: undefined
  Notifications: undefined
  Profile: undefined
}

// Individual stack param lists for each tab
export type HomeStackParamList = {
  Feed: undefined
  PostDetail: { postId: string }
}
export type ExploreStackParamList = {
  ExploreRoot: undefined
  OrgProfile: { orgId: string }
  UserProfile: { userId: string }
}
export type NotificationsStackParamList = { NotificationsRoot: undefined }
export type ProfileStackParamList = {
  /** userId is optional; omit for own profile, pass it to view another user's profile.
   *  displayName is used for the Message button navigation (ConversationScreen title). */
  ProfileRoot: { userId?: string; displayName?: string } | undefined
  /** Edit the authenticated user's own profile (display name, bio, avatar). */
  EditProfile: undefined
  /** App settings: change password, push notification preference, delete account. */
  Settings: undefined
  /** Moderation queue — accessible only when user.role === 'super_admin'. */
  Admin: undefined
}
// MessagesStackParamList is defined in MessagesScreen and re-exported from there

// ─── Stack navigators (one per real tab) ────────────────────────────────────

const HomeStack = createStackNavigator<HomeStackParamList>()
const ExploreStack = createStackNavigator<ExploreStackParamList>()
const NotificationsStack = createStackNavigator<NotificationsStackParamList>()
const ProfileStack = createStackNavigator<ProfileStackParamList>()
const MessagesStack = createStackNavigator<MessagesStackParamList>()

/** Stack for the Home tab — FeedScreen at root, PostDetailScreen nested. */
function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Feed" component={FeedScreen} />
      <HomeStack.Screen name="PostDetail" component={PostDetailScreen} />
    </HomeStack.Navigator>
  )
}

/** Stack for the Explore tab — includes OrgProfile and UserProfile as nested screens. */
function ExploreNavigator() {
  return (
    <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
      <ExploreStack.Screen name="ExploreRoot" component={ExploreScreen} />
      <ExploreStack.Screen name="OrgProfile" component={OrgProfileScreen} />
      <ExploreStack.Screen name="UserProfile" component={ProfileScreen} />
    </ExploreStack.Navigator>
  )
}

/** Stack for the Notifications tab. */
function NotificationsNavigator() {
  return (
    <NotificationsStack.Navigator screenOptions={{ headerShown: false }}>
      <NotificationsStack.Screen name="NotificationsRoot" component={NotificationsScreen} />
    </NotificationsStack.Navigator>
  )
}

/** Stack for the Profile tab. */
function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileRoot" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      {/* Admin is a hidden route — only reachable from SettingsScreen for super_admin users */}
      <ProfileStack.Screen name="Admin" component={AdminScreen} />
    </ProfileStack.Navigator>
  )
}

/**
 * Stack for the Messages tab.
 * Root is MessagesList (the conversation list); Conversation is pushed on row press.
 *
 * ConversationScreen opts into the native stack header so the other user's
 * display name appears as the title — set via navigation.setOptions inside
 * the screen itself.
 */
function MessagesNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerShown: false,
        // Dark header to match the app's void background
        headerStyle: { backgroundColor: colors.void },
        headerTintColor: colors.paper,
        headerTitleStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 16,
        },
        headerBackTitle: '',
      }}
    >
      {/* Conversation list — no header (MessagesScreen renders its own title) */}
      <MessagesStack.Screen name="MessagesList" component={MessagesScreen} />
      {/* Individual DM thread — native header shows otherDisplayName as title */}
      <MessagesStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ headerShown: true }}
      />
    </MessagesStack.Navigator>
  )
}


// ─── Bottom tab navigator ────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<AppTabParamList>()

/**
 * The five-tab bottom shell with a floating compose button (FAB).
 *
 * `navigation` is the parent AppStack navigator so the FAB can push
 * ComposeModal above the tab bar.
 */
function TabNavigator({ navigation }: { navigation: NavigationProp<AppStackParamList> }) {
  const openCompose = useCallback(
    () => navigation.navigate('ComposeModal'),
    [navigation],
  )

  // Traverse the nav state to get both the active tab name and the active
  // nested screen name within that tab's stack.
  // Traversal: AppStack state → Tabs route → Tab state → active tab → Stack state → active screen
  const { activeTab, activeScreen } = useNavigationState((state) => {
    const tabState = state?.routes?.[state.index]?.state          // Tab navigator state
    if (!tabState?.routes) return { activeTab: null, activeScreen: null }
    const activeTabRoute = tabState.routes[tabState.index ?? 0]   // e.g. { name: 'Messages', state: ... }
    const tabName = activeTabRoute?.name ?? null
    const stackState = activeTabRoute?.state                       // e.g. Messages stack state
    if (!stackState?.routes) return { activeTab: tabName, activeScreen: null }
    const screenName = stackState.routes[(stackState.index as number) ?? 0]?.name ?? null
    return { activeTab: tabName, activeScreen: screenName }
  })

  // FAB is hidden on the entire Explore tab, and on PostDetail/Conversation
  // detail screens in any other tab.
  const showFab =
    activeTab !== 'Explore' &&
    activeScreen !== 'PostDetail' &&
    activeScreen !== 'Conversation'

  // When on the Messages tab at the root MessagesList screen, the FAB becomes
  // a compose/search shortcut (PenLine icon) that focuses the search input.
  const isMessagesRoot = activeTab === 'Messages' && activeScreen === 'MessagesList'

  const handleFabPress = useCallback(() => {
    if (isMessagesRoot) {
      // Navigate to MessagesList with focusSearch param so MessagesScreen
      // can imperatively focus the search TextInput via a ref.
      navigation.navigate('Tabs')
      // Use the Messages stack navigation directly via the tab navigator.
      // Passing params through Tab.navigate is not supported for nested stacks,
      // so we navigate to the Tabs screen and rely on MessagesScreen reading
      // route.params.focusSearch after the navigation settles.
      // The cleanest approach here is to navigate to the nested screen directly.
      ;(navigation as any).navigate('Messages', {
        screen: 'MessagesList',
        params: { focusSearch: true },
      })
      return
    }
    openCompose()
  }, [isMessagesRoot, navigation, openCompose])

  return (
    <View style={styles.tabContainer}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.signal,
          tabBarInactiveTintColor: colors.muted,
          tabBarShowLabel: false,
        }}
      >
        {/* ── Home ── */}
        <Tab.Screen
          name="Home"
          component={HomeNavigator}
          options={{ tabBarIcon: ({ color }) => <Home color={color} size={24} strokeWidth={1.75} /> }}
        />
        <Tab.Screen
          name="Explore"
          component={ExploreNavigator}
          options={{ tabBarIcon: ({ color }) => <Compass color={color} size={24} strokeWidth={1.75} /> }}
        />
        <Tab.Screen
          name="Messages"
          component={MessagesNavigator}
          options={{ tabBarIcon: ({ color }) => <MessageCircle color={color} size={24} strokeWidth={1.75} /> }}
        />
        <Tab.Screen
          name="Notifications"
          component={NotificationsNavigator}
          options={{ tabBarIcon: ({ color }) => <Bell color={color} size={24} strokeWidth={1.75} /> }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileNavigator}
          options={{ tabBarIcon: ({ color }) => <User color={color} size={24} strokeWidth={1.75} /> }}
        />
      </Tab.Navigator>

      {/* ── Floating compose button — hidden on Explore tab and detail screens ── */}
      {showFab && (
        <TouchableOpacity
          onPress={handleFabPress}
          activeOpacity={0.85}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel={isMessagesRoot ? 'New message' : 'Create post'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isMessagesRoot
            ? <PenLine color={colors.void} size={22} strokeWidth={2.25} />
            : <Plus color={colors.void} size={22} strokeWidth={2.25} />
          }
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Root app stack (tabs + compose modal) ───────────────────────────────────

const AppStack = createStackNavigator<AppStackParamList>()

/**
 * AppNavigator is the top-level navigator for authenticated sessions.
 *
 * The wrapping Stack allows ComposeModal to slide up as a full-screen modal
 * over the entire tab shell (including the tab bar) with a native card
 * presentation style.
 */
export function AppNavigator() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  // Register (or re-register) the device push token whenever the user signs in.
  // user?.id is used as the dependency so this fires on login but not on
  // unrelated re-renders. Silent failure keeps push non-critical.
  useEffect(() => {
    if (user) {
      registerPushToken().catch(() => {})
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate the notifications cache whenever a push lands while the app is
  // foregrounded. This ensures NotificationsScreen reflects new items without
  // requiring a manual pull-to-refresh. Navigation-on-tap is Sprint 10 scope.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
    return () => subscription.remove()
  }, [queryClient])

  return (
    <LanguageProvider>
      <DrawerProvider>
        <AppStack.Navigator
          screenOptions={{
            headerShown: false,
            presentation: 'modal',
            cardStyle: { backgroundColor: colors.void },
          }}
        >
          <AppStack.Screen
            name="Tabs"
            component={TabNavigator}
            options={{ presentation: 'card' }}
          />
          <AppStack.Screen
            name="ComposeModal"
            component={ComposeScreen}
            options={{ presentation: 'modal', gestureEnabled: true }}
          />
        </AppStack.Navigator>
        {/* Side drawer — absolute overlay above all tab screens */}
        <SideDrawer />
      </DrawerProvider>
    </LanguageProvider>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /** Full-size container that wraps Tab.Navigator + FAB overlay */
  tabContainer: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: '#010101',
    borderTopColor: '#2A2A2A',
    borderTopWidth: 0.5,
    height: 84,
    paddingBottom: 20,
    paddingTop: 8,
  },
  /** Floating compose button — sits above the tab bar, bottom-right */
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
})
