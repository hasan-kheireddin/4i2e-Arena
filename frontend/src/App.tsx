import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import Verify2FAPage from "./pages/Verify2fapage";
import Setup2FAPage from "./pages/Setup2fapage";
import ForgotPasswordPage from "./pages/Forgotpasswordpage";
import ResetPasswordPage from "./pages/Resetpasswordpage";
import DarkModeToggle from "./components/Darkmodetoggle";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DarkModeToggle />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-2fa" element={<Verify2FAPage />} />
          <Route path="/setup-2fa" element={<Setup2FAPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;