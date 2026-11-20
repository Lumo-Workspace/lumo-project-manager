/** @jest-environment node */
import {
  isHumanWebSession,
  requireHumanWebSession,
} from '@/lib/auth/human-web-session'

describe('human web session check', () => {
  it('accepts a browser session', () => {
    expect(isHumanWebSession({ source: 'clerk' })).toBe(true)
    expect(requireHumanWebSession({ source: 'clerk' }, 'web only')).toBeNull()
  })

  it('refuses an API key with 403 and the given message', async () => {
    expect(isHumanWebSession({ source: 'bearer' })).toBe(false)
    const response = requireHumanWebSession({ source: 'bearer' }, 'web only')
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({ error: 'web only' })
  })
})

describe('no route re-implements the check inline', () => {
  it("finds no `identity.source !== 'clerk'` under app/api", () => {
    const { execFileSync } =
      jest.requireActual<typeof import('child_process')>('child_process')
    let hits = ''
    try {
      hits = execFileSync('grep', ['-rIl', "source !== 'clerk'", 'app/api'], {
        encoding: 'utf8',
      })
    } catch (error) {
      // grep exits 1 when nothing matches.
      if ((error as { status?: number }).status !== 1) throw error
    }
    expect(hits.trim()).toBe('')
  })
})
