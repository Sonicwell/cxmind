import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, expect } from 'vitest'
import { CallerContext360 } from '../CallerContext360'

// Mock API Hook
const mockFetchApi = vi.fn()
vi.mock('~/hooks/useApi', () => ({
  useApi: () => ({
    fetchApi: mockFetchApi,
    isInitialized: true,
  }),
}))

// Mock Modules Hook
const mockIsModuleEnabled = vi.fn()
vi.mock('~/hooks/useModules', () => ({
  useModules: () => ({
    isModuleEnabled: mockIsModuleEnabled,
  }),
}))

describe('CallerContext360', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock response for contact lookup
    mockFetchApi.mockResolvedValue({
      id: 'contact_123',
      name: 'John Doe',
      phone: '+15551234567',
      email: 'john@example.com',
      tier: 'premium',
      sentiment: 'positive',
      totalCalls: 5,
      openTickets: 1,
      notes: 'VIP Customer',
      verification: { verified: true }
    })
    
    // By default, allow contacts module
    mockIsModuleEnabled.mockReturnValue(true)
  })

  const renderComponent = (props = {}) => {
    return render(
      <CallerContext360
        callerId="+15551234567"
        {...props}
      />
    )
  }

  it('renders loading state initially', () => {
    // Delay resolution to capture loading state
    mockFetchApi.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)))
    const { container } = renderComponent()
    
    // The skeleton loader div is rendered
    expect(container.querySelector('.ctx360-skeleton')).toBeInTheDocument()
  })

  it('renders caller data successfully after API fetch', async () => {
    renderComponent()

    await waitFor(() => {
      // Basic Info Display
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('+15551234567')).toBeInTheDocument()
      expect(screen.getByText('Premium')).toBeInTheDocument()
      expect(screen.getByText('5 contacts')).toBeInTheDocument()
    })
  })

  it('renders fallback UI when contacts module is disabled without fetching API', async () => {
    // Return false for contacts module
    mockIsModuleEnabled.mockImplementation((slug: string) => slug !== 'contacts')
    
    renderComponent({ callerName: 'Fallback Name' })

    await waitFor(() => {
      expect(screen.getByText('Fallback Name')).toBeInTheDocument()
      expect(screen.getByText('+15551234567')).toBeInTheDocument()
      // Should not have made the contact-lookup API call
      expect(mockFetchApi).not.toHaveBeenCalled()
    })
  })

  it('displays extended details when expanded', async () => {
    const { container } = renderComponent()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    // Expand the card
    const headerRow = container.querySelector('.ctx360-header') || screen.getByText('John Doe').closest('.ctx360-header')
    fireEvent.click(headerRow!)

    await waitFor(() => {
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('VIP Customer')).toBeInTheDocument()
    })
  })

})
