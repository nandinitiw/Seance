// Set EXPO_PUBLIC_API_URL in mobile/.env for dev, e.g.:
//   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
// On-LAN: use your laptop's actual IP (ifconfig | grep "inet ").
// Off-network: use an ngrok URL (ngrok http 3000).
// Mic permission is an OS prompt in native apps — HTTPS is NOT required for LAN testing.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
