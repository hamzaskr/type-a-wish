import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive, ArrowLeft, BookHeart, Check, Compass, Filter, Heart, ImagePlus,
  Lock, Plus, Search, Settings as SettingsIcon, Sparkles, Tag, Trash2, Unlock,
  WandSparkles,
} from 'lucide-react'
import { db, seedCategories } from './infrastructure/database'
import { authenticateBiometric, biometricSupported, createPasscodeVerifier, registerBiometric, verifyPasscode, type PasscodeVerifier } from './infrastructure/security'
import type { Category, MediaAttachment, Memory, Wish, WishStatus } from './domain/types'
import './App.css'

const SECURITY_KEY = 'type-a-wish-security'
type SecuritySettings = { passcodeVerifier?: PasscodeVerifier; biometricCredentialId?: string }
const readSecurity = (): SecuritySettings => {
  try { return JSON.parse(localStorage.getItem(SECURITY_KEY) ?? '{}') as SecuritySettings } catch { return {} }
}
const writeSecurity = (settings: SecuritySettings) => localStorage.setItem(SECURITY_KEY, JSON.stringify(settings))
const prompts = [
  "Something I've always wanted to try…",
  'A moment I want to experience with someone I love.',
  'A place I want to see with my own eyes.',
  'Something I want to create with my own hands.',
  'A version of myself I want to meet.',
  "A simple moment I don't want to take for granted.",
]

const navItems = [
  { to: '/', label: 'Atlas', icon: Compass },
  { to: '/wishes', label: 'Wishes', icon: Archive },
  { to: '/memories', label: 'Memories', icon: Heart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]
const nowIso = () => new Date().toISOString()

function App() {
  const [wishes, setWishes] = useState<Wish[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [media, setMedia] = useState<MediaAttachment[]>([])
  const [locked, setLocked] = useState(false)
  const [security, setSecurity] = useState<SecuritySettings>(() => readSecurity())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const load = async () => {
      await seedCategories()
      const [nextWishes, nextMemories, nextCategories, nextMedia] = await Promise.all([
        db.wishes.toArray(), db.memories.toArray(), db.categories.toArray(), db.media.toArray(),
      ])
      setWishes(nextWishes)
      setMemories(nextMemories)
      setCategories(nextCategories)
      setMedia(nextMedia)
      setReady(true)
    }
    void load()
  }, [])

  const saveWish = async (wish: Wish) => {
    await db.wishes.put(wish)
    setWishes((current) => {
      const exists = current.some((item) => item.id === wish.id)
      return exists ? current.map((item) => item.id === wish.id ? wish : item) : [wish, ...current]
    })
  }

  const saveMemory = async (memory: Memory) => {
    await db.memories.put(memory)
    setMemories((current) => {
      const exists = current.some((item) => item.id === memory.id)
      return exists ? current.map((item) => item.id === memory.id ? memory : item) : [memory, ...current]
    })
  }

  const deleteWish = async (id: string) => {
    const wishMedia = await db.media.where('ownerId').equals(id).toArray()
    await db.transaction('rw', db.wishes, db.media, async () => {
      await db.wishes.delete(id)
      await db.media.bulkDelete(wishMedia.map((item) => item.id))
    })
    setWishes((current) => current.filter((wish) => wish.id !== id))
    setMedia((current) => current.filter((item) => item.ownerId !== id || item.ownerType !== 'wish'))
  }

  const attachMedia = async (ownerType: 'wish' | 'memory', ownerId: string, file: File) => {
    const mediaType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : null
    if (!mediaType) throw new Error('Choose an image, audio, or video file.')
    if (file.size > 25 * 1024 * 1024) throw new Error('Attachments must be 25 MB or smaller.')
    const attachment: MediaAttachment = { id: crypto.randomUUID(), ownerType, ownerId, mediaType, originalName: file.name, mimeType: file.type, sizeBytes: file.size, createdAt: nowIso(), blob: file }
    await db.media.put(attachment)
    setMedia((current) => [...current, attachment])
    if (ownerType === 'wish') {
      const wish = wishes.find((item) => item.id === ownerId)
      if (wish) await saveWish({ ...wish, mediaIds: [...wish.mediaIds, attachment.id], updatedAt: nowIso() })
    }
  }

  const removeMedia = async (mediaId: string) => {
    const attachment = await db.media.get(mediaId)
    if (!attachment) return
    await db.media.delete(mediaId)
    setMedia((current) => current.filter((item) => item.id !== mediaId))
    if (attachment.ownerType === 'wish') {
      const wish = wishes.find((item) => item.id === attachment.ownerId)
      if (wish) await saveWish({ ...wish, mediaIds: wish.mediaIds.filter((id) => id !== mediaId), updatedAt: nowIso() })
    }
  }

  if (!ready) return <div className="loading-screen"><Sparkles size={24} /><p>Opening your atlas…</p></div>
  if (locked) return <LockScreen security={security} onUnlock={() => setLocked(false)} />

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <NavLink to="/" className="wordmark"><span className="wordmark-mark"><Compass size={17} /></span> type a wish</NavLink>
        <button className="icon-button" onClick={() => setLocked(true)} aria-label="Lock your atlas"><Lock size={18} /></button>
      </header>
      <aside className="sidebar">
        <NavLink to="/" className="wordmark"><span className="wordmark-mark"><Compass size={17} /></span> type a wish</NavLink>
        <p className="sidebar-kicker">YOUR PRIVATE ATLAS</p>
        <nav aria-label="Primary navigation" className="primary-nav">
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon size={18} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="lock-link" onClick={() => setLocked(true)}><Lock size={16} /> Lock atlas</button>
          <p className="sidebar-note">A quiet place for the life you hope to live.</p>
        </div>
      </aside>
      <main className="main-content">
        <RoutesView wishes={wishes} memories={memories} media={media} categories={categories} saveWish={saveWish} saveMemory={saveMemory} deleteWish={deleteWish} attachMedia={attachMedia} removeMedia={removeMedia} security={security} setSecurity={setSecurity} lock={() => setLocked(true)} />
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'bottom-link active' : 'bottom-link'}><Icon size={19} /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  )
}

