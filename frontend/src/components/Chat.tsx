import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { WebSocketService, StreamEvent } from '../services/websocket'
import { useAuth } from '../contexts/AuthContext'

interface Message {
  id: string
  text: string
  sender: 'user' | 'agent'
  timestamp: Date
  error?: boolean
  streaming?: boolean
}

function Chat() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null)
  const [streamingText, setStreamingText] = useState('')
  const [currentTool, setCurrentTool] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)
  const wsServiceRef = useRef<WebSocketService | null>(null)

  // Generate a session ID if we don't have one
  useEffect(() => {
    if (!sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      navigate(`/chat/${newSessionId}`, { replace: true })
    }
  }, [sessionId, navigate])

  // Initialize WebSocket connection
  useEffect(() => {
    if (!sessionId || !user) return

    const initializeWebSocket = async () => {
      try {
        setConnectionStatus('connecting')

        const wsService = new WebSocketService()
        wsServiceRef.current = wsService

        // Set up event listeners
        wsService.on('stream_event', handleStreamEvent)
        wsService.on('complete', handleComplete)
        wsService.on('error', handleError)
        wsService.on('close', handleClose)

        // Connect to WebSocket with JWT authentication
        await wsService.connect(sessionId, user.sub)

        setConnectionStatus('connected')
        console.log('✅ WebSocket connection ready')
      } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error)
        setConnectionStatus('disconnected')

        // Show error message
        const errorMessage: Message = {
          id: Date.now().toString(),
          text: 'Failed to establish WebSocket connection. Please refresh the page.',
          sender: 'agent',
          timestamp: new Date(),
          error: true
        }
        setMessages(prev => [...prev, errorMessage])
      }
    }

    initializeWebSocket()

    // Cleanup on unmount
    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect()
        wsServiceRef.current = null
      }
    }
  }, [sessionId, user])

  // Handle WebSocket stream events
  const handleStreamEvent = (data: StreamEvent) => {
    const event = data.event
    if (!event) return

    // Handle text streaming (most important!)
    if (event.data) {
      setStreamingText(prev => prev + event.data)
    }

    // Handle tool usage
    if (event.current_tool_use?.name) {
      const toolName = event.current_tool_use.name
      setCurrentTool(toolName)
      console.log(`🔧 Agent using tool: ${toolName}`)
    }

    // Log lifecycle events
    if (event.init_event_loop) {
      console.log('🔄 Agent initialized')
    } else if (event.start_event_loop) {
      console.log('▶️ Agent started processing')
    } else if (event.complete) {
      console.log('✅ Agent completed')
    }
  }

  // Handle completion of streaming
  const handleComplete = () => {
    console.log('✅ Stream complete, finalizing message...')

    // Finalize the streaming message
    if (streamingText) {
      const agentMessage: Message = {
        id: Date.now().toString(),
        text: streamingText,
        sender: 'agent',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, agentMessage])
      setStreamingText('')
    }

    setCurrentTool(null)
    setIsLoading(false)
  }

  // Handle WebSocket errors
  const handleError = (data: StreamEvent) => {
    console.error('❌ WebSocket error:', data)

    const errorMessage: Message = {
      id: Date.now().toString(),
      text: data.message || data.error || 'An error occurred',
      sender: 'agent',
      timestamp: new Date(),
      error: true
    }

    setMessages(prev => [...prev, errorMessage])
    setStreamingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }

  // Handle WebSocket close
  const handleClose = () => {
    setConnectionStatus('disconnected')
    console.log('🔌 WebSocket connection closed')
  }

  // Send message via WebSocket
  const handleSendMessage = () => {
    if (!inputText.trim() || isLoading || !wsServiceRef.current?.isConnected()) {
      if (!wsServiceRef.current?.isConnected()) {
        alert('WebSocket not connected. Please refresh the page.')
      }
      return
    }

    const queryText = inputText.trim()

    // Add user message to UI
    const userMessage: Message = {
      id: Date.now().toString(),
      text: queryText,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)
    setStreamingText('')

    // Send via WebSocket
    wsServiceRef.current.sendQuery(queryText, sessionId!, user?.sub)
  }

  // Auto-send initial query from Home page navigation
  useEffect(() => {
    const initialQuery = (location.state as any)?.initialQuery
    if (initialQuery && sessionId && !initialQuerySent.current && wsServiceRef.current?.isConnected()) {
      initialQuerySent.current = true
      setInputText(initialQuery)

      // Wait a bit for connection to stabilize
      setTimeout(() => {
        if (wsServiceRef.current?.isConnected()) {
          handleSendMessage()
        }
      }, 500)
    }
  }, [sessionId, location.state, connectionStatus])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="header-top">
          <button
            className="back-home-button"
            onClick={() => navigate('/')}
            title="Back to Home"
          >
            ← Home
          </button>
          <h2>AgentCore Chatbot (WebSocket)</h2>
        </div>
        {sessionId && (
          <div className="session-info">
            <div className="session-badge">
              <span className="session-label">Session:</span>
              <span className="session-id">{sessionId}</span>
            </div>
            <div className={`connection-status ${connectionStatus}`}>
              <span className="status-dot"></span>
              <span className="status-text">
                {connectionStatus === 'connected' && '🟢 Connected'}
                {connectionStatus === 'connecting' && '🟡 Connecting...'}
                {connectionStatus === 'disconnected' && '🔴 Disconnected'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.sender} ${message.error ? 'error' : ''}`}>
            <div className="message-content">
              <div className="message-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
            </div>
            <div className="message-timestamp">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingText && (
          <div className="message agent streaming">
            <div className="message-content">
              <div className="message-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {streamingText}
                </ReactMarkdown>
              </div>
              {currentTool && (
                <div className="tool-indicator">
                  🔧 Using tool: <strong>{currentTool}</strong>
                </div>
              )}
            </div>
            <div className="streaming-indicator">
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingText && (
          <div className="message agent loading">
            <div className="message-content">
              <div className="loading-indicator">
                <span>Thinking...</span>
                <div className="loading-dots">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            connectionStatus === 'connected'
              ? 'Type your message...'
              : 'Connecting...'
          }
          rows={3}
          disabled={isLoading || connectionStatus !== 'connected'}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !inputText.trim() || connectionStatus !== 'connected'}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

export default Chat
