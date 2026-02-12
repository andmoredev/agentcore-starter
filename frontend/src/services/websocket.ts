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
          // Connect to WebSocket with JWT token in URL
          // AgentCore Runtime with JWT authorizer expects token as query parameter
          const wsUrlWithAuth = `${wsUrl}?authorization=${encodeURIComponent('Bearer ' + accessToken)}`;
          console.log('🔗 Connecting to:', wsUrl.replace(/\/\/.*?\./, '//***.'));

          this.ws = new WebSocket(wsUrlWithAuth);

          this.ws.onopen = () => {
            console.log('✅ WebSocket connection established with JWT authentication');

            // With JWT in URL, authentication is validated at connection time by AgentCore Runtime
            // No need to send auth message - connection establishment means auth succeeded
            this.authenticationCompleted = true;
            this.reconnectAttempts = 0;

            console.log('🔐 JWT authentication successful, ready to send queries');
            resolve();
          };

          this.ws.onmessage = (event) => {
            try {
              const data: StreamEvent = JSON.parse(event.data);

              console.log('📩 WebSocket message received:', data.type);

              // Emit to listeners
              this.emit('message', data);

              // Emit specific event types
              if (data.type) {
                this.emit(data.type, data);
              }
            } catch (error) {
              console.error('❌ Failed to parse WebSocket message:', error);
              console.error('Raw message:', event.data);
            }
          };

          this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            console.error('WebSocket readyState:', this.ws?.readyState);
            console.error('This may indicate:');
            console.error('  1. Invalid or expired JWT token');
            console.error('  2. AgentCore Runtime not accepting connections');
            console.error('  3. Network/CORS issue');

            this.emit('error', {
              type: 'error',
              error: 'WebSocket connection error - check JWT token and AgentCore Runtime status'
            });

            if (!this.authenticationCompleted) {
              reject(new Error('WebSocket connection failed - likely JWT authentication issue'));
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
