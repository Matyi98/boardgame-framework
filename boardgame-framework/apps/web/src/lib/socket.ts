import { io, type Socket } from 'socket.io-client';

const WS_BASE = import.meta.env.VITE_WS_BASE ?? '';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(WS_BASE, {
    path: '/ws',
    auth: { token },
    transports: ['websocket'],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
