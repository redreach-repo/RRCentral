import { supabase } from './supabase'

export async function logActivity(
  action: string,
  entity: string,
  reference: string,
  details: string,
  userEmail: string,
): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    action,
    entity,
    reference: reference || '',
    details: details || '',
    user_email: userEmail || '',
  })

  if (error) {
    console.error('Failed to log activity:', error.message)
  }
}
