/**
 * WebSocket Service with JWT Authentication
 *
 * Handles real-time WebSocket connections to AgentCore Runtime
 * with JWT bearer token authentication.
 */

import { authService } from './auth';
import { apiService } from './api';

export interface StreamEvent {
  type: 'stream_event' | 'complete' | 'error' | 'auth_success';
  event?: any;
  session_id?: string;
  error?: string;
  message?: string;
}

export type EventListener = (event: StreamEvent) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private isAuthenticating = false;
  private authenticationCompleted = false;

  /**
   * Connect to WebSocket with JWT authentication
   */
  async connect(sessionId: string, userId?: string): Promise<void> {
    try {
      // Step 1: Get WebSocket URL from backend
      const { wsUrl } = await apiService.getWebSocketInfo();
      console.log('📡 WebSocket URL obtained:', wsUrl);

      // Step 2: Get JWT access token
      const accessToken = await authService.getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated - no access token');
      }

      console.log('🔑 JWT token obtained, connecting to WebSocket...');

      return new Promise((resolve, reject) => {
        try {
          // Connect to WebSocket
          // Note: Browser WebSocket API doesn't support custom headers,
          // so we'll send the token in the first message after connection
          this.ws = new WebSocket(wsUrl);

          this.ws.onopen = () => {
            console.log('✅ WebSocket connection established');

            // Send authentication immediately after connection
            // AgentCore Runtime expects JWT in initial request
            this.isAuthenticating = true;
            this.sendAuthentication(accessToken, sessionId, userId);

            // Wait for authentication to complete before resolving
            setTimeout(() => {
              if (this.authenticationCompleted) {
                this.reconnectAttempts = 0;
                resolve();
              } else {
                // Still waiting for auth, but don't block
                resolve();
              }
            }, 500);
          };

          this.ws.onmessage = (event) => {
            try {
              const data: StreamEvent = JSON.parse(event.data);

              // Handle authentication success
              if (data.type === 'auth_success') {
                console.log('✅ Authentication successful');
                this.authenticationCompleted = true;
                this.isAuthenticating = false;
                return;
              }

              // Emit to listeners
              this.emit('message', data);

              // Emit specific event types
              if (data.type) {
                this.emit(data.type, data);
              }
            } catch (error) {
              console.error('❌ Failed to parse WebSocket message:', error);
            }
          };

          this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.emit('error', {
              type: 'error',
              error: 'WebSocket connection error'
            });

            if (this.isAuthenticating) {
              reject(new Error('WebSocket connection failed during authentication'));
            }
          };

          this.ws.onclose = (event) => {
            console.log('🔌 WebSocket closed:', event.code, event.reason);

            // Check for authentication errors
            if (event.code === 4401 || event.code === 1008) {
              this.emit('error', {
                type: 'error',
                error: 'Authentication failed - invalid or expired token'
              });
              reject(new Error('Authentication failed'));
              return;
            }

            this.emit('close', { type: 'complete' });

            // Attempt reconnection if not a normal closure
            if (
              event.code !== 1000 &&
              this.reconnectAttempts < this.maxReconnectAttempts
            ) {
              console.log(
                `🔄 Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`
              );

              setTimeout(() => {
                this.reconnectAttempts++;
                this.connect(sessionId, userId).catch((err) => {
                  console.error('Reconnection failed:', err);
                });
              }, this.reconnectDelay * this.reconnectAttempts);
            }
          };
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket connection:', error);
      throw error;
    }
  }

  /**
   * Send authentication token (sent immediately after WebSocket connection)
   */
  private sendAuthentication(accessToken: string, sessionId: string, userId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // For AgentCore Runtime, we send the token in the Authorization header
      // Since browser WebSocket doesn't support headers, we include it in the first message
      // The backend will extract the token from this message or context
      console.log('🔐 Sending authentication...');

      // Note: AgentCore Runtime with JWT authorizer validates the token at connection time
      // We still send session info as the first message
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: accessToken,
        sessionId,
        userId
      }));
    }
  }

  /**
   * Send a query to the agent
   */
  sendQuery(request: string, sessionId: string, userId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket is not open. Ready state:', this.ws?.readyState);
      this.emit('error', {
        type: 'error',
        error: 'WebSocket connection is not open'
      });
      return;
    }

    if (this.isAuthenticating) {
      console.warn('⚠️ Still authenticating, queuing message...');
      // Wait for authentication to complete
      setTimeout(() => this.sendQuery(request, sessionId, userId), 500);
      return;
    }

    console.log('📤 Sending query:', request.substring(0, 50) + '...');

    this.ws.send(JSON.stringify({
      request,
      session_id: sessionId,
      user_id: userId
    }));
  }

  /**
   * Register an event listener
   */
  on(eventType: string, callback: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)?.add(callback);
  }

  /**
   * Unregister an event listener
   */
  off(eventType: string, callback: EventListener): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit(eventType: string, data: StreamEvent): void {
    this.listeners.get(eventType)?.forEach((callback) => callback(data));
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.ws) {
      console.log('👋 Closing WebSocket connection...');
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.listeners.clear();
    this.authenticationCompleted = false;
    this.isAuthenticating = false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticationCompleted;
  }

  /**
   * Get current connection state
   */
  getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
