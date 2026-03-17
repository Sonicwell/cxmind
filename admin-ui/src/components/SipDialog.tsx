import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../services/api';
import { formatToLocalTime, formatUTCToLocal } from '../utils/date';


interface SipMessage {
    timestamp: string;
    method: string;
    status_code: number;
    src_ip: string;
    dst_ip: string;
    src_port: number;
    dst_port: number;
    body: string;
}

interface SipDialogProps {
    callId: string;
}

const SipDialog: React.FC<SipDialogProps> = ({ callId }) => {
    const [messages, setMessages] = useState<SipMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMessage, setSelectedMessage] = useState<SipMessage | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const fetchDialog = async () => {
            try {
                const response = await api.get(`/platform/calls/${callId}/dialog`);
                setMessages(response.data.data);
            } catch (error) {
                console.error('Failed to fetch dialog', error);
            } finally {
                setLoading(false);
            }
        };

        if (callId) {
            fetchDialog();
        }
    }, [callId]);

    // Calculate unique hosts for columns
    const hosts = useMemo(() => {
        const uniqueEndpoints = new Set<string>();
        messages.forEach(msg => {
            if (msg.src_ip && msg.src_port) uniqueEndpoints.add(`${msg.src_ip}:${msg.src_port}`);
            else if (msg.src_ip) uniqueEndpoints.add(msg.src_ip);

            if (msg.dst_ip && msg.dst_port) uniqueEndpoints.add(`${msg.dst_ip}:${msg.dst_port}`);
            else if (msg.dst_ip) uniqueEndpoints.add(msg.dst_ip);
        });
        // Sort but put the first message's src endpoint first (caller) 
        const sorted = Array.from(uniqueEndpoints);
        if (messages.length > 0) {
            const firstMsg = messages[0];
            const callerEndpoint = firstMsg.src_ip && firstMsg.src_port
                ? `${firstMsg.src_ip}:${firstMsg.src_port}`
                : firstMsg.src_ip;

            if (callerEndpoint && sorted.includes(callerEndpoint)) {
                return [callerEndpoint, ...sorted.filter(ep => ep !== callerEndpoint)];
            }
        }
        return sorted;
    }, [messages]);

    // Diagram Layout Constants
    const MSG_HEIGHT = 56;
    const HEADER_HEIGHT = 45;
    const COLUMN_WIDTH = 180;
    const START_PADDING = 80; // Space for timestamp on the left

    const getHostX = (index: number) => START_PADDING + (index * COLUMN_WIDTH) + (COLUMN_WIDTH / 2);

    if (loading) return <div>Loading dialog...</div>;

    const svgHeight = HEADER_HEIGHT + (messages.length * MSG_HEIGHT) + 40;
    const svgWidth = START_PADDING + (hosts.length * COLUMN_WIDTH) + 20;

    return (
        <div style={{ display: 'flex', height: '80vh', gap: '0' }}>
            {/* SVG Diagram Container */}
            <div style={{
                flex: 2,
                overflow: 'auto',
                borderRight: '1px solid var(--glass-border)',
                paddingRight: '1rem',
                background: '#0d0d0d', // Dark background like sngrep
                borderRadius: 'var(--radius-sm)',
                position: 'relative'
            }}>
                <svg
                    ref={svgRef}
                    width={svgWidth}
                    height={svgHeight}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                >
                    {/* Host Headers & Vertical Lines */}
                    {hosts.map((host, i) => {
                        const x = getHostX(i);
                        return (
                            <g key={host}>
                                {/* Header Text */}
                                <text
                                    x={x}
                                    y={25}
                                    textAnchor="middle"
                                    fill="#d4d4d4"
                                    fontWeight="bold"
                                >
                                    {host}
                                </text>
                                {/* Vertical Line */}
                                <line
                                    x1={x}
                                    y1={HEADER_HEIGHT}
                                    x2={x}
                                    y2={svgHeight - 20}
                                    stroke="#404040"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                />
                            </g>
                        );
                    })}

                    {/* Messages */}
                    {messages.map((msg, i) => {
                        const srcEndpoint = msg.src_ip && msg.src_port ? `${msg.src_ip}:${msg.src_port}` : msg.src_ip;
                        const dstEndpoint = msg.dst_ip && msg.dst_port ? `${msg.dst_ip}:${msg.dst_port}` : msg.dst_ip;

                        const srcIndex = srcEndpoint ? hosts.indexOf(srcEndpoint) : -1;
                        const dstIndex = dstEndpoint ? hosts.indexOf(dstEndpoint) : -1;

                        if (srcIndex === -1 || dstIndex === -1) return null;

                        const x1 = getHostX(srcIndex);
                        const x2 = getHostX(dstIndex);
                        const y = HEADER_HEIGHT + (i * MSG_HEIGHT) + (MSG_HEIGHT / 2);

                        const isRequest = msg.method !== '' && msg.status_code === 0;
                        const hasSDP = msg.body && (msg.body.includes('v=0') && msg.body.includes('o='));
                        let label = isRequest ? msg.method : `${msg.status_code} ${getReasonPhrase(msg.status_code)}`;
                        if (hasSDP) label += ' (SDP)';

                        // sngrep style colors: Requests = Red, Responses = Green
                        let color = '#ef4444'; // Red for requests
                        if (!isRequest) {
                            color = '#22c55e'; // Green for responses
                        }

                        // Calculate delta
                        let deltaStr = '';
                        if (i > 0) {
                            const prev = new Date(messages[i - 1].timestamp).getTime();
                            const curr = new Date(msg.timestamp).getTime();
                            const diffMs = curr - prev;
                            if (diffMs < 1000) deltaStr = `+${diffMs}ms`;
                            else deltaStr = `+${(diffMs / 1000).toFixed(1)}s`;
                        }

                        const isSelected = selectedMessage === msg;

                        return (
                            <g
                                key={i}
                                onClick={() => setSelectedMessage(msg)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Hover/Selection Highlight Zone */}
                                <rect
                                    x={0}
                                    y={y - 25}
                                    width={svgWidth}
                                    height={50}
                                    fill={isSelected ? '#333' : 'transparent'}
                                    className="msg-row"
                                />

                                {/* Timestamp & Delta */}
                                <text x={10} y={y - 2} fill="#d4d4d4" fontSize="11px" fontFamily="monospace">
                                    {formatUTCToLocal(msg.timestamp, 'HH:mm:ss')}
                                </text>
                                <text x={10} y={y + 10} fill="#06b6d4" fontSize="10px" fontFamily="monospace">
                                    {deltaStr}
                                </text>

                                {/* Arrow Line */}
                                <line
                                    x1={x1} y1={y} x2={x2} y2={y}
                                    stroke={color} strokeWidth="1.5"
                                />

                                {/* Arrowhead */}
                                <polygon
                                    points={x1 < x2
                                        ? `${x2},${y} ${x2 - 8},${y - 4} ${x2 - 8},${y + 4}`
                                        : `${x2},${y} ${x2 + 8},${y - 4} ${x2 + 8},${y + 4}`
                                    }
                                    fill={color}
                                />

                                {/* Label */}
                                <text
                                    x={(x1 + x2) / 2}
                                    y={y - 6}
                                    textAnchor="middle"
                                    fill={color}
                                    fontWeight="bold"
                                    fontSize="11px"
                                >
                                    {label}
                                </text>

                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Message Details Panel - Sngrep Style */}
            <div style={{ flex: 1, overflowY: 'auto', paddingLeft: '0', background: '#000', color: '#d4d4d4', fontFamily: 'monospace', fontSize: '0.9rem', borderLeft: '1px solid #333', minWidth: '300px' }}>
                {selectedMessage ? (
                    <SipMessageViewer message={selectedMessage} />
                ) : (
                    <div style={{ padding: '1rem', color: '#666', textAlign: 'center' }}>
                        Select a message to view details
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper for status codes
const getReasonPhrase = (code: number) => {
    const phrases: Record<number, string> = {
        100: 'Trying', 180: 'Ringing', 183: 'Session Progress',
        200: 'OK',
        301: 'Moved Permanently', 302: 'Moved Temporarily',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
        404: 'Not Found', 407: 'Proxy Auth Required', 408: 'Request Timeout',
        480: 'Temporarily Unavailable', 486: 'Busy Here', 487: 'Request Terminated',
        488: 'Not Acceptable Here',
        500: 'Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
        504: 'Server Timeout', 600: 'Busy Everywhere', 603: 'Decline',
    };
    return phrases[code] || '';
};

// Component to render colored SIP message
const SipMessageViewer: React.FC<{ message: SipMessage }> = ({ message }) => {
    // Basic parsing logic
    const lines = message.body.split('\n');
    const headerEndIndex = lines.findIndex(l => l.trim() === '');
    const headers = headerEndIndex === -1 ? lines : lines.slice(0, headerEndIndex);
    const body = headerEndIndex === -1 ? [] : lines.slice(headerEndIndex + 1);

    // First line (Request Line or Status Line)
    const firstLine = headers.length > 0 ? headers[0] : '';
    const otherHeaders = headers.slice(1);

    const isRequest = message.method !== '';
    const firstLineColor = isRequest ? '#ef4444' : '#22c55e'; // Red request, Green response

    return (
        <div style={{ padding: '1rem' }}>
            <div style={{
                marginBottom: '0.5rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid #333',
                fontSize: '0.8rem',
                color: '#666'
            }}>
                {formatToLocalTime(message.timestamp)} &nbsp;
                {message.src_ip}:{message.src_port} -&gt; {message.dst_ip}:{message.dst_port}
            </div>

            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {/* First Line */}
                <div style={{ color: firstLineColor, fontWeight: 'bold' }}>{firstLine}</div>

                {/* Headers */}
                {otherHeaders.map((line, idx) => {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex > -1) {
                        const name = line.substring(0, colonIndex);
                        const value = line.substring(colonIndex);
                        return (
                            <div key={idx}>
                                <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{name}</span>
                                <span style={{ color: '#e5e5e5' }}>{value}</span>
                            </div>
                        );
                    }
                    return <div key={idx}>{line}</div>;
                })}

                {/* Body Seperator */}
                {body.length > 0 && <div style={{ height: '1rem' }}></div>}

                {/* Body */}
                {body.map((line, idx) => (
                    <div key={`b-${idx}`} style={{ color: '#9ca3af' }}>{line}</div>
                ))}
            </div>
        </div>
    );
};

export default SipDialog;
