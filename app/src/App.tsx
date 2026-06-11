import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import SignupPage from './auth/SignupPage'
import ForgotPasswordPage from './auth/ForgotPasswordPage'
import ResetPasswordPage from './auth/ResetPasswordPage'
import GoodbyePage from './auth/GoodbyePage'
import AuthCallback from './auth/AuthCallback'
import LegalDoc from './auth/LegalDoc'
import Layout from './components/Layout'
import HomePage from './features/groups/HomePage'
import NewGroupPage from './features/groups/NewGroupPage'
import EditGroupPage from './features/groups/EditGroupPage'
import MembersPage from './features/groups/MembersPage'
import ConvokeMemberPage from './features/groups/ConvokeMemberPage'
import JoinPage from './features/groups/JoinPage'
import AvailabilityPage from './features/availability/AvailabilityPage'
import UpcomingPage from './features/agenda/UpcomingPage'
import SessionsPage from './features/sessions/SessionsPage'
import SessionDetailPage from './features/sessions/SessionDetailPage'
import ShortLinkPage from './features/sessions/ShortLinkPage'
import PlannerPage from './features/planner/PlannerPage'
import EditSessionPage from './features/planner/EditSessionPage'
import NewSessionPage from './features/planner/NewSessionPage'
import NotificationsPage from './features/notifications/NotificationsPage'
import ProfilePage from './features/profile/ProfilePage'
import AdminPage from './features/admin/AdminPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/goodbye" element={<GoodbyePage />} />
        <Route
          path="/privacy"
          element={
            <LegalDoc
              ns="privacy"
              sections={[
                'controller',
                'data',
                'purpose',
                'legalBasis',
                'retention',
                'recipients',
                'transfers',
                'rights',
                'security',
                'storage',
                'changes',
              ]}
            />
          }
        />
        <Route
          path="/legal"
          element={<LegalDoc ns="legal" sections={['identity', 'terms', 'ip', 'liability', 'links', 'law']} />}
        />
        <Route
          path="/cookies"
          element={<LegalDoc ns="cookies" sections={['what', 'types', 'used', 'manage', 'changes']} gated={false} />}
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* /join/:code and /s/:code handle their own login (shareable links) */}
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/s/:code" element={<ShortLinkPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/new-group" element={<NewGroupPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/g/:groupId" element={<SessionsPage />} />
          <Route path="/g/:groupId/edit" element={<EditGroupPage />} />
          <Route path="/g/:groupId/planner" element={<PlannerPage />} />
          <Route path="/g/:groupId/members" element={<MembersPage />} />
          <Route path="/g/:groupId/members/:memberId/sessions" element={<ConvokeMemberPage />} />
          <Route path="/g/:groupId/sessions/new" element={<NewSessionPage />} />
          <Route path="/g/:groupId/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/g/:groupId/sessions/:sessionId/edit" element={<EditSessionPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
