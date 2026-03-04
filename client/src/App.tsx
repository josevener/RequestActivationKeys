import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import PendingRequestsPage from "./pages/PendingRequestsPage";
import RequestOverviewPage from "./pages/RequestOverviewPage";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? "/requests" : "/login"} replace />}
      />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/requests" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/requests" element={<RequestOverviewPage />} />
        <Route path="/requests/activation-keys" element={<PendingRequestsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
