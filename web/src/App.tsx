import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coffee,
  Copy,
  Crown,
  DoorOpen,
  Globe2,
  ListTodo,
  LockKeyhole,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import {
  Badge,
  BuildInfo,
  Card,
  FasShell,
  Modal,
  ProgressBar,
  SignInButton,
  Tabs,
} from '@freeappstore/sdk/ui'
import { useRoomChannel } from './hooks/useRoomChannel'
import { readStoredValue, useStoredState } from './hooks/useStoredState'
import type {
  DiscussionPost,
  Participant,
  PersonalTask,
  PostCategory,
  Reply,
  RoomEvent,
  SavedPost,
  StudyRoom,
  StudyStatus,
  TimerState,
} from './types'

const fas = initApp({ appId: 'study-room' })
const ACTIVE_ROOM_KEY = 'study-room:active-room'
const IDENTITY_KEY = 'study-room:identity'
const SAVED_POSTS_KEY = 'study-room:saved-posts'
const ROOM_REGISTRY_COLLECTION = 'study-room-rooms'
const HOST_RECONNECT_GRACE_MS = 30 * 60 * 1000
const HOST_HEARTBEAT_MS = 30 * 1000
const ROOM_STATUS_CHECK_MS = 60 * 1000

type RoomRegistryDoc = {
  roomCode: string
  roomName: string
  ownerId: string
  ownerName: string
  createdAt: number
  closed: boolean
  closedAt: number | null
  closedReason: 'manual' | 'expired' | null
  lastHostSeenAt: number
  reconnectGraceMs: number
}

const roomRegistry = fas.collections.collection(ROOM_REGISTRY_COLLECTION)

const participantColors = ['#d86f4d', '#4c97b5', '#4d9a6a', '#9b6bb2', '#c6862a']

const categoryOrder: PostCategory[] = ['question', 'resource', 'note', 'other']

const categoryMeta: Record<PostCategory, { label: string; shortLabel: string; icon: ReactNode }> = {
  question: {
    label: 'Question',
    shortLabel: 'Q',
    icon: <MessageCircle size={15} />,
  },
  resource: {
    label: 'Resource',
    shortLabel: 'R',
    icon: <Globe2 size={15} />,
  },
  note: {
    label: 'Study note',
    shortLabel: 'N',
    icon: <BookOpen size={15} />,
  },
  other: {
    label: 'Other',
    shortLabel: 'O',
    icon: <Sparkles size={15} />,
  },
}

const statusMeta: Record<
  StudyStatus,
  { label: string; shortLabel: string; color: string; icon: ReactNode }
> = {
  studying: {
    label: 'Studying',
    shortLabel: 'Focus',
    color: 'var(--success)',
    icon: <BookOpen size={14} />,
  },
  break: {
    label: 'On a break',
    shortLabel: 'Break',
    color: 'var(--warning)',
    icon: <Coffee size={14} />,
  },
  away: {
    label: 'Away',
    shortLabel: 'Away',
    color: 'var(--muted)',
    icon: <Clock3 size={14} />,
  },
}

function createId(prefix = 'item') {
  if ('randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function getIdentity() {
  const existing = readStoredValue<{ id: string; name: string } | null>(IDENTITY_KEY, null)
  if (existing) return existing
  const identity = { id: createId('guest'), name: '' }
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  return identity
}

function saveIdentityName(name: string) {
  const identity = getIdentity()
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ ...identity, name }))
}

function participantColor(id: string) {
  const score = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0)
  return participantColors[score % participantColors.length]
}

function CategoryMark({ category }: { category: PostCategory }) {
  const meta = categoryMeta[category]
  return (
    <span className={`category-mark category-${category}`} title={meta.label} aria-label={meta.label}>
      <span aria-hidden="true">{meta.icon}</span>
      <span>{meta.shortLabel}</span>
    </span>
  )
}

function createParticipant(name: string, isHost: boolean): Participant {
  const identity = getIdentity()
  return {
    id: identity.id,
    name: name.trim() || 'Guest',
    status: 'studying',
    isHost,
    color: participantColor(identity.id),
    lastSeen: Date.now(),
  }
}

function createWelcomePosts(participant: Participant): DiscussionPost[] {
  return [
    {
      id: createId('post'),
      authorId: participant.id,
      author: participant.name,
      title: 'What are you focusing on today?',
      content:
        'Share a concrete study goal so the room can help you stay accountable without turning into a chat.',
      category: 'note',
      createdAt: Date.now(),
      replies: [],
    },
  ]
}

function createRoomSeed(
  name: string,
  focusMinutes: number,
  breakMinutes: number,
  displayName: string,
): StudyRoom {
  const participant = createParticipant(displayName, true)
  const code = createRoomCode()
  return {
    settings: {
      code,
      name: name.trim() || 'Deep Focus Room',
      focusMinutes,
      breakMinutes,
      createdAt: Date.now(),
      hostId: participant.id,
    },
    timer: {
      mode: 'focus',
      remaining: focusMinutes * 60,
      isRunning: false,
      endsAt: null,
      completedFocusSessions: 0,
    },
    participants: [participant],
    posts: createWelcomePosts(participant),
    goal: 'One focused session, one meaningful result.',
  }
}

function createJoinedRoom(code: string, displayName: string, sourceLink = ''): StudyRoom {
  let roomName = 'Shared Study Room'
  let focusMinutes = 25
  let breakMinutes = 5
  let registryId: string | undefined

  if (sourceLink) {
    try {
      const url = new URL(sourceLink)
      roomName = url.searchParams.get('name') || roomName
      focusMinutes = Number(url.searchParams.get('focus')) || focusMinutes
      breakMinutes = Number(url.searchParams.get('break')) || breakMinutes
      registryId = url.searchParams.get('rid') || undefined
    } catch {
      // The join form also accepts a raw code.
    }
  }

  const participant = createParticipant(displayName, false)
  return {
    settings: {
      code: code.toUpperCase(),
      name: roomName,
      focusMinutes,
      breakMinutes,
      createdAt: Date.now(),
      hostId: 'remote-host',
      registryId,
    },
    timer: {
      mode: 'focus',
      remaining: focusMinutes * 60,
      isRunning: false,
      endsAt: null,
      completedFocusSessions: 0,
    },
    participants: [participant],
    posts: [],
    goal: 'Waiting for the host to share the room state.',
  }
}

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function upsertParticipant(participants: Participant[], participant: Participant) {
  const exists = participants.some((item) => item.id === participant.id)
  return exists
    ? participants.map((item) => (item.id === participant.id ? participant : item))
    : [...participants, participant]
}

async function createRoomRegistry(room: StudyRoom, ownerId: string, ownerName: string) {
  const now = Date.now()
  const registry = await roomRegistry.create({
    roomCode: room.settings.code,
    roomName: room.settings.name,
    ownerId,
    ownerName,
    createdAt: room.settings.createdAt,
    closed: false,
    closedAt: null,
    closedReason: null,
    lastHostSeenAt: now,
    reconnectGraceMs: HOST_RECONNECT_GRACE_MS,
  } satisfies RoomRegistryDoc)
  return registry.id
}

async function readRoomRegistry(registryId?: string) {
  if (!registryId) return null
  return roomRegistry.get<RoomRegistryDoc>(registryId)
}

