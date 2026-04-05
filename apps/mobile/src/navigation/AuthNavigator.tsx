import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { WelcomeScreen } from '../screens/auth/WelcomeScreen'
import { RegisterScreen } from '../screens/auth/RegisterScreen'
import { VerifyOtpScreen } from '../screens/auth/VerifyOtpScreen'
import { CreateProfileScreen } from '../screens/auth/CreateProfileScreen'
import { SelectUniversityScreen } from '../screens/auth/SelectUniversityScreen'
import { SelectOrgsScreen } from '../screens/auth/SelectOrgsScreen'
import { LoginScreen } from '../screens/auth/LoginScreen'
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen'
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen'

export type AuthStackParamList = {
  Welcome: undefined
  Register: undefined
  VerifyOtp: { email: string }
  CreateProfile: { email: string; otp: string }
  SelectUniversity: undefined
  SelectOrgs: undefined
  Login: undefined
  ForgotPassword: undefined
  ResetPassword: { email: string }
}

const Stack = createStackNavigator<AuthStackParamList>()

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#010101' },
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
      <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
      <Stack.Screen name="SelectUniversity" component={SelectUniversityScreen} />
      <Stack.Screen name="SelectOrgs" component={SelectOrgsScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  )
}
