import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// These keys must stay in sync with authStore.ts constants
const ACCESS_TOKEN_KEY = '@portal/accessToken'
const REFRESH_TOKEN_KEY = '@portal/refreshToken'

// Shape of errors thrown by the request function.
// Callers can inspect .statusCode and .code to handle specific cases.
export interface ApiError {
  statusCode: number
  code: string
  message: string
}

// Core request function. Reads the access token from AsyncStorage on every
// call so it always reflects the most up-to-date value (e.g. after a refresh).
//
// retry=true means: on a 401, attempt a token refresh and replay the request
// exactly once (retry=false). This prevents infinite refresh loops.
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const url = `${BASE_URL}/api${path}`
  console.log(`[api] ${method} ${url}`)
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // --- 401 handling with single refresh retry ---
  if (response.status === 401 && retry) {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY)

    if (refreshToken) {
      const refreshResponse = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (refreshResponse.ok) {
        // Server returns new token pair — persist them and retry the original request
        const refreshData = await refreshResponse.json()
        const newAccess: string = refreshData.data?.accessToken ?? refreshData.accessToken
        const newRefresh: string = refreshData.data?.refreshToken ?? refreshData.refreshToken
        await AsyncStorage.multiSet([
          [ACCESS_TOKEN_KEY, newAccess],
          [REFRESH_TOKEN_KEY, newRefresh],
        ])
        // Retry with retry=false to prevent a second refresh attempt
        return request<T>(method, path, body, false)
      }
    }

    // Refresh failed or no refresh token available — log the user out.
    // Import is deferred here (lazy) to avoid the circular dependency that
    // would occur if authStore imported api and api imported authStore at
    // module evaluation time.
    const { useAuthStore } = await import('../stores/authStore')
    await useAuthStore.getState().logout()

    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Session expired. Please log in again.',
    } satisfies ApiError
  }

  // --- Generic error handling for non-2xx responses ---
  if (!response.ok) {
    let data: { code?: string; message?: string } = {}
    try {
      data = await response.json()
    } catch {
      // Ignore JSON parse failures — use fallback values below
    }
    throw {
      statusCode: response.status,
      code: data.code ?? 'error',
      message: data.message ?? 'Request failed',
    } satisfies ApiError
  }

  // 204 No Content — nothing to parse
  if (response.status === 204) {
    return undefined as unknown as T
  }

  // All successful responses are expected to be wrapped in { data: T }
  const json = await response.json()
  return (json.data ?? json) as T
}

// Convenience wrappers matching the method names callers expect.
// `del` is used instead of `delete` because delete is a reserved keyword.
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