async function touchRoomRegistry(registryId: string, room: StudyRoom) {
  await roomRegistry.update(registryId, {
    roomName: room.settings.name,
    lastHostSeenAt: Date.now(),
  })
}

async function markRoomRegistryClosed(
  registryId: string | undefined,
  reason: RoomRegistryDoc['closedReason'],
) {
  if (!registryId) return
  await roomRegistry.update(registryId, {
    closed: true,
    closedAt: Date.now(),
    closedReason: reason,
  })
}

function isRegistryExpired(registry: RoomRegistryDoc) {
  const graceMs = registry.reconnectGraceMs || HOST_RECONNECT_GRACE_MS
  return Date.now() - registry.lastHostSeenAt > graceMs
}

function createSavedPost(room: StudyRoom, post: DiscussionPost): SavedPost {
  const now = Date.now()
  return {
    id: `${room.settings.code}:${post.id}`,
    postId: post.id,
    roomCode: room.settings.code,
    roomName: room.settings.name,
    category: post.category,
    title: post.title,
    content: post.content,
    author: post.author,
    authorId: post.authorId,
    createdAt: post.createdAt,
    savedAt: now,
    updatedAt: now,
    replies: post.replies,
  }
}

function syncSavedPostFromRoomPost(savedPost: SavedPost, room: StudyRoom, post: DiscussionPost) {
  return {
    ...savedPost,
    roomName: room.settings.name,
    category: post.category,
    title: post.title,
    content: post.content,
    author: post.author,
    authorId: post.authorId,
    createdAt: post.createdAt,
    updatedAt: Date.now(),
    replies: post.replies,
  }
}

function repliesMatch(left: Reply[], right: Reply[]) {
  return (
    left.length === right.length &&
    left.every((reply, index) => {
      const other = right[index]
      return (
        other &&
        reply.id === other.id &&
        reply.authorId === other.authorId &&
        reply.author === other.author &&
        reply.content === other.content &&
        reply.createdAt === other.createdAt
      )
    })
  )
}

function savedPostMatchesRoomPost(savedPost: SavedPost, room: StudyRoom, post: DiscussionPost) {
  return (
    savedPost.roomName === room.settings.name &&
    savedPost.category === post.category &&
    savedPost.title === post.title &&
    savedPost.content === post.content &&
    savedPost.author === post.author &&
    savedPost.authorId === post.authorId &&
    savedPost.createdAt === post.createdAt &&
    repliesMatch(savedPost.replies, post.replies)
  )
}

function isPostSaved(savedPosts: SavedPost[], roomCode: string, postId: string) {
  return savedPosts.some((post) => post.roomCode === roomCode && post.postId === postId)
}

function formatMarkdownDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function savedPostToMarkdown(post: SavedPost) {
  const replies = post.replies.length
    ? post.replies
        .map(
          (reply) => `### ${reply.author} · ${formatMarkdownDate(reply.createdAt)}\n\n${reply.content}`,
        )
        .join('\n\n')
    : '_No replies saved._'

  return [
    `# ${post.title}`,
    '',
    `- Room: ${post.roomName} (${post.roomCode})`,
    `- Category: ${categoryMeta[post.category].label}`,
    `- Author: ${post.author}`,
    `- Created: ${formatMarkdownDate(post.createdAt)}`,
    `- Saved: ${formatMarkdownDate(post.savedAt)}`,
    `- Last synced: ${formatMarkdownDate(post.updatedAt || post.savedAt)}`,
    '',
    '## Post',
    '',
    post.content,
    '',
    '## Replies',
    '',
    replies,
  ].join('\n')
}

function savedPostsToMarkdown(posts: SavedPost[]) {
  return posts.map(savedPostToMarkdown).join('\n\n---\n\n')
}

function extractRoomCode(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    return (url.searchParams.get('room') || '').toUpperCase()
  } catch {
    return trimmed.replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase()
  }
}

