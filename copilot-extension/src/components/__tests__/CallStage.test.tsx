import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, expect } from 'vitest'
import { CallStage } from '../CallStage'

// Mock translations
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock API
const mockFetchApi = vi.fn()
vi.mock('~/hooks/useApi', () => ({
  useApi: () => ({
    fetchApi: mockFetchApi,
  })
}))

// Mock Auth
vi.mock('~/hooks/useAuth', () => ({
  useAuth: () => ({
    agentInfo: {
      sipNumber: '1001',
      userId: 'user_123'
    }
  })
}))

describe('CallStage', () => {

  const incomingCall = {
    callId: 'call_1',
    caller: 'sip:+15551234567@example.com',
    callee: 'sip:1001@example.com',
    status: 'ringing',
    startTime: new Date().toISOString()
  }

  const outgoingCall = {
    callId: 'call_2',
    caller: 'sip:1001@example.com',
    callee: '+18005550000',
    status: 'answered',
    startTime: new Date().toISOString()
  }

  const agentToAgentCall = {
    callId: 'call_3',
    caller: 'sip:1002@example.com',
    caller_type: 'agent',
    callee: 'sip:1001@example.com',
    status: 'answered',
    startTime: new Date().toISOString()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders incoming call with ringing status', () => {
    render(<CallStage call={incomingCall} />)
    expect(screen.getByText('+15551234567')).toBeInTheDocument()
    expect(screen.getByText('call.ringing')).toBeInTheDocument()
    // It should not show the '🎧 Agent' tag since it's an external number
    expect(screen.queryByText('🎧 Agent')).not.toBeInTheDocument()
  })

  it('renders outgoing call with active status', () => {
    render(<CallStage call={outgoingCall} />)
    expect(screen.getByText('+18005550000')).toBeInTheDocument()
    // A non-ringing status shows 'call.active'
    expect(screen.getByText('call.active')).toBeInTheDocument()
  })

  it('renders internal agent tag if the caller is an agent', () => {
    render(<CallStage call={agentToAgentCall} />)
    expect(screen.getByText('1002')).toBeInTheDocument()
    expect(screen.getByText('🎧 Agent')).toBeInTheDocument()
  })

  it('formats time to 0:00 initially', () => {
    render(<CallStage call={{ ...incomingCall, startTime: new Date().toISOString() }} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

})
