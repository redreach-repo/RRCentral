import { describe, expect, it } from 'vitest'
import { cleanEditedPayload, describeProposal, isEdited, payloadProblem, statusTone } from './aiApprovals'
import { isMissingSetup } from './aiApprovalsStore'

describe('payloadProblem', () => {
  it('accepts the two allowed actions', () => {
    expect(payloadProblem('add_timeline_note', { kind: 'call', body: 'Spoke to Sara' })).toBe('')
    expect(payloadProblem('update_account_fields', { city: 'Dubai' })).toBe('')
  })
  it('refuses fields and actions outside the allow list', () => {
    expect(payloadProblem('update_account_fields', { owner_user_id: 'x' })).toMatch(/cannot be changed/)
    expect(payloadProblem('update_account_fields', { name: 'x' })).toMatch(/cannot be changed/)
    expect(payloadProblem('update_account_fields', {})).toMatch(/no fields/)
    expect(payloadProblem('add_timeline_note', { kind: 'system', body: 'x' })).toMatch(/kind/)
    expect(payloadProblem('add_timeline_note', { kind: 'note', body: '  ' })).toMatch(/body/)
    expect(payloadProblem('send_email', { to: 'x' })).toMatch(/unknown action/)
    expect(payloadProblem('add_timeline_note', null)).toMatch(/object/)
  })
})

describe('edit helpers', () => {
  it('drops empty account fields and trims', () => {
    expect(cleanEditedPayload('update_account_fields', { city: ' Dubai ', country: '' })).toEqual({ city: 'Dubai' })
    expect(cleanEditedPayload('add_timeline_note', { kind: '', body: ' hi ' })).toEqual({ kind: 'note', body: 'hi' })
  })
  it('detects edits', () => {
    expect(isEdited({ city: 'Dubai' }, { city: 'Dubai' })).toBe(false)
    expect(isEdited({ city: 'Dubai' }, { city: 'Abu Dhabi' })).toBe(true)
    expect(isEdited({ city: 'Dubai' }, { city: 'Dubai', country: 'UAE' })).toBe(true)
  })
  it('describes what approving does', () => {
    expect(describeProposal('update_account_fields', { city: 'Dubai' })).toEqual(['Set city to “Dubai”'])
    expect(describeProposal('add_timeline_note', { kind: 'call', body: 'x' })[0]).toMatch(/call/)
  })
  it('maps status to tone and spots missing setup', () => {
    expect(statusTone('executed')).toBe('good')
    expect(statusTone('failed')).toBe('bad')
    expect(statusTone('pending')).toBe('neutral')
    expect(isMissingSetup({ code: '42P01' })).toBe(true)
    expect(isMissingSetup({ message: 'relation "ai_action_proposals" does not exist' })).toBe(true)
    expect(isMissingSetup({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
