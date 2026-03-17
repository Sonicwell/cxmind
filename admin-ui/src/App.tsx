import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { ThemeProvider } from './context/ThemeContext';
import 'nprogress/nprogress.css';
import { useState, useEffect, Suspense, lazy } from 'react';
import { TopProgress } from './components/common/TopProgress';
import { RouteErrorBoundary } from './components/common/RouteErrorBoundary';
import { ModuleRoute } from './components/guards/ModuleRoute';
import NProgress from 'nprogress';

// ============================================================================
// UX & 并发渲染架构说明 (UX & Concurrent Rendering Architecture)
// ============================================================================
// 在 React 18 + React Router v6 环境下，路由导航默认包裹在 startTransition 中。
// 这意味着 React 会保持当前界面的交互性（不触发白屏/骨架 fallback），直到新组件的包被下载并解析完毕。
// 因此外层的 <Suspense fallback={<TopProgress />}> 在大多数导航中是失效的。
// 为了弥补网络请求期间缺乏视觉反馈的问题，我们封装了 lazyWithProgress：
// 利用 Promise 生命周期主动侵入 NProgress，在维持并发展示优势的同时提供确定的加载进度条。
// ============================================================================
const lazyWithProgress = (importFunc: () => Promise<any>) => {
  return lazy(() => {
    NProgress.start();
    return importFunc().finally(() => {
      NProgress.done();
    });
  });
};

// Immediate/Static Imports (Critical Path)
import Login from './pages/Login';
import { NotFound } from './pages/NotFound';
import DashboardLayout from './layouts/DashboardLayout';
import { ClientProvider } from './context/ClientContext';
import { ModuleProvider } from './context/ModuleContext';
import { Toaster } from 'react-hot-toast';
import AiVendors from './pages/settings/AiVendors';
import SystemConfig from './pages/settings/SystemConfig';
import OmnichannelConfig from './pages/settings/OmnichannelConfig';
import SessionManagement from './pages/settings/SessionManagement';
import IntentManagement from './components/settings/IntentManagement';
import EmotionAnchors from './components/settings/EmotionAnchors';
import { StorageSettingsTab } from './components/settings/StorageSettingsTab';
import { SystemHealthPanel } from './components/settings/SystemHealthPanel';

// Dynamic Imports (Code Splitting)
const TrafficReplayPage = lazyWithProgress(() => import('./pages/settings/TrafficReplay').then(m => ({ default: m.TrafficReplay })));
const Dashboard = lazyWithProgress(() => import('./pages/Dashboard'));
const Users = lazyWithProgress(() => import('./pages/Users'));
const Agents = lazyWithProgress(() => import('./pages/Agents'));
const SipCalls = lazyWithProgress(() => import('./pages/SipCalls'));
const CallEvents = lazyWithProgress(() => import('./pages/CallEvents'));
const Monitoring = lazyWithProgress(() => import('./pages/Monitoring').then(m => ({ default: m.Monitoring })));
const ConversationMonitor = lazyWithProgress(() => import('./pages/ConversationMonitor'));
const SettingsLayout = lazyWithProgress(() => import('./layouts/SettingsLayout'));
const LicenseSettings = lazyWithProgress(() => import('./pages/settings/LicenseSettings'));

const GeneralSettings = lazyWithProgress(() => import('./pages/settings/GeneralSettings'));
const RoleManagement = lazyWithProgress(() => import('./pages/settings/RoleManagement'));
const ModuleManagementPanel = lazyWithProgress(() => import('./components/settings/ModuleManagementPanel').then(m => ({ default: m.ModuleManagementPanel })));
const SerConfig = lazyWithProgress(() => import('./pages/settings/SerConfig'));
const VectorDbConfig = lazyWithProgress(() => import('./pages/settings/VectorDbConfig'));
const SummarySchemasConfig = lazyWithProgress(() => import('./pages/settings/SummarySchemasConfig'));
const DistillationLogs = lazyWithProgress(() => import('./pages/settings/distillation-logs'));
const ContactStagesConfig = lazyWithProgress(() => import('./pages/settings/ContactStagesConfig').then(module => ({ default: module.ContactStagesConfig })));
const AgentStatusConfig = lazyWithProgress(() => import('./pages/settings/AgentStatusConfig').then(m => ({ default: m.AgentStatusConfig })));
const AuditDashboard = lazyWithProgress(() => import('./pages/AuditDashboard'));
const AuditLogs = lazyWithProgress(() => import('./pages/AuditLogs'));
const AuditAnomalies = lazyWithProgress(() => import('./pages/AuditAnomalies'));
const AuditRules = lazyWithProgress(() => import('./pages/AuditRules'));
const AuditReports = lazyWithProgress(() => import('./pages/AuditReports'));
const AlertCenter = lazyWithProgress(() => import('./pages/AlertCenter'));
const ActionHistory = lazyWithProgress(() => import('./pages/ActionHistory'));
const AgentMapPage = lazyWithProgress(() => import('./pages/AgentMap').then(m => ({ default: m.AgentMapPage })));
const QualityInspector = lazyWithProgress(() => import('./pages/QualityInspector'));
const Analytics = lazyWithProgress(() => import('./pages/Analytics'));
const ROIDashboard = lazyWithProgress(() => import('./pages/ROIDashboard'));
const CommandCenter = lazyWithProgress(() => import('./pages/CommandCenter'));
const Webhooks = lazyWithProgress(() => import('./pages/Webhooks'));
const Alerts = lazyWithProgress(() => import('./pages/Alerts'));
const Assistant = lazyWithProgress(() => import('./pages/Assistant'));
const Omnichannel = lazyWithProgress(() => import('./pages/Omnichannel'));
const KnowledgeBase = lazyWithProgress(() => import('./pages/KnowledgeBase'));
const Contacts = lazyWithProgress(() => import('./pages/Contacts'));
const ContactDetail = lazyWithProgress(() => import('./pages/ContactDetail'));
const CXMindDemo = lazyWithProgress(() => import('./pages/CXMindDemo'));
const Integrations = lazyWithProgress(() => import('./pages/Integrations'));
const CRMIntegrationWizard = lazyWithProgress(() => import('./pages/CRMIntegrationWizard'));
const TicketSetup = lazyWithProgress(() => import('./pages/TicketSetup'));

