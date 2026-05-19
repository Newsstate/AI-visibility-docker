// src/components/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { auth } from '../lib/api.js';

export default function ProtectedRoute({ children }) {
  const { token, setAuth, logout } = useStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    auth.me()
      .then(r => { setAuth(r.data, token); setChecking(false); })
      .catch(() => { logout(); setChecking(false); });
  }, []);

  if (checking) return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
      <i className="ti ti-loader-2 animate-spin text-gray-400 text-xl" />
    </div>
  );

  if (!token) return <Navigate to="/login" replace />;
  return children;
}
