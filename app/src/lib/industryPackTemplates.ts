/** M12: apply industry pack object templates (custom fields / pipelines). */

export type PackFieldTemplate = {
  object_type: string
  field_key: string
  label: string
  field_type: string
  options?: string[]
}

export type PackPipelineTemplate = {
  name: string
  object_type: string
  stages: string[]
}

export type PackTemplates = {
  custom_fields?: PackFieldTemplate[]
  pipelines?: PackPipelineTemplate[]
}

export function templatesFromManifest(manifest: unknown): PackTemplates {
  if (!manifest || typeof manifest !== 'object') return {}
  const t = (manifest as { templates?: PackTemplates }).templates
  if (!t || typeof t !== 'object') return {}
  return {
    custom_fields: Array.isArray(t.custom_fields) ? t.custom_fields : [],
    pipelines: Array.isArray(t.pipelines) ? t.pipelines : [],
  }
}

export function fieldKeysToCreate(
  templates: PackFieldTemplate[],
  existingKeys: Set<string>,
): PackFieldTemplate[] {
  return templates.filter((f) => {
    const key = `${f.object_type}:${f.field_key}`
    return f.object_type && f.field_key && !existingKeys.has(key)
  })
}

export function pipelineNamesToCreate(
  templates: PackPipelineTemplate[],
  existingNames: Set<string>,
): PackPipelineTemplate[] {
  return templates.filter((p) => p.name && !existingNames.has(p.name.trim().toLowerCase()))
}

export function summarizeTemplatePlan(templates: PackTemplates): {
  fields: number
  pipelines: number
} {
  return {
    fields: templates.custom_fields?.length || 0,
    pipelines: templates.pipelines?.length || 0,
  }
}
