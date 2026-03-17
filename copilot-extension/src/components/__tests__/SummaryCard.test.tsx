import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, expect } from 'vitest'
import { SummaryCard } from '../SummaryCard'
import type { CallSummary } from '~/hooks/useWebSocket'

// Mock translations
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock fetchApi
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

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockSummary: CallSummary = {
  intent: 'Customer Inquiry',
  outcome: 'Issue resolved',
  nextAction: 'No action needed',
  sentiment: 'positive',
  entities: JSON.stringify({ product: 'Widget X' }),
  rawSummary: 'Customer called about Widget X. Issue resolved.'
}

describe('SummaryCard', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  const renderComponent = (props = {}) => {
    return render(
      <SummaryCard
        callId="call_123"
        callInfo={{
          caller: '+15551234567',
          callee: '1001',
          startTime: new Date(Date.now() - 60000).toISOString() // 1 min ago
        }}
        summary={mockSummary}
        loading={false}
        onDismiss={vi.fn()}
        {...props}
      />
    )
  }

  it('renders completed summary details and caller info', () => {
    renderComponent()
    
    // Call info
    expect(screen.getByText('+15551234567')).toBeInTheDocument()
    
    // Summary details
    expect(screen.getByText('Customer Inquiry')).toBeInTheDocument()
    expect(screen.getByText('Issue resolved')).toBeInTheDocument()
    expect(screen.getByText('No action needed')).toBeInTheDocument()
    // Sentiment contains emoji so regex match
    expect(screen.getByText(/positive/i)).toBeInTheDocument()
    // Entities
    expect(screen.getByText('product: Widget X')).toBeInTheDocument()
    
    // Raw text block
    expect(screen.getByText('Customer called about Widget X. Issue resolved.')).toBeInTheDocument()
  })

  it('renders manual input area when summary is skipped', () => {
    renderComponent({ summarySkipped: true, summary: null })
    
    expect(screen.getByText('Not enough transcript, skip AI Summary')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write your summary here...')).toBeInTheDocument()
  })

  it('submits manual outcome and renders successful feedback', async () => {
    mockFetchApi.mockResolvedValue({})
    renderComponent()
    
    // Find the Success button based on the label
    const successBtn = screen.getByText('Success')
    fireEvent.click(successBtn)

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/api/agent/calls/call_123/outcome', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ outcome: 'success' })
      }))
      expect(screen.getByText('Outcome Saved')).toBeInTheDocument()
    })
  })

  it('allows editing the raw summary text and auto-saves on blur', async () => {
    const onSaveMock = vi.fn()
    vi.useFakeTimers()
    
    renderComponent({ onSave: onSaveMock })
    
    // Click the raw summary div to turn it into a textarea
    const rawSummDiv = screen.getByText('Customer called about Widget X. Issue resolved.')
    fireEvent.click(rawSummDiv)
    
    // Now it should be a textarea
    const textarea = screen.getByDisplayValue('Customer called about Widget X. Issue resolved.')
    fireEvent.change(textarea, { target: { value: 'Customer called and bought Widget Y.' } })
    
    // Blur to trigger save
    fireEvent.blur(textarea)

    // Fast-forward the 500ms debounce
    vi.advanceTimersByTime(600)

    expect(onSaveMock).toHaveBeenCalledWith('Customer called and bought Widget Y.')
    
    vi.useRealTimers()
  })

})
