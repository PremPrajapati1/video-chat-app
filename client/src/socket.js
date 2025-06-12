import { io } from 'socket.io-client';
export const socket = io('https://video-chat-server-j2gu.onrender.com/', {
  transports: ['websocket']
});
