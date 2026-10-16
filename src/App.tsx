import { useEffect, useMemo, useRef, useState } from 'react'
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
const PROFILE_KEY = 'type-a-wish-profile'
const GREETING_COOLDOWN_MS = 30 * 60 * 1000
const MAX_BIRTH_DATE = new Date().toISOString().slice(0, 10)
type SecuritySettings = { passcodeVerifier?: PasscodeVerifier; biometricCredentialId?: string }
type BirthdayMoment = 'before' | 'day' | 'after'
type UserProfile = { name: string; birthDate: string; lastGreetingAt?: string; lastBirthdayNoticeKey?: string }
const readSecurity = (): SecuritySettings => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECURITY_KEY) ?? '{}') as SecuritySettings
    return parsed.passcodeVerifier ? parsed : { passcodeVerifier: undefined, biometricCredentialId: undefined }
  } catch {
    return {}
  }
}
const writeSecurity = (settings: SecuritySettings) => localStorage.setItem(SECURITY_KEY, JSON.stringify(settings))
const readProfile = (): UserProfile | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<UserProfile> | null
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.birthDate !== 'string') return null
    return { name: parsed.name, birthDate: parsed.birthDate, lastGreetingAt: parsed.lastGreetingAt, lastBirthdayNoticeKey: parsed.lastBirthdayNoticeKey }
  } catch {
    return null
  }
}
const writeProfile = (profile: UserProfile) => localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
const ageAtDate = (birthDate: string, today = new Date()) => {
  const birth = new Date(`${birthDate}T00:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const birthdayPassed = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!birthdayPassed) age -= 1
  return age
}
const birthdayMoment = (birthDate: string, today = new Date()): BirthdayMoment | null => {
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const birthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  const daysFromBirthday = Math.round((today.getTime() - birthday.getTime()) / 86_400_000)
  if (daysFromBirthday === 0) return 'day'
  if (daysFromBirthday >= -7 && daysFromBirthday < 0) return 'before'
  if (daysFromBirthday > 0 && daysFromBirthday <= 7) return 'after'
  return null
}
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
const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function CompassMark() {
  const reduced = useReducedMotion()
  const [rotation, setRotation] = useState(0)
  const [motionEnabled, setMotionEnabled] = useState(false)
  const markRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!motionEnabled || reduced || !('DeviceOrientationEvent' in window)) return
    const onOrientation = (event: DeviceOrientationEvent) => setRotation(Math.max(-12, Math.min(12, (event.gamma ?? 0) / 4)))
    window.addEventListener('deviceorientation', onOrientation)
    return () => window.removeEventListener('deviceorientation', onOrientation)
  }, [motionEnabled, reduced])
  const requestMotion = async () => {
    const orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
    if (orientation.requestPermission) {
      try { if (await orientation.requestPermission() !== 'granted') return } catch { return }
    }
    setMotionEnabled(true)
  }
  return <button type="button" className={`compass-mark ${motionEnabled ? 'motion-enabled' : ''}`} ref={markRef} onPointerMove={(event) => { if (!reduced) setRotation((event.clientX / window.innerWidth - .5) * 10) }} onPointerLeave={() => setRotation(0)} onClick={() => void requestMotion()} aria-label="Enable device compass motion" title="Tap to enable gentle device motion"><Compass size={17} style={{ transform: `rotate(${rotation}deg)`, transition: reduced ? 'none' : 'transform 450ms cubic-bezier(.2,.8,.2,1)' }} /></button>
}

function AmbientAtmosphere() {
  return <div className="ambient-atmosphere" aria-hidden="true"><span className="atmosphere-blob blob-one" /><span className="atmosphere-blob blob-two" /><span className="atmosphere-contours" /></div>
}

function App() {
  const [wishes, setWishes] = useState<Wish[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [media, setMedia] = useState<MediaAttachment[]>([])
  const [locked, setLocked] = useState(false)
  const [security, setSecurity] = useState<SecuritySettings>(() => readSecurity())
  const [profile, setProfile] = useState<UserProfile | null>(() => readProfile())
  const [showWelcome, setShowWelcome] = useState(() => readProfile() === null)
  const [greeting, setGreeting] = useState('')
  const [birthdayPrompt, setBirthdayPrompt] = useState<{ moment: BirthdayMoment; message: string } | null>(null)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

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

  useEffect(() => {
    const greetIfDue = () => {
      const current = readProfile()
      if (!current || !current.lastGreetingAt) return
      if (Date.now() - new Date(current.lastGreetingAt).getTime() < GREETING_COOLDOWN_MS) return
      const greeted = { ...current, lastGreetingAt: nowIso() }
      writeProfile(greeted)
      setGreeting(`Welcome back, ${greeted.name}.`)
    }
    greetIfDue()
    document.addEventListener('visibilitychange', greetIfDue)
    return () => document.removeEventListener('visibilitychange', greetIfDue)
  }, [])

  useEffect(() => {
    const checkBirthday = () => {
      const current = readProfile()
      if (!current) return
      const moment = birthdayMoment(current.birthDate)
      if (!moment) return
      const year = new Date().getFullYear()
      const noticeKey = `${year}-${moment}`
      if (current.lastBirthdayNoticeKey === noticeKey) return
      const messages = {
        before: `Your birthday is coming up, ${current.name}. What would make this year feel like yours?`,
        day: `Happy birthday, ${current.name}. What gift, adventure, or person are you wishing for today?`,
        after: `Your birthday week is still unfolding, ${current.name}. What moment from it do you want to remember?`,
      }
      const nextProfile = { ...current, lastBirthdayNoticeKey: noticeKey }
      writeProfile(nextProfile)
      setProfile(nextProfile)
      setBirthdayPrompt({ moment, message: messages[moment] })
    }
    checkBirthday()
    document.addEventListener('visibilitychange', checkBirthday)
    return () => document.removeEventListener('visibilitychange', checkBirthday)
  }, [profile])

  const completeWelcome = (name: string, birthDate: string) => {
    const nextProfile = { name, birthDate, lastGreetingAt: nowIso() }
    writeProfile(nextProfile)
    setProfile(nextProfile)
    setShowWelcome(false)
  }

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
      <AmbientAtmosphere />
      <header className="mobile-header">
        <NavLink to="/" className="wordmark"><CompassMark /> type a wish</NavLink>
        <button className="icon-button" onClick={() => setLocked(true)} aria-label="Lock your atlas"><Lock size={18} /></button>
      </header>
      <aside className="sidebar">
        <NavLink to="/" className="wordmark"><CompassMark /> type a wish</NavLink>
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
        {greeting && <div className="greeting-banner" role="status"><Sparkles size={17} /><span>{greeting}</span><button className="text-button" onClick={() => setGreeting('')} aria-label="Dismiss greeting">Dismiss</button></div>}
        {birthdayPrompt && <BirthdayPrompt moment={birthdayPrompt.moment} message={birthdayPrompt.message} onDismiss={() => setBirthdayPrompt(null)} onAction={() => { setBirthdayPrompt(null); navigate(birthdayPrompt.moment === 'after' ? '/memories/new' : '/wishes/new') }} />}
        <RoutesView wishes={wishes} memories={memories} media={media} categories={categories} saveWish={saveWish} saveMemory={saveMemory} deleteWish={deleteWish} attachMedia={attachMedia} removeMedia={removeMedia} security={security} setSecurity={setSecurity} lock={() => setLocked(true)} />
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'bottom-link active' : 'bottom-link'}><Icon size={19} /><span>{label}</span></NavLink>)}
      </nav>
      {showWelcome && <WelcomeDialog onComplete={completeWelcome} />}
    </div>
  )
}

function WelcomeDialog({ onComplete }: { onComplete: (name: string, birthDate: string) => void }) {
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length < 2) { setError('Please enter at least two characters for your name.'); return }
    if (!birthDate || ageAtDate(birthDate) < 13 || new Date(`${birthDate}T00:00:00`) > new Date()) { setError('Please enter a valid birth date. You must be at least 13.'); return }
    onComplete(trimmedName, birthDate)
  }
  return <div className="welcome-backdrop"><section className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="welcome-icon"><Sparkles size={22} /></div><p className="eyebrow">A SMALL HELLO</p><h1 id="welcome-title">Welcome to your atlas.</h1><p>What should we call you? This stays on this device and helps your atlas feel like yours.</p><form className="welcome-form" onSubmit={submit}><label><span>Your name</span><input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError('') }} autoComplete="name" /></label><label><span>When were you born?</span><input type="date" value={birthDate} onChange={(event) => { setBirthDate(event.target.value); setError('') }} max={MAX_BIRTH_DATE} /></label>{birthDate && <small className="age-preview">Your atlas will remember that you are {ageAtDate(birthDate)}.</small>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" type="submit">Enter my atlas <ArrowLeft size={17} className="welcome-arrow" /></button></form><small>Used only to personalize your experience. It is never sent anywhere.</small></section></div>
}

function BirthdayPrompt({ moment, message, onDismiss, onAction }: { moment: BirthdayMoment; message: string; onDismiss: () => void; onAction: () => void }) {
  return <aside className="birthday-prompt" role="status"><div className="birthday-icon"><Sparkles size={20} /></div><div><p className="eyebrow">{moment === 'day' ? 'TODAY IS YOUR DAY' : moment === 'before' ? 'A LITTLE SOMETHING AHEAD' : 'A NEW YEAR OF YOU'}</p><p>{message}</p><button className="button primary small" onClick={onAction}>{moment === 'after' ? 'Save this memory' : 'Add a birthday wish'}</button><button className="text-button" onClick={onDismiss}>Not now</button></div></aside>
}

function RoutesView(props: { wishes: Wish[]; memories: Memory[]; media: MediaAttachment[]; categories: Category[]; saveWish: (wish: Wish) => Promise<void>; saveMemory: (memory: Memory) => Promise<void>; deleteWish: (id: string) => Promise<void>; attachMedia: (ownerType: 'wish' | 'memory', ownerId: string, file: File) => Promise<void>; removeMedia: (mediaId: string) => Promise<void>; security: SecuritySettings; setSecurity: (settings: SecuritySettings) => void; lock: () => void }) {
  const location = useLocation()
  let content: ReactNode
  if (location.pathname === '/wishes/new') content = <WishEditor categories={props.categories} saveWish={props.saveWish} />
  else if (location.pathname === '/memories/new') content = <MemoryEditor saveMemory={props.saveMemory} />
  else if (location.pathname.endsWith('/edit')) {
    const wishId = location.pathname.split('/')[2]
    content = <WishEditor initialWish={props.wishes.find((wish) => wish.id === wishId)} categories={props.categories} saveWish={props.saveWish} />
  } else if (location.pathname.startsWith('/wishes/')) content = <WishDetail wishes={props.wishes} categories={props.categories} media={props.media} saveWish={props.saveWish} deleteWish={props.deleteWish} attachMedia={props.attachMedia} removeMedia={props.removeMedia} />
  else if (location.pathname === '/wishes') content = <WishesPage {...props} />
  else if (location.pathname === '/memories') content = <MemoriesPage memories={props.memories} />
  else if (location.pathname === '/settings') content = <SettingsPage security={props.security} setSecurity={props.setSecurity} lock={props.lock} />
  else content = <AtlasPage wishes={props.wishes} categories={props.categories} memories={props.memories} />
  return <div className="page-transition" key={`${location.pathname}${location.search}`}>{content}</div>
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>
}

function AtlasPage({ wishes, categories, memories }: { wishes: Wish[]; categories: Category[]; memories: Memory[] }) {
  const navigate = useNavigate()
  const [today] = useState(() => new Date())
  const [showResurfacing, setShowResurfacing] = useState(true)
  const weather = wishes.length === 0 ? 'A quiet sky, waiting for its first star.' : wishes.filter((wish) => wish.status === 'Done').length > 0 ? 'Some stars have already become memories.' : wishes.filter((wish) => wish.status === 'Planning').length > 0 ? 'The map is beginning to take shape.' : 'The horizon is wide.'
  const resurfaced = memories.find((memory) => {
    if (!memory.memoryDate) return false
    const memoryDate = new Date(memory.memoryDate)
    return memoryDate.getMonth() === today.getMonth() && memoryDate.getDate() === today.getDate() && memoryDate.getFullYear() < today.getFullYear()
  })
  return <div className="page atlas-page">
    <PageHeader eyebrow="YOUR PRIVATE ATLAS" title="A life in the making." description="A place for everything you hope to experience, create, and remember." />
    <div className="atlas-weather"><Sparkles size={16} /><span>{weather}</span></div>
    <button className="hero-action" onClick={() => navigate('/wishes/new')}><Plus size={24} /><span><strong>Add a wish</strong><small>Start with a sentence. Let the rest come later.</small></span><ArrowLeft className="action-arrow" size={20} /></button>
    <WishConstellation wishes={wishes} onSelect={(id) => navigate(`/wishes/${id}`)} />
    {resurfaced && showResurfacing && <MemoryResurfacing memory={resurfaced} onDismiss={() => setShowResurfacing(false)} onOpen={() => navigate('/memories')} />}
    <section className="section-block"><div className="section-heading"><h2>Your world, so far</h2><NavLink to="/wishes">Explore all <span aria-hidden="true">→</span></NavLink></div>
      <div className="category-grid">{categories.map((category, index) => {
        const count = wishes.filter((wish) => wish.categoryIds.includes(category.id)).length
        return <NavLink to={`/wishes?category=${category.id}`} className={`category-card category-${index % 4}`} key={category.id}><span className="category-icon">{index === 0 ? <Compass /> : index === 1 ? <Archive /> : index === 2 ? <Heart /> : <Sparkles />}<span className="category-orbit" /></span><span className="category-name">{category.name}</span><span className="category-copy">{category.description}</span><span className="category-count">{count ? `${count} ${count === 1 ? 'wish' : 'wishes'}` : 'A space for what matters.'}</span></NavLink>
      })}</div>
    </section>
    {wishes.length === 0 && <div className="empty-card"><WandSparkles size={20} /><div><h3>There is room for your first wish.</h3><p>It can be ambitious, ordinary, or still taking shape. One sentence is enough.</p></div></div>}
  </div>
}

function WishConstellation({ wishes, onSelect }: { wishes: Wish[]; onSelect: (id: string) => void }) {
  const reduced = useReducedMotion()
  return <section className="constellation" aria-label="Your wish constellation"><div className="constellation-heading"><div><p className="eyebrow">YOUR CONSTELLATION</p><h2>What is calling you?</h2></div><span>{wishes.length ? `${wishes.length} ${wishes.length === 1 ? 'star' : 'stars'}` : 'First star awaits'}</span></div><div className="constellation-sky">{wishes.length === 0 ? <button className="constellation-empty" onClick={() => onSelect('new')}><span className="constellation-star pulse-star" />Your first wish will become the first star.</button> : wishes.map((wish, index) => <button key={wish.id} className={`constellation-star constellation-${wish.status.toLowerCase()}`} style={{ left: `${15 + ((index * 37) % 72)}%`, top: `${25 + ((index * 53) % 48)}%`, animationDelay: reduced ? '0s' : `${index * 120}ms` }} onClick={() => onSelect(wish.id)} title={wish.title} aria-label={`Open wish: ${wish.title}`}>{wish.pinned && <span className="star-ring" />}</button>)}</div></section>
}

function MemoryResurfacing({ memory, onDismiss, onOpen }: { memory: Memory; onDismiss: () => void; onOpen: () => void }) {
  return <aside className="memory-resurfacing" role="status"><p className="eyebrow">A MEMORY FOUND YOU</p><p>One year ago, you remembered “{memory.title || memory.body.slice(0, 72)}”.</p><button className="button secondary small" onClick={onOpen}>Revisit memory</button><button className="text-button" onClick={onDismiss}>Not now</button></aside>
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
  const reduced = useReducedMotion()
  return <button className={`wish-card ${compact ? 'compact' : ''}`} onPointerMove={(event) => { if (reduced) return; const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--tilt-x', `${((event.clientY - rect.top) / rect.height - .5) * -1.2}deg`); event.currentTarget.style.setProperty('--tilt-y', `${((event.clientX - rect.left) / rect.width - .5) * 1.2}deg`) }} onPointerLeave={(event) => { event.currentTarget.style.setProperty('--tilt-x', '0deg'); event.currentTarget.style.setProperty('--tilt-y', '0deg') }} onClick={() => navigate(`/wishes/${wish.id}`)}><div className="wish-card-meta"><span>{wish.status}</span>{wish.pinned && <span aria-label="Pinned">• pinned</span>}</div><h3>{wish.title}</h3>{wish.body && <p>{wish.body}</p>}<div className="tag-row">{wish.categoryIds.map((id) => <span key={id}>{categories.find((category) => category.id === id)?.name}</span>)}</div></button>
}

function WishEditor({ categories, saveWish, initialWish }: { categories: Category[]; saveWish: (wish: Wish) => Promise<void>; initialWish?: Wish }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(initialWish?.title ?? '')
  const [body, setBody] = useState(initialWish?.body ?? '')
  const [prompt, setPrompt] = useState(() => prompts[Math.floor(Math.random() * prompts.length)])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialWish?.categoryIds ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true); setSaveError('')
    try {
      const now = new Date().toISOString()
      await saveWish({ id: initialWish?.id ?? crypto.randomUUID(), title: title.trim(), body: body.trim(), status: initialWish?.status ?? 'Dreaming', categoryIds: selectedCategories, tagIds: initialWish?.tagIds ?? [], createdAt: initialWish?.createdAt ?? now, updatedAt: now, completedAt: initialWish?.completedAt, targetDate: initialWish?.targetDate, pinned: initialWish?.pinned ?? false, sortOrder: initialWish?.sortOrder ?? Date.now(), mediaIds: initialWish?.mediaIds ?? [] })
      setSaved(true)
      window.setTimeout(() => navigate(-1), 650)
    } catch {
      setSaveError('Your wish could not be saved yet. Nothing has been lost. Try again.')
      setSaving(false)
    }
  }
  return <div className="page writing-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back</button><PageHeader eyebrow="A NEW WISH" title="What do you want to experience?" description="It doesn't have to make sense to anyone else. It only has to mean something to you." /><form onSubmit={submit} className="writing-form"><label className="writing-field"><span>YOUR WISH</span><textarea autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setSaveError('') }} placeholder="Write whatever comes to mind…" rows={3} required /></label><label className="writing-field"><span>THE STORY BEHIND IT <em>(OPTIONAL)</em></span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Why does this matter to you? Write a little, or leave it for another day." rows={4} /></label><div className="prompt-card"><div className="prompt-title"><WandSparkles size={18} /> Need a little inspiration?</div><p>“{prompt}”</p><button type="button" className="text-button" onClick={() => setPrompt(prompts[(prompts.indexOf(prompt) + 1) % prompts.length])}>Another prompt <span>↗</span></button><small>Optional</small></div><WritingSoundscape /> <fieldset className="category-picker"><legend>ADD DETAILS <em>(OPTIONAL)</em></legend><div className="category-options">{categories.map((category) => <button type="button" className={selectedCategories.includes(category.id) ? 'selected' : ''} key={category.id} onClick={() => setSelectedCategories((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])}>{selectedCategories.includes(category.id) && <Check size={15} />}{category.name}</button>)}</div></fieldset>{saveError && <p className="form-error" role="alert">{saveError}</p>}<button className={`save-button ${saved ? 'saved' : ''}`} disabled={!title.trim() || saving}>{saved ? 'Saved to your atlas ✓' : saving ? 'Saving your wish…' : 'Save to my atlas'}</button></form></div>
}

function WritingSoundscape() {
  const [enabled, setEnabled] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const toggle = () => {
    if (enabled) { oscillatorRef.current?.stop(); oscillatorRef.current = null; audioRef.current?.close(); audioRef.current = null; setEnabled(false); return }
    try {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = 174; gain.gain.value = 0.008
      oscillator.connect(gain).connect(context.destination); oscillator.start()
      audioRef.current = context; oscillatorRef.current = oscillator; setEnabled(true)
    } catch { setEnabled(false) }
  }
  useEffect(() => () => { oscillatorRef.current?.stop(); void audioRef.current?.close() }, [])
  return <button type="button" className={`soundscape-toggle ${enabled ? 'enabled' : ''}`} onClick={toggle} aria-pressed={enabled}><span className="soundscape-wave" /> {enabled ? 'Quiet soundscape on' : 'Optional quiet soundscape'}</button>
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
  return <div className="page detail-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back to wishes</button><article className="detail-card story-reveal"><div className="wish-card-meta"><span>A WISH · {wish.status.toUpperCase()}</span></div><h1>{wish.title}</h1>{wish.body && <p className="detail-body">{wish.body}</p>}<div className="tag-row">{wish.categoryIds.map((categoryId) => <span key={categoryId}>{categories.find((category) => category.id === categoryId)?.name}</span>)}</div></article><div className="story-progress" aria-hidden="true" /><section className="detail-section story-reveal"><BookHeart size={22} /><div><p className="eyebrow">CHAPTER ONE</p><h2>The story behind it</h2><p>An optional reflection can grow as this dream becomes more meaningful.</p></div></section><section className="detail-section media-section story-reveal"><ImagePlus size={22} /><div><p className="eyebrow">CHAPTER TWO</p><h2>Photos, audio and video</h2><p>Files stay in this browser and are attached to this wish.</p><div className="media-buttons"><label className="button secondary small">Add photo<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label><label className="button secondary small">Add audio<input type="file" accept="audio/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label><label className="button secondary small">Add video<input type="file" accept="video/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachMedia('wish', wish.id, file).catch((error: Error) => setMediaError(error.message)) }} /></label></div>{mediaError && <p className="media-error" role="alert">{mediaError}</p>}<div className="media-list">{wishMedia.map((item) => <MediaPreview key={item.id} item={item} onRemove={removeMedia} />)}</div></div></section><div className="detail-actions"><button className="button secondary" onClick={() => navigate(`/wishes/${wish.id}/edit`)}><WandSparkles size={17} /> Edit wish</button><button className="button primary" onClick={complete} disabled={wish.status === 'Done'}><Check size={18} /> {wish.status === 'Done' ? 'Already done' : 'Mark as done'}</button></div><button className="danger-link" onClick={async () => { if (window.confirm('Delete this wish? Linked memories will stay safe.')) { await deleteWish(wish.id); navigate('/wishes') } }}><Trash2 size={15} /> Delete this wish</button></div>
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
  const navigate = useNavigate(); const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [memoryDate, setMemoryDate] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim() || saving) return
    setSaving(true); setError('')
    try {
      const now = new Date().toISOString()
      await saveMemory({ id: crypto.randomUUID(), title: title.trim(), body: body.trim(), memoryDate: memoryDate || undefined, createdAt: now, updatedAt: now, categoryIds: [], tagIds: [], mediaIds: [], linkedWishIds: [] })
      navigate('/memories')
    } catch {
      setError('Your memory could not be saved yet. Nothing has been lost. Try again.')
      setSaving(false)
    }
  }
  return <div className="page writing-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Back</button><PageHeader eyebrow="A NEW MEMORY" title="What do you want to remember?" description="The ordinary moments often become the ones we keep." /><form className="writing-form" onSubmit={submit}><label className="writing-field"><span>TITLE <em>(OPTIONAL)</em></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A name for this moment" /></label><label className="writing-field"><span>WHEN DID THIS HAPPEN? <em>(OPTIONAL)</em></span><input type="date" value={memoryDate} onChange={(event) => setMemoryDate(event.target.value)} max={MAX_BIRTH_DATE} /></label><label className="writing-field"><span>YOUR MEMORY</span><textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell it like you remember it…" rows={8} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="save-button" disabled={!body.trim() || saving}>{saving ? 'Saving your memory…' : 'Save this memory'}</button></form></div>
}

function SettingsPage({ security, setSecurity, lock }: { security: SecuritySettings; setSecurity: (settings: SecuritySettings) => void; lock: () => void }) {
  const [timeout, setTimeoutValue] = useState('5 minutes')
  const [passcode, setPasscode] = useState('')
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [newPasscode, setNewPasscode] = useState('')
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('success')
  const [busy, setBusy] = useState(false)
  const showMessage = (nextMessage: string, kind: 'error' | 'success') => { setMessage(nextMessage); setMessageKind(kind) }
  const saveSettings = (next: SecuritySettings) => { writeSecurity(next); setSecurity(next) }
  const enablePasscode = async () => { if (passcode.length < 4) { showMessage('Use at least 4 characters for a passcode.', 'error'); return }; setBusy(true); try { saveSettings({ ...security, passcodeVerifier: await createPasscodeVerifier(passcode) }); setPasscode(''); showMessage('Passcode enabled. Your atlas is ready to protect.', 'success') } catch { showMessage('Passcode could not be created. Try again.', 'error') } finally { setBusy(false) } }
  const resetPasscode = async () => { if (!security.passcodeVerifier || !await verifyPasscode(currentPasscode, security.passcodeVerifier)) { showMessage('The previous passcode is incorrect.', 'error'); return }; if (newPasscode.length < 4) { showMessage('Use at least 4 characters for the new passcode.', 'error'); return }; setBusy(true); try { saveSettings({ ...security, passcodeVerifier: await createPasscodeVerifier(newPasscode) }); setCurrentPasscode(''); setNewPasscode(''); showMessage('Passcode changed successfully.', 'success') } catch { showMessage('Passcode could not be changed. Try again.', 'error') } finally { setBusy(false) } }
  const disablePasscode = async () => { if (!security.passcodeVerifier || !await verifyPasscode(currentPasscode, security.passcodeVerifier)) { showMessage('Enter the current passcode to disable it.', 'error'); return }; setBusy(true); saveSettings({ passcodeVerifier: undefined, biometricCredentialId: undefined }); setCurrentPasscode(''); showMessage('Passcode disabled. Your atlas is now no-passcode.', 'success'); setBusy(false) }
  const enableBiometric = async () => {
    if (!security.passcodeVerifier) { showMessage('Set a passcode before enabling fingerprint or Face ID.', 'error'); return }
    if (!biometricSupported()) { showMessage('Biometric authentication requires HTTPS and a browser with WebAuthn support.', 'error'); return }
    setBusy(true)
    try { saveSettings({ ...security, biometricCredentialId: await registerBiometric() }); showMessage('Biometric unlock enabled on this device.', 'success') } catch { showMessage('Biometric setup was cancelled or is unavailable on this device.', 'error') } finally { setBusy(false) }
  }
  return <div className="page"><PageHeader eyebrow="YOUR SPACE" title="Settings" description="Keep your atlas private, portable, and yours." /><div className="settings-list"><section className="settings-card"><div className="settings-icon"><Lock size={20} /></div><div><h2>Privacy and security</h2><p>Passcode protection is optional and off by default. It protects this browser session; it is not a substitute for encrypted storage.</p>{!security.passcodeVerifier ? <div className="security-form"><input type="password" value={passcode} onChange={(event) => { setPasscode(event.target.value); setMessage('') }} placeholder="Create a passcode" aria-label="Create a passcode" /><button className="button secondary small" disabled={busy} onClick={() => void enablePasscode()}>{busy ? 'Creating…' : 'Enable passcode'}</button></div> : <><div className="security-form"><input type="password" value={currentPasscode} onChange={(event) => { setCurrentPasscode(event.target.value); setMessage('') }} placeholder="Current passcode" aria-label="Current passcode" /><input type="password" value={newPasscode} onChange={(event) => { setNewPasscode(event.target.value); setMessage('') }} placeholder="New passcode" aria-label="New passcode" /><button className="button secondary small" disabled={busy} onClick={() => void resetPasscode()}>{busy ? 'Changing…' : 'Change passcode'}</button><button className="button secondary small" disabled={busy} onClick={() => void disablePasscode()}>Turn off passcode</button></div><button className="button primary small" disabled={busy} onClick={lock}><Lock size={15} /> Lock now</button></>}{!security.biometricCredentialId && <button className="button secondary small" disabled={!security.passcodeVerifier || busy} onClick={() => void enableBiometric()}>{!security.passcodeVerifier ? 'Set a passcode before enabling biometrics' : biometricSupported() ? busy ? 'Verifying device…' : 'Enable fingerprint / Face ID' : 'Biometric authentication unavailable'}</button>}{security.biometricCredentialId && <p className="security-success">Biometric unlock is enabled on this device.</p>}{message && <p className={messageKind === 'error' ? 'form-error' : 'security-success'} role={messageKind === 'error' ? 'alert' : 'status'}>{message}</p>}</div></section><section className="settings-card"><div className="settings-icon"><Archive size={20} /></div><div><h2>Backups and restore</h2><p>Browser storage is not a backup. Export an archive regularly and keep the recovery key somewhere safe.</p><button className="button secondary small" onClick={() => alert('Backup export is not yet available.')}>Manage backups</button></div></section><section className="settings-card"><div className="settings-icon"><Tag size={20} /></div><div><h2>Automatic lock</h2><p>Lock your atlas after a period of inactivity.</p><select value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} aria-label="Automatic lock timeout">{['Immediately', '5 minutes', '15 minutes', 'Never'].map((value) => <option key={value}>{value}</option>)}</select></div></section></div></div>
}

function LockScreen({ security, onUnlock }: { security: SecuritySettings; onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const unlock = async (event: FormEvent) => { event.preventDefault(); if (!security.passcodeVerifier || busy) return; setBusy(true); setMessage(''); try { if (!await verifyPasscode(value, security.passcodeVerifier)) { setMessage('That passcode is incorrect.'); return }; onUnlock() } finally { setBusy(false) } }
  const biometricUnlock = async () => {
    if (!security.biometricCredentialId || busy) return
    setBusy(true)
    try { await authenticateBiometric(security.biometricCredentialId); onUnlock() } catch { setMessage('Biometric verification was cancelled or failed. You can try again or use your passcode.') } finally { setBusy(false) }
  }
  const hasAuthentication = Boolean(security.passcodeVerifier || security.biometricCredentialId)
  return <div className="lock-screen"><div className="lock-panel"><span className="lock-mark"><Unlock size={22} /></span><p className="eyebrow">YOUR PRIVATE ATLAS</p><h1>Welcome back.</h1>{security.passcodeVerifier && <form onSubmit={(event) => void unlock(event)}><p>Enter your passcode to return to the life you are making.</p><input type="password" value={value} onChange={(event) => { setValue(event.target.value); setMessage('') }} placeholder="Passcode" autoFocus aria-label="Passcode" /><button className="button primary" disabled={busy} type="submit">{busy ? 'Checking…' : 'Unlock atlas'}</button></form>}{security.biometricCredentialId && <button className="button secondary" disabled={busy} onClick={() => void biometricUnlock()}>{busy ? 'Waiting for verification…' : 'Use fingerprint / Face ID'}</button>}{!hasAuthentication && <><p>Your atlas has no passcode or biometric authentication. You can continue.</p><button className="button primary" onClick={onUnlock}>Continue</button></>}{message && <p className="form-error" role="alert">{message}</p>}</div></div>
}

export default App
