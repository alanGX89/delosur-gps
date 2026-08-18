import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/LOGO_DELOSUR.png";
import backgroundImg from "../assets/foto_fondo.jfif";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen" style={{ backgroundImage: `url(${backgroundImg})` }}>
      <div className="login-card">
        <img src={logo} alt="DELOSUR" className="login-logo" />
        <p className="login-tagline">Plataforma de tracking de flota</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Usuario</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>

      <style>{`
        .login-screen {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-size: cover;
          background-position: center;
          padding: 24px;
        }
        .login-card {
          position: relative;
          width: 100%;
          max-width: 380px;
          background: rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 16px;
          padding: 40px 32px 32px;
          box-shadow: 0 24px 60px rgba(2, 12, 40, 0.45);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .login-logo {
          width: 220px;
          margin-bottom: 8px;
        }
        .login-tagline {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,.4);
          margin: 0 0 28px;
        }
        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .login-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,.35);
        }
        .login-form input {
          border: 1px solid rgba(255,255,255,.4);
          border-radius: 8px;
          padding: 12px;
          font-size: 16px;
          color: #fff;
          background: rgba(255,255,255,.14);
        }
        .login-form input::placeholder {
          color: rgba(255,255,255,.65);
        }
        .login-form input:focus {
          outline: 2px solid #fff;
          outline-offset: 1px;
          background: rgba(255,255,255,.22);
        }
        .login-form button {
          margin-top: 8px;
          background: var(--navy);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
        }
        .login-form button:hover:not(:disabled) {
          background: var(--navy-deep);
        }
        .login-form button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .login-error {
          margin: 0;
          font-size: 13px;
          color: #ffb4bd;
          text-shadow: 0 1px 3px rgba(0,0,0,.4);
        }

        @media (max-width: 420px) {
          .login-screen { padding: 16px; }
          .login-card { padding: 32px 22px 24px; border-radius: 14px; }
          .login-logo { width: 175px; }
        }
      `}</style>
    </div>
  );
}
