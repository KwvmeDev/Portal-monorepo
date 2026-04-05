import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.wordmark}>PORTAL</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#010101',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: '#F5F5F3',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
})
