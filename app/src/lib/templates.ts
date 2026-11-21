/** Simple {{token}} replacement for email/WhatsApp templates. */
export function applyMessageTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key]
    if (v == null) return ''
    return String(v)
  })
}

export const DEFAULT_EMAIL_QUOTE_SUBJECT =
  '{{title}} {{ref}} — {{company}}'

export const DEFAULT_EMAIL_QUOTE_BODY = `Dear {{contact}},

Please find attached our {{titleLower}} {{ref}}.

Amount: {{amount}}{{validUntilLine}}

Best regards,
{{company}}`

export const DEFAULT_EMAIL_INVOICE_SUBJECT = '{{title}} {{ref}} — {{company}}'

export const DEFAULT_EMAIL_INVOICE_BODY = `Dear {{contact}},

Please find attached our {{titleLower}} {{ref}}.

Amount due: {{amount}}

Best regards,
{{company}}`

export const DEFAULT_WHATSAPP_QUOTE =
  'Hello{{contactGreeting}},\n\nPlease find our {{titleLower}} {{ref}}.\nAmount: {{amount}}\n\nThank you,\n{{company}}'

export const DEFAULT_WHATSAPP_CRM =
  'Hello{{contactGreeting}},\n\nFollowing up regarding {{client}}. Kindly update us on the status at your earliest convenience.\n\nBest regards,\n{{company}}'

export const DEFAULT_EMAIL_CRM_SUBJECT = 'Follow-up — {{client}}'

export const DEFAULT_EMAIL_CRM_BODY = `Dear {{contact}},

I hope you are well.

Best regards,
{{company}}`