export default function App() {
  const { user } = useAuth(fas)
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(() =>
    readStoredValue<StudyRoom | null>(ACTIVE_ROOM_KEY, null),
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [roomClosedMessage, setRoomClosedMessage] = useState('')
  const [savedPostsOpen, setSavedPostsOpen] = useState(false)
  const [savedPosts, setSavedPosts] = useStoredState<SavedPost[]>(SAVED_POSTS_KEY, [])

  useEffect(() => {
    const roomCode = new URLSearchParams(window.location.search).get('room')
    if (roomCode && !activeRoom) setJoinOpen(true)
  }, [activeRoom])

  const enterRoom = async (room: StudyRoom) => {
    const identity = getIdentity()
    let nextRoom = room
    if (!room.settings.registryId && room.settings.hostId === identity.id && user) {
      try {
        const registryId = await createRoomRegistry(room, user.id, user.login)
        nextRoom = {
          ...room,
          settings: {
            ...room.settings,
            registryId,
          },
        }
      } catch (error) {
        console.warn('Unable to create shared room registry. Falling back to local room state.', error)
      }
    }

    window.localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(nextRoom))
    window.localStorage.setItem(`study-room:room:${nextRoom.settings.code}`, JSON.stringify(nextRoom))
    setActiveRoom(nextRoom)
    setCreateOpen(false)
    setJoinOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const exitRoom = (roomCode?: string) => {
    window.localStorage.removeItem(ACTIVE_ROOM_KEY)
    if (roomCode) window.localStorage.removeItem(`study-room:room:${roomCode}`)
    window.history.replaceState({}, '', window.location.pathname)
    setActiveRoom(null)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const leaveRoom = () => exitRoom()

  const handleRoomClosed = (message: string, roomCode: string) => {
    exitRoom(roomCode)
    setRoomClosedMessage(message)
  }

  return (
    <FasShell app={fas} appName="Study Room">
      {activeRoom ? (
        <RoomExperience
          key={activeRoom.settings.code}
          initialRoom={activeRoom}
          authenticated={Boolean(user)}
          platformName={user?.login}
          savedPosts={savedPosts}
          setSavedPosts={setSavedPosts}
          onLeave={leaveRoom}
          onRoomClosed={handleRoomClosed}
        />
      ) : (
        <Lobby
          userName={user?.login}
          savedCount={savedPosts.length}
          onCreate={() => setCreateOpen(true)}
          onJoin={() => setJoinOpen(true)}
          onSaved={() => setSavedPostsOpen(true)}
        />
      )}

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={enterRoom} />
      <JoinRoomModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={enterRoom} />
      <SavedPostsModal
        open={savedPostsOpen}
        posts={savedPosts}
        setPosts={setSavedPosts}
        onClose={() => setSavedPostsOpen(false)}
      />
      <Modal
        open={Boolean(roomClosedMessage)}
        onClose={() => setRoomClosedMessage('')}
        title="Room closed"
        maxWidth={420}
      >
        <div className="form-stack">
          <p className="modal-intro">{roomClosedMessage}</p>
          <button
            className="button button-primary button-full"
            onClick={() => setRoomClosedMessage('')}
          >
            Back to home
          </button>
        </div>
      </Modal>
      <BuildInfo />
    </FasShell>
  )
}

interface LobbyProps {
  userName?: string
  savedCount: number
  onCreate: () => void
  onJoin: () => void
  onSaved: () => void
}

function Lobby({ userName, savedCount, onCreate, onJoin, onSaved }: LobbyProps) {
  return (
    <div className="lobby-shell">
      <section className="lobby-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} />
            Quiet accountability for focused work
          </div>
          <h1 className="display-font">Study together. Stay in the zone.</h1>
          <p>
            A calm shared Pomodoro room for friends who want presence and momentum, without the
            noise of a chat app or video call.
          </p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={onCreate}>
              <Plus size={18} />
              Create a room
            </button>
            <button className="button button-secondary button-large" onClick={onJoin}>
              <DoorOpen size={18} />
              Join a room
            </button>
            <button className="button button-secondary button-large" onClick={onSaved}>
              <BookOpen size={18} />
              Saved posts
              {savedCount > 0 && <span className="button-count">{savedCount}</span>}
            </button>
          </div>
          <div className="trust-row">
            <span>
              <CheckCircle2 size={16} /> No account required
            </span>
            <span>
              <CheckCircle2 size={16} /> No tracking
            </span>
            <span>
              <CheckCircle2 size={16} /> Free forever
            </span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Study timer preview">
          <div className="timer-preview">
            <div className="timer-preview-top">
              <div>
                <span className="preview-kicker">FOCUS SESSION</span>
                <strong>Research Sprint</strong>
              </div>
              <Badge variant="success">3 together</Badge>
            </div>
            <div className="preview-ring">
              <div>
                <span>18:32</span>
                <small>of 25:00</small>
              </div>
            </div>
            <div className="preview-control">
              <Pause size={17} fill="currentColor" />
              Pause together
            </div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <Card padding="1.25rem">
          <div className="feature-icon warm">
            <Clock3 size={20} />
          </div>
          <h2>One shared rhythm</h2>
          <p>Everyone follows the same focus and break cycle, controlled by the room host.</p>
        </Card>
        <Card padding="1.25rem">
          <div className="feature-icon cool">
            <Users size={20} />
          </div>
          <h2>Presence, not pressure</h2>
          <p>See who is studying, taking a break, or away without opening a live chat.</p>
        </Card>
        <Card padding="1.25rem">
          <div className="feature-icon mint">
            <ListTodo size={20} />
          </div>
          <h2>Your private plan</h2>
          <p>Keep a local task list for this session. It is visible only on your device.</p>
        </Card>
      </section>

      <section className="sync-card">
        <div className="sync-copy">
          <div className="feature-icon cool">
            {userName ? <Wifi size={20} /> : <Globe2 size={20} />}
          </div>
          <div>
            <h2>{userName ? 'Live sync is on' : 'Want cross-device live sync?'}</h2>
            <p>
              Guest rooms work instantly. Sign in only when you want FreeAppStore real-time rooms
              across devices.
            </p>
          </div>
        </div>
        {!userName && (
          <div className="auth-actions">
            <SignInButton app={fas} label="GitHub" />
            <button className="button button-secondary" onClick={() => fas.auth.signIn('google')}>
              <Globe2 size={17} />
              Google
            </button>
          </div>
        )}
      </section>

      <a className="platform-link" href="https://freeappstore.online">
        Part of FreeAppStore <ChevronRight size={15} />
      </a>
    </div>
  )
}

interface CreateRoomModalProps {
  open: boolean
  onClose: () => void
  onCreate: (room: StudyRoom) => void
}

function CreateRoomModal({ open, onClose, onCreate }: CreateRoomModalProps) {
  const identity = getIdentity()
  const [roomName, setRoomName] = useState('Deep Focus Room')
  const [displayName, setDisplayName] = useState(identity.name)
  const [focusMinutes, setFocusMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!displayName.trim()) return
    saveIdentityName(displayName.trim())
    onCreate(createRoomSeed(roomName, focusMinutes, breakMinutes, displayName))
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a study room" maxWidth={540}>
      <form className="form-stack" onSubmit={submit}>
        <p className="modal-intro">Choose a simple rhythm. You can invite friends once inside.</p>
        <Field label="Room name">
          <input
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="e.g. COMP90015 Study Room"
            autoFocus
          />
        </Field>
        <Field label="Your display name">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How friends will see you"
            required
          />
        </Field>
        <div className="form-grid-two">
          <Field label="Focus minutes">
            <input
              type="number"
              min={5}
              max={120}
              value={focusMinutes}
              onChange={(event) => setFocusMinutes(Number(event.target.value))}
            />
          </Field>
          <Field label="Break minutes">
            <input
              type="number"
              min={1}
              max={30}
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(Number(event.target.value))}
            />
          </Field>
        </div>
        <button className="button button-primary button-full" type="submit">
          Create room
          <ChevronRight size={17} />
        </button>
      </form>
    </Modal>
  )
}

interface JoinRoomModalProps {
  open: boolean
  onClose: () => void
  onJoin: (room: StudyRoom) => void
}

function JoinRoomModal({ open, onClose, onJoin }: JoinRoomModalProps) {
  const identity = getIdentity()
  const params = new URLSearchParams(window.location.search)
  const initialLink = params.get('room') ? window.location.href : ''
  const [mode, setMode] = useState('link')
  const [value, setValue] = useState(initialLink)
  const [displayName, setDisplayName] = useState(identity.name)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const code = extractRoomCode(value)
    if (!code || !displayName.trim()) {
      setError('Enter a valid room link or code and your display name.')
      return
    }
    saveIdentityName(displayName.trim())
    onJoin(createJoinedRoom(code, displayName, mode === 'link' ? value : ''))
  }

  return (
    <Modal open={open} onClose={onClose} title="Join a room" maxWidth={500}>
      <div className="form-stack">
        <Tabs
          tabs={[
            { key: 'link', label: 'By link' },
            { key: 'code', label: 'By code' },
          ]}
          active={mode}
          onChange={(nextMode) => {
            setMode(nextMode)
            setValue('')
            setError('')
          }}
        />
        <form className="form-stack" onSubmit={submit}>
          <Field label={mode === 'link' ? 'Room link' : 'Room code'}>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                mode === 'link'
                  ? 'https://study-room.freeappstore.online/?room=...'
                  : 'e.g. 7X6K2A'
              }
              autoFocus
            />
          </Field>
          <Field label="Your display name">
            <div className="input-with-icon">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How friends will see you"
                required
              />
              <CircleUserRound size={18} />
            </div>
          </Field>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary button-full" type="submit">
            <DoorOpen size={17} />
            Join room
          </button>
          <p className="form-footnote">
            <LockKeyhole size={15} />
            You do not need an account to join.
          </p>
        </form>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface RoomExperienceProps {
  initialRoom: StudyRoom
  authenticated: boolean
  platformName?: string
  savedPosts: SavedPost[]
  setSavedPosts: React.Dispatch<React.SetStateAction<SavedPost[]>>
  onLeave: () => void
  onRoomClosed: (message: string, roomCode: string) => void
}

type RoomPage = 'room' | 'members' | 'tasks' | 'board'

