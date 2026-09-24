import { describe, expect, it } from 'vitest'
import {
  deliveryNoteAttachmentRefs,
  SIGNED_DELIVERY_NOTE_ENTITY,
} from './signedDeliveryNotes'

describe('signedDeliveryNotes', () => {
  it('stores signed copies under a dedicated attachment entity', () => {
    expect(SIGNED_DELIVERY_NOTE_ENTITY).toBe('delivery_note_signed')
  })

  it('looks up attachments by delivery-note reference or id', () => {
    expect(
      deliveryNoteAttachmentRefs({
        reference_number: 'DN-01-26001',
        id: 'uuid-1',
      }),
    ).toEqual(['DN-01-26001', 'uuid-1'])
  })
})
