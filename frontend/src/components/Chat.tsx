import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { apiService } from '../services/api'

interface Message {
  id: string
  text: string
  sender: 'user' | 'agent'
  timestamp: Date
  error?: boolean
  retryable?: boolean
  originalQuery?: string
}

function Chat() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)

  // Generate a session ID if we don't have one
  useEffect(() => {
    if (!sessionId) {
      const newSessionId = `session_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
      setSessionId(newSessionId)
      navigate(`/chat/${newSessionId}`, { replace: true })
    }
  }, [sessionId, navigate])

  // Core send logic
  const sendMessage = async (queryText: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text: queryText,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)

    try {
      const result = await apiService.sendQuery({
        request: queryText,
        sessionId: sessionId || undefined
      })

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: result.response,
        sender: 'agent',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, agentMessage])
    } catch (error) {
      console.error('Query failed:', error)

      let errorText: string

      if (error instanceof Error) {
        const msg = error.message
        if (msg.includes('REQUEST_TIMEOUT')) {
          errorText = 'The request timed out. Please try again.'
        } else if (msg.includes('NETWORK_ERROR')) {
          errorText = 'Unable to connect to the server. Please check your connection.'
        } else {
          errorText = msg.includes(': ') ? msg.split(': ').slice(1).join(': ') : msg
        }
      } else {
        errorText = 'An unknown error occurred. Please try again.'
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorText,
        sender: 'agent',
        timestamp: new Date(),
        error: true,
        retryable: true,
        originalQuery: queryText
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-send initial query from Home page navigation
  useEffect(() => {
    const initialQuery = (location.state as any)?.initialQuery
    if (initialQuery && sessionId && !initialQuerySent.current) {
      initialQuerySent.current = true
      sendMessage(initialQuery)
    }
  }, [sessionId, location.state])

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return
    sendMessage(inputText.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleRetry = async (originalQuery: string) => {
    setInputText(originalQuery)
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
          <h2>AgentCore Chatbot</h2>
        </div>
        {sessionId && (
          <div className="session-info">
            <div className="session-badge">
              <span className="session-label">Session:</span>
              <span className="session-id">{sessionId}</span>
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

              {message.error && message.retryable && message.originalQuery && (
                <div className="retry-section">
                  <button
                    className="retry-button"
                    onClick={() => handleRetry(message.originalQuery!)}
                    disabled={isLoading}
                    title="Retry this query"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
            <div className="message-timestamp">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {isLoading && (
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
          placeholder="Type your message..."
          rows={3}
          disabled={isLoading}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !inputText.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default Chat
