import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HomeDashboard } from '../HomeDashboard'
import { vi, expect } from 'vitest'
import { AuthProvider } from '~/hooks/useAuth'

// Mock Translations
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

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

// Mock Auth Hook
vi.mock('~/hooks/useAuth', () => ({
  useAuth: () => ({
    agentInfo: {
      displayName: 'Test Agent',
      role: 'agent',
      isDemo: false,
    },
  }),
  AuthProvider: ({ children }: any) => <>{children}</>
}))

// Mock Sub Components to keep test isolated
vi.mock('~/components/AchievementsPanel', () => ({
  AchievementsPanel: () => <div data-testid="achievements-panel" />
}))
vi.mock('~/components/LiveFeed', () => ({
  LiveFeed: () => <div data-testid="live-feed" />
}))
vi.mock('~/components/SOPGuidePanel', () => ({
  SOPGuidePanel: () => <div data-testid="sop-guide-panel" />
}))
vi.mock('~/components/PolicyBadges', () => ({
  PolicyBadges: () => <div data-testid="policy-badges" />
}))
vi.mock('../AgentStatusCard', () => ({
  AgentStatusCard: () => <div data-testid="agent-status-card" />
}))


describe('HomeDashboard', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchApi.mockResolvedValue({
      callCount: 10,
      avgDuration: 120,
      avgCSAT: 4.5,
      compliance: 95,
      chatsResolved: 5,
      totalCalls: 100
    })
    // By default, allow all modules
    mockIsModuleEnabled.mockReturnValue(true)
  })

  const renderComponent = (props = {}) => {
    return render(
      <HomeDashboard
        hasActiveCall={false}
        callCount={0}
        onNavigate={vi.fn()}
        {...props}
      />
    )
  }

  it('renders greeting and basic stats', async () => {
    renderComponent()
    
    expect(screen.getByText(/Test/)).toBeInTheDocument()
    expect(screen.getByText('home.readyToHelp')).toBeInTheDocument()

    // Wait for API to populate stats
    await waitFor(() => {
      // callCount: 10, avgDuration: 120s (2m), CSAT: 4.5
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('4.5')).toBeInTheDocument()
      expect(screen.getByText('2m')).toBeInTheDocument()
    })
  })

  it('conditionally hides Inbox stats and action when inbox module is disabled', async () => {
    // Disable inbox
    mockIsModuleEnabled.mockImplementation((slug) => slug !== 'inbox')
    
    renderComponent()
    
    await waitFor(() => {
      // chatsResolved (from mock) is 5, but shouldn't render if inbox disabled
      expect(screen.queryByText('5')).not.toBeInTheDocument()
      expect(screen.queryByText('home.chatsResolved')).not.toBeInTheDocument()
      // Inbox quick action should be missing
      expect(screen.queryByText('home.inbox')).not.toBeInTheDocument()
    })
  })

  it('renders active call banner when hasActiveCall is true', () => {
    renderComponent({ hasActiveCall: true })
    expect(screen.getByText('home.activeCall')).toBeInTheDocument()
    expect(screen.getByText('home.onCall')).toBeInTheDocument()
  })

})
