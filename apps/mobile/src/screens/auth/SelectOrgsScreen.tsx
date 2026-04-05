import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import { useAuthStore } from '../../stores/authStore'
import type { OrgSummary } from '@portal/types'

type Props = StackScreenProps<AuthStackParamList, 'SelectOrgs'>

export function SelectOrgsScreen({ navigation: _navigation }: Props) {
  const { theme } = useTheme()
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)

  const [orgs, setOrgs] = useState<OrgSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch global (umbrella) orgs — no universityId filter
  const fetchGlobalOrgs = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.get<{ orgs: OrgSummary[] }>('/orgs?global=true&limit=50')
      setOrgs(data.orgs)
    } catch {
      setOrgs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGlobalOrgs()
  }, [fetchGlobalOrgs])

  function toggleOrg(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSkip() {
    completeOnboarding()
  }

  async function handleContinue() {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await Promise.allSettled(
        Array.from(selectedIds).map((id) => api.post(`/orgs/${id}/join`, {})),
      )
    } finally {
      setIsSubmitting(false)
      completeOnboarding()
    }
  }

  const renderItem = ({ item }: { item: OrgSummary }) => {
    const isSelected = selectedIds.has(item.id)
    return (
      <TouchableOpacity
        onPress={() => toggleOrg(item.id)}
        activeOpacity={0.7}
        style={[
          styles.listItem,
          {
            backgroundColor: isSelected ? `${colors.signal}1A` : theme.surface,
            borderColor: isSelected ? colors.signal : theme.border,
          },
        ]}
        accessibilityLabel={item.name}
        accessibilityState={{ selected: isSelected }}
      >
        <View style={styles.itemMain}>
          <Text style={[styles.orgName, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.orgMeta, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.memberCount} member{item.memberCount !== 1 ? 's' : ''} · Joining adds you to your campus chapter
          </Text>
        </View>
        <View
          style={[
            styles.checkCircle,
            {
              backgroundColor: isSelected ? colors.signal : 'transparent',
              borderColor: isSelected ? colors.signal : theme.border,
            },
          ]}
        >
          {isSelected && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Join organisations</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Joining a global org automatically adds you to your campus chapter
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.signal} />
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No organisations available
            </Text>
          }
        />
      )}

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {selectedIds.size > 0 && (
          <Text style={[styles.selectionCount, { color: theme.textSecondary }]}>
            {selectedIds.size} selected
          </Text>
        )}
        <View style={styles.footerButtons}>
          <Button variant="ghost" size="md" onPress={handleSkip} style={styles.skipButton}>
            Skip
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={selectedIds.size === 0 || isSubmitting}
            loading={isSubmitting}
            onPress={handleContinue}
            style={styles.continueButton}
          >
            Join & Continue
          </Button>
        </View>
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
  subtitle: { fontSize: 15, fontFamily: typography.fontFamily.regular, lineHeight: 21 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  itemMain: { flex: 1, marginRight: spacing.md },
  orgName: { fontSize: 15, fontFamily: typography.fontFamily.semiBold, marginBottom: 3 },
  orgMeta: { fontSize: 13, fontFamily: typography.fontFamily.regular, lineHeight: 18 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 12, color: '#010101', fontFamily: typography.fontFamily.semiBold },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: typography.fontFamily.regular,
    paddingVertical: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectionCount: {
    fontSize: 13,
    fontFamily: typography.fontFamily.regular,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  footerButtons: { flexDirection: 'row', gap: spacing.md },
  skipButton: { flex: 1 },
  continueButton: { flex: 2 },
})

export default SelectOrgsScreen
