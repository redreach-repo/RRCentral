/** True when the app should use seed/mock data instead of Supabase. */
export function useMockData(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== 'false') return true
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return true
  return false
}
