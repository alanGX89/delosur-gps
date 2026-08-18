import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import ActivityLog from "./pages/ActivityLog";
import AdminUsers from "./pages/AdminUsers";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function useUserTheme() {
  const { user } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (user) {
      root.style.setProperty("--navy", user.colorPrimary);
      root.style.setProperty("--navy-deep", user.colorPrimary);
      root.style.setProperty("--red", user.colorAccent);
      root.style.setProperty("--danger", user.colorAccent);
      root.style.setProperty("--blue", user.colorSecondary);
    } else {
      root.style.removeProperty("--navy");
      root.style.removeProperty("--navy-deep");
      root.style.removeProperty("--red");
      root.style.removeProperty("--danger");
      root.style.removeProperty("--blue");
    }
  }, [user]);
}

export default function App() {
  useUserTheme();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/actividad"
        element={
          <AdminRoute>
            <ActivityLog />
          </AdminRoute>
        }
      />
    </Routes>
  );
}