function RoomExperience({
  initialRoom,
  authenticated,
  platformName,
  savedPosts,
  setSavedPosts,
  onLeave,
  onRoomClosed,
}: RoomExperienceProps) {
  const identity = getIdentity()
  const [room, setRoom] = useStoredState(
    `study-room:room:${initialRoom.settings.code}`,
    initialRoom,
  )
  const [tasks, setTasks] = useStoredState<PersonalTask[]>(
    `study-room:tasks:${initialRoom.settings.code}`,
    [],
  )
  const [page, setPage] = useState<RoomPage>('room')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(Date.now())
  const roomRef = useRef(room)
  const sendRef = useRef<(event: RoomEvent) => void>(() => undefined)

  roomRef.current = room

  const isHost = room.settings.hostId === identity.id
  const currentParticipant =
    room.participants.find((participant) => participant.id === identity.id) ??
    createParticipant(identity.name || platformName || 'Guest', isHost)

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room))
  }, [room])

  useEffect(() => {
    setSavedPosts((current) => {
      let changed = false
      const nextSavedPosts = current.map((savedPost) => {
        if (savedPost.roomCode !== room.settings.code) return savedPost
        const livePost = room.posts.find((post) => post.id === savedPost.postId)
        if (!livePost) return savedPost
        if (savedPostMatchesRoomPost(savedPost, room, livePost)) return savedPost
        changed = true
        return syncSavedPostFromRoomPost(savedPost, room, livePost)
      })
      return changed ? nextSavedPosts : current
    })
  }, [room, setSavedPosts])

  const handleRoomEvent = useCallback(
    (event: RoomEvent) => {
      if (event.type === 'room-closed') {
        if (event.roomCode !== roomRef.current.settings.code) return
        onRoomClosed('The host closed this study room.', event.roomCode)
        return
      }

      if (event.type === 'sync-request') {
        setRoom((current) => ({
          ...current,
          participants: upsertParticipant(current.participants, event.participant),
        }))
        if (roomRef.current.settings.hostId === identity.id) {
          sendRef.current({
            type: 'snapshot',
            room: {
              ...roomRef.current,
              participants: upsertParticipant(
                roomRef.current.participants,
                event.participant,
              ),
            },
          })
        }
        return
      }

      setRoom((current) => {
        switch (event.type) {
          case 'presence':
          case 'status':
            return {
              ...current,
              participants: upsertParticipant(current.participants, event.participant),
            }
          case 'leave':
            return {
              ...current,
              participants: current.participants.filter(
                (participant) => participant.id !== event.participantId,
              ),
            }
          case 'timer':
            return { ...current, timer: event.timer }
          case 'post':
            return current.posts.some((post) => post.id === event.post.id)
              ? current
              : { ...current, posts: [event.post, ...current.posts] }
          case 'reply':
            return {
              ...current,
              posts: current.posts.map((post) =>
                post.id === event.postId &&
                !post.replies.some((reply) => reply.id === event.reply.id)
                  ? { ...post, replies: [...post.replies, event.reply] }
                  : post,
              ),
            }
          case 'goal':
            return { ...current, goal: event.goal }
          case 'snapshot': {
            if (current.settings.hostId === identity.id) return current
            return {
              ...event.room,
              participants: upsertParticipant(event.room.participants, currentParticipant),
            }
          }
          default:
            return current
        }
      })
    },
    [currentParticipant, identity.id, onRoomClosed, setRoom],
  )

  const { send, connectionState } = useRoomChannel({
    fas,
    roomCode: room.settings.code,
    authenticated,
    onEvent: handleRoomEvent,
  })
  sendRef.current = send

  useEffect(() => {
    const registryId = room.settings.registryId
    if (!registryId) return

    let cancelled = false
    const validateRegistry = async () => {
      try {
        const registry = await readRoomRegistry(registryId)
        if (cancelled || !registry) return

        const roomCode = roomRef.current.settings.code
        if (registry.closed) {
          onRoomClosed('This study room has been closed.', roomCode)
          return
        }

        if (isRegistryExpired(registry)) {
          if (isHost) {
            try {
              await markRoomRegistryClosed(registryId, 'expired')
            } catch {
              // If the host cannot update the registry, still expire locally.
            }
          }
          if (!cancelled) {
            onRoomClosed(
              isHost
                ? 'This room expired after the host was away for too long.'
                : 'The host did not reconnect in time, so this room expired.',
              roomCode,
            )
          }
          return
        }

        if (isHost) {
          await touchRoomRegistry(registryId, roomRef.current)
        }
      } catch {
        // Fail open: a temporary network or API issue must not close the room.
      }
    }

    void validateRegistry()
    const interval = window.setInterval(
      validateRegistry,
      isHost ? HOST_HEARTBEAT_MS : ROOM_STATUS_CHECK_MS,
    )

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isHost, onRoomClosed, room.settings.registryId])

  useEffect(() => {
    const participant = { ...currentParticipant, lastSeen: Date.now() }
    setRoom((current) => ({
      ...current,
      participants: upsertParticipant(current.participants, participant),
    }))
    send({ type: 'presence', participant })
    if (!isHost) send({ type: 'sync-request', participant })
  }, [connectionState, isHost, send, setRoom])

  useEffect(() => {
    if (!room.timer.isRunning) return
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [room.timer.isRunning])

  const displayedRemaining = room.timer.isRunning && room.timer.endsAt
    ? Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000))
    : room.timer.remaining

  useEffect(() => {
    if (!room.timer.isRunning || displayedRemaining > 0) return
    const nextMode = room.timer.mode === 'focus' ? 'break' : 'focus'
    const nextTimer: TimerState = {
      mode: nextMode,
      remaining:
        (nextMode === 'focus'
          ? room.settings.focusMinutes
          : room.settings.breakMinutes) * 60,
      isRunning: false,
      endsAt: null,
      completedFocusSessions:
        room.timer.completedFocusSessions + (room.timer.mode === 'focus' ? 1 : 0),
    }
    setRoom((current) => ({ ...current, timer: nextTimer }))
    send({ type: 'timer', timer: nextTimer })
  }, [
    displayedRemaining,
    room.settings.breakMinutes,
    room.settings.focusMinutes,
    room.timer,
    send,
    setRoom,
  ])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [page])

  const updateTimer = (timer: TimerState) => {
    setNow(Date.now())
    setRoom((current) => ({ ...current, timer }))
    send({ type: 'timer', timer })
  }

  const toggleTimer = () => {
    if (!isHost) return
    if (room.timer.isRunning) {
      updateTimer({
        ...room.timer,
        remaining: displayedRemaining,
        isRunning: false,
        endsAt: null,
      })
    } else {
      updateTimer({
        ...room.timer,
        remaining: displayedRemaining,
        isRunning: true,
        endsAt: Date.now() + displayedRemaining * 1000,
      })
    }
  }

  const resetTimer = () => {
    if (!isHost) return
    updateTimer({
      mode: 'focus',
      remaining: room.settings.focusMinutes * 60,
      isRunning: false,
      endsAt: null,
      completedFocusSessions: room.timer.completedFocusSessions,
    })
  }

  const skipSession = () => {
    if (!isHost) return
    const nextMode = room.timer.mode === 'focus' ? 'break' : 'focus'
    updateTimer({
      mode: nextMode,
      remaining:
        (nextMode === 'focus'
          ? room.settings.focusMinutes
          : room.settings.breakMinutes) * 60,
      isRunning: false,
      endsAt: null,
      completedFocusSessions:
        room.timer.completedFocusSessions + (room.timer.mode === 'focus' ? 1 : 0),
    })
  }

  const changeStatus = (status: StudyStatus) => {
    const participant = { ...currentParticipant, status, lastSeen: Date.now() }
    setRoom((current) => ({
      ...current,
      participants: upsertParticipant(current.participants, participant),
    }))
    send({ type: 'status', participant })
  }

  const addPost = (post: DiscussionPost) => {
    setRoom((current) => ({ ...current, posts: [post, ...current.posts] }))
    send({ type: 'post', post })
    setPostOpen(false)
    setToast('Post shared with the room')
  }

  const addReply = (postId: string, reply: Reply) => {
    setRoom((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId ? { ...post, replies: [...post.replies, reply] } : post,
      ),
    }))
    send({ type: 'reply', postId, reply })
  }

  const updateGoal = (goal: string) => {
    setRoom((current) => ({ ...current, goal }))
    send({ type: 'goal', goal })
  }

  const toggleSavePost = (post: DiscussionPost) => {
    const savedId = `${room.settings.code}:${post.id}`
    const alreadySaved = savedPosts.some((savedPost) => savedPost.id === savedId)
    setSavedPosts((current) =>
      alreadySaved
        ? current.filter((savedPost) => savedPost.id !== savedId)
        : [createSavedPost(room, post), ...current],
    )
    setToast(alreadySaved ? 'Post removed from saved posts' : 'Post saved')
  }

  const exitCurrentRoom = () => {
    if (isHost) {
      const roomCode = room.settings.code
      void markRoomRegistryClosed(room.settings.registryId, 'manual')
      send({
        type: 'room-closed',
        closedBy: identity.id,
        roomCode,
      })
      window.setTimeout(() => onRoomClosed('You closed this study room.', roomCode), 150)
      return
    }

    send({ type: 'leave', participantId: identity.id })
    onLeave()
  }

  const activePost = room.posts.find((post) => post.id === activePostId) ?? null

  return (
    <div className="room-app">
      <RoomHeader
        room={room}
        connectionState={connectionState}
        authenticated={authenticated}
        onInvite={() => setInviteOpen(true)}
        onTasks={() => setPage('tasks')}
        onExit={exitCurrentRoom}
        isHost={isHost}
      />

      {page === 'room' ? (
        <div className="room-grid">
          <MemberPanel
            room={room}
            currentParticipant={currentParticipant}
            onStatusChange={changeStatus}
          />
          <TimerPanel
            room={room}
            remaining={displayedRemaining}
            isHost={isHost}
            onToggle={toggleTimer}
            onReset={resetTimer}
            onSkip={skipSession}
          />
          <RoomSidePanel
            room={room}
            isHost={isHost}
            onGoalChange={updateGoal}
            onOpenBoard={() => setPage('board')}
            onNewPost={() => setPostOpen(true)}
            onOpenPost={(postId) => setActivePostId(postId)}
          />
        </div>
      ) : page === 'members' ? (
        <PageFrame title="Room members" onBack={() => setPage('room')}>
          <MemberPanel
            room={room}
            currentParticipant={currentParticipant}
            onStatusChange={changeStatus}
            standalone
          />
        </PageFrame>
      ) : page === 'tasks' ? (
        <TasksPage tasks={tasks} setTasks={setTasks} onBack={() => setPage('room')} />
      ) : (
        <DiscussionBoard
          posts={room.posts}
          currentParticipant={currentParticipant}
          onBack={() => setPage('room')}
          onNewPost={() => setPostOpen(true)}
          onOpenPost={(postId) => setActivePostId(postId)}
          onToggleSave={toggleSavePost}
          isSaved={(postId) => isPostSaved(savedPosts, room.settings.code, postId)}
        />
      )}

      <nav className="mobile-dock" aria-label="Study room navigation">
        <MobileNavButton
          active={page === 'room'}
          label="Room"
          icon={<Clock3 size={20} />}
          onClick={() => setPage('room')}
        />
        <MobileNavButton
          active={page === 'members'}
          label="Members"
          icon={<Users size={20} />}
          onClick={() => setPage('members')}
        />
        <MobileNavButton
          active={page === 'tasks'}
          label="Tasks"
          icon={<ListTodo size={20} />}
          onClick={() => setPage('tasks')}
        />
        <MobileNavButton
          active={page === 'board'}
          label="Board"
          icon={<MessageCircle size={20} />}
          onClick={() => setPage('board')}
        />
      </nav>

      <InviteModal
        open={inviteOpen}
        room={room}
        onClose={() => setInviteOpen(false)}
        onCopied={(message) => setToast(message)}
      />
      <NewPostModal
        open={postOpen}
        participant={currentParticipant}
        onClose={() => setPostOpen(false)}
        onPost={addPost}
      />
      <ThreadModal
        post={activePost}
        participant={currentParticipant}
        saved={activePost ? isPostSaved(savedPosts, room.settings.code, activePost.id) : false}
        onClose={() => setActivePostId(null)}
        onReply={addReply}
        onToggleSave={activePost ? () => toggleSavePost(activePost) : undefined}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function RoomHeader({
  room,
  connectionState,
  authenticated,
  isHost,
  onInvite,
  onTasks,
  onExit,
}: {
  room: StudyRoom
  connectionState: string
  authenticated: boolean
  isHost: boolean
  onInvite: () => void
  onTasks: () => void
  onExit: () => void
}) {
  return (
    <header className="room-header">
      <div className="room-identity">
        <div className="room-mark">
          <BookOpen size={20} />
        </div>
        <div>
          <h1>{room.settings.name}</h1>
          <span>
            Room {room.settings.code}
            <span className="connection-label">
              {authenticated && connectionState === 'open' ? (
                <>
                  <Wifi size={13} /> Live
                </>
              ) : (
                <>
                  <WifiOff size={13} /> Guest
                </>
              )}
            </span>
          </span>
        </div>
      </div>
      <div className="room-actions">
        <button className="button button-secondary" onClick={onInvite} aria-label="Invite friends">
          <Share2 size={16} />
          <span>Invite</span>
        </button>
        <button className="button button-quiet desktop-action" onClick={onTasks}>
          <ListTodo size={16} />
          My tasks
        </button>
        <button
          className="button button-danger"
          onClick={onExit}
          aria-label={isHost ? 'Close room' : 'Leave room'}
        >
          <DoorOpen size={16} />
          <span>{isHost ? 'Close room' : 'Leave'}</span>
        </button>
      </div>
    </header>
  )
}

function MemberPanel({
  room,
  currentParticipant,
  onStatusChange,
  standalone = false,
}: {
  room: StudyRoom
  currentParticipant: Participant
  onStatusChange: (status: StudyStatus) => void
  standalone?: boolean
}) {
  return (
    <aside className={`member-panel room-panel ${standalone ? 'standalone-panel' : ''}`}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">ROOM PRESENCE</span>
          <h2>Members</h2>
        </div>
        <span className="count-chip">{room.participants.length}</span>
      </div>

      <div className="member-list">
        {room.participants.map((participant) => {
          const status = statusMeta[participant.status]
          return (
            <div className="member-row" key={participant.id}>
              <div className="member-avatar" style={{ background: participant.color }}>
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div className="member-copy">
                <strong>
                  {participant.name}
                  {participant.id === currentParticipant.id && <span> (you)</span>}
                </strong>
                <small style={{ color: status.color }}>
                  <span className="status-dot" style={{ background: status.color }} />
                  {status.label}
                </small>
              </div>
              {participant.isHost && (
                <span className="host-crown" title="Room host">
                  <Crown size={16} />
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="status-control">
        <span className="panel-kicker">MY STATUS</span>
        <div className="status-buttons">
          {(Object.keys(statusMeta) as StudyStatus[]).map((statusKey) => (
            <button
              key={statusKey}
              className={currentParticipant.status === statusKey ? 'active' : ''}
              style={
                currentParticipant.status === statusKey
                  ? { borderColor: statusMeta[statusKey].color, color: statusMeta[statusKey].color }
                  : undefined
              }
              onClick={() => onStatusChange(statusKey)}
            >
              {statusMeta[statusKey].icon}
              {statusMeta[statusKey].shortLabel}
            </button>
          ))}
        </div>
        <p>Visible only to people in this room.</p>
      </div>
    </aside>
  )
}

function TimerPanel({
  room,
  remaining,
  isHost,
  onToggle,
  onReset,
  onSkip,
}: {
  room: StudyRoom
  remaining: number
  isHost: boolean
  onToggle: () => void
  onReset: () => void
  onSkip: () => void
}) {
  const totalSeconds =
    (room.timer.mode === 'focus' ? room.settings.focusMinutes : room.settings.breakMinutes) * 60
  const progress = Math.min(1, Math.max(0, 1 - remaining / totalSeconds))
  const degrees = `${Math.max(8, progress * 360)}deg`

  return (
    <main className="timer-panel room-panel">
      <div className="session-label">
        <span className={`session-indicator ${room.timer.mode}`} />
        <div>
          <strong>{room.timer.mode === 'focus' ? 'Focus session' : 'Break time'}</strong>
          <small>{room.timer.isRunning ? `${formatTime(remaining)} remaining` : 'Ready when you are'}</small>
        </div>
      </div>

      <div className="timer-ring" style={{ '--progress': degrees } as React.CSSProperties}>
        <div className="timer-ring-inner">
          <span>{formatTime(remaining)}</span>
          <small>of {formatTime(totalSeconds)}</small>
        </div>
      </div>

      <div className="timer-controls">
        <button
          className="button button-primary timer-main-button"
          onClick={onToggle}
          disabled={!isHost}
          title={isHost ? undefined : 'Only the room host can control the timer'}
        >
          {room.timer.isRunning ? (
            <>
              <Pause size={18} fill="currentColor" /> Pause
            </>
          ) : (
            <>
              <Play size={18} fill="currentColor" /> Start focus
            </>
          )}
        </button>
        <div className="timer-secondary-actions">
          <button className="button button-quiet" onClick={onReset} disabled={!isHost}>
            <RefreshCcw size={16} /> Reset
          </button>
          <button className="button button-quiet" onClick={onSkip} disabled={!isHost}>
            <ChevronRight size={17} /> Skip
          </button>
        </div>
      </div>

      <div className="session-progress">
        <span>
          Focus {room.settings.focusMinutes} min
          <i />
          Break {room.settings.breakMinutes} min
        </span>
        <span>{room.timer.completedFocusSessions} sessions completed</span>
      </div>

      {!isHost && (
        <div className="host-note">
          <LockKeyhole size={15} />
          The room host controls this shared timer.
        </div>
      )}
    </main>
  )
}

function RoomSidePanel({
  room,
  isHost,
  onGoalChange,
  onOpenBoard,
  onNewPost,
  onOpenPost,
}: {
  room: StudyRoom
  isHost: boolean
  onGoalChange: (goal: string) => void
  onOpenBoard: () => void
  onNewPost: () => void
  onOpenPost: (postId: string) => void
}) {
  return (
    <aside className="side-panel room-panel">
      <section className="room-goal">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">SHARED INTENTION</span>
            <h2>Room goal</h2>
          </div>
          <Sparkles size={18} />
        </div>
        {isHost ? (
          <textarea
            value={room.goal}
            onChange={(event) => onGoalChange(event.target.value)}
            rows={3}
            aria-label="Room goal"
          />
        ) : (
          <p>{room.goal}</p>
        )}
      </section>

      <section className="discussion-preview">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">ASYNC, NOT CHAT</span>
            <h2>Discussion board</h2>
          </div>
          <MessageCircle size={18} />
        </div>
        <div className="preview-posts">
          {room.posts.map((post) => (
            <button className="preview-post" key={post.id} onClick={() => onOpenPost(post.id)}>
              <CategoryMark category={post.category} />
              <span>
                <strong>{post.title}</strong>
                <small className="preview-post-meta">
                  <span className={`category-chip category-${post.category}`}>
                    {categoryMeta[post.category].label}
                  </span>
                  <span>
                    {post.author} {'\u00b7'} {relativeTime(post.createdAt)}
                  </span>
                </small>
              </span>
              <span className="reply-count">
                {post.replies.length}
                <MessageCircle size={13} />
              </span>
            </button>
          ))}
          {room.posts.length === 0 && (
            <div className="empty-mini">
              <MessageCircle size={24} />
              <span>No discussions yet.</span>
            </div>
          )}
        </div>
        <button className="text-button" onClick={onOpenBoard}>
          View all discussions <ChevronRight size={15} />
        </button>
        <button className="button button-primary board-compose-button" onClick={onNewPost}>
          <Plus size={15} />
          New post
        </button>
      </section>
    </aside>
  )
}

function PageFrame({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <section className="page-shell">
      <div className="page-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to room">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="panel-kicker">STUDY ROOM</span>
          <h1>{title}</h1>
        </div>
      </div>
      {children}
    </section>
  )
}

function DiscussionBoard({
  posts,
  currentParticipant,
  onBack,
  onNewPost,
  onOpenPost,
  onToggleSave,
  isSaved,
}: {
  posts: DiscussionPost[]
  currentParticipant: Participant
  onBack: () => void
  onNewPost: () => void
  onOpenPost: (postId: string) => void
  onToggleSave: (post: DiscussionPost) => void
  isSaved: (postId: string) => boolean
}) {
  const [filter, setFilter] = useState('all')
  const filteredPosts =
    filter === 'mine'
      ? posts.filter((post) => post.authorId === currentParticipant.id)
      : posts

  return (
    <section className="page-shell board-page">
      <div className="page-header page-header-actions">
        <button className="icon-button" onClick={onBack} aria-label="Back to room">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="panel-kicker">LOW-FREQUENCY DISCUSSION</span>
          <h1>Discussion board</h1>
        </div>
        <button className="button button-primary" onClick={onNewPost}>
          <Plus size={17} />
          New post
        </button>
      </div>
      <Tabs
        tabs={[
          { key: 'all', label: 'All posts' },
          { key: 'mine', label: 'My posts' },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="discussion-list">
        {filteredPosts.map((post) => (
          <article className="discussion-card" key={post.id}>
            <button className="discussion-card-main" onClick={() => onOpenPost(post.id)}>
              <div className="post-author-row">
                <CategoryMark category={post.category} />
                <span>
                  <strong>{post.author}</strong>
                  <small>{relativeTime(post.createdAt)}</small>
                </span>
                <span className="post-replies">
                  <MessageCircle size={16} /> {post.replies.length}
                </span>
              </div>
              <h2>{post.title}</h2>
              <p>{post.content}</p>
            </button>
            <div className="post-footer">
              <Badge variant={post.category === 'question' ? 'accent' : 'default'}>
                {categoryMeta[post.category].label}
              </Badge>
              <div className="post-footer-actions">
                <button className="save-post-button" onClick={() => onToggleSave(post)}>
                  {isSaved(post.id) ? <Check size={15} /> : <BookOpen size={15} />}
                  {isSaved(post.id) ? 'Saved' : 'Save'}
                </button>
                <ChevronRight size={17} />
              </div>
            </div>
          </article>
        ))}
        {filteredPosts.length === 0 && (
          <div className="empty-board">
            <MessageCircle size={30} />
            <h2>No posts here yet</h2>
            <p>Use the board for useful questions, resources, and study notes.</p>
            <button className="button button-primary" onClick={onNewPost}>
              Write the first post
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function TasksPage({
  tasks,
  setTasks,
  onBack,
}: {
  tasks: PersonalTask[]
  setTasks: React.Dispatch<React.SetStateAction<PersonalTask[]>>
  onBack: () => void
}) {
  const [taskTitle, setTaskTitle] = useState('')
  const completed = tasks.filter((task) => task.completed).length

  const addTask = (event: FormEvent) => {
    event.preventDefault()
    if (!taskTitle.trim()) return
    setTasks((current) => [
      ...current,
      { id: createId('task'), title: taskTitle.trim(), completed: false, createdAt: Date.now() },
    ])
    setTaskTitle('')
  }

  return (
    <section className="page-shell tasks-page">
      <div className="page-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to room">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="panel-kicker">PRIVATE TO THIS DEVICE</span>
          <h1>My tasks</h1>
        </div>
      </div>

      <div className="task-summary">
        <div>
          <strong>Today's session</strong>
          <span>
            {completed} / {tasks.length} completed
          </span>
        </div>
        <ProgressBar
          value={completed}
          max={Math.max(tasks.length, 1)}
          color="var(--mint)"
          height={8}
        />
      </div>

      <form className="task-input" onSubmit={addTask}>
        <input
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Add a focused, achievable task..."
        />
        <button type="submit" aria-label="Add task">
          <Plus size={19} />
        </button>
      </form>

      <div className="task-list">
        {tasks.map((task) => (
          <div className={`task-row ${task.completed ? 'completed' : ''}`} key={task.id}>
            <button
              className="task-check"
              onClick={() =>
                setTasks((current) =>
                  current.map((item) =>
                    item.id === task.id ? { ...item, completed: !item.completed } : item,
                  ),
                )
              }
              aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {task.completed && <Check size={15} />}
            </button>
            <span>{task.title}</span>
            <button
              className="task-delete"
              onClick={() =>
                setTasks((current) => current.filter((item) => item.id !== task.id))
              }
              aria-label="Delete task"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="empty-board compact-empty">
            <ListTodo size={28} />
            <h2>Set your intention</h2>
            <p>Add two or three tasks you can finish in this study session.</p>
          </div>
        )}
      </div>

      <div className="privacy-note">
        <LockKeyhole size={18} />
        <div>
          <strong>Only you can see these tasks.</strong>
          <span>They are stored locally on this device.</span>
        </div>
      </div>
    </section>
  )
}

function MobileNavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function InviteModal({
  open,
  room,
  onClose,
  onCopied,
}: {
  open: boolean
  room: StudyRoom
  onClose: () => void
  onCopied: (message: string) => void
}) {
  const inviteUrl = useMemo(() => {
    const url = new URL(window.location.origin)
    url.searchParams.set('room', room.settings.code)
    url.searchParams.set('name', room.settings.name)
    url.searchParams.set('focus', String(room.settings.focusMinutes))
    url.searchParams.set('break', String(room.settings.breakMinutes))
    if (room.settings.registryId) url.searchParams.set('rid', room.settings.registryId)
    return url.toString()
  }, [room.settings])

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value)
    onCopied(`${label} copied`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite friends" maxWidth={560}>
      <div className="form-stack invite-content">
        <p className="modal-intro">
          Share this link or code. Friends can enter a display name and join without an account.
        </p>
        <Field label="Room link">
          <div className="copy-field">
            <span>{inviteUrl}</span>
            <button className="button button-primary" onClick={() => copy(inviteUrl, 'Link')}>
              <Copy size={16} /> Copy
            </button>
          </div>
        </Field>
        <Field label="Room code">
          <div className="copy-field">
            <strong>{room.settings.code}</strong>
            <button
              className="button button-secondary"
              onClick={() => copy(room.settings.code, 'Code')}
            >
              <Copy size={16} /> Copy
            </button>
          </div>
        </Field>
        <div className="info-callout">
          <UserPlus size={20} />
          <div>
            <strong>Up to 32 people can focus together.</strong>
            <span>Signed-in participants also get cross-device live updates.</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function SavedPostsModal({
  open,
  posts,
  setPosts,
  onClose,
}: {
  open: boolean
  posts: SavedPost[]
  setPosts: React.Dispatch<React.SetStateAction<SavedPost[]>>
  onClose: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copiedMessage, setCopiedMessage] = useState('')
  const [activeSavedPostId, setActiveSavedPostId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedIds(posts.map((post) => post.id))
    setActiveSavedPostId(null)
  }, [open, posts])

  useEffect(() => {
    if (!copiedMessage) return
    const timeout = window.setTimeout(() => setCopiedMessage(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [copiedMessage])

  const selectedPosts = posts.filter((post) => selectedIds.includes(post.id))
  const allSelected = posts.length > 0 && selectedPosts.length === posts.length
  const activeSavedPost = posts.find((post) => post.id === activeSavedPostId) ?? null

  const toggleSelected = (postId: string) => {
    setSelectedIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    )
  }

  const removePost = (postId: string) => {
    setPosts((current) => current.filter((post) => post.id !== postId))
    setSelectedIds((current) => current.filter((id) => id !== postId))
    setActiveSavedPostId((current) => (current === postId ? null : current))
  }

  const copyMarkdown = async (targetPosts: SavedPost[]) => {
    if (targetPosts.length === 0) return
    try {
      await navigator.clipboard.writeText(savedPostsToMarkdown(targetPosts))
      setCopiedMessage(
        targetPosts.length === 1
          ? 'Copied 1 saved post as Markdown'
          : `Copied ${targetPosts.length} saved posts as Markdown`,
      )
    } catch {
      setCopiedMessage('Copy failed. Check browser clipboard permission and try again.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Saved posts" maxWidth={780}>
      <div className="saved-posts-panel">
        <div className="saved-posts-toolbar">
          <p>
            {posts.length === 0
              ? 'Saved posts from any room will appear here.'
              : `${selectedPosts.length} of ${posts.length} selected`}
          </p>
          <div>
            <button
              className="button button-secondary"
              onClick={() => setSelectedIds(allSelected ? [] : posts.map((post) => post.id))}
              disabled={posts.length === 0}
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
            <button
              className="button button-primary"
              onClick={() => copyMarkdown(selectedPosts)}
              disabled={selectedPosts.length === 0}
            >
              <Copy size={16} />
              Copy selected Markdown
            </button>
          </div>
        </div>

        {activeSavedPost ? (
          <SavedPostDetail
            post={activeSavedPost}
            onBack={() => setActiveSavedPostId(null)}
            onRemove={() => removePost(activeSavedPost.id)}
          />
        ) : posts.length === 0 ? (
          <div className="empty-board compact-empty">
            <BookOpen size={30} />
            <h2>No saved posts yet</h2>
            <p>Save useful questions and answers from any room, then export them later.</p>
          </div>
        ) : (
          <div className="saved-post-list">
            {posts.map((post) => {
              const selected = selectedIds.includes(post.id)
              return (
                <article className="saved-post-item" key={post.id}>
                  <button
                    className={`saved-select ${selected ? 'selected' : ''}`}
                    onClick={() => toggleSelected(post.id)}
                    aria-label={selected ? `Deselect ${post.title}` : `Select ${post.title}`}
                  >
                    {selected && <Check size={15} />}
                  </button>
                  <button
                    className="saved-post-summary"
                    onClick={() => setActiveSavedPostId(post.id)}
                  >
                    <div className="saved-post-heading">
                      <CategoryMark category={post.category} />
                      <div>
                        <h3>{post.title}</h3>
                        <small>
                          {post.roomName} ({post.roomCode}) · {post.replies.length} replies
                        </small>
                      </div>
                    </div>
                    <p>{post.content}</p>
                  </button>
                    <div className="saved-post-actions">
                      <button
                        className="text-button inline danger"
                        onClick={() => removePost(post.id)}
                      >
                        Remove
                      </button>
                    </div>
                </article>
              )
            })}
          </div>
        )}

        {copiedMessage && <div className="toast local-toast">{copiedMessage}</div>}
      </div>
    </Modal>
  )
}

function SavedPostDetail({
  post,
  onBack,
  onRemove,
}: {
  post: SavedPost
  onBack: () => void
  onRemove: () => void
}) {
  return (
    <article className="saved-post-detail">
      <div className="saved-detail-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to saved posts">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="panel-kicker">SAVED FROM {post.roomName}</span>
          <h2>{post.title}</h2>
          <p>
            {categoryMeta[post.category].label} {'\u00b7'} {post.roomCode} {'\u00b7'}{' '}
            {post.replies.length} replies
          </p>
        </div>
      </div>

      <div className="saved-detail-meta">
        <span>Author: {post.author}</span>
        <span>Created: {formatMarkdownDate(post.createdAt)}</span>
        <span>Saved: {formatMarkdownDate(post.savedAt)}</span>
        <span>Last synced: {formatMarkdownDate(post.updatedAt || post.savedAt)}</span>
      </div>

      <section className="saved-detail-section">
        <h3>Post</h3>
        <p>{post.content}</p>
      </section>

      <section className="saved-detail-section">
        <h3>Replies</h3>
        {post.replies.length === 0 ? (
          <p className="saved-empty-replies">No replies saved.</p>
        ) : (
          <div className="saved-detail-replies">
            {post.replies.map((reply) => (
              <div className="reply-item" key={reply.id}>
                <span className="avatar-dot" style={{ background: participantColor(reply.authorId) }}>
                  {reply.author.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {reply.author} <small>{'\u00b7'} {relativeTime(reply.createdAt)}</small>
                  </strong>
                  <p>{reply.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="text-button inline danger" onClick={onRemove}>
        Remove saved post
      </button>
    </article>
  )
}

function NewPostModal({
  open,
  participant,
  onClose,
  onPost,
}: {
  open: boolean
  participant: Participant
  onClose: () => void
  onPost: (post: DiscussionPost) => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<PostCategory>('question')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !content.trim()) return
    onPost({
      id: createId('post'),
      authorId: participant.id,
      author: participant.name,
      title: title.trim(),
      content: content.trim(),
      category,
      createdAt: Date.now(),
      replies: [],
    })
    setTitle('')
    setContent('')
    setCategory('question')
  }

  return (
    <Modal open={open} onClose={onClose} title="New discussion post" maxWidth={620}>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Title">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What would help the room learn?"
            autoFocus
          />
        </Field>
        <Field label="Category">
          <div className="category-picker">
            {categoryOrder.map((categoryKey) => (
              <button
                type="button"
                className={category === categoryKey ? 'active' : ''}
                key={categoryKey}
                onClick={() => setCategory(categoryKey)}
              >
                <span className={`category-picker-icon category-${categoryKey}`}>
                  {categoryMeta[categoryKey].icon}
                </span>
                <span>{categoryMeta[categoryKey].label}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Content">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write your question, resource, or study note..."
            rows={7}
          />
        </Field>
        <button className="button button-primary button-full" type="submit">
          <Send size={17} /> Post to board
        </button>
      </form>
    </Modal>
  )
}

function ThreadModal({
  post,
  participant,
  saved,
  onClose,
  onReply,
  onToggleSave,
}: {
  post: DiscussionPost | null
  participant: Participant
  saved: boolean
  onClose: () => void
  onReply: (postId: string, reply: Reply) => void
  onToggleSave?: () => void
}) {
  const [reply, setReply] = useState('')

  useEffect(() => setReply(''), [post?.id])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!post || !reply.trim()) return
    onReply(post.id, {
      id: createId('reply'),
      authorId: participant.id,
      author: participant.name,
      content: reply.trim(),
      createdAt: Date.now(),
    })
    setReply('')
  }

  return (
    <Modal open={Boolean(post)} onClose={onClose} title="Discussion" maxWidth={680}>
      {post && (
        <div className="thread">
          <div className="thread-post">
            <div className="post-author-row">
              <span className="member-avatar small" style={{ background: participantColor(post.authorId) }}>
                {post.author.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{post.author}</strong>
                <small>{relativeTime(post.createdAt)}</small>
              </span>
              <Badge variant={post.category === 'question' ? 'accent' : 'default'}>
                {categoryMeta[post.category].label}
              </Badge>
            </div>
            <button className="save-post-button thread-save-button" onClick={onToggleSave}>
              {saved ? <Check size={15} /> : <BookOpen size={15} />}
              {saved ? 'Saved' : 'Save post'}
            </button>
            <h2>{post.title}</h2>
            <p>{post.content}</p>
          </div>

          <div className="reply-heading">
            <strong>{post.replies.length} replies</strong>
            <span>Keep responses useful and focused.</span>
          </div>
          <div className="reply-list">
            {post.replies.map((item) => (
              <div className="reply-item" key={item.id}>
                <span className="avatar-dot" style={{ background: participantColor(item.authorId) }}>
                  {item.author.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {item.author} <small>· {relativeTime(item.createdAt)}</small>
                  </strong>
                  <p>{item.content}</p>
                </div>
              </div>
            ))}
          </div>
          <form className="reply-form" onSubmit={submit}>
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Add a helpful reply..."
            />
            <button className="button button-primary" type="submit">
              <Send size={16} /> Reply
            </button>
          </form>
        </div>
      )}
    </Modal>
  )
}
