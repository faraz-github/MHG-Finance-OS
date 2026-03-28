"use client";
// src/app/(auth)/login/LoginForm.tsx

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed. Please try again.");
        return;
      }

      // Use ?next= param if present (e.g. redirected from a protected page),
      // otherwise use the role-specific landing path from the API.
      const next = searchParams.get("next");
      const landing = (next && next.startsWith("/")) ? next : (data.landingPath ?? "/dashboard");
      router.push(landing);
    } catch {
      setError("Unable to connect. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --brand:        #F97316;
          --brand-hover:  #EA6C0A;
          --brand-dim:    rgba(249, 115, 22, 0.12);
          --bg-page:      #0F1117;
          --bg-card:      #181B24;
          --bg-input:     #1E2130;
          --border:       #2A2F42;
          --border-focus: #F97316;
          --text-primary: #F1F3F9;
          --text-secondary:#8B91A7;
          --text-error:   #F87171;
          --radius:       10px;
          --font:         'Sora', sans-serif;
        }

        html, body { height: 100%; font-family: var(--font); background: var(--bg-page); color: var(--text-primary); }

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-page);
          background-image: radial-gradient(ellipse 60% 50% at 50% 40%, rgba(249,115,22,0.07) 0%, transparent 70%);
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 40px 36px 36px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
        }

        .login-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 32px;
        }

        .login-logo-mark {
          width: 36px;
          height: 36px;
          background: var(--brand);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .login-logo-text {
          display: flex;
          flex-direction: column;
          line-height: 1;
        }

        .login-logo-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.01em;
        }

        .login-logo-sub {
          font-size: 11px;
          font-weight: 400;
          color: var(--text-secondary);
          margin-top: 2px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .login-heading {
          font-size: 22px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
          letter-spacing: -0.3px;
        }

        .login-subheading {
          font-size: 13px;
          font-weight: 400;
          color: var(--text-secondary);
          margin-bottom: 28px;
        }

        .login-divider {
          height: 1px;
          background: var(--border);
          margin-bottom: 28px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .field-input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text-primary);
          font-family: var(--font);
          font-size: 14px;
          font-weight: 400;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          caret-color: var(--brand);
        }

        .field-input::placeholder { color: #4A5068; }

        .field-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px var(--brand-dim);
        }

        .field-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px 14px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: var(--radius);
          margin-bottom: 16px;
        }

        .error-icon {
          flex-shrink: 0;
          width: 16px;
          height: 16px;
          margin-top: 1px;
          color: var(--text-error);
        }

        .error-text {
          font-size: 13px;
          font-weight: 400;
          color: var(--text-error);
          line-height: 1.4;
        }

        .login-btn {
          width: 100%;
          height: 46px;
          background: var(--brand);
          color: #fff;
          border: none;
          border-radius: var(--radius);
          font-family: var(--font);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .login-btn:hover:not(:disabled) { background: var(--brand-hover); }
        .login-btn:active:not(:disabled) { transform: scale(0.99); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .login-footer {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary);
        }
      `}</style>

      <div className="login-root">
        <div className="login-card">

          <div className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="MehmanGhar Stays"
              fetchPriority="high"
              style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }}
            />
            <div className="login-logo-text">
              <span className="login-logo-name">MehmanGhar</span>
              <span className="login-logo-sub">Finance OS</span>
            </div>
          </div>

          <h1 className="login-heading">Welcome back</h1>
          <p className="login-subheading">Sign in to access your dashboard</p>
          <div className="login-divider" />

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">

              <div className="field">
                <label htmlFor="username" className="field-label">Username</label>
                <input
                  ref={usernameRef}
                  id="username"
                  type="text"
                  className="field-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="password" className="field-label">Password</label>
                <input
                  id="password"
                  type="password"
                  className="field-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
              </div>

            </div>

            {error && (
              <div className="error-box" role="alert">
                <svg className="error-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z" fill="currentColor"/>
                  <path d="M8 4.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.5ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor"/>
                </svg>
                <span className="error-text">{error}</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="login-footer">
            MehmanGhar Stays Services Pvt. Ltd.
          </p>

        </div>
      </div>
    </>
  );
}