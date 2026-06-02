import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { WebSocketService } from '../services/websocket'
import { useAuth } from './AuthContext'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface WebSocketContextType {
  wsService: WebSocketService
  connectionStatus: ConnectionStatus
  sendMessage: (text: string, sessionId: string, userId?: string) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const wsServiceRef = useRef<WebSocketService>(new WebSocketService())
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connectWebSocket = useCallback(async () => {
    try {
      setConnectionStatus('connecting')
      // Use close() to preserve event listeners across reconnects
      wsServiceRef.current.close()
      await wsServiceRef.current.connect()
      setConnectionStatus('connected')
      // Reset backoff on successful connection
      reconnectAttemptRef.current = 0
      console.log('WebSocket connection ready')
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
      setConnectionStatus('disconnected')
    }
  }, [])

  const connectWithBackoff = useCallback(() => {
    // Clear any pending reconnect timer
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const attempt = reconnectAttemptRef.current
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
      RECONNECT_MAX_DELAY_MS
    )
    reconnectAttemptRef.current = attempt + 1

    console.log(`Reconnecting in ${delay}ms (attempt ${attempt + 1})`)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      connectWebSocket()
    }, delay)
  }, [connectWebSocket])

  // Connect when user is authenticated
  useEffect(() => {
    if (user !== null && !isLoading) {
      connectWebSocket()
    }

    if (user === null && !isLoading) {
      // Full cleanup on logout: close socket and clear all listeners
      wsServiceRef.current.destroy()
      setConnectionStatus('disconnected')
    }
  }, [user, isLoading, connectWebSocket])

  // Listen for close events from the WebSocket service
  useEffect(() => {
    const handleClose = () => {
      setConnectionStatus('disconnected')
    }

    const wsService = wsServiceRef.current
    wsService.on('close', handleClose)

    return () => {
      wsService.off('close', handleClose)
    }
  }, [])

  // Reconnect on visibility change or network restore
  useEffect(() => {
    if (!user || isLoading) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wsServiceRef.current.isConnected()) {
        console.log('Tab active - reconnecting WebSocket')
        connectWithBackoff()
      }
    }

    const handleOnline = () => {
      if (!wsServiceRef.current.isConnected()) {
        console.log('Network restored - reconnecting WebSocket')
        connectWithBackoff()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      // Clear any pending reconnect timer on cleanup
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }
  }, [user, isLoading, connectWithBackoff])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending reconnect timer
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // Full cleanup: close socket and clear listeners
      wsServiceRef.current.destroy()
    }
  }, [])

  const sendMessage = useCallback((text: string, sessionId: string, userId?: string) => {
    wsServiceRef.current.sendQuery(text, sessionId, userId)
  }, [])

  const value: WebSocketContextType = {
    wsService: wsServiceRef.current,
    connectionStatus,
    sendMessage
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}
