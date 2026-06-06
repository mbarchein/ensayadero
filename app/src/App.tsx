import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import SignupPage from './auth/SignupPage'
import ForgotPasswordPage from './auth/ForgotPasswordPage'
import ResetPasswordPage from './auth/ResetPasswordPage'
import AuthCallback from './auth/AuthCallback'
import Layout from './components/Layout'
import HomePage from './features/groups/HomePage'
import MembersPage from './features/groups/MembersPage'
import JoinPage from './features/groups/JoinPage'
import AvailabilityPage from './features/availability/AvailabilityPage'
import UpcomingPage from './features/agenda/UpcomingPage'
import SessionsPage from './features/sessions/SessionsPage'
import SessionDetailPage from './features/sessions/SessionDetailPage'
import PlannerPage from './features/planner/PlannerPage'
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
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* /join/:code gestiona su propio login (enlace compartible) */}
        <Route path="/join/:code" element={<JoinPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/g/:groupId" element={<SessionsPage />} />
          <Route path="/g/:groupId/planner" element={<PlannerPage />} />
          <Route path="/g/:groupId/members" element={<MembersPage />} />
          <Route path="/g/:groupId/sessions/:sessionId" element={<SessionDetailPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
