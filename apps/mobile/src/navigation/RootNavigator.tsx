import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { useAuthStore } from '../stores/authStore'
import { AuthNavigator } from './AuthNavigator'
import { AppNavigator } from './AppNavigator'
import { SplashScreen } from '../screens/SplashScreen'

export function RootNavigator() {
  const { isAuthenticated, onboardingComplete, isLoading, hydrate } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (isLoading) {
    return <SplashScreen />
  }

  return (
    <NavigationContainer>
      {isAuthenticated && onboardingComplete ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
