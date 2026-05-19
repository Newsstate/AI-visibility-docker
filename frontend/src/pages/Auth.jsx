// src/pages/Auth.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../lib/api.js';
import { useStore } from '../lib/store.js';
import toast from 'react-hot-toast';

function AuthForm({ mode }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { setAuth } = useStore();
  const nav = useNavigate();
  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = isLogin
        ? await auth.login({ email: form.email, password: form.password })
        : await auth.register(form);
      setAuth(data.user, data.token);
      toast.success(isLogin ? 'Welcome back!' : 'Account created!');
      nav('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{background:'#7F77DD'}}>AI</div>
          <span className="text-base font-medium text-gray-800">AI Visibility</span>
        </div>

        <div className="card">
          <h1 className="text-base font-medium text-gray-900 mb-1">
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </h1>
          <p className="text-xs text-gray-400 mb-6">
            {isLogin ? 'Track your brand\'s visibility across AI platforms.' : 'Start tracking your AI visibility for free.'}
          </p>

          <form onSubmit={submit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  placeholder="Jane Smith"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({...f, email: e.target.value}))}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({...f, password: e.target.value}))}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 mt-2" disabled={loading}>
              {loading
                ? <><i className="ti ti-loader-2 animate-spin text-sm" />Please wait...</>
                : isLogin ? 'Sign in' : 'Create account'
              }
            </button>
          </form>

          <div className="mt-5 pt-4 border-t text-center text-xs text-gray-400" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}}>
            {isLogin ? (
              <>Don't have an account?{' '}
                <Link to="/register" className="font-medium" style={{color:'#7F77DD'}}>Sign up free</Link>
              </>
            ) : (
              <>Already have an account?{' '}
                <Link to="/login" className="font-medium" style={{color:'#7F77DD'}}>Sign in</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage()    { return <AuthForm mode="login" />; }
export function RegisterPage() { return <AuthForm mode="register" />; }
