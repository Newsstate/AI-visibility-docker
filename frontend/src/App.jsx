// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { LoginPage, RegisterPage } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddWebsite from './pages/AddWebsite.jsx';
import RunningChecks from './pages/RunningChecks.jsx';
import ReportDashboard from './pages/ReportDashboard.jsx';
import './styles/global.css';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: 'DM Sans, system-ui', fontSize: 13, borderRadius: 10, border: '0.5px solid #e8e6df' },
          success: { iconTheme: { primary: '#1D9E75', secondary: '#E1F5EE' } },
          error:   { iconTheme: { primary: '#E24B4A', secondary: '#FCEBEB' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/add"       element={<ProtectedRoute><AddWebsite /></ProtectedRoute>} />
        <Route path="/checking/:runId"    element={<ProtectedRoute><RunningChecks /></ProtectedRoute>} />
        <Route path="/report/:projectId"  element={<ProtectedRoute><ReportDashboard /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
