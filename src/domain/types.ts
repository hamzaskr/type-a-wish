export type WishStatus = 'Dreaming' | 'Planning' | 'Done'

export interface Wish {
  id: string
  title: string
  body: string
  status: WishStatus
  categoryIds: string[]
  tagIds: string[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  targetDate?: string
  pinned: boolean
  sortOrder: number
  cardStyleId?: string
  mediaIds: string[]
}

export interface Category {
  id: string
  name: string
  description: string
  isPreset: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Memory {
  id: string
  title: string
  body: string
  memoryDate?: string
  createdAt: string
  updatedAt: string
  categoryIds: string[]
  tagIds: string[]
  mediaIds: string[]
  linkedWishIds: string[]
}

export type MediaType = 'image' | 'audio' | 'video'

export interface MediaAttachment {
  id: string
  ownerType: 'wish' | 'memory'
  ownerId: string
  mediaType: MediaType
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  blob: Blob
}
