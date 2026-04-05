import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useAuthStore } from '../../stores/authStore'
import { useDrawer } from '../../i18n/DrawerContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { colors, typography, spacing } from '../../theme/tokens'

const DRAWER_WIDTH = Dimensions.get('window').width * 0.75

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNav = ReturnType<typeof useNavigation<any>>

export function SideDrawer() {
  const { isOpen, closeDrawer } = useDrawer()
  const { t, language, setLanguage } = useLanguage()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AnyNav>()

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [isOpen, translateX, backdropOpacity])

  if (!isOpen) return null

  const navigate = (screen: string) => {
    closeDrawer()
    // Cross-stack navigation to Profile tab → sub-screen
    navigation.navigate('Profile', { screen })
  }

  const handleLogout = async () => {
    closeDrawer()
    await logout()
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="auto"
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeDrawer} activeOpacity={1} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Close button */}
        <TouchableOpacity onPress={closeDrawer} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X color={colors.muted} size={18} strokeWidth={2} />
        </TouchableOpacity>

        {/* User info */}
        <View style={styles.userSection}>
          <Avatar uri={user?.avatarUrl} name={user?.displayName} size="lg" />
          <Text style={styles.displayName} numberOfLines={1}>{user?.displayName ?? ''}</Text>
          <Text style={styles.username} numberOfLines={1}>@{user?.username ?? ''}</Text>
        </View>

        <View style={styles.divider} />

        {/* Nav links */}
        <TouchableOpacity style={styles.menuItem} onPress={() => { closeDrawer(); navigation.navigate('Profile') }}>
          <Text style={styles.menuItemText}>{t('profile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => navigate('Settings')}>
          <Text style={styles.menuItemText}>{t('settings')}</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Language picker */}
        <Text style={styles.languageLabel}>{t('language')}</Text>
        <View style={styles.languageRow}>
          {(
            [
              { code: 'en', label: 'English' },
              { code: 'pt', label: 'Português' },
              { code: 'am', label: 'አማርኛ' },
              { code: 'mg', label: 'Malagasy' },
            ] as const
          ).map(({ code, label }) => (
            <TouchableOpacity
              key={code}
              onPress={() => setLanguage(code)}
              style={[
                styles.langBtn,
                language === code && styles.langBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${label}`}
              accessibilityState={{ selected: language === code }}
            >
              <Text
                style={[
                  styles.langBtnText,
                  language === code && styles.langBtnTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.spacer} />

        {/* Logout */}
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Text style={[styles.menuItemText, styles.logoutText]}>{t('logout')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#111111',
    paddingHorizontal: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 16,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
  },
  userSection: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  displayName: {
    color: colors.paper,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    marginTop: spacing.sm,
  },
  username: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  menuItem: {
    paddingVertical: spacing.md,
  },
  menuItemText: {
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  logoutText: {
    color: '#FF4444',
  },
  languageLabel: {
    color: colors.muted,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  langBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBtnActive: {
    backgroundColor: colors.signal,
    borderColor: colors.signal,
  },
  langBtnText: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  langBtnTextActive: {
    color: colors.void,
  },
  spacer: {
    flex: 1,
  },
})

export default SideDrawer
