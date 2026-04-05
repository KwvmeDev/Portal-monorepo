/**
 * registerPushToken — requests push notification permissions, obtains an
 * Expo push token, and registers it with the Portal server.
 *
 * Called once after the user authenticates. All failures are intentionally
 * swallowed by the caller (push is non-critical UX).
 */
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { api } from '../services/api'

export async function registerPushToken(): Promise<void> {
  // Android requires a notification channel to be created before any
  // push can be displayed. MAX importance ensures heads-up banners appear.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    })
  }

  // Request OS-level permission. Return early (no throw) if the user
  // declines — push is optional and the app must continue normally.
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  // Resolve the EAS project ID from the Expo config. Both the legacy
  // Constants.expoConfig path and the newer Constants.easConfig path are
  // checked so the function works across SDK versions and build environments.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as Record<string, unknown> & { easConfig?: { projectId?: string } }).easConfig
      ?.projectId

  const pushToken = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )

  // Send the token to the server so it can be used to dispatch targeted pushes.
  await api.post('/push-tokens', { token: pushToken.data })
}
