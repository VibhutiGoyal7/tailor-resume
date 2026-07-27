// Runtime configuration. The API base URL comes from an Expo public env var
// (`EXPO_PUBLIC_API_URL`, inlined at build per Expo's convention) so it can point
// at localhost in dev and the deployed API in prod without code changes. Falls
// back to the local web dev server. See `.env.example` (App section).
//
// Note for device testing: `localhost` resolves to the phone, not your Mac — set
// EXPO_PUBLIC_API_URL to your machine's LAN IP (e.g. http://192.168.1.20:3000/api)
// when running on a physical device.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
