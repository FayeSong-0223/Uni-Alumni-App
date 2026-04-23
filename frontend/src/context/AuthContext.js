import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tempToken, setTempToken] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        const { data } = await api.get('/auth/me/');
        setUser(data);
      }
    } catch {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const { data } = await api.post('/token/', { username, password });

    // If 2FA is required, store temp token and signal the caller
    if (data.requires_2fa) {
      setTempToken(data.temp_token);
      return { requires_2fa: true };
    }

    // No 2FA — store tokens and load user
    await AsyncStorage.setItem('access_token', data.access);
    await AsyncStorage.setItem('refresh_token', data.refresh);
    const { data: userData } = await api.get('/auth/me/');
    setUser(userData);
    return { success: true };
  };

  const verify2FA = async (totpCode) => {
    if (!tempToken) throw new Error('No pending 2FA session.');
    const { data } = await api.post('/token/2fa-verify/', {
      temp_token: tempToken,
      totp_code: totpCode,
    });
    await AsyncStorage.setItem('access_token', data.access);
    await AsyncStorage.setItem('refresh_token', data.refresh);
    const { data: userData } = await api.get('/auth/me/');
    setUser(userData);
    setTempToken(null);
  };

  const register = async (username, email, password, passwordConfirm, fullName) => {
    await api.post('/auth/register/', {
      username,
      email,
      password,
      password_confirm: passwordConfirm,
    });
    await login(username, password);
    // Set the full name on their profile after registration
    if (fullName) {
      try {
        await api.patch('/profiles/me/', { name: fullName });
      } catch {}
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    setUser(null);
    setTempToken(null);
  };

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/me/');
      setUser(data);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{
      user, loading, tempToken,
      login, verify2FA, register, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
