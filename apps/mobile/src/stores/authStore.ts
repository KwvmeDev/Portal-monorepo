import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../services/api'
import type { User } from '@portal/types'

// AsyncStorage keys — must match the keys used in api.ts
export const ACCESS_TOKEN_KEY = '@portal/accessToken'
export const REFRESH_TOKEN_KEY = '@portal/refreshToken'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  /** False during the university/org onboarding steps after first registration. */
  onboardingComplete: boolean
  isLoading: boolean
}

interface AuthActions {
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>
  setUser: (user: User) => void
  /** Called when the user finishes (or skips) the SelectOrgs onboarding step. */
  completeOnboarding: () => void
  logout: () => Promise<void>
  hydrate: () => Promise<void>
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  onboardingComplete: false,
  isLoading: true,
}

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  ...initialState,

  // Persist both tokens to AsyncStorage and update in-memory state.
  // isAuthenticated is set to true here so callers don't need a separate step.
  setTokens: async (accessToken, refreshToken) => {
    await AsyncStorage.multiSet([
      [ACCESS_TOKEN_KEY, accessToken],
      [REFRESH_TOKEN_KEY, refreshToken],
    ])
    set({ accessToken, refreshToken, isAuthenticated: true })
  },

  // Store the resolved user profile and mark the session as authenticated.
  setUser: (user) => set({ user, isAuthenticated: true }),

  completeOnboarding: () => set({ onboardingComplete: true }),

  // Fire-and-forget the server logout, then wipe local storage and reset state
  // regardless of whether the server call succeeded.
  logout: async () => {
    try {
      // api.ts prepends /api, so the effective URL is DELETE /api/auth/logout
      await api.del('/auth/logout')
    } catch {
      // Ignore logout errors — local state must be cleared unconditionally
    }
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY])
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  // Called once at app start (see RootNavigator). Reads tokens directly from
  // AsyncStorage (not from Zustand state) to avoid persist-middleware timing
  // issues. Sets isLoading=false when done, which unblocks RootNavigator.
  hydrate: async () => {
    set({ isLoading: true })

    const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY)

    if (!accessToken) {
      // No stored session — show auth flow immediately
      set({ isLoading: false })
      return
    }

    // Also restore refreshToken so api.ts can read it during the /me call if
    // a refresh is needed (edge case: access token expired on first load).
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY)
    set({ accessToken, refreshToken: refreshToken ?? null })

    try {
      // api.ts reads the token from AsyncStorage directly, so it will attach
      // the correct Authorization header without any extra work here.
      // The endpoint returns { user: User } — extract the nested object.
      const { user } = await api.get<{ user: User }>('/users/me')
      // Returning users have already completed onboarding
      set({ user, isAuthenticated: true, onboardingComplete: true, isLoading: false })
    } catch {
      // Token invalid or network error — clear everything and show auth flow
      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY])
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },
}))
