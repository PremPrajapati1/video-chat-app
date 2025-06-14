import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { socket } from '../socket';
import './Room.css';

export default function Room() {
  const { roomId } = useParams();
  const { state } = useLocation();
  const username = state?.username || 'Anonymous';

  const localVideo = useRef();
  const peersRef = useRef({});
  const localStreamRef = useRef();

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState({});

  const joinSound = useRef(new Audio('/sounds/join.mp3'));
  const disconnectSound = useRef(new Audio('/sounds/disconnect.mp3'));

  // Initialize media and join room
  useEffect(() => {
    const init = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      if (cams.length === 0) return;

      setVideoDevices(cams);
      setCurrentDeviceIndex(0);
      await startStream(cams[0].deviceId);

      socket.emit('join-room', { roomId, username });
    };
    init();
  }, [roomId, username]);

  // Start or update local stream
  const startStream = async deviceId => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: true
    });

    // Replace old tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    localStreamRef.current = stream;
    localVideo.current.srcObject = stream;

    // Update senders in all peers
    Object.values(peersRef.current).forEach(peer => {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      peer.getSenders().forEach(sender => {
        if (sender.track.kind === 'video') sender.replaceTrack(videoTrack);
        if (sender.track.kind === 'audio') sender.replaceTrack(audioTrack);
      });
    });
  };

  // Camera switch
  const switchCamera = async () => {
    if (videoDevices.length < 2) return;
    const next = (currentDeviceIndex + 1) % videoDevices.length;
    setCurrentDeviceIndex(next);
    await startStream(videoDevices[next].deviceId);
  };

  // Create RTCPeerConnection
  const createPeer = (id, initiator) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });

    // Add local tracks
    localStreamRef.current.getTracks().forEach(track =>
      peer.addTrack(track, localStreamRef.current)
    );

    // Create separate MediaStream to collect remote tracks
    const remoteStream = new MediaStream();
    peer.ontrack = e => {
      remoteStream.addTrack(e.track);
      setRemoteStreams(prev => ({ ...prev, [id]: remoteStream }));
    };

    peer.onicecandidate = e => {
      if (e.candidate) {
        socket.emit('signal', { to: id, data: { candidate: e.candidate } });
      }
    };

    if (initiator) {
      peer.createOffer().then(offer => {
        peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });
      });
    }

    return peer;
  };

  // Socket events
  useEffect(() => {
    socket.on('user-joined', ({ id }) => {
      if (id === socket.id || peersRef.current[id]) return;
      peersRef.current[id] = createPeer(id, true);
      joinSound.current.play();
    });

    socket.on('signal', async ({ from, data }) => {
      if (!peersRef.current[from]) {
        peersRef.current[from] = createPeer(from, false);
      }
      const peer = peersRef.current[from];

      if (data.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const ans = await peer.createAnswer();
          peer.setLocalDescription(ans);
          socket.emit('signal', { to: from, data: { sdp: ans } });
        }
      }

      if (data.candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('ICE err:', err);
        }
      }
    });

    socket.on('user-disconnected', ({ id }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].close();
        delete peersRef.current[id];
        setRemoteStreams(prev => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }
      disconnectSound.current.play();
    });

    socket.on('chat-message', ({ username, message }) => {
      setChat(prev => [...prev, { username, message }]);
    });

    return () => {
      socket.off();
    };
  }, [roomId]);

  // Chat functions
  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('chat-message', { roomId, username, message });
    setChat(prev => [...prev, { username, message }]);
    setMessage('');
  };

  const toggleMute = () => {
    localStreamRef.current
      .getAudioTracks()
      .forEach(track => (track.enabled = isMuted));
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    localStreamRef.current
      .getVideoTracks()
      .forEach(track => (track.enabled = isCameraOff));
    setIsCameraOff(!isCameraOff);
  };

  const leaveRoom = () => {
    Object.values(peersRef.current).forEach(peer => peer.close());
    peersRef.current = {};
    localStreamRef.current.getTracks().forEach(t => t.stop());
    setRemoteStreams({});
    socket.emit('leave-room', { roomId, username });
    window.location.href = '/';
  };

  return (
    <div className="room-container">
      <h2 className="room-title">Room: {roomId}</h2>

      <div className="content-box">
        <div className="video-container">
          <video ref={localVideo} autoPlay muted playsInline />
          {Object.entries(remoteStreams).map(([id, stream]) => (
            <video
              key={id}
              autoPlay
              playsInline
              ref={videoEl => {
                if (videoEl) videoEl.srcObject = stream;
              }}
            />
          ))}
        </div>

        <div className="chat-container">
          <h3>Chat</h3>
          <div className="chat-messages">
            {chat.map((m, i) => (
              <p key={i}>
                <b>{m.username === username ? 'Me' : m.username}:</b> {m.message}
              </p>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' ? sendMessage() : null)}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>

      <div className="controls-bar">
        <div className="footer">
          <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCamera}>
            {isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          </button>
          <button onClick={switchCamera}>Switch Camera</button>
          <button onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}
