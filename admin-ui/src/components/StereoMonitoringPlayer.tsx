import React, { useState, useEffect, useRef } from 'react';
import { AudioPlayer } from './AudioPlayer';
import { useWebSocket } from '../context/WebSocketContext';

import { Button } from './ui/button';

interface StereoMonitoringPlayerProps {
    callId: string;
    leftPlayerRef?: AudioPlayer;  // Optional: use existing player
    rightPlayerRef?: AudioPlayer; // Optional: use existing player
    callEnded?: boolean; // Whether the call has ended
}

/**
 * Stereo Monitoring Player for real-time audio playback
 * Plays left (caller) and right (callee) channels separately with independent controls
 */
export const StereoMonitoringPlayer: React.FC<StereoMonitoringPlayerProps> = ({
    callId,
    leftPlayerRef: externalLeftPlayer,
    rightPlayerRef: externalRightPlayer,
    callEnded = false
}) => {
    const [balance, setBalance] = useState(0); // -1 (left) to 1 (right)
    const [isPlaying, setIsPlaying] = useState(true); // Controls audio playback only
    const [playbackPosition, setPlaybackPosition] = useState(0); // Current playback position in seconds
    const [isLiveMode, setIsLiveMode] = useState(true); // true = live monitoring, false = playback mode
    const [recordingStats, setRecordingStats] = useState<any>(null);

    const leftPlayerRef = useRef<AudioPlayer | null>(null);
    const rightPlayerRef = useRef<AudioPlayer | null>(null);

    const { subscribe } = useWebSocket();

    // 初始化audio player
    useEffect(() => {
        // Use external players if provided, otherwise create new ones
        if (externalLeftPlayer && externalRightPlayer) {
            leftPlayerRef.current = externalLeftPlayer;
            rightPlayerRef.current = externalRightPlayer;
            console.log('[StereoMonitoringPlayer] Using external AudioPlayer instances');
        } else {
            leftPlayerRef.current = new AudioPlayer();
            rightPlayerRef.current = new AudioPlayer();
            console.log('[StereoMonitoringPlayer] Created new AudioPlayer instances');

            // Start initial recording segment
            leftPlayerRef.current.startNewSegment();
            rightPlayerRef.current.startNewSegment();
        }

        return () => {
            // Only cleanup if we created the players
            if (!externalLeftPlayer && !externalRightPlayer) {
                leftPlayerRef.current?.stopCurrentSegment();
                rightPlayerRef.current?.stopCurrentSegment();
                leftPlayerRef.current?.stop();
                rightPlayerRef.current?.stop();
            }
        };
    }, [externalLeftPlayer, externalRightPlayer]);

    // 订阅WS audio frame (只在自己创建的player时)
    useEffect(() => {
        // Skip WebSocket subscription if using external players
        // (Monitoring.tsx already handles audio routing)
        if (externalLeftPlayer && externalRightPlayer) {
            console.log('[StereoMonitoringPlayer] Skipping WebSocket subscription (using external players)');
            return;
        }

        console.log('[StereoMonitoringPlayer] Subscribing to WebSocket audio frames');
        const handleAudioFrame = (message: any) => {
            const frame = message.data;
            if (frame.call_id !== callId) return;

            // Route frame to appropriate player based on channel
            if (frame.channel === 'left' && leftPlayerRef.current) {
                leftPlayerRef.current.playAudioFrame(frame);
            } else if (frame.channel === 'right' && rightPlayerRef.current) {
                rightPlayerRef.current.playAudioFrame(frame);
            }
        };

        const unsubscribe = subscribe('monitor:audio', handleAudioFrame);
        return () => unsubscribe();
    }, [callId, subscribe, externalLeftPlayer, externalRightPlayer]);

    // Update volumes based on mute and balance
    useEffect(() => {
        if (!leftPlayerRef.current || !rightPlayerRef.current) return;

        // 根据balance(-1~1)算左右音量
        // balance = -1: left 100%, right 0%
        // balance = 0: left 100%, right 100%
        // balance = 1: left 0%, right 100%
        const leftVolume = Math.max(0, Math.min(1, 1 - balance));
        const rightVolume = Math.max(0, Math.min(1, 1 + balance));

        console.log('[StereoMonitoringPlayer] Volume update:', {
            balance,
            leftVolume,
            rightVolume,
            leftPlayerExists: !!leftPlayerRef.current,
            rightPlayerExists: !!rightPlayerRef.current
        });

        console.log('[StereoMonitoringPlayer] Setting LEFT volume to:', leftVolume);
        leftPlayerRef.current.setVolume(leftVolume);

        console.log('[StereoMonitoringPlayer] Setting RIGHT volume to:', rightVolume);
        rightPlayerRef.current.setVolume(rightVolume);
    }, [balance]);

    // Set playback complete callback for ended calls
    useEffect(() => {
        if (!leftPlayerRef.current || !rightPlayerRef.current) return;

        if (callEnded) {
            // Set callback to auto-stop and reset when playback completes
            const handlePlaybackComplete = () => {
                setIsPlaying(false);
                setPlaybackPosition(0);
            };

            leftPlayerRef.current.setPlaybackCompleteCallback(handlePlaybackComplete);
            rightPlayerRef.current.setPlaybackCompleteCallback(handlePlaybackComplete);
        } else {
            // Clear callback for ongoing calls
            leftPlayerRef.current.setPlaybackCompleteCallback(null);
            rightPlayerRef.current.setPlaybackCompleteCallback(null);
        }
    }, [callEnded]);

    // Auto-reset to start when call ends at end position
    useEffect(() => {
        if (callEnded && recordingStats) {
            const totalDuration = recordingStats.totalDuration || 0;
            const currentPos = playbackPosition;
            if (totalDuration > 0 && Math.abs(currentPos - totalDuration) < 0.5) {
                setIsPlaying(false);
                setPlaybackPosition(0);
            }
        }
    }, [callEnded]); // Only trigger when callEnded changes

    const togglePlayPause = () => {
        if (!leftPlayerRef.current || !rightPlayerRef.current) return;

        console.log('[togglePlayPause] Called, isPlaying:', isPlaying, 'callEnded:', callEnded, 'playbackPosition:', playbackPosition);

        if (isPlaying) {
            // Pause: stop audio but continue recording
            leftPlayerRef.current.pause();
            rightPlayerRef.current.pause();

            // Record current position
            const currentPos = leftPlayerRef.current.getCurrentPosition();
            setPlaybackPosition(currentPos);
        } else {
            // Play: resume from current position
            const totalDuration = recordingStats?.totalDuration || 0;
            let currentPos = playbackPosition;

            console.log('[togglePlayPause] Play from:', currentPos, 'totalDuration:', totalDuration);

            // Clamp position to valid range [0, totalDuration]
            currentPos = Math.max(0, Math.min(currentPos, totalDuration));
            setPlaybackPosition(currentPos);

            // If call ended, always use playback mode
            if (callEnded) {
                leftPlayerRef.current.playFromPosition(currentPos);
                rightPlayerRef.current.playFromPosition(currentPos);
                setIsLiveMode(false);
            } else {
                // Check if we're near live (< 2s)
                if (totalDuration - currentPos < 2) {
                    // Switch to LIVE mode
                    leftPlayerRef.current.switchToLive();
                    rightPlayerRef.current.switchToLive();
                    leftPlayerRef.current.resume();
                    rightPlayerRef.current.resume();
                    setIsLiveMode(true);
                } else {
                    // Enter PLAYBACK mode
                    leftPlayerRef.current.playFromPosition(currentPos);
                    rightPlayerRef.current.playFromPosition(currentPos);
                    setIsLiveMode(false);
                }
            }
        }
        setIsPlaying(!isPlaying);
    };


    const updateRecordingStats = () => {
        if (!leftPlayerRef.current) return;

        const stats = leftPlayerRef.current.getRecordingStats();
        setRecordingStats(stats);
    };

    // Update stats periodically (always run)
    useEffect(() => {
        // Immediate update
        updateRecordingStats();

        // Then update every second
        const interval = setInterval(() => {
            updateRecordingStats();
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, []); // Empty dependency - run once on mount

    const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBalance(parseFloat(e.target.value));
    };

    const formatTime = (seconds: number): string => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPosition = parseFloat(e.target.value);
        setPlaybackPosition(newPosition);

        const totalDuration = recordingStats?.totalDuration || 0;

        // Check if near live (< 2s)
        if (totalDuration - newPosition < 2) {
            // Switch to LIVE mode
            if (leftPlayerRef.current && rightPlayerRef.current) {
                leftPlayerRef.current.switchToLive();
                rightPlayerRef.current.switchToLive();
            }
            setIsLiveMode(true);
        } else {
            // Enter PLAYBACK mode
            if (isPlaying && leftPlayerRef.current && rightPlayerRef.current) {
                leftPlayerRef.current.playFromPosition(newPosition);
                rightPlayerRef.current.playFromPosition(newPosition);
            }
            setIsLiveMode(false);
        }
    };

    // Update playback position in LIVE mode (only when playing)
    useEffect(() => {
        // Don't update if paused - position should stay fixed
        if (!isPlaying) return;

        if (recordingStats && isLiveMode) {
            setPlaybackPosition(recordingStats.totalDuration);
        }
    }, [recordingStats, isLiveMode, isPlaying]);

    // Update playback position during PLAYBACK mode
    useEffect(() => {
        if (!isPlaying || isLiveMode) return; // Only in playback mode

        const interval = setInterval(() => {
            if (leftPlayerRef.current) {
                const currentPos = leftPlayerRef.current.getCurrentPosition();
                const totalDuration = recordingStats?.totalDuration || 0;

                // Clamp to valid range
                const clampedPos = Math.max(0, Math.min(currentPos, totalDuration));
                setPlaybackPosition(clampedPos);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [isPlaying, isLiveMode, recordingStats]);


    return (
        <div className="stereo-monitoring-player">
            {/* Playback controls */}
            <div className="playback-controls">
                <Button onClick={togglePlayPause} className="play-pause-">
                    {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </Button>
                <h3 style={{ margin: 0, marginLeft: 'auto', fontSize: '14px', fontWeight: 600 }}>
                    🎧 Live Stereo Monitoring
                </h3>
            </div>

            {/* Monitoring Timeline with Seekable Progress */}
            <div className="monitoring-timeline">
                {/* Time labels */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#666',
                    marginBottom: '5px'
                }}>
                    <span>
                        {callEnded ? '📼 PLAYBACK' : (isLiveMode ? '🔴 LIVE' : '⏸️ PLAYBACK')} Monitoring
                    </span>
                    <span style={{ fontWeight: 600, color: '#333' }}>
                        {formatTime(playbackPosition)} / {recordingStats ? formatTime(recordingStats.totalDuration) : '0:00'}
                        {recordingStats && recordingStats.gapCount > 0 && (
                            <span style={{ color: '#ff5722', marginLeft: '8px' }}>
                                ({recordingStats.gapCount} gap{recordingStats.gapCount > 1 ? 's' : ''})
                            </span>
                        )}
                    </span>
                </div>

                {/* Seekable progress bar */}
                <div className="monitoring-progress-container">
                    {/* Range input for seeking */}
                    <input
                        type="range"
                        className="monitoring-progress-bar"
                        min="0"
                        max={recordingStats?.totalDuration || 0}
                        step="0.1"
                        value={playbackPosition}
                        onChange={handleSeek}
                    />

                    {/* Gap markers overlay */}
                    <div className="gap-markers-overlay">
                        {recordingStats?.gaps?.map((gap: any, index: number) => {
                            const totalDuration = recordingStats.totalDuration || 1;
                            const leftPercent = (gap.startTime / totalDuration) * 100;
                            const widthPercent = ((gap.endTime - gap.startTime) / totalDuration) * 100;

                            return (
                                <div
                                    key={index}
                                    className="gap-marker"
                                    style={{
                                        left: `${leftPercent}%`,
                                        width: `${widthPercent}%`
                                    }}
                                    title={`Interruption: ${formatTime(gap.startTime)} - ${formatTime(gap.endTime)} (${formatTime(gap.endTime - gap.startTime)})`}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Balance control */}
            <div className="balance-control">
                <label>Balance:</label>
                <span className="balance-label left">L(Caller)</span>
                <input
                    type="range"
                    min="-1"
                    max="1"
                    value={balance}
                    onChange={handleBalanceChange}
                    step="0.1"
                />
                <span className="balance-label right">R(Callee)</span>
                <span className="balance-value">
                    {balance === 0 ? 'Center' : balance < 0 ? `L ${Math.abs(balance * 100).toFixed(0)}%` : `R ${(balance * 100).toFixed(0)}%`}
                </span>
            </div>



            <style>{`
                .stereo-player {
                    padding: 1rem;
                    background: white;
                    border-radius: 8px;
                }

                .playback-controls {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .play-pause-btn {
                    padding: 0.5rem 1.5rem;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    font-weight: 500;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .play-pause-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .timeline-status {
                    flex: 1;
                    text-align: right;
                    font-size: 0.875rem;
                    color: #6b7280;
                }

                .timeline-container {
                    margin-bottom: 1rem;
                }

                .timeline-info {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }

                .timeline-label {
                    font-size: 0.875rem;
                    color: #6b7280;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .timeline-time {
                    font-family: 'Monaco', 'Courier New', monospace;
                    font-size: 0.875rem;
                    color: #1a1a1a;
                }

                .timeline-wrapper {
                    position: relative;
                }

                .timeline {
                    width: 100%;
                    height: 8px;
                    background: linear-gradient(90deg, #e5e7eb 0%, #d1d5db 100%);
                    border-radius: 4px;
                    cursor: pointer;
                    position: relative;
                    overflow: visible;
                }

                .timeline::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    transition: all 0.2s;
                }

                .timeline::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
                }

                .timeline::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }

                .gap-marker {
                    position: absolute;
                    top: 0;
                    height: 100%;
                    background: repeating-linear-gradient(
                        45deg,
                        #ef4444,
                        #ef4444 2px,
                        #fca5a5 2px,
                        #fca5a5 4px
                    );
                    pointer-events: none;
                    opacity: 0.6;
                    border-radius: 2px;
                }

                .monitoring-progress-bar {
                    width: 100% !important;
                }

                .balance-control {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                    font-size: 13px;
                }

                .balance-control label {
                    color: #666;
                    font-weight: 500;
                }

                .balance-label {
                    color: #666;
                    font-weight: 600;
                    min-width: 15px;
                }

                .balance-control input[type="range"] {
                    flex: 1;
                    height: 6px;
                    border-radius: 3px;
                    background: linear-gradient(to right, #6366f1 0%, #9ca3af 50%, #f59e0b 100%);
                    outline: none;
                    -webkit-appearance: none;
                }

                .balance-control input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: white;
                    border: 2px solid #6366f1;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                .balance-value {
                    min-width: 70px;
                    text-align: right;
                    color: #374151;
                    font-weight: 500;
                    font-size: 12px;
                }

                .channel-controls {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                .channel {
                    padding: 1rem;
                    background: #f9fafb;
                    border-radius: 8px;
                    border: 2px solid #e5e7eb;
                }

                .left-channel {
                    border-color: #3b82f6;
                    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                }

                .right-channel {
                    border-color: #f59e0b;
                    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
                }

                .channel h4 {
                    margin: 0 0 0.75rem 0;
                    font-size: 0.875rem;
                    color: #374151;
                }

                .channel button {
                    width: 100%;
                    padding: 0.5rem;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }

                .channel button:hover {
                    border-color: #667eea;
                    background: #f5f3ff;
                }

                .channel button.muted {
                    background: #fee2e2;
                    border-color: #ef4444;
                    color: #991b1b;
                }

                .btn-ended {
                    background: #9ca3af;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    cursor: default;
                    font-size: 0.875rem;
                }
            `}</style>
        </div>
    );
};