function RoutesView(props: { wishes: Wish[]; memories: Memory[]; media: MediaAttachment[]; categories: Category[]; saveWish: (wish: Wish) => Promise<void>; saveMemory: (memory: Memory) => Promise<void>; deleteWish: (id: string) => Promise<void>; attachMedia: (ownerType: 'wish' | 'memory', ownerId: string, file: File) => Promise<void>; removeMedia: (mediaId: string) => Promise<void>; security: SecuritySettings; setSecurity: (settings: SecuritySettings) => void; lock: () => void }) {
  const location = useLocation()
  if (location.pathname === '/wishes/new') return <WishEditor categories={props.categories} saveWish={props.saveWish} />
  if (location.pathname === '/memories/new') return <MemoryEditor saveMemory={props.saveMemory} />
  if (location.pathname.endsWith('/edit')) {
    const wishId = location.pathname.split('/')[2]
    return <WishEditor initialWish={props.wishes.find((wish) => wish.id === wishId)} categories={props.categories} saveWish={props.saveWish} />
  }
  if (location.pathname.startsWith('/wishes/')) return <WishDetail wishes={props.wishes} categories={props.categories} media={props.media} saveWish={props.saveWish} deleteWish={props.deleteWish} attachMedia={props.attachMedia} removeMedia={props.removeMedia} />
  if (location.pathname === '/wishes') return <WishesPage {...props} />
  if (location.pathname === '/memories') return <MemoriesPage memories={props.memories} />
  if (location.pathname === '/settings') return <SettingsPage security={props.security} setSecurity={props.setSecurity} lock={props.lock} />
  return <AtlasPage wishes={props.wishes} categories={props.categories} />
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>
}

