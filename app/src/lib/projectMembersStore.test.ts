import { describe, expect, it } from 'vitest'
import { addableMembers, memberLabel, type ProjectMember, type TeamMember } from './projectMembersStore'

const team: TeamMember[] = [
  { id: 'm', name: 'Maya', email: 'maya@redreach.ae', role: 'manager' },
  { id: 's1', name: 'Sam', email: 'sam@redreach.ae', role: 'sales' },
  { id: 's2', name: '', email: 'ali@redreach.ae', role: 'sales' },
]
const member = (user_id: string): ProjectMember => ({ id: `x-${user_id}`, project_id: 'p', user_id, added_by: '', added_at: '' })

describe('project members', () => {
  it('offers only people not on the project, Sales first', () => {
    expect(addableMembers(team, [member('s1')]).map((u) => u.id)).toEqual(['s2', 'm'])
  })

  it('names a member by name, then email, then as a former member', () => {
    expect(memberLabel(team, 's1')).toBe('Sam')
    expect(memberLabel(team, 's2')).toBe('ali@redreach.ae')
    expect(memberLabel(team, 'gone')).toBe('Former team member')
  })
})
