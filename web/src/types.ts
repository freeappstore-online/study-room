export type StudyStatus = 'studying' | 'break' | 'away'

export type TimerMode = 'focus' | 'break'

export type PostCategory = 'question' | 'resource' | 'note' | 'other'

export interface RoomSettings {
  code: string
  name: string
  focusMinutes: number
  breakMinutes: number
  createdAt: number
  hostId: string
  registryId?: string
}

export interface Participant {
  id: string
  name: string
  status: StudyStatus
  isHost: boolean
  color: string
  lastSeen: number
}

export interface TimerState {
  mode: TimerMode
  remaining: number
  isRunning: boolean
  endsAt: number | null
  completedFocusSessions: number
}

export interface Reply {
  id: string
  authorId: string
  author: string
  content: string
  createdAt: number
}

export interface DiscussionPost {
  id: string
  authorId: string
  author: string
  title: string
  content: string
  category: PostCategory
  createdAt: number
  replies: Reply[]
}

export interface PersonalTask {
  id: string
  title: string
  completed: boolean
  createdAt: number
}

export interface SavedPost {
  id: string
  postId: string
  roomCode: string
  roomName: string
  category: PostCategory
  title: string
  content: string
  author: string
  authorId: string
  createdAt: number
  savedAt: number
  updatedAt: number
  replies: Reply[]
}

export interface StudyRoom {
  settings: RoomSettings
  timer: TimerState
  participants: Participant[]
  posts: DiscussionPost[]
  goal: string
}

export type RoomEvent =
  | { type: 'presence'; participant: Participant }
  | { type: 'leave'; participantId: string }
  | { type: 'room-closed'; closedBy: string; roomCode: string }
  | { type: 'timer'; timer: TimerState }
  | { type: 'status'; participant: Participant }
  | { type: 'post'; post: DiscussionPost }
  | { type: 'reply'; postId: string; reply: Reply }
  | { type: 'goal'; goal: string }
  | { type: 'sync-request'; participant: Participant }
  | { type: 'snapshot'; room: StudyRoom }