function AtlasPage({ wishes, categories }: { wishes: Wish[]; categories: Category[] }) {
  const navigate = useNavigate()
  return <div className="page atlas-page">
    <PageHeader eyebrow="YOUR PRIVATE ATLAS" title="A life in the making." description="A place for everything you hope to experience, create, and remember." />
    <button className="hero-action" onClick={() => navigate('/wishes/new')}><Plus size={24} /><span><strong>Add a wish</strong><small>Start with a sentence. Let the rest come later.</small></span><ArrowLeft className="action-arrow" size={20} /></button>
    <section className="section-block"><div className="section-heading"><h2>Your world, so far</h2><NavLink to="/wishes">Explore all <span aria-hidden="true">→</span></NavLink></div>
      <div className="category-grid">{categories.map((category, index) => {
        const count = wishes.filter((wish) => wish.categoryIds.includes(category.id)).length
        return <NavLink to={`/wishes?category=${category.id}`} className={`category-card category-${index % 4}`} key={category.id}><span className="category-icon">{index === 0 ? <Compass /> : index === 1 ? <Archive /> : index === 2 ? <Heart /> : <Sparkles />}</span><span className="category-name">{category.name}</span><span className="category-copy">{category.description}</span><span className="category-count">{count ? `${count} ${count === 1 ? 'wish' : 'wishes'}` : 'A space for what matters.'}</span></NavLink>
      })}</div>
    </section>
    {wishes.length === 0 && <div className="empty-card"><WandSparkles size={20} /><div><h3>There is room for your first wish.</h3><p>It can be ambitious, ordinary, or still taking shape. One sentence is enough.</p></div></div>}
  </div>
}

function WishesPage({ wishes, categories }: { wishes: Wish[]; categories: Category[] }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'All' | WishStatus>('All')
  const [layout, setLayout] = useState<'cards' | 'list'>('cards')
  const categoryId = searchParams.get('category')
  const filtered = useMemo(() => wishes.filter((wish) => (status === 'All' || wish.status === status) && (!categoryId || wish.categoryIds.includes(categoryId)) && `${wish.title} ${wish.body}`.toLowerCase().includes(search.toLowerCase())), [wishes, status, search, categoryId])
  return <div className="page"><PageHeader eyebrow="YOUR COLLECTION" title="Your wishes" description="The experiences, ideas, and quiet hopes you are carrying with you." action={<button className="button primary" onClick={() => navigate('/wishes/new')}><Plus size={18} /> Add a wish</button>} />
    <div className="collection-controls"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a wish…" aria-label="Search wishes" /></label><div className="filter-row" role="group" aria-label="Filter by status">{['All', 'Dreaming', 'Planning', 'Done'].map((item) => <button key={item} className={`filter-pill ${status === item ? 'selected' : ''}`} onClick={() => setStatus(item as 'All' | WishStatus)}>{item}</button>)}{categoryId && <button className="filter-pill selected" onClick={() => navigate('/wishes')}>Category: {categories.find((category) => category.id === categoryId)?.name ?? categoryId} ×</button>}<button className="view-toggle" onClick={() => setLayout(layout === 'cards' ? 'list' : 'cards')} aria-label={`Switch to ${layout === 'cards' ? 'list' : 'card'} view`}><Filter size={17} /> {layout === 'cards' ? 'List' : 'Cards'}</button></div></div>
    {filtered.length === 0 ? <div className="empty-card"><Search size={20} /><div><h3>{wishes.length ? 'Nothing matches just yet.' : 'Your collection starts here.'}</h3><p>{wishes.length ? 'Try another search or filter.' : 'Capture a wish with the button above.'}</p></div></div> : <div className={layout === 'cards' ? 'wish-grid' : 'wish-list'}>{filtered.map((wish) => <WishCard key={wish.id} wish={wish} categories={categories} compact={layout === 'list'} />)}</div>}
  </div>
}

function WishCard({ wish, categories, compact }: { wish: Wish; categories: Category[]; compact?: boolean }) {
  const navigate = useNavigate()
  return <button className={`wish-card ${compact ? 'compact' : ''}`} onClick={() => navigate(`/wishes/${wish.id}`)}><div className="wish-card-meta"><span>{wish.status}</span>{wish.pinned && <span aria-label="Pinned">• pinned</span>}</div><h3>{wish.title}</h3>{wish.body && <p>{wish.body}</p>}<div className="tag-row">{wish.categoryIds.map((id) => <span key={id}>{categories.find((category) => category.id === id)?.name}</span>)}</div></button>
}

