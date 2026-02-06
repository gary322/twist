import React, { useState } from 'react';

interface LoginViewProps {
  onLogin: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTHENTICATE',
        payload: { email, password }
      });

      if (response.success) {
        onLogin();
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      setError('Failed to connect to extension');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="logo-large">
        <img src="/assets/icon-128.png" alt="TWIST" />
        <h1>TWIST</h1>
        <p>Earn tokens while you browse</p>
      </div>

      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>

      <div className="login-footer">
        <a href="https://twist.io/signup" target="_blank" rel="noopener noreferrer">
          Create Account
        </a>
        <a href="https://twist.io/forgot" target="_blank" rel="noopener noreferrer">
          Forgot Password?
        </a>
      </div>
    </div>
  );
};

export default LoginView;