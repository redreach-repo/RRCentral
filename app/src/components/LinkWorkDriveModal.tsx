import { useEffect, useMemo, useState } from 'react'
import type { CustomerDocumentCategory } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import Modal from './Modal'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import {
  COMMUNICATION_KINDS,
  isWorkDriveShareUrl,
  saveCustomerDriveLink,
  suggestedDocumentTitle,
  type RelatedRefOption,
} from '../lib/customerFiles'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'

export type LinkWorkDriveMode = 'signed' | 'communication' | 'purchasing'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: () => void | Promise<void>
  company: string
  crmId?: string | null
  uploadedBy: string
  mode: LinkWorkDriveMode
  /** Fixed signed / purchasing category when mode is not communication. */
  category?: CustomerDocumentCategory
  title?: string
  hint?: string
  relatedRefOptions?: RelatedRefOption[]
  defaultRelatedRef?: string
  defaultCategory?: CustomerDocumentCategory
  defaultTitle?: string
  defaultNotes?: string
}

export default function LinkWorkDriveModal({
  open,
  onClose,
  onSaved,
  company,
  crmId,
  uploadedBy,
  mode,
  category,
  title,
  hint,
  relatedRefOptions = [],
  defaultRelatedRef = '',
  defaultCategory,
  defaultTitle,
  defaultNotes,
}: Props) {
  const { showToast } = useToast()
  const [kind, setKind] = useState<CustomerDocumentCategory>('email')
  const [docTitle, setDocTitle] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [relatedRef, setRelatedRef] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [titleTouched, setTitleTouched] = useState(false)

  const resolvedCategory: CustomerDocumentCategory =
    mode === 'communication'
      ? kind
      : mode === 'purchasing'
        ? 'supplier_invoice'
        : (category || 'signed_quotation')

  const modalTitle =
    title ||
    (mode === 'communication'
      ? 'Communication'
      : mode === 'purchasing'
        ? 'Supplier invoice'
        : 'Signed copy')

  const modalHint =
    hint ||
    (mode === 'communication'
      ? 'Save the email export, WhatsApp chat, or notes PDF in Zoho WorkDrive, then paste the share link here.'
      : mode === 'purchasing'
        ? 'Paste the Zoho WorkDrive share link for the supplier invoice PDF.'
        : 'Upload the signed PDF to Zoho WorkDrive, then paste the share link.')

  useEffect(() => {
    if (!open) return
    const initialKind =
      mode === 'communication'
        ? (defaultCategory && COMMUNICATION_KINDS.some((k) => k.id === defaultCategory)
            ? defaultCategory
            : 'email')
        : mode === 'purchasing'
          ? 'supplier_invoice'
          : category || 'signed_quotation'
    setKind(initialKind as CustomerDocumentCategory)
    setRelatedRef(defaultRelatedRef || '')
    setDriveUrl('')
    setNotes(
      defaultNotes ??
        (mode === 'communication' ? '' : mode === 'purchasing' ? '' : 'Signed copy'),
    )
    setTitleTouched(Boolean(defaultTitle?.trim()))
    setDocTitle(
      defaultTitle?.trim() ||
        suggestedDocumentTitle(
          initialKind as CustomerDocumentCategory,
          defaultRelatedRef,
          company,
        ),
    )
  }, [open, mode, category, defaultCategory, defaultRelatedRef, defaultTitle, defaultNotes, company])

  const autoTitle = useMemo(
    () => suggestedDocumentTitle(resolvedCategory, relatedRef, company),
    [resolvedCategory, relatedRef, company],
  )

  useEffect(() => {
    if (!open || titleTouched) return
    setDocTitle(autoTitle)
  }, [autoTitle, open, titleTouched])

  async function handleSave() {
    if (!company.trim()) {
      showToast('Company is required', 'error')
      return
    }
    if (!isWorkDriveShareUrl(driveUrl)) {
      showToast('Use a Zoho WorkDrive share link', 'error')
      return
    }
    if (!docTitle.trim()) {
      showToast('Give the file a short title', 'error')
      return
    }
    setSaving(true)
    try {
      await saveCustomerDriveLink({
        company,
        crmId: crmId || null,
        category: resolvedCategory,
        title: docTitle,
        driveUrl,
        relatedRef,
        notes,
        uploadedBy,
      })
      await logActivity(
        'add_customer_drive_file',
        'customer_document',
        company,
        `${resolvedCategory}: ${docTitle.trim()}`,
        uploadedBy,
        crmId || null,
      )
      showToast(
        mode === 'communication'
          ? 'Communication linked'
          : mode === 'purchasing'
            ? 'Supplier invoice linked'
            : 'Signed copy linked',
        'success',
      )
      onClose()
      await onSaved?.()
    } catch (e) {
      if (isMissingRelationError(e)) {
        showToast('Run supabase-customer-files-upgrade.sql in Supabase first', 'error')
      } else {
        showToast(errorMessage(e, 'Could not save WorkDrive link'), 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={modalTitle} onClose={onClose} width={520}>
      <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
        {modalHint} The CRM only stores the link — not the file bytes.
      </p>
      {mode === 'communication' ? (
        <div style={fieldStyle}>
          <label style={labelStyle}>Type *</label>
          <select
            style={inputStyle}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as CustomerDocumentCategory)
              setTitleTouched(false)
            }}
          >
            {COMMUNICATION_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div style={fieldStyle}>
        <label style={labelStyle}>Title *</label>
        <input
          style={inputStyle}
          value={docTitle}
          onChange={(e) => {
            setTitleTouched(true)
            setDocTitle(e.target.value)
          }}
          placeholder={autoTitle}
        />
        <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>
          Suggested: {autoTitle}
          {!titleTouched || docTitle !== autoTitle ? (
            <>
              {' · '}
              <button
                type="button"
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  color: colors.accent,
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  textDecoration: 'underline',
                }}
                onClick={() => {
                  setDocTitle(autoTitle)
                  setTitleTouched(false)
                }}
              >
                Use suggestion
              </button>
            </>
          ) : null}
        </p>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Zoho WorkDrive share link *</label>
        <input
          style={inputStyle}
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://workdrive.zoho.com/… or workdrive.zohoexternal.com/…"
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Related ref (optional)</label>
        {relatedRefOptions.length > 0 ? (
          <select
            style={inputStyle}
            value={relatedRef}
            onChange={(e) => {
              setRelatedRef(e.target.value)
              setTitleTouched(false)
            }}
          >
            <option value="">None</option>
            {relatedRefOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {relatedRef && !relatedRefOptions.some((o) => o.value === relatedRef) ? (
              <option value={relatedRef}>{relatedRef}</option>
            ) : null}
          </select>
        ) : (
          <input
            style={inputStyle}
            value={relatedRef}
            onChange={(e) => {
              setRelatedRef(e.target.value)
              setTitleTouched(false)
            }}
            placeholder="e.g. RR-01-26001 or DN-01-26001"
          />
        )}
      </div>
      {mode === 'communication' || mode === 'purchasing' ? (
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes (optional)</label>
          <input
            style={inputStyle}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              mode === 'communication'
                ? 'e.g. Exported from WhatsApp · Mar 2026'
                : 'e.g. Supplier PO-123'
            }
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          style={buttonPrimaryStyle}
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving
            ? 'Saving…'
            : mode === 'communication'
              ? 'Save communication'
              : mode === 'purchasing'
                ? 'Save supplier invoice'
                : 'Save signed copy'}
        </button>
      </div>
    </Modal>
  )
}
