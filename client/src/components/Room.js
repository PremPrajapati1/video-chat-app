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
  const [remoteStreams, setRemoteStreams] = useState({});

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const [videoDevices, setVideoDevices] = useState([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

  const joinSound = useRef(new Audio('/sounds/join.mp3'));
  const disconnectSound = useRef(new Audio('/sounds/disconnect.mp3'));

  useEffect(() => {
    const init = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      if (cams.length === 0) return alert('No camera found');
      setVideoDevices(cams);
      await switchStream(cams[0].deviceId);
      socket.emit('join-room', { roomId, username });
    };
    init();
  }, [roomId, username]);

  const switchStream = async deviceId => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: true,
    });
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    localStreamRef.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;

    Object.values(peersRef.current).forEach(peer => {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      peer.getSenders().forEach(sender => {
        if (sender.track.kind === 'video') sender.replaceTrack(videoTrack);
        if (sender.track.kind === 'audio') sender.replaceTrack(audioTrack);
      });
    });
  };

  const switchCamera = async () => {
    if (videoDevices.length < 2) return;
    const next = (currentDeviceIndex + 1) % videoDevices.length;
    setCurrentDeviceIndex(next);
    await switchStream(videoDevices[next].deviceId);
  };

  const createPeer = (id, initiator) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
    });

    localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));
    const remote = new MediaStream();
    peer.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remote.addTrack(t));
      setRemoteStreams(prev => ({ ...prev, [id]: remote }));
    };

    peer.onicecandidate = e => {
      if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } });
    };

    if (initiator) {
      peer.createOffer().then(o => {
        peer.setLocalDescription(o);
        socket.emit('signal', { to: id, data: { sdp: o } });
      });
    }

    return peer;
  };

  useEffect(() => {
    socket.on('user-joined', ({ id }) => {
      if (id === socket.id || peersRef.current[id]) return;
      peersRef.current[id] = createPeer(id, true);
      joinSound.current.play();
    });

    socket.on('signal', async ({ from, data }) => {
      if (!peersRef.current[from]) peersRef.current[from] = createPeer(from, false);
      const peer = peersRef.current[from];

      if (data.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await peer.createAnswer();
          peer.setLocalDescription(answer);
          socket.emit('signal', { to: from, data: { sdp: answer } });
        }
      }

      if (data.candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Failed to add ICE candidate:', err);
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

    return () => socket.off();
  }, [roomId]);

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('chat-message', { roomId, username, message });
    setChat(prev => [...prev, { username, message }]);
    setMessage('');
  };

  const leaveRoom = () => {
    Object.values(peersRef.current).forEach(p => p.close());
    peersRef.current = {};
    setRemoteStreams({});
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
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
            <video key={id} autoPlay playsInline
              ref={el => { if (el) el.srcObject = stream; }} />
          ))}
        </div>

        <div className="chat-container">
          <h3 style={{ textAlign: 'center' }}>Chat</h3>
          <div className="chat-messages">
            {chat.map((msg, i) => (
              <p key={i}>
                <b>{msg.username === username ? 'Me' : msg.username}:</b> {msg.message}
              </p>
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
        <div className="footer">
          <button onClick={() => {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = isMuted);
            setIsMuted(!isMuted);
          }}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={() => {
            localStreamRef.current.getVideoTracks().forEach(t => t.enabled = isCameraOff);
            setIsCameraOff(!isCameraOff);
          }}>
            {isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          </button>
          <button onClick={switchCamera}>Switch Camera</button>
          <button onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}