function WishEditor({ categories, saveWish, initialWish }: { categories: Category[]; saveWish: (wish: Wish) => Promise<void>; initialWish?: Wish }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(initialWish?.title ?? '')
  const [body, setBody] = useState(initialWish?.body ?? '')
  const [prompt, setPrompt] = useState(() => prompts[Math.floor(Math.random() * prompts.length)])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialWish?.categoryIds ?? [])
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    const now = new Date().toISOString()
    await saveWish({ id: initialWish?.id ?? crypto.randomUUID(), title: title.trim(), body: body.trim(), status: initialWish?.status ?? 'Dreaming', categoryIds: selectedCategories, tagIds: initialWish?.tagIds ?? [], createdAt: initialWish?.createdAt ?? now, updatedAt: now, completedAt: initialWish?.completedAt, targetDate: initialWish?.targetDate, pinned: initialWish?.pinned ?? false, sortOrder: initialWish?.sortOrder ?? Date.now(), mediaIds: initialWish?.mediaIds ?? [] })
    navigate(-1)
  }
  return <div className="page writing-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back</button><PageHeader eyebrow="A NEW WISH" title="What do you want to experience?" description="It doesn't have to make sense to anyone else. It only has to mean something to you." /><form onSubmit={submit} className="writing-form"><label className="writing-field"><span>YOUR WISH</span><textarea autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write whatever comes to mind…" rows={3} required /></label><label className="writing-field"><span>THE STORY BEHIND IT <em>(OPTIONAL)</em></span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Why does this matter to you? Write a little, or leave it for another day." rows={4} /></label><div className="prompt-card"><div className="prompt-title"><WandSparkles size={18} /> Need a little inspiration?</div><p>“{prompt}”</p><button type="button" className="text-button" onClick={() => setPrompt(prompts[(prompts.indexOf(prompt) + 1) % prompts.length])}>Another prompt <span>↗</span></button><small>Optional</small></div><fieldset className="category-picker"><legend>ADD DETAILS <em>(OPTIONAL)</em></legend><div className="category-options">{categories.map((category) => <button type="button" className={selectedCategories.includes(category.id) ? 'selected' : ''} key={category.id} onClick={() => setSelectedCategories((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])}>{selectedCategories.includes(category.id) && <Check size={15} />}{category.name}</button>)}</div></fieldset><button className="save-button" disabled={!title.trim() || saving}>{saving ? 'Saving…' : 'Save to my atlas'}</button></form></div>
}

function WishDetail({ wishes, categories, media, saveWish, deleteWish, attachMedia, removeMedia }: { wishes: Wish[]; categories: Category[]; media: MediaAttachment[]; saveWish: (wish: Wish) => Promise<void>; deleteWish: (id: string) => Promise<void>; attachMedia: (ownerType: 'wish' | 'memory', ownerId: string, file: File) => Promise<void>; removeMedia: (mediaId: string) => Promise<void> }) {
  const location = useLocation()
  const navigate = useNavigate()
  const id = location.pathname.split('/').filter(Boolean)[1]
  const wish = wishes.find((item) => item.id === id)
  const wishMedia = media.filter((item) => item.ownerType === 'wish' && item.ownerId === id)
  const [mediaError, setMediaError] = useState('')
  if (!wish) return <div className="page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back</button><div className="empty-card"><p>That wish could not be found.</p></div></div>
  const complete = async () => { const timestamp = nowIso(); await saveWish({ ...wish, status: 'Done', completedAt: timestamp, updatedAt: timestamp }); }
  return <div className="page detail-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back to wishes</button><article className="detail-card"><div className="wish-card-meta"><span>A WISH · {wish.status.toUpperCase()}</span></div><h1>{wish.title}</h1>{wish.body && <p className="detail-body">{wish.body}</p>}<div className="tag-row">{wish.categoryIds.map((categoryId) => <span key={categoryId}>{categories.find((category) => category.id === categoryId)?.name}</span>)}</div></article><section className="detail-section"><BookHeart size={22} /><div><h2>The story behind it</h2><p>An optional reflection can grow as this dream becomes more meaningful.</p></div></section><section className="detail-section media-section"><ImagePlus size={22} /><div><h2>Photos, audio and video</h2><p>Files stay in this browser and are attached to this wish.</p><div className="media-buttons"><label className="button secondary small">Add photo<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label><label className="button secondary small">Add audio<input type="file" accept="audio/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label><label className="button secondary small">Add video<input type="file" accept="video/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label></div>{mediaError && <p className="media-error" role="alert">{mediaError}</p>}<div className="media-list">{wishMedia.map((item) => <MediaPreview key={item.id} item={item} onRemove={removeMedia} />)}</div></div></section><div className="detail-actions"><button className="button secondary" onClick={() => navigate(`/wishes/${wish.id}/edit`)}><WandSparkles size={17} /> Edit wish</button><button className="button primary" onClick={complete} disabled={wish.status === 'Done'}><Check size={18} /> {wish.status === 'Done' ? 'Already done' : 'Mark as done'}</button></div><button className="danger-link" onClick={async () => { if (window.confirm('Delete this wish? Linked memories will stay safe.')) { await deleteWish(wish.id); navigate('/wishes') } }}><Trash2 size={15} /> Delete this wish</button></div>
}

