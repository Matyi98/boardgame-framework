import { io, type Socket } from 'socket.io-client';

const WS_BASE = import.meta.env.VITE_WS_BASE ?? '';

let socket: Socket | null = null;
let activeToken: string | null = null;

export function getSocket(token: string): Socket {
  // Reuse only if connected and the token hasn't changed
  if (socket && socket.connected && activeToken === token) return socket;

  // Token changed or socket dropped — tear down the old one first
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  activeToken = token;
  socket = io(WS_BASE, {
    path: '/ws',
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  activeToken = null;
}
