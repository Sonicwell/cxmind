import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, expect } from 'vitest'
import { SuggestionsPanel } from '../SuggestionsPanel'
import type { AISuggestion } from '~/hooks/useWebSocket'

// Mock API Hook for Telemetry calls
const mockFetchApi = vi.fn()
vi.mock('~/hooks/useApi', () => ({
  useApi: () => ({
    fetchApi: mockFetchApi,
    isInitialized: true,
  }),
}))

describe('SuggestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchApi.mockResolvedValue({})
  })

  const mockSuggestions: AISuggestion[] = [
    {
      id: 'sugg_1',
      type: 'tip',
      text: 'Offer a 10% discount to retain the customer.',
      intent: { category: 'actionable', reasoning: 'Customer expressed churn risk', confidence: 0.95 },
      timestamp: Date.now()
    },
    {
      id: 'sugg_2',
      type: 'alert',
      text: 'Compliance warning: Must state call is being recorded.',
      timestamp: Date.now()
    }
  ]

  const renderComponent = (props = {}) => {
    return render(
      <SuggestionsPanel
        suggestions={mockSuggestions}
        callId="call_123"
        contactId="contact_456"
        {...props}
      />
    )
  }

  it('renders a list of suggestions with correct classifications', () => {
    renderComponent()
    
    // Header count
    expect(screen.getByText('2')).toBeInTheDocument()
    
    // Suggestion 1
    expect(screen.getByText('Offer a 10% discount to retain the customer.')).toBeInTheDocument()
    expect(screen.getByText('TIP')).toBeInTheDocument()
    // It should render intent details
    expect(screen.getByText(/actionable \(95%\)/)).toBeInTheDocument()
    expect(screen.getByText('Customer expressed churn risk')).toBeInTheDocument()
    
    // Suggestion 2
    expect(screen.getByText('Compliance warning: Must state call is being recorded.')).toBeInTheDocument()
    expect(screen.getByText('ALERT')).toBeInTheDocument()
  })

  it('sends telemetry event when copying a suggestion', async () => {
    renderComponent()
    
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    })
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText')

    const copyBtns = screen.getAllByText('Copy')
    fireEvent.click(copyBtns[0])

    expect(clipboardSpy).toHaveBeenCalledWith('Offer a 10% discount to retain the customer.')
    expect(screen.getByText('Copied')).toBeInTheDocument()

    // Verify telemetry API call
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/api/telemetry/events', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"eventType":"suggestion_copy"')
      }))
    })
  })

  it('renders simplified read-only view post-call', () => {
    renderComponent({ readOnly: true })
    
    expect(screen.getByText('📋 Post-call')).toBeInTheDocument()
    // Copy buttons shouldn't exist in readOnly mode
    expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    expect(screen.queryByText('Apply')).not.toBeInTheDocument()
  })

  it('renders Apply button only when NOT in Voice mode', () => {
    const { rerender } = renderComponent({ isVoice: false })
    
    // OmniChannel mode (isVoice = false)
    expect(screen.getAllByText('Apply').length).toBe(2)

    // Voice mode rerender
    rerender(
      <SuggestionsPanel
        suggestions={mockSuggestions}
        callId="call_123"
        contactId="contact_456"
        isVoice={true}
      />
    )
    
    // Apply buttons should be gone
    expect(screen.queryByText('Apply')).not.toBeInTheDocument()
    // but the feedback thumbs remain
    expect(screen.getAllByText('👍').length).toBeGreaterThan(0)
  })

  it('sends telemetry when correcting AI classification', async () => {
    renderComponent()
    
    const correctBtns = screen.getAllByText(/Correct/)
    // Suggestion 1 has an intent object, so it should have a 'Correct' button
    expect(correctBtns.length).toBeGreaterThan(0)
    
    fireEvent.click(correctBtns[0])
    
    // Reveal correction options
    const actuallyChitchatBtn = screen.getByText('Actually chitchat')
    fireEvent.click(actuallyChitchatBtn)

    await waitFor(() => {
      expect(screen.getByText('✓ Feedback saved')).toBeInTheDocument()
      expect(mockFetchApi).toHaveBeenCalledWith('/api/telemetry/events', expect.objectContaining({
        method: 'POST',
        body: expect.stringMatching(/"eventType":"suggestion_correct".*"original":"actionable".*"corrected":"chitchat"/)
      }))
    })
  })

})