function MediaPreview({ item, onRemove }: { item: MediaAttachment; onRemove: (id: string) => Promise<void> }) {
  const [url] = useState(() => URL.createObjectURL(item.blob))
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])
  return <div className="media-item">{url && (item.mediaType === 'image' ? <img src={url} alt={item.originalName} /> : item.mediaType === 'audio' ? <audio controls src={url} /> : <video controls src={url} />)}<div className="media-caption"><span>{item.originalName}</span><button className="danger-link" onClick={() => { if (window.confirm(`Remove ${item.originalName}?`)) void onRemove(item.id) }}><Trash2 size={14} /> Remove</button></div></div>
}

function MemoriesPage({ memories }: { memories: Memory[] }) {
  const navigate = useNavigate()
  return <div className="page"><PageHeader eyebrow="YOUR MEMORIES" title="A life, as it happened." description="Little moments, long-awaited experiences, and things you don't want to forget." action={<button className="button primary" onClick={() => navigate('/memories/new')}><Plus size={18} /> Add a memory</button>} />{memories.length === 0 ? <div className="empty-card"><Heart size={20} /><div><h3>Keep a moment close.</h3><p>Save a memory from a wish, or record something that surprised you.</p></div></div> : <div className="memory-list">{memories.map((memory) => <article className="memory-item" key={memory.id}><div className="memory-mark"><Heart size={22} /></div><div><p className="eyebrow">{(memory.memoryDate ?? memory.createdAt).slice(0, 7)}</p><h2>{memory.title || 'A moment worth keeping'}</h2><p>{memory.body}</p></div></article>)}</div>}</div>
}

function MemoryEditor({ saveMemory }: { saveMemory: (memory: Memory) => Promise<void> }) {
  const navigate = useNavigate(); const [title, setTitle] = useState(''); const [body, setBody] = useState('')
  return <div className="page writing-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back</button><PageHeader eyebrow="A NEW MEMORY" title="What do you want to remember?" description="The ordinary moments often become the ones we keep." /><form className="writing-form" onSubmit={async (event) => { event.preventDefault(); if (!body.trim()) return; const now = new Date().toISOString(); await saveMemory({ id: crypto.randomUUID(), title: title.trim(), body: body.trim(), createdAt: now, updatedAt: now, categoryIds: [], tagIds: [], mediaIds: [], linkedWishIds: [] }); navigate('/memories') }}><label className="writing-field"><span>TITLE <em>(OPTIONAL)</em></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A name for this moment" /></label><label className="writing-field"><span>YOUR MEMORY</span><textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell it like you remember it…" rows={8} required /></label><button className="save-button" disabled={!body.trim()}>Save this memory</button></form></div>
}

