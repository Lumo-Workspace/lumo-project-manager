import {
  applyShuffle,
  pushShuffled,
  readShuffled,
  SHUFFLE_STORAGE_KEY,
  writeShuffled,
} from '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/shuffle-order'

const cards = (...ids: string[]) => ids.map(id => ({ id }))

describe('LUM-1336 shuffle to back', () => {
  it('moves shuffled cards behind every card never shuffled, in shuffle order', () => {
    const ordered = applyShuffle(cards('a', 'b', 'c', 'd'), ['b', 'a'])
    expect(ordered.map(c => c.id)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('ignores shuffled ids that left the queue', () => {
    expect(applyShuffle(cards('a', 'b'), ['gone', 'a']).map(c => c.id)).toEqual(
      ['b', 'a']
    )
  })

  it('sends a card shuffled twice to the very back again', () => {
    expect(pushShuffled(['a', 'b'], 'a')).toEqual(['b', 'a'])
    expect(pushShuffled([], 'x')).toEqual(['x'])
  })

  it('round-trips through storage and survives junk or a throwing store', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    writeShuffled(storage, ['a', 'b'])
    expect(readShuffled(storage)).toEqual(['a', 'b'])

    store.set(SHUFFLE_STORAGE_KEY, '{not json')
    expect(readShuffled(storage)).toEqual([])
    store.set(SHUFFLE_STORAGE_KEY, JSON.stringify(['a', 3, null]))
    expect(readShuffled(storage)).toEqual(['a'])

    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readShuffled(throwing)).toEqual([])
    expect(() => writeShuffled(throwing, ['a'])).not.toThrow()
    expect(readShuffled(null)).toEqual([])
  })
})
