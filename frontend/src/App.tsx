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
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import NotFoundPage from "./pages/Notfoundpage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DarkModeToggle />
        <Routes>
          {/* ========== PUBLIC ROUTES (No Layout) ========== */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-2fa" element={<Verify2FAPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          {/* ========== PROTECTED ROUTES (With Layout) ========== */}
          <Route
            path="/"
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

          {/* ========== GAME ROUTES (Protected, No Layout - Full Screen) ========== */}
          <Route
            path="/games/tictactoe"
            element={
              <ProtectedRoute>
                <TicTacToePage />
              </ProtectedRoute>
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