function SettingsPage({ security, setSecurity, lock }: { security: SecuritySettings; setSecurity: (settings: SecuritySettings) => void; lock: () => void }) {
  const [timeout, setTimeoutValue] = useState('5 minutes')
  const [passcode, setPasscode] = useState('')
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [newPasscode, setNewPasscode] = useState('')
  const [message, setMessage] = useState('')
  const saveSettings = (next: SecuritySettings) => { writeSecurity(next); setSecurity(next) }
  const enablePasscode = async () => { if (passcode.length < 4) { setMessage('Use at least 4 characters for a passcode.'); return }; saveSettings({ ...security, passcodeVerifier: await createPasscodeVerifier(passcode) }); setPasscode(''); setMessage('Passcode enabled.'); }
  const resetPasscode = async () => { if (!security.passcodeVerifier || !await verifyPasscode(currentPasscode, security.passcodeVerifier)) { setMessage('The previous passcode is incorrect.'); return }; if (newPasscode.length < 4) { setMessage('Use at least 4 characters for the new passcode.'); return }; saveSettings({ ...security, passcodeVerifier: await createPasscodeVerifier(newPasscode) }); setCurrentPasscode(''); setNewPasscode(''); setMessage('Passcode changed.'); }
  const disablePasscode = async () => { if (!security.passcodeVerifier || !await verifyPasscode(currentPasscode, security.passcodeVerifier)) { setMessage('Enter the current passcode to disable it.'); return }; saveSettings({ ...security, passcodeVerifier: undefined }); setCurrentPasscode(''); setMessage('Passcode disabled. Your atlas is now no-passcode.'); }
  const enableBiometric = async () => {
    if (!biometricSupported()) { setMessage('Biometric authentication requires HTTPS and a browser with WebAuthn support.'); return }
    try { saveSettings({ ...security, biometricCredentialId: await registerBiometric() }); setMessage('Biometric unlock enabled on this device.') } catch { setMessage('Biometric setup was cancelled or is unavailable on this device.') }
  }
  return <div className="page"><PageHeader eyebrow="YOUR SPACE" title="Settings" description="Keep your atlas private, portable, and yours." /><div className="settings-list"><section className="settings-card"><div className="settings-icon"><Lock size={20} /></div><div><h2>Privacy and security</h2><p>Passcode protection is optional and off by default. It protects this browser session; it is not a substitute for encrypted storage.</p>{!security.passcodeVerifier ? <div className="security-form"><input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder="Create a passcode" aria-label="Create a passcode" /><button className="button secondary small" onClick={() => void enablePasscode()}>Enable passcode</button></div> : <><div className="security-form"><input type="password" value={currentPasscode} onChange={(event) => setCurrentPasscode(event.target.value)} placeholder="Current passcode" aria-label="Current passcode" /><input type="password" value={newPasscode} onChange={(event) => setNewPasscode(event.target.value)} placeholder="New passcode" aria-label="New passcode" /><button className="button secondary small" onClick={() => void resetPasscode()}>Change passcode</button><button className="button secondary small" onClick={() => void disablePasscode()}>Turn off passcode</button></div><button className="button primary small" onClick={lock}><Lock size={15} /> Lock now</button></>}{!security.biometricCredentialId && <button className="button secondary small" onClick={() => void enableBiometric()}>{biometricSupported() ? 'Enable fingerprint / Face ID' : 'Biometric authentication unavailable'}</button>}{security.biometricCredentialId && <p className="security-success">Biometric unlock is enabled on this device.</p>}{message && <p className="media-error" role="status">{message}</p>}</div></section><section className="settings-card"><div className="settings-icon"><Archive size={20} /></div><div><h2>Backups and restore</h2><p>Browser storage is not a backup. Export an archive regularly and keep the recovery key somewhere safe.</p><button className="button secondary small" onClick={() => alert('Backup export is not yet available.')}>Manage backups</button></div></section><section className="settings-card"><div className="settings-icon"><Tag size={20} /></div><div><h2>Automatic lock</h2><p>Lock your atlas after a period of inactivity.</p><select value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} aria-label="Automatic lock timeout">{['Immediately', '5 minutes', '15 minutes', 'Never'].map((value) => <option key={value}>{value}</option>)}</select></div></section></div></div>
}

function LockScreen({ security, onUnlock }: { security: SecuritySettings; onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const unlock = async (event: FormEvent) => { event.preventDefault(); if (security.passcodeVerifier && !await verifyPasscode(value, security.passcodeVerifier)) { setMessage('That passcode is incorrect.'); return }; onUnlock() }
  const biometricUnlock = async () => {
    if (!security.biometricCredentialId) return
    try { await authenticateBiometric(security.biometricCredentialId); onUnlock() } catch { setMessage('Biometric verification was cancelled or failed.') }
  }
  return <div className="lock-screen"><div className="lock-panel"><span className="lock-mark"><Unlock size={22} /></span><p className="eyebrow">YOUR PRIVATE ATLAS</p><h1>Welcome back.</h1>{security.passcodeVerifier ? <form onSubmit={(event) => void unlock(event)}><p>Enter your passcode to return to the life you are making.</p><input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Passcode" autoFocus aria-label="Passcode" /><button className="button primary" type="submit">Unlock atlas</button></form> : <><p>Your atlas has no passcode. You can continue.</p><button className="button primary" onClick={onUnlock}>Continue</button></>}{security.biometricCredentialId && <button className="button secondary" onClick={() => void biometricUnlock()}>Use fingerprint / Face ID</button>}{message && <p className="media-error" role="alert">{message}</p>}</div></div>
}

export default App
