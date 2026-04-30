import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// Resolve the backend base URL.
//
// Optional overrides (read from `.env` or shell at bundle time):
//   EXPO_PUBLIC_API_URL              — universal override
//   EXPO_PUBLIC_API_URL_WEB          — web-only override
//   EXPO_PUBLIC_API_URL_ANDROID      — Android-only override
//   EXPO_PUBLIC_API_URL_IOS          — iOS-only override
//
// When no override is set, native (Expo Go on a real device) auto-detects
// the host from Metro's bundle URL — whatever IP the phone fetched the
// JS bundle from is also where the backend lives, just on port 8000. This
// means LAN testing works on any network with no .env file.
const DEFAULT_API_URL = 'http://localhost:8000/api';

// On native, NativeModules.SourceCode.scriptURL is the URL the JS bundle
// was loaded from, e.g. 'http://172.20.10.10:8081/index.bundle?…'. We
// extract the host so the API client can target the same machine on :8000.
const getBundleHost = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
  return match ? match[1] : null;
};

export const getBaseURL = () => {
  const universal = process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_API_URL_WEB || universal || DEFAULT_API_URL;
  }
  if (Platform.OS === 'android') {
    const override = process.env.EXPO_PUBLIC_API_URL_ANDROID || universal;
    if (override) return override;
    const host = getBundleHost();
    // 10.0.2.2 is the Android emulator's alias for the host's localhost;
    // it only matters when the bundle host can't be detected (e.g. some
    // production-mode edge cases).
    return host ? `http://${host}:8000/api` : 'http://10.0.2.2:8000/api';
  }
  // iOS (and any other native platform).
  const override = process.env.EXPO_PUBLIC_API_URL_IOS || universal;
  if (override) return override;
  const host = getBundleHost();
  return host ? `http://${host}:8000/api` : DEFAULT_API_URL;
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
