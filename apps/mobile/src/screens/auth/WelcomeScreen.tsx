import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { Button } from '../../components/ui/Button'
import { colors, typography, spacing } from '../../theme/tokens'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'

type Props = StackScreenProps<AuthStackParamList, 'Welcome'>

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Wordmark section — takes up the upper portion of the screen */}
      <View style={styles.wordmarkSection}>
        <Text style={styles.wordmark}>PORTAL</Text>
        <Text style={styles.tagline}>Built for the culture.</Text>
      </View>

      {/* CTA buttons stacked in the lower portion */}
      <View style={styles.buttonSection}>
        <Button
          variant="primary"
          size="lg"
          style={styles.buttonFull}
          onPress={() => navigation.navigate('Register')}
        >
          Create account
        </Button>
        <Button
          variant="ghost"
          size="lg"
          style={styles.buttonFull}
          onPress={() => navigation.navigate('Login')}
        >
          Sign in
        </Button>
      </View>

      {/* Legal disclaimer anchored to the bottom */}
      <View style={styles.legalContainer}>
        <Text style={styles.legalText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.void,
    paddingHorizontal: spacing.xxl,
  },
  wordmarkSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: typography.fontFamily.black,
    fontSize: 48,
    color: '#F5F5F3',
    textAlign: 'center',
    letterSpacing: 4,
  },
  tagline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  buttonSection: {
    gap: 12,
    paddingBottom: spacing.xxl,
  },
  buttonFull: {
    width: '100%',
  },
  legalContainer: {
    paddingBottom: 32,
    alignItems: 'center',
  },
  legalText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
})
