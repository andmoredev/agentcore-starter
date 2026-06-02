import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { StreamEvent } from '../services/websocket'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../contexts/WebSocketContext'

interface Message {
  id: string
  text: string
  thinking?: string
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
  const { wsService, connectionStatus, sendMessage: wsSendMessage } = useWebSocket()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null)
  const [streamingText, setStreamingText] = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [currentTool, setCurrentTool] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)
  const streamingTextRef = useRef('')
  const thinkingTextRef = useRef('')

  // Generate a session ID if we don't have one
  useEffect(() => {
    if (!sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      navigate(`/chat/${newSessionId}`, { replace: true })
    }
  }, [sessionId, navigate])

  // Handle WebSocket stream events
  const handleStreamEvent = useCallback((data: StreamEvent) => {
    const event = data.event
    if (!event) return

    // Handle tool usage - move accumulated text to thinking phase
    if (event.current_tool_use?.name) {
      const toolName = event.current_tool_use.name
      setCurrentTool(toolName)
      // Move any text accumulated so far into thinking
      setStreamingText(prev => {
        if (prev) {
          setThinkingText(t => {
            const newThinking = t + prev
            thinkingTextRef.current = newThinking
            return newThinking
          })
        }
        streamingTextRef.current = ''
        return ''
      })
    }

    // Handle text streaming
    if (event.data) {
      setStreamingText(prev => {
        const newText = prev + event.data
        streamingTextRef.current = newText
        return newText
      })
    }

    // Log lifecycle events
    if (event.init_event_loop) {
      console.log('🔄 Agent initialized')
    } else if (event.start_event_loop) {
      console.log('▶️ Agent started processing')
    } else if (event.complete) {
      console.log('✅ Agent completed')
      handleComplete()
    }
  }, [])

  // Handle completion of streaming
  const handleComplete = useCallback(() => {
    const currentStreamingText = streamingTextRef.current
    const currentThinkingText = thinkingTextRef.current

    if (currentStreamingText || currentThinkingText) {
      const agentMessage: Message = {
        id: Date.now().toString(),
        text: currentStreamingText,
        ...(currentThinkingText ? { thinking: currentThinkingText } : {}),
        sender: 'agent',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, agentMessage])
    }

    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }, [])

  // Handle WebSocket errors
  const handleError = useCallback((data: StreamEvent) => {
    console.error('❌ WebSocket error:', data)

    const errorMessage: Message = {
      id: Date.now().toString(),
      text: data.message || data.error || 'An error occurred',
      sender: 'agent',
      timestamp: new Date(),
      error: true
    }

    setMessages(prev => [...prev, errorMessage])
    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }, [])

  // Subscribe to WebSocket events
  useEffect(() => {
    wsService.on('stream_event', handleStreamEvent)
    wsService.on('complete', handleComplete)
    wsService.on('error', handleError)

    return () => {
      wsService.off('stream_event', handleStreamEvent)
      wsService.off('complete', handleComplete)
      wsService.off('error', handleError)
    }
  }, [wsService, handleStreamEvent, handleComplete, handleError])

  // Send a specific message directly (used for auto-send from Home page)
  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading || connectionStatus !== 'connected') return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)
    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')

    wsSendMessage(text.trim(), sessionId!, user?.sub)
  }

  // Send message via WebSocket (from input box)
  const handleSendMessage = () => {
    if (!inputText.trim() || isLoading || connectionStatus !== 'connected') {
      if (connectionStatus !== 'connected') {
        alert('WebSocket not connected. Please refresh the page.')
      }
      return
    }

    sendMessage(inputText)
  }

  // Auto-send initial query from Home page navigation
  useEffect(() => {
    const initialQuery = (location.state as any)?.initialQuery
    if (initialQuery && sessionId && !initialQuerySent.current && connectionStatus === 'connected' && !isLoading) {
      initialQuerySent.current = true
      sendMessage(initialQuery)
    }
  }, [sessionId, location.state, connectionStatus, isLoading])

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
              {message.thinking && (
                <details className="thinking-section">
                  <summary>Thinking</summary>
                  <div className="thinking-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {message.thinking}
                    </ReactMarkdown>
                  </div>
                </details>
              )}
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
        {(streamingText || thinkingText) && (
          <div className="message agent streaming">
            <div className="message-content">
              {thinkingText && (
                <div className="thinking-section thinking-live">
                  <div className="thinking-label">Thinking...</div>
                  <div className="thinking-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {thinkingText}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              {currentTool && !streamingText && (
                <div className="tool-indicator">
                  🔧 Using: <strong>{currentTool}</strong>
                </div>
              )}
              {streamingText && (
                <div className="message-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                  >
                    {streamingText}
                  </ReactMarkdown>
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
