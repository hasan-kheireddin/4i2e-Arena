import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { FriendshipProvider } from "./context/FriendshipContext";
import { BlockProvider } from "./context/BlockContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import Verify2FAPage from "./pages/Verify2fapage";
import Setup2FAPage from "./pages/Setup2fapage";
import ForgotPasswordPage from "./pages/Forgotpasswordpage";
import ResetPasswordPage from "./pages/Resetpasswordpage";
import DarkModeToggle from "./components/Darkmodetoggle";
import TicTacToePage from "./pages/Tictactoepage";
import PongPage from "./pages/PongPage";
import Pong3DPage from "./pages/Pong3DPage";
import NotFoundPage from "./pages/Notfoundpage";
import LandingPage from "./pages/LandingPage";
import PlayPage from "./pages/PlayPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import SettingsPage from "./pages/SettingsPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ProfilePage from "./pages/ProfilePage";
import AchievementsPage from "./pages/AchievementsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import ChatPage from "./pages/ChatPage";
import SpectatePage from "./pages/SpectatePage";
import GamificationNotifications from "./components/GamificationNotifications";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FriendshipProvider>
        <BlockProvider>
        <ToastProvider>
        <DarkModeToggle />
        <GamificationNotifications />
        <Routes>
          {/* ========== PUBLIC ROUTES (No Layout) ========== */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/verify-2fa" element={<Verify2FAPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />

          {/* ========== PROTECTED ROUTES (With Layout) ========== */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Layout>
                  <HomePage />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/setup-2fa"
            element={
              <ProtectedRoute>
                <Layout>
                  <Setup2FAPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <LeaderboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <Layout>
                  <MatchHistoryPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfilePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:userId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfilePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/achievements"
            element={
              <ProtectedRoute>
                <Layout>
                  <AchievementsPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* ========== GAME SELECTION (Protected, With Layout) ========== */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Layout>
                  <ChatPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/games/playpage"
            element={
              <ProtectedRoute>
                <Layout>
                  <PlayPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* ========== GAME ROUTES (Protected, No Layout - Full Screen) ========== */}
          <Route
            path="/games/tictactoe"
            element={
              <ProtectedRoute>
                <TicTacToePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/games/pong"
            element={
              <ProtectedRoute>
                <PongPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/games/pong3d"
            element={
              <ProtectedRoute>
                <Pong3DPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/spectate/:gameId"
            element={
              <ProtectedRoute>
                <SpectatePage />
              </ProtectedRoute>
            }
          />

          {/* ========== 404 CATCH-ALL ========== */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ToastProvider>
      </BlockProvider>
      </FriendshipProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
