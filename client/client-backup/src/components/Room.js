import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { socket } from '../socket';
import './Room.css';

export default function Room() {
  const { roomId } = useParams();
  const { state } = useLocation();
  const username = state?.username || 'Anonymous';

  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerRef = useRef();

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    const startMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.current.srcObject = stream;
      socket.emit('join-room', { roomId, username });
    };
    startMedia();
  }, [username, roomId]);

  useEffect(() => {
    socket.on('user-joined', async ({ id }) => {
      peerRef.current = new RTCPeerConnection();
      localVideo.current.srcObject.getTracks().forEach(track => {
        peerRef.current.addTrack(track, localVideo.current.srcObject);
      });

      peerRef.current.onicecandidate = e => {
        if (e.candidate) {
          socket.emit('signal', { to: id, data: { candidate: e.candidate } });
        }
      };

      peerRef.current.ontrack = e => {
        remoteVideo.current.srcObject = e.streams[0];
      };

      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      socket.emit('signal', { to: id, data: { sdp: offer } });
    });

    socket.on('signal', async ({ from, data }) => {
      if (!peerRef.current) {
        peerRef.current = new RTCPeerConnection();
        localVideo.current.srcObject.getTracks().forEach(track => {
          peerRef.current.addTrack(track, localVideo.current.srcObject);
        });

        peerRef.current.onicecandidate = e => {
          if (e.candidate) {
            socket.emit('signal', { to: from, data: { candidate: e.candidate } });
          }
        };

        peerRef.current.ontrack = e => {
          remoteVideo.current.srcObject = e.streams[0];
        };
      }

      if (data.sdp) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);
          socket.emit('signal', { to: from, data: { sdp: answer } });
        }
      }

      if (data.candidate) {
        const tryAddCandidate = async () => {
          while (!peerRef.current.remoteDescription) {
            await new Promise(r => setTimeout(r, 100));
          }
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        };
        tryAddCandidate();
      }
    });

    socket.on('chat-message', ({ username, message }) => {
      setChat(prev => [...prev, { username, message }]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('signal');
      socket.off('chat-message');
    };
  }, [roomId, username]);

const sendMessage = () => {
  if (message.trim() === '') return;
  socket.emit('chat-message', { roomId, username, message });
  setChat(prev => [...prev, { username, message }]);
  setMessage('');
};
  const toggleMute = () => {
    const stream = localVideo.current.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    const stream = localVideo.current.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = isCameraOff;
      });
      setIsCameraOff(!isCameraOff);
    }
  };

  const leaveRoom = () => {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    const stream = localVideo.current.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    socket.emit('leave-room', { roomId, username });
    window.location.href = '/';
  };

  return (
    <div className="room-container">
      <div className="controls-bar">
        <div className='footer'>
        <button type="button" onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
        <button type="button" onClick={toggleCamera}>{isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}</button>
        <button type="button" onClick={leaveRoom}>Leave Room</button>
      </div>
      </div>

      <h2 className="room-title">Room: {roomId}</h2>

      <div className="both">
        <div className="video-container">
          <video ref={localVideo} autoPlay muted playsInline />
          <video ref={remoteVideo} autoPlay playsInline />
        </div>

        <div className="chat-container">
          <h3 style={{ textAlign: 'center' }}>Chat</h3>
          <div className="chat-messages">
            {chat.map((msg, i) => (
              <p key={i}><b>{msg.username === username ? 'Me' : msg.username}:</b> {msg.message}</p>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
            />
            <button type="button" onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
