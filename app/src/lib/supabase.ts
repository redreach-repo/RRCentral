import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

export { isSupabaseConfigured }
export const supabase = getSupabaseClient()
