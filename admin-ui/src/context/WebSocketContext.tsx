import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface WebSocketMessage {
    type: string;
    data?: any;
    [key: string]: any;
}

type MessageHandler = (data: any) => void;

interface WebSocketContextValue {
    connected: boolean;
    error: Error | null;
    send: (data: any) => void;
    subscribe: (messageType: string, handler: MessageHandler) => () => void;
    disconnect: () => void;
    reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within WebSocketProvider');
    }
    return context;
};

interface WebSocketProviderProps {
    children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
    const { isAuthenticated, token, logout } = useAuth();
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const subscribersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());

    const MAX_RECONNECT_ATTEMPTS = 10;

    // Derive WebSocket URL from environment config
    const wsUrl = (() => {
        // 1. Explicit WS URL from env
        if (import.meta.env.VITE_WS_URL) {
            return import.meta.env.VITE_WS_URL;
        }
        // 2. Derive from API URL
        if (import.meta.env.VITE_API_URL) {
            const apiUrl = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
            return apiUrl.replace(/^http/, 'ws');
        }
        // 3. Auto-detect from current page location (use proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws`;
    })();

    // 按type订阅消息
    const subscribe = useCallback((messageType: string, handler: MessageHandler) => {
        if (!subscribersRef.current.has(messageType)) {
            subscribersRef.current.set(messageType, new Set());
        }
        subscribersRef.current.get(messageType)!.add(handler);

        // Return unsubscribe function
        return () => {
            const handlers = subscribersRef.current.get(messageType);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    subscribersRef.current.delete(messageType);
                }
            }
        };
    }, []);

    // Notify subscribers
    const notifySubscribers = useCallback((message: WebSocketMessage) => {
        const handlers = subscribersRef.current.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    console.error(`Error in WebSocket message handler for type ${message.type}:`, error);
                }
            });
        }
    }, []);

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (!isAuthenticated || !token) {
            console.log('[WebSocket] Not connecting - user not authenticated');
            return;
        }

        if (import.meta.env.VITE_MOCK_MODE === 'true') {
            console.log('[WebSocket] Mock Mode active. WebSocket connection disabled for demo.');
            // We can optionally set connected(true) so UI components relying on the connected state don't show warnings.
            setConnected(true);
            return;
        }

        try {
            // Close existing connection if any
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }

            console.log('[WebSocket] Connecting to', wsUrl);
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[WebSocket] Connected');
                setConnected(true);
                setError(null);
                reconnectAttemptsRef.current = 0;

                // Authenticate
                ws.send(JSON.stringify({ type: 'auth', token }));
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as WebSocketMessage;
                    notifySubscribers(message);
                } catch (error) {
                    console.error('[WebSocket] Failed to parse message:', error);
                }
            };

            ws.onerror = (event) => {
                console.error('[WebSocket] Error:', event);
                setError(new Error('WebSocket connection error'));
            };

            ws.onclose = (event) => {
                // Ignore if this is not the current active socket
                if (ws !== socketRef.current) {
                    return;
                }

                console.log(`[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason})`);
                setConnected(false);
                socketRef.current = null;

                // 认证失败 code=1008
                if (event.code === 1008) {
                    console.error('[WebSocket] Authentication failed (expired/invalid token). Logging out.');
                    logout();
                    return; // Stop reconnecting
                }

                // Auto reconnect for other codes with exponential backoff
                else if (isAuthenticated && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttemptsRef.current++;
                    const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
                    console.log(`[WebSocket] Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

                    reconnectTimeoutRef.current = window.setTimeout(() => {
                        connect();
                    }, delay);
                }
            };

            socketRef.current = ws;
        } catch (error) {
            console.error('[WebSocket] Failed to create connection:', error);
            setError(error as Error);
        }
    }, [isAuthenticated, token, logout, notifySubscribers]);

    // Disconnect
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }

        setConnected(false);
    }, []);

    // Send message
    const send = useCallback((data: any) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(data));
        } else {
            console.warn('[WebSocket] Cannot send - not connected');
        }
    }, []);

    // Connect when authenticated
    useEffect(() => {
        if (isAuthenticated) {
            connect();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
    }, [isAuthenticated, connect, disconnect]);

    const value: WebSocketContextValue = {
        connected,
        error,
        send,
        subscribe,
        disconnect,
        reconnect: connect
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};
