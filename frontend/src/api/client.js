import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const getBaseURL = () => {
  if (Platform.OS === 'web') return 'http://172.20.10.10:8000/api';
  if (Platform.OS === 'android') return 'http://172.20.10.10:8000/api';
  return 'http://172.20.10.10:8000/api';
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
