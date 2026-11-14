import { z } from 'zod'
import { firstZodError } from './common'

export type SupabaseConnectFormInput = {
  url: string
  anonKey: string
}

export type SupabaseConnectFormParsed = {
  url: string
  anonKey: string
}

export const supabaseConnectFormSchema = z
  .object({
    url: z.string().trim().min(1, 'Enter Supabase URL and anon key'),
    anonKey: z.string().trim().min(1, 'Enter Supabase URL and anon key'),
  })
  .superRefine((val, ctx) => {
    const url = val.url.replace(/\/+$/, '')
    const apiHostOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)
    if (!apiHostOk || url.includes('supabase.com/dashboard')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'Use Project URL like https://xxxx.supabase.co (not the dashboard link)',
      })
    }
    if (!val.anonKey.startsWith('eyJ') && !val.anonKey.startsWith('sb_publishable_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anonKey'],
        message: 'Anon key looks wrong — paste the anon/public key',
      })
    }
  })

export function parseSupabaseConnectForm(
  input: SupabaseConnectFormInput,
): { ok: true; data: SupabaseConnectFormParsed } | { ok: false; error: string } {
  const result = supabaseConnectFormSchema.safeParse({
    url: input.url,
    anonKey: input.anonKey,
  })
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check Supabase credentials') }
  }
  return {
    ok: true,
    data: {
      url: result.data.url.replace(/\/+$/, ''),
      anonKey: result.data.anonKey,
    },
  }
}
