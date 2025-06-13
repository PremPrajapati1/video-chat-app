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
  const localStreamRef = useRef();

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Camera switching
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

  // Sound effects
  const joinSound = useRef(new Audio('/sounds/join.mp3'));
  const disconnectSound = useRef(new Audio('/sounds/disconnect.mp3'));

  // Get devices and start video
  useEffect(() => {
    const getDevicesAndStart = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        if (videoInputs.length === 0) {
          alert('No video devices found.');
          return;
        }

        setVideoDevices(videoInputs);
        setCurrentDeviceIndex(0);
        await startStream(videoInputs[0].deviceId);

        socket.emit('join-room', { roomId, username });
      } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Please allow camera and microphone access.');
      }
    };

    getDevicesAndStart();
  }, [username, roomId]);

  const startStream = async (deviceId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: true
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      localStreamRef.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }
    } catch (error) {
      console.error('startStream error:', error);
    }
  };

  const switchCamera = async () => {
    if (videoDevices.length < 2) return;
    const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const nextDeviceId = videoDevices[nextIndex].deviceId;
    setCurrentDeviceIndex(nextIndex);
    await startStream(nextDeviceId);
  };

  useEffect(() => {
    const createPeer = (id, initiator) => {
      const peer = new RTCPeerConnection();

      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current);
      });

      peer.onicecandidate = e => {
        if (e.candidate) {
          socket.emit('signal', { to: id, data: { candidate: e.candidate } });
        }
      };

      peer.ontrack = e => {
        remoteVideo.current.srcObject = e.streams[0];
      };

      if (initiator) {
        peer.createOffer().then(offer => {
          peer.setLocalDescription(offer);
          socket.emit('signal', { to: id, data: { sdp: offer } });
        });
      }

      return peer;
    };

    socket.on('user-joined', ({ id }) => {
      peerRef.current = createPeer(id, true);
      joinSound.current.currentTime = 0;
      joinSound.current.play();
    });

    socket.on('user-disconnected', ({ id }) => {
      disconnectSound.current.currentTime = 0;
      disconnectSound.current.play();
    });

    socket.on('signal', async ({ from, data }) => {
      if (!peerRef.current) {
        peerRef.current = createPeer(from, false);
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
        if (peerRef.current.remoteDescription) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          const waitForRemote = async () => {
            while (!peerRef.current.remoteDescription) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          };
          waitForRemote();
        }
      }
    });

    socket.on('chat-message', ({ username, message }) => {
      setChat(prev => [...prev, { username, message }]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-disconnected');
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
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
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

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    socket.emit('leave-room', { roomId, username });
    window.location.href = '/';
  };

  return (
    <div className="room-container">
      <h2 className="room-title">Room: {roomId}</h2>

      <div className="content-box">
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
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>

      <div className="controls-bar">
        <div className='footer'>
          <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCamera}>{isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}</button>
          <button onClick={switchCamera}>Switch Camera</button>
          <button onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}
