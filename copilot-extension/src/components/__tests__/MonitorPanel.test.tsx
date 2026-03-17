import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, expect } from 'vitest'
import { MonitorPanel } from '../MonitorPanel'

// Mock getStatusColor hook
vi.mock('~/hooks/useAgentStatus', () => ({
  useAgentStatus: () => ({
    getStatusColor: (status: string) => {
      switch (status) {
        case 'online': return 'green'
        case 'busy': return 'red'
        default: return 'gray'
      }
    }
  })
}))

// Mock API
const mockFetchApi = vi.fn()
vi.mock('~/hooks/useApi', () => ({
  useApi: () => ({
    fetchApi: mockFetchApi,
    isInitialized: true,
    hasToken: true,
    apiUrl: 'http://localhost:3000'
  })
}))

// Mock Chrome runtime for WebSocket messages
const mockAddListener = vi.fn()
const mockRemoveListener = vi.fn()
global.chrome = {
  runtime: {
    onMessage: {
      addListener: mockAddListener,
      removeListener: mockRemoveListener,
    }
  }
} as any

describe('MonitorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default API response
    mockFetchApi.mockResolvedValue({
      summary: { total: 2, online: 1, calls: 15, avgDuration: 130 },
      agents: [
        {
          id: 'agent_1',
          name: 'Alice Smith',
          sipNumber: '1001',
          online: true,
          status: 'online',
          callsToday: 10,
          avgDuration: 120,
          chatsToday: 5,
        },
        {
          id: 'agent_2',
          name: 'Bob Jones',
          sipNumber: '1002',
          online: false,
          status: 'offline',
          callsToday: 5,
          avgDuration: 150,
          chatsToday: 2,
          insights: {
            abnormalWrapups: 2, // Should trigger "Long Wrapups" warning
            statusFlapCount: 0,
            utilization: 0,
            nonAdherent: true   // Should trigger "Late Login" warning
          }
        }
      ]
    })
  })

  const renderComponent = () => render(<MonitorPanel />)

  it('renders team summary and agent list from API', async () => {
    renderComponent()
    
    await waitFor(() => {
      // Summary cards
      expect(screen.getByText('15')).toBeInTheDocument() // Total calls
      expect(screen.getByText('2m 10s')).toBeInTheDocument() // Avg dur
      
      // Agent 1
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('1001 · online')).toBeInTheDocument()
      
      // Agent 2
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
      expect(screen.getByText('1002 · offline')).toBeInTheDocument()
    })
  })

  it('renders agent insights warnings (Late Login, Long Wrapups)', async () => {
    renderComponent()
    
    await waitFor(() => {
      expect(screen.getByText('Late Login')).toBeInTheDocument()
      expect(screen.getByText('Long Wrapups')).toBeInTheDocument()
    })
  })

  it('updates agent status when receiving chrome runtime message (WebSocket via SW)', async () => {
    renderComponent()
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('1001 · online')).toBeInTheDocument()
    })

    // Find the listener that was registered
    const listener = mockAddListener.mock.calls[0][0]
    
    // Simulate a message changing Alice to 'busy'
    act(() => {
      listener({
        type: 'agent:status_change',
        data: { agentId: 'agent_1', status: 'busy' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('1001 · busy')).toBeInTheDocument()
    })
  })

  it('displays error message if API fails', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('Network error 500'))
    renderComponent()
    
    await waitFor(() => {
      expect(screen.getByText('Network error 500')).toBeInTheDocument()
    })
  })

})
