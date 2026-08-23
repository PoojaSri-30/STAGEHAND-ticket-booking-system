import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('tb_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tb_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('tb_user', JSON.stringify(user));
      })
      .catch(() => {
        localStorage.removeItem('tb_token');
        localStorage.removeItem('tb_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user, token } = await api.login({ email, password });
    localStorage.setItem('tb_token', token);
    localStorage.setItem('tb_user', JSON.stringify(user));
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (name, email, password, role) => {
    const { user, token } = await api.register({ name, email, password, role });
    localStorage.setItem('tb_token', token);
    localStorage.setItem('tb_user', JSON.stringify(user));
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
