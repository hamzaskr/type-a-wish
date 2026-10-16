import { describe, expect, it } from 'vitest'
import type { Wish, WishStatus } from './types'

describe('wish domain shape', () => {
  it('supports the three product statuses and stable relationships', () => {
    const statuses: WishStatus[] = ['Dreaming', 'Planning', 'Done']
    const wish: Wish = {
      id: 'wish-1',
      title: 'See the northern lights',
      body: '',
      status: 'Dreaming',
      categoryIds: ['travel', 'adventure'],
      tagIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pinned: false,
      sortOrder: 1,
      mediaIds: [],
    }
    expect(statuses).toContain(wish.status)
    expect(wish.categoryIds).toHaveLength(2)
    expect(wish.id).toBe('wish-1')
  })
})
