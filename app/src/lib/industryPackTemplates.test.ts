import { describe, expect, it } from 'vitest'
import {
  fieldKeysToCreate,
  pipelineNamesToCreate,
  summarizeTemplatePlan,
  templatesFromManifest,
} from './industryPackTemplates'

describe('industryPackTemplates', () => {
  it('parses and diffs templates', () => {
    const t = templatesFromManifest({
      templates: {
        custom_fields: [
          { object_type: 'deal', field_key: 'site_code', label: 'Site', field_type: 'text' },
          { object_type: 'deal', field_key: 'eng_discipline', label: 'Disc', field_type: 'select' },
        ],
        pipelines: [{ name: 'Construction bid', object_type: 'deal', stages: ['Tender'] }],
      },
    })
    expect(summarizeTemplatePlan(t)).toEqual({ fields: 2, pipelines: 1 })
    expect(
      fieldKeysToCreate(t.custom_fields!, new Set(['deal:site_code'])).map((f) => f.field_key),
    ).toEqual(['eng_discipline'])
    expect(pipelineNamesToCreate(t.pipelines!, new Set(['construction bid']))).toEqual([])
  })
})
