// Tests for src/api/client.js getBaseURL — verifies that the platform/env
// fallbacks resolve to the right backend URL. The failure mode this guards
// against is silently shipping pointing at localhost on Android emulator
// (which can't reach the host's localhost — it needs 10.0.2.2).

// The module imports react-native and async-storage; mock them so the
// test can run under plain node without the Expo runtime.
// jest.mock factories can't reference out-of-scope vars except those
// prefixed with `mock`, so we expose a mutable holder.
const mockPlatform = { OS: 'web' };
// Default: no Metro bundle URL (simulates production / web). Tests that
// care about LAN auto-detect set this explicitly.
const mockNativeModules = { SourceCode: { scriptURL: null } };

jest.mock(
  'react-native',
  () => ({
    get Platform() {
      return mockPlatform;
    },
    get NativeModules() {
      return mockNativeModules;
    },
  }),
  { virtual: true }
);

jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    multiRemove: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  'axios',
  () => ({
    create: () => ({
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
    post: jest.fn(),
  }),
  { virtual: true }
);

describe('getBaseURL', () => {
  let getBaseURL;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    // Wipe the env vars and bundle URL so each case starts clean.
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL_WEB;
    delete process.env.EXPO_PUBLIC_API_URL_ANDROID;
    delete process.env.EXPO_PUBLIC_API_URL_IOS;
    mockNativeModules.SourceCode.scriptURL = null;
    ({ getBaseURL } = require('../src/api/client'));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Android with no bundle URL falls back to 10.0.2.2 (emulator alias for host)', () => {
    mockPlatform.OS = 'android';
    expect(getBaseURL()).toBe('http://10.0.2.2:8000/api');
  });

  test('Web defaults to localhost', () => {
    mockPlatform.OS = 'web';
    expect(getBaseURL()).toBe('http://localhost:8000/api');
  });

  test('iOS with no bundle URL defaults to localhost', () => {
    mockPlatform.OS = 'ios';
    expect(getBaseURL()).toBe('http://localhost:8000/api');
  });

  test('iOS auto-derives backend host from Metro bundle URL (LAN testing)', () => {
    mockPlatform.OS = 'ios';
    mockNativeModules.SourceCode.scriptURL =
      'http://172.20.10.10:8081/index.bundle?platform=ios&dev=true';
    expect(getBaseURL()).toBe('http://172.20.10.10:8000/api');
  });

  test('Android auto-derives backend host from Metro bundle URL', () => {
    mockPlatform.OS = 'android';
    mockNativeModules.SourceCode.scriptURL =
      'http://192.168.1.42:8081/index.bundle?platform=android';
    expect(getBaseURL()).toBe('http://192.168.1.42:8000/api');
  });

  test('Platform-specific env var beats the universal one', () => {
    mockPlatform.OS = 'android';
    process.env.EXPO_PUBLIC_API_URL = 'https://api.universal.example';
    process.env.EXPO_PUBLIC_API_URL_ANDROID = 'https://api.android.example';
    expect(getBaseURL()).toBe('https://api.android.example');
  });

  test('Universal env var is used when no platform-specific override exists', () => {
    mockPlatform.OS = 'web';
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    expect(getBaseURL()).toBe('https://api.example.com');
  });
});
