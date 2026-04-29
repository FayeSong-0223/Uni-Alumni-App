import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Resolve the backend base URL from Expo public env vars.
// Set these in `.env` (or your shell) before running `expo start`:
//   EXPO_PUBLIC_API_URL              — universal override
//   EXPO_PUBLIC_API_URL_WEB          — web-only override
//   EXPO_PUBLIC_API_URL_ANDROID      — Android-only override (10.0.2.2 for emulator)
//   EXPO_PUBLIC_API_URL_IOS          — iOS-only override
// Falls back to localhost so a fresh checkout works without configuration.
const DEFAULT_API_URL = 'http://localhost:8000/api';

export const getBaseURL = () => {
  const universal = process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_API_URL_WEB || universal || DEFAULT_API_URL;
  }
  if (Platform.OS === 'android') {
    // Android emulator can't reach the host's localhost — use 10.0.2.2 unless
    // an explicit override is provided.
    return (
      process.env.EXPO_PUBLIC_API_URL_ANDROID ||
      universal ||
      'http://10.0.2.2:8000/api'
    );
  }
  return process.env.EXPO_PUBLIC_API_URL_IOS || universal || DEFAULT_API_URL;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  // Serialise array params as repeated keys ?tags=a&tags=b (no brackets)
  // so Django's request.GET.getlist('tags') picks them up correctly.
  // Default axios behaviour would produce ?tags[]=a which getlist doesn't parse.
  paramsSerializer: { indexes: null },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        const { data } = await axios.post(`${getBaseURL()}/token/refresh/`, { refresh: refreshToken });
        await AsyncStorage.setItem('access_token', data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (err) {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
