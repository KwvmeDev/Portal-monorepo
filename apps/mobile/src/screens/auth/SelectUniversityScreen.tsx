import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'
import { useTheme } from '../../theme/useTheme'
import { colors, spacing, typography, radius } from '../../theme/tokens'
import { Button } from '../../components/ui/Button'
import { api } from '../../services/api'
import type { University } from '@portal/types'

type Props = StackScreenProps<AuthStackParamList, 'SelectUniversity'>

export function SelectUniversityScreen({ navigation }: Props) {
  const { theme } = useTheme()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<University[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customUniversity, setCustomUniversity] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchUniversities = useCallback(async (searchQuery: string) => {
    setIsSearching(true)
    try {
      const fetched = await api.get<University[]>(
        `/users/universities?search=${encodeURIComponent(searchQuery)}&limit=20`,
      )
      setResults(fetched)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceTimer.current = setTimeout(() => fetchUniversities(query), 400)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, fetchUniversities])

  function handleSelectUniversity(id: string) {
    setSelectedId((prev) => (prev === id ? null : id))
    setShowCustomInput(false)
    setCustomUniversity('')
  }

  function handleCustomToggle() {
    setShowCustomInput((prev) => !prev)
    setSelectedId(null)
  }

  function handleSkip() {
    navigation.navigate('SelectOrgs')
  }

  async function handleContinue() {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      if (selectedId) {
        await api.patch('/users/me', { universityId: selectedId }).catch(() => {})
      }
    } finally {
      setIsSubmitting(false)
      navigation.navigate('SelectOrgs')
    }
  }

  const canContinue = selectedId !== null || (showCustomInput && customUniversity.trim().length > 0)

  const renderItem = ({ item }: { item: University }) => {
    const isSelected = selectedId === item.id
    return (
      <TouchableOpacity
        onPress={() => handleSelectUniversity(item.id)}
        activeOpacity={0.7}
        style={[
          styles.listItem,
          {
            backgroundColor: isSelected ? `${colors.signal}1A` : theme.surface,
            borderColor: isSelected ? colors.signal : theme.border,
          },
        ]}
        accessibilityLabel={`${item.name}, ${item.city}, ${item.country}`}
        accessibilityState={{ selected: isSelected }}
      >
        <Text style={[styles.universityName, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.universityLocation, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.city}, {item.country}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Find your university</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Connect with students at your institution
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.searchIconSlot}>
            {isSearching ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Text style={{ fontSize: 16 }}>🔍</Text>
            )}
          </View>
          <TextInput
            autoFocus
            placeholder="Search universities..."
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchTextInput, { color: theme.textPrimary }]}
          />
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.trim() && !isSearching ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No universities found for "{query}"
            </Text>
          ) : null
        }
        ListFooterComponent={
          <View>
            <TouchableOpacity
              onPress={handleCustomToggle}
              style={[
                styles.customToggle,
                {
                  borderColor: showCustomInput ? colors.signal : theme.border,
                  backgroundColor: showCustomInput ? `${colors.signal}1A` : 'transparent',
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.customToggleText, { color: showCustomInput ? colors.signal : theme.textSecondary }]}>
                My university isn't listed
              </Text>
            </TouchableOpacity>

            {showCustomInput && (
              <View style={styles.customInputWrapper}>
                <TextInput
                  placeholder="Enter your university name"
                  placeholderTextColor={theme.textMuted}
                  value={customUniversity}
                  onChangeText={setCustomUniversity}
                  autoFocus
                  style={[
                    styles.customTextInput,
                    {
                      color: theme.textPrimary,
                      backgroundColor: theme.surface,
                      borderColor: customUniversity.trim() ? colors.signal : theme.border,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        }
      />

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button variant="ghost" size="md" onPress={handleSkip} style={styles.skipButton}>
          Skip
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canContinue || isSubmitting}
          loading={isSubmitting}
          onPress={handleContinue}
          style={styles.continueButton}
        >
          Continue
        </Button>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  title: { fontSize: 24, fontFamily: typography.fontFamily.bold, marginBottom: spacing.xs },
  subtitle: { fontSize: 15, fontFamily: typography.fontFamily.regular },
  searchContainer: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  searchIconSlot: { paddingLeft: 14, justifyContent: 'center', alignItems: 'center' },
  searchTextInput: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  listItem: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  universityName: { fontSize: 15, fontFamily: typography.fontFamily.semiBold, marginBottom: 2 },
  universityLocation: { fontSize: 13, fontFamily: typography.fontFamily.regular },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: typography.fontFamily.regular,
    paddingVertical: spacing.xl,
  },
  customToggle: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  customToggleText: { fontSize: 14, fontFamily: typography.fontFamily.medium },
  customInputWrapper: { marginTop: spacing.md },
  customTextInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: typography.fontFamily.regular,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  skipButton: { flex: 1 },
  continueButton: { flex: 2 },
})

export default SelectUniversityScreen
