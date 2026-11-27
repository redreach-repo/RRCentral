import { db } from './db'

/** Who is on a delivery project (table delivery_project_members). Managers add and remove. */
export type ProjectMember = {
  id: string
  project_id: string
  user_id: string
  added_by: string
  added_at: string
}

export type TeamMember = { id: string; name: string; email: string; role: string }

function missingTable(message: string | undefined): boolean {
  return /delivery_project_members|does not exist|schema cache/i.test(message || '')
}

export async function listProjectMembers(projectId: string): Promise<{ members: ProjectMember[]; missingTable: boolean }> {
  const { data, error } = await db
    .from('delivery_project_members')
    .select('id, project_id, user_id, added_by, added_at')
    .eq('project_id', projectId)
    .order('added_at')
  if (error) {
    if (missingTable(error.message)) return { members: [], missingTable: true }
    throw new Error(error.message)
  }
  return { members: (data || []) as ProjectMember[], missingTable: false }
}

export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  const { error } = await db.from('delivery_project_members').insert({ project_id: projectId, user_id: userId })
  if (error && !/duplicate|unique/i.test(error.message || '')) throw new Error(error.message)
}

export async function removeProjectMember(memberId: string): Promise<void> {
  const { error } = await db.from('delivery_project_members').delete().eq('id', memberId)
  if (error) throw new Error(error.message)
}

export async function listActiveTeam(): Promise<TeamMember[]> {
  const { data, error } = await db.from('app_users').select('id, name, email, role, active').order('name')
  if (error) throw new Error(error.message)
  return ((data || []) as (TeamMember & { active: boolean })[])
    .filter((u) => u.active !== false)
    .map(({ id, name, email, role }) => ({ id, name: name || '', email: email || '', role: role || '' }))
}

/** Team members who can still be added: not on the project yet; Sales listed first. */
export function addableMembers(team: TeamMember[], members: ProjectMember[]): TeamMember[] {
  const on = new Set(members.map((m) => m.user_id))
  return team
    .filter((u) => !on.has(u.id))
    .sort((a, b) => Number(b.role === 'sales') - Number(a.role === 'sales') || (a.name || a.email).localeCompare(b.name || b.email))
}

export function memberLabel(team: TeamMember[], userId: string): string {
  const u = team.find((t) => t.id === userId)
  return u ? u.name || u.email : 'Former team member'
}
