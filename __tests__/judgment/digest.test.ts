import {
  JUDGMENT_DIGEST_FIELDS,
  canonicalJson,
  canonicalizeJudgmentContent,
  computeJudgmentDigest,
  type JudgmentDigestContent,
} from '@/lib/judgment/digest'

const BASE: JudgmentDigestContent = {
  judgmentId: 'jdg_1',
  baseRevisionId: null,
  description: 'Regenerate the client instead of editing generated files',
  statement: 'Change the source schema and regenerate the client.',
  kind: 'CONDITIONAL_GUIDANCE',
  rationale: 'The next generator run overwrites hand edits.',
  polarity: 'PREFER',
  assertionKey: 'generated-files.edit',
  assertionValue: 'regenerate',
  scopeRepo: 'acme/app',
  scopePathGlobs: ['src/generated/**'],
  scopeTopic: 'codegen',
  when: [{ field: 'agent', equals: 'CLAUDE_CODE' }],
  limits: ['Does not decide whether a file is generated.'],
  validFrom: null,
  validUntil: new Date('2027-01-01T00:00:00.000Z'),
  origin: 'HUMAN_GUIDANCE',
  judgedByMemberId: 'mem_1',
  judgedByLabel: null,
  recordedByMemberId: 'mem_1',
  recordedByAgent: null,
  recordedVia: 'WEB',
  captureMethod: 'EXPLICIT',
  sourceSessionId: null,
  sourceTaskId: 'LUM-1356',
  sourceRefs: ['task:LUM-1356'],
  evidence: [{ reference: 'pr:1', role: 'supports', summary: 'Seen once.' }],
  context: null,
  alternatives: null,
  expectedOutcome: null,
  legacyMemoryId: null,
}

describe('judgment digest', () => {
  it('keeps a fixed field order', () => {
    // A change here changes every stored digest: bump JUDGMENT_DIGEST_VERSION
    // and add new vectors instead of editing this list in place.
    expect([...JUDGMENT_DIGEST_FIELDS]).toEqual([
      'judgmentId',
      'baseRevisionId',
      'description',
      'statement',
      'kind',
      'rationale',
      'polarity',
      'assertionKey',
      'assertionValue',
      'scopeRepo',
      'scopePathGlobs',
      'scopeTopic',
      'when',
      'limits',
      'validFrom',
      'validUntil',
      'origin',
      'judgedByMemberId',
      'judgedByLabel',
      'recordedByMemberId',
      'recordedByAgent',
      'recordedVia',
      'captureMethod',
      'sourceSessionId',
      'sourceTaskId',
      'sourceRefs',
      'evidence',
      'context',
      'alternatives',
      'expectedOutcome',
      'legacyMemoryId',
    ])
  })

  it('matches the stored test vectors', () => {
    expect(canonicalizeJudgmentContent(BASE)).toBe(
      'judgment-digest/v1\n{"judgmentId":"jdg_1","baseRevisionId":null,"description":"Regenerate the client instead of editing generated files","statement":"Change the source schema and regenerate the client.","kind":"CONDITIONAL_GUIDANCE","rationale":"The next generator run overwrites hand edits.","polarity":"PREFER","assertionKey":"generated-files.edit","assertionValue":"regenerate","scopeRepo":"acme/app","scopePathGlobs":["src/generated/**"],"scopeTopic":"codegen","when":[{"equals":"CLAUDE_CODE","field":"agent"}],"limits":["Does not decide whether a file is generated."],"validFrom":null,"validUntil":"2027-01-01T00:00:00.000Z","origin":"HUMAN_GUIDANCE","judgedByMemberId":"mem_1","judgedByLabel":null,"recordedByMemberId":"mem_1","recordedByAgent":null,"recordedVia":"WEB","captureMethod":"EXPLICIT","sourceSessionId":null,"sourceTaskId":"LUM-1356","sourceRefs":["task:LUM-1356"],"evidence":[{"reference":"pr:1","role":"supports","summary":"Seen once."}],"context":null,"alternatives":null,"expectedOutcome":null,"legacyMemoryId":null}'
    )
    expect(computeJudgmentDigest(BASE)).toBe(VECTOR_BASE)
    expect(
      computeJudgmentDigest({
        ...BASE,
        rationale: null,
        assertionKey: null,
        assertionValue: null,
        origin: 'UNKNOWN',
      })
    ).toBe(VECTOR_NO_RATIONALE)
  })

  it('does not depend on object key order or on Date vs ISO string', () => {
    const reordered = {
      ...BASE,
      when: [{ equals: 'CLAUDE_CODE', field: 'agent' }],
      evidence: [
        { summary: 'Seen once.', role: 'supports', reference: 'pr:1' },
      ],
      validUntil: '2027-01-01T00:00:00.000Z',
    }
    const shuffled = Object.fromEntries(
      Object.entries(reordered).reverse()
    ) as unknown as JudgmentDigestContent
    expect(computeJudgmentDigest(shuffled)).toBe(computeJudgmentDigest(BASE))
  })

  it('changes when any content field changes', () => {
    const base = computeJudgmentDigest(BASE)
    const changed: Partial<JudgmentDigestContent>[] = [
      { statement: 'Change the source schema and regenerate the client!' },
      { rationale: null },
      { baseRevisionId: 'rev_0' },
      { assertionValue: 'hand-edit' },
      { limits: ['Does not decide whether a file is generated.', 'x'] },
      { origin: 'AGENT_JUDGMENT' },
      { scopePathGlobs: ['src/**'] },
      { validUntil: null },
      { judgmentId: 'jdg_2' },
    ]
    for (const change of changed) {
      expect(computeJudgmentDigest({ ...BASE, ...change })).not.toBe(base)
    }
  })

  it('keeps array order significant', () => {
    expect(canonicalJson(['a', 'b'])).not.toBe(canonicalJson(['b', 'a']))
    expect(canonicalJson({ b: 1, a: [true, null] })).toBe(
      '{"a":[true,null],"b":1}'
    )
  })
})

const VECTOR_BASE =
  'sha256:7a70399699d7f83ad5e65de84d8aa432b26596029fba02429ed04d78823851b7'
const VECTOR_NO_RATIONALE =
  'sha256:22d98f1b77aa8436fe6c23efdc2bd9e1f4fccccb0e5746485d8549728129cf2a'
