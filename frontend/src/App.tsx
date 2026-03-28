import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
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
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import NotFoundPage from "./pages/Notfoundpage";
import LandingPage from "./pages/Landingpage";
import PlayPage from "./pages/PlayPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DarkModeToggle />
        <Routes>
          {/* ========== PUBLIC ROUTES (No Layout) ========== */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-2fa" element={<Verify2FAPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          {/* ========== PROTECTED ROUTES (With Layout) ========== */}
          <Route
            path="/home"
            element={
                <Layout>
                  <HomePage />
                </Layout>
            }
          />

          <Route
            path="/setup-2fa"
            element={
                <Layout>
                  <Setup2FAPage />
                </Layout>
            }
          />

          <Route
            path="/leaderboard"
            element={
                <Layout>  {/* ← Added Layout */}
                  <LeaderboardPage />
                </Layout>
            }
          />
          <Route
            path="/history"
            element={
                <Layout>  {/* ← Added Layout */}
                  <MatchHistoryPage />
                </Layout>
            }
          />
          <Route
            path="/settings"
            element={
                <Layout>  {/* ← Added Layout */}
                  <SettingsPage />
                </Layout>
            }
          />

          {/* ========== GAME ROUTES (Protected, No Layout - Full Screen) ========== */}
          <Route
            path="/games/playpage" 
            element={
                <PlayPage />
            }
          />

          <Route
            path="/games/tictactoe"
            element={
                <TicTacToePage />
            }
          />

          <Route
            path="/games/pong"
            element={
                <PongPage />
            }
          />

          {/* ========== 404 CATCH-ALL ========== */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;