/** M13: WebAuthn passkey stub — UI readiness only; enroll later. */

export function passkeysSupported(win: { PublicKeyCredential?: unknown } = window): boolean {
  return typeof win.PublicKeyCredential !== 'undefined'
}

export function passkeyStubStatus(input: {
  supported: boolean
  enrolledCount: number
}): { label: string; ready: boolean } {
  if (!input.supported) return { label: 'Passkeys not supported in this browser', ready: false }
  if (input.enrolledCount > 0) return { label: `${input.enrolledCount} passkey(s) enrolled`, ready: true }
  return { label: 'Passkeys supported — enroll coming soon (TOTP remains available)', ready: true }
}
