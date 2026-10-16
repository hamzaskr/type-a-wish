import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Category, MediaAttachment, Memory, Wish } from '../domain/types'
import type { PasscodeVerifier } from './security'

class AtlasDatabase extends Dexie {
  wishes!: Table<Wish, string>
  memories!: Table<Memory, string>
  categories!: Table<Category, string>
  media!: Table<MediaAttachment, string>
  settings!: Table<{ key: string; passcode?: PasscodeVerifier; biometricCredentialId?: string; autoLockMinutes?: number }, string>

  constructor() {
    super('type-a-wish')
    this.version(1).stores({
      wishes: 'id, status, createdAt, updatedAt, *categoryIds, *tagIds, sortOrder',
      memories: 'id, memoryDate, createdAt, updatedAt, *categoryIds, *linkedWishIds',
      categories: 'id, sortOrder, isPreset',
    })
    this.version(2).stores({
      wishes: 'id, status, createdAt, updatedAt, *categoryIds, *tagIds, sortOrder',
      memories: 'id, memoryDate, createdAt, updatedAt, *categoryIds, *linkedWishIds',
      categories: 'id, sortOrder, isPreset',
      media: 'id, ownerId, ownerType, mediaType, createdAt',
      settings: 'key',
    })
  }
}

export const db = new AtlasDatabase()

export async function seedCategories() {
  if (await db.categories.count()) return
  const now = new Date().toISOString()
  await db.categories.bulkAdd([
    { id: 'adventure', name: 'Adventure', description: 'The things that scare you a little.', isPreset: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'travel', name: 'Travel', description: 'Places still waiting for you.', isPreset: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { id: 'relationships', name: 'Relationships', description: 'People and moments that matter.', isPreset: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { id: 'lifestyle', name: 'Lifestyle', description: 'The life you want to live.', isPreset: true, sortOrder: 3, createdAt: now, updatedAt: now },
  ])
}
