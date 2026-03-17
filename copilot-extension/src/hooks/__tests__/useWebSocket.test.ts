import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, expect } from 'vitest'
import { useWebSocket } from '../useWebSocket'

// Mock Chrome API
const mockSendMessage = vi.fn()
const mockAddListener = vi.fn()
const mockRemoveListener = vi.fn()

global.chrome = {
  runtime: {
    onMessage: {
      addListener: mockAddListener,
      removeListener: mockRemoveListener,
    },
    sendMessage: mockSendMessage,
    lastError: undefined,
  }
} as any

describe('useWebSocket', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock response: connection active
    mockSendMessage.mockImplementation((msg, cb) => {
      if (msg.type === 'getConnectionStatus') {
        cb({ connected: true, connecting: false })
      } else if (msg.type === 'getCurrentCall') {
        cb({ call: null })
      }
    })
  })

  it('listens for connection status requests', async () => {
    const { result } = renderHook(() => useWebSocket())

    // Initial check (triggered on mount)
    await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({ type: 'getConnectionStatus' }, expect.any(Function))
    })
    
    // Test the state update manually through the callback the hook provides
    const statusCallback = mockSendMessage.mock.calls.find(call => call[0].type === 'getConnectionStatus')[1]
    
    act(() => {
        statusCallback({ connected: false, connecting: true })
    })

    await waitFor(() => {
        expect(result.current.connected).toBe(false)
        expect(result.current.connecting).toBe(true)
    })
  })

  it('handles mid-call transcription replay correctly upon reconnect', () => {
    const { result } = renderHook(() => useWebSocket())
    
    const listener = mockAddListener.mock.calls[0][0]

    // Setup an initial live transcription
    act(() => {
        listener({
            type: 'transcription_update',
            data: [{ id: 'live-1', text: 'Live transcript', is_final: false }]
        })
    })

    expect(result.current.transcriptions.length).toBe(1)
    expect(result.current.transcriptions[0].text).toBe('Live transcript')

    // Simulate Reconnect Replay Event
    act(() => {
        listener({
            type: 'call:transcription_replay',
            data: {
                segments: [
                    { text: 'Historical Transcript 1', timestamp: '2025-01-01T10:00:00Z' },
                    { text: 'Historical Transcript 2', timestamp: '2025-01-01T10:00:05Z' }
                ]
            }
        })
    })

    // It should prepend historical data and map ids properly, preserving the live one
    expect(result.current.transcriptions.length).toBe(3)
    // First element should be historic
    expect(result.current.transcriptions[0].text).toBe('Historical Transcript 1')
    expect(result.current.transcriptions[0].is_final).toBe(true)
    
    // Last element should be the live unfinalized one
    expect(result.current.transcriptions[2].text).toBe('Live transcript')
    expect(result.current.transcriptions[2].is_final).toBe(false)
  })

  it('manages correct state lifecycle on call creation to answer to hangup', () => {
    const { result } = renderHook(() => useWebSocket())
    const listener = mockAddListener.mock.calls[0][0]
    
    // 1. Inbound Call Created
    act(() => {
        listener({
            type: 'call_event',
            data: {
                event_type: 'call_create',
                call_id: 'call_new_123',
                caller_uri: 'sip:john',
                status: 'ringing'
            }
        })
    })

    expect(result.current.currentCall?.call_id).toBe('call_new_123')
    expect(result.current.currentCall?.status).toBe('ringing')

    // 2. Call Answered
    act(() => {
        listener({
            type: 'call_event',
            data: {
                event_type: 'call_answer',
            }
        })
    })
    
    expect(result.current.currentCall?.status).toBe('active')

    // 3. Call Hangup triggers summary loading mode
    act(() => {
        listener({
            type: 'call_event',
            data: {
                event_type: 'call_hangup',
                call_id: 'call_new_123',
            }
        })
    })

    expect(result.current.currentCall).toBeNull()
    expect(result.current.lastEndedCallId).toBe('call_new_123')
    expect(result.current.summaryLoading).toBe(true)
  })
})
