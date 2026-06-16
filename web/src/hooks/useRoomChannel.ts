import { useCallback, useEffect, useRef, useState } from 'react'
import type { FreeAppStore, Room } from '@freeappstore/sdk'
import type { ConnectionState } from '@freeappstore/sdk'
import type { RoomEvent } from '../types'

interface UseRoomChannelOptions {
  fas: FreeAppStore
  roomCode: string
  authenticated: boolean
  onEvent: (event: RoomEvent) => void
}

export function useRoomChannel({
  fas,
  roomCode,
  authenticated,
  onEvent,
}: UseRoomChannelOptions) {
  const broadcastRef = useRef<BroadcastChannel | null>(null)
  const sdkRoomRef = useRef<Room | null>(null)
  const onEventRef = useRef(onEvent)
  const [connectionState, setConnectionState] = useState<ConnectionState | 'guest'>(
    authenticated ? 'connecting' : 'guest',
  )

  onEventRef.current = onEvent

  useEffect(() => {
    const broadcast =
      'BroadcastChannel' in window
        ? new BroadcastChannel(`study-room:${roomCode}`)
        : null

    broadcastRef.current = broadcast
    if (broadcast) {
      broadcast.onmessage = (message: MessageEvent<RoomEvent>) => {
        onEventRef.current(message.data)
      }
    }

    let sdkRoom: Room | null = null
    const unsubscribers: Array<() => void> = []

    if (authenticated) {
      sdkRoom = fas.rooms.join(roomCode)
      sdkRoomRef.current = sdkRoom
      unsubscribers.push(
        sdkRoom.onMessage<RoomEvent>((message) => onEventRef.current(message.data)),
        sdkRoom.onConnectionState(setConnectionState),
      )
    } else {
      setConnectionState('guest')
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      sdkRoom?.close()
      sdkRoomRef.current = null
      broadcast?.close()
      broadcastRef.current = null
    }
  }, [authenticated, fas, roomCode])

  const send = useCallback((event: RoomEvent) => {
    broadcastRef.current?.postMessage(event)
    sdkRoomRef.current?.send(event)
  }, [])

  return { send, connectionState }
}