// WFM
const WfmLayout = lazyWithProgress(() => import('./pages/wfm/WfmLayout'));
const WfmSchedule = lazyWithProgress(() => import('./pages/wfm/WfmSchedule'));
const WfmAdherence = lazyWithProgress(() => import('./pages/wfm/WfmAdherence'));
const WfmApprovals = lazyWithProgress(() => import('./pages/wfm/WfmApprovals'));
const WfmSettings = lazyWithProgress(() => import('./pages/wfm/WfmSettings'));

const SetupWizard = lazyWithProgress(() => import('./pages/SetupWizard'));
const OmnichannelTemplates = lazyWithProgress(() => import('./pages/omnichannel/OmnichannelTemplates'));
const TemplateBuilder = lazyWithProgress(() => import('./pages/omnichannel/TemplateBuilder'));
const SOPLibrary = lazyWithProgress(() => import('./pages/sop/SOPLibrary'));
const SOPBuilder = lazyWithProgress(() => import('./pages/sop/SOPBuilder'));
const SipDiagramPage = lazyWithProgress(() => import('./pages/SipDiagramPage'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const [showSpinner, setShowSpinner] = useState(false);

  // Only show spinner after 300ms to avoid flash on fast loads
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return showSpinner ? (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-base, #0f172a)' }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTop: '3px solid var(--primary, #6366f1)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    ) : null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      <BrowserRouter>
        <AuthProvider>
          <RouteErrorBoundary>
            <Suspense fallback={<TopProgress />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={
                  <ProtectedRoute>
                    <SetupWizard />
                  </ProtectedRoute>
                } />
                <Route path="/command" element={
                  <ProtectedRoute>
                    <WebSocketProvider>
                      <ClientProvider>
                        <CommandCenter />
                      </ClientProvider>
                    </WebSocketProvider>
                  </ProtectedRoute>
                } />

                <Route path="/sip-diagram/:callId" element={
                  <ProtectedRoute>
                    <SipDiagramPage />
                  </ProtectedRoute>
                } />

                <Route path="/" element={
                  <ProtectedRoute>
                    <WebSocketProvider>
                      <ClientProvider>
                        <ModuleProvider>
                          <DashboardLayout />
                        </ModuleProvider>
                      </ClientProvider>
                    </WebSocketProvider>
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="users" element={<Users />} />
                  <Route path="agents" element={<Agents />} />
                  <Route path="calls" element={<SipCalls />} />
                  <Route path="events" element={<CallEvents />} />
                  <Route path="monitoring" element={<Monitoring />} />
                  <Route path="omni-monitor" element={<ModuleRoute module="inbox"><ConversationMonitor /></ModuleRoute>} />

                  {/* Settings Sub-Routing */}
                  <Route path="settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="general" replace />} />

                    {/* Global Settings */}
                    <Route path="general" element={<GeneralSettings />} />

                    {/* Access & Security */}
                    <Route path="organization/roles" element={<RoleManagement />} />
                    <Route path="organization/sessions" element={<SessionManagement />} />

                    {/* AI Engine */}
                    <Route path="ai/vendors" element={<AiVendors />} />
                    <Route path="ai/ser" element={<SerConfig />} />
                    <Route path="ai/vector-db" element={<VectorDbConfig />} />

                    {/* Business Logic */}
                    <Route path="business/intents" element={<IntentManagement />} />
                    <Route path="business/emotions" element={<EmotionAnchors />} />
                    <Route path="business/schemas" element={<SummarySchemasConfig />} />
                    <Route path="business/llm-logs" element={<DistillationLogs />} />
                    <Route path="business/stages" element={<ContactStagesConfig />} />
                    <Route path="business/agent-statuses" element={<AgentStatusConfig />} />

                    {/* System Configuration */}
                    <Route path="system/general" element={<SystemConfig />} />
                    <Route path="system/modules" element={<ModuleManagementPanel />} />
                    <Route path="system/license" element={<LicenseSettings />} />
                    <Route path="system/storage" element={<StorageSettingsTab />} />
                    <Route path="system/smtp" element={<SystemConfig />} />
                    <Route path="system/health" element={<SystemHealthPanel />} />
                    <Route path="system/tests" element={<TrafficReplayPage />} />

                    {/* Channels & Connectors */}
                    <Route path="channels/omnichannel" element={<OmnichannelConfig />} />


                  </Route>

                  <Route path="audit" element={<ModuleRoute module="audit"><AuditDashboard /></ModuleRoute>} />
                  <Route path="audit/logs" element={<ModuleRoute module="audit"><AuditLogs /></ModuleRoute>} />
                  <Route path="audit/anomalies" element={<ModuleRoute module="audit"><AuditAnomalies /></ModuleRoute>} />
                  <Route path="audit/rules" element={<ModuleRoute module="audit"><AuditRules /></ModuleRoute>} />
                  <Route path="audit/alerts" element={<ModuleRoute module="audit"><AlertCenter /></ModuleRoute>} />
                  {/* C5: Action Draft Engine */}
                  <Route path="actions" element={<ModuleRoute module="action_center"><ActionHistory /></ModuleRoute>} />
                  <Route path="audit/reports" element={<ModuleRoute module="audit"><AuditReports /></ModuleRoute>} />
                  <Route path="map" element={<AgentMapPage />} />
                  <Route path="assistant" element={<Assistant />} />
                  <Route path="qi" element={<ModuleRoute module="qi"><QualityInspector /></ModuleRoute>} />
                  <Route path="analytics" element={<ModuleRoute module="analytics"><Analytics /></ModuleRoute>} />
                  <Route path="roi" element={<ModuleRoute module="analytics"><ROIDashboard /></ModuleRoute>} />

                  {/* WFM Implementation */}
                  <Route path="wfm" element={<ModuleRoute module="wfm"><WfmLayout /></ModuleRoute>}>
                    <Route index element={<Navigate to="schedule" replace />} />
                    <Route path="schedule" element={<WfmSchedule />} />
                    <Route path="adherence" element={<WfmAdherence />} />
                    <Route path="approvals" element={<WfmApprovals />} />
                    <Route path="settings" element={<WfmSettings />} />
                  </Route>

                  <Route path="templates" element={<ModuleRoute module="inbox"><OmnichannelTemplates /></ModuleRoute>} />
                  <Route path="templates/builder" element={<ModuleRoute module="inbox"><TemplateBuilder /></ModuleRoute>} />
                  <Route path="sop" element={<ModuleRoute module="sop"><SOPLibrary /></ModuleRoute>} />
                  <Route path="sop/builder" element={<ModuleRoute module="sop"><SOPBuilder /></ModuleRoute>} />
                  <Route path="webhooks" element={<ModuleRoute module="webhooks"><Webhooks /></ModuleRoute>} />
                  <Route path="alerts" element={<Alerts />} />
                  <Route path="inbox" element={<ModuleRoute module="inbox"><Omnichannel /></ModuleRoute>} />
                  <Route path="knowledge" element={<ModuleRoute module="knowledge"><KnowledgeBase /></ModuleRoute>} />
                  <Route path="integrations" element={<ModuleRoute module="webhooks"><Integrations /></ModuleRoute>} />
                  <Route path="integrations/jira" element={<ModuleRoute module="webhooks"><TicketSetup /></ModuleRoute>} />
                  <Route path="integrations/servicenow" element={<ModuleRoute module="webhooks"><TicketSetup /></ModuleRoute>} />
                  <Route path="integrations/:provider" element={<ModuleRoute module="webhooks"><CRMIntegrationWizard /></ModuleRoute>} />
                  <Route path="contacts" element={<ModuleRoute module="contacts"><Contacts /></ModuleRoute>} />
                  <Route path="contacts/:id" element={<ModuleRoute module="contacts"><ContactDetail /></ModuleRoute>} />
                  <Route path="playground" element={<ModuleRoute module="demo"><CXMindDemo /></ModuleRoute>} />
                  <Route path="call-quality" element={<Navigate to="/dashboard" replace />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
