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
  const peersRef = useRef({});
  const localStreamRef = useRef();

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

  const joinSound = useRef(new Audio('/sounds/join.mp3'));
  const disconnectSound = useRef(new Audio('/sounds/disconnect.mp3'));

  useEffect(() => {
    const getDevicesAndStart = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if (!videoInputs.length) return alert('No camera found.');
      setVideoDevices(videoInputs);
      setCurrentDeviceIndex(0);
      await startStream(videoInputs[0].deviceId);
      socket.emit('join-room', { roomId, username });
    };
    getDevicesAndStart();
  }, [roomId, username]);

  const startStream = async (deviceId) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: true
    });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = stream;
    localVideo.current.srcObject = stream;
    Object.values(peersRef.current).forEach(peer => {
      const s = stream;
      peer.getSenders().forEach(sender => {
        if (sender.track.kind === 'video') sender.replaceTrack(s.getVideoTracks()[0]);
        if (sender.track.kind === 'audio') sender.replaceTrack(s.getAudioTracks()[0]);
      });
    });
  };

  const switchCamera = async () => {
    if (videoDevices.length < 2) return;
    const next = (currentDeviceIndex + 1) % videoDevices.length;
    setCurrentDeviceIndex(next);
    await startStream(videoDevices[next].deviceId);
  };

  const createPeer = (id, initiator) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:YOUR_TURN_SERVER:3478',
          username: 'TURN_USER',
          credential: 'TURN_PASSWORD'
        }
      ]
    });

    localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));

    const remoteStream = new MediaStream();
    remoteVideo.current.srcObject = remoteStream;
    peer.ontrack = e => e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

    peer.onicecandidate = e => {
      if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } });
    };

    if (initiator) {
      peer.createOffer().then(off => {
        peer.setLocalDescription(off);
        socket.emit('signal', { to: id, data: { sdp: off } });
      });
    }
    return peer;
  };

  useEffect(() => {
    socket.on('user-joined', ({ id }) => {
      if (!peersRef.current[id]) {
        peersRef.current[id] = createPeer(id, true);
        joinSound.current.play();
      }
    });

    socket.on('user-disconnected', ({ id }) => {
      peersRef.current[id]?.close();
      delete peersRef.current[id];
      disconnectSound.current.play();
    });

    socket.on('signal', async ({ from, data }) => {
      if (!peersRef.current[from]) peersRef.current[from] = createPeer(from, false);
      const peer = peersRef.current[from];
      if (data.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const ans = await peer.createAnswer();
          await peer.setLocalDescription(ans);
          socket.emit('signal', { to: from, data: { sdp: ans } });
        }
      } else if (data.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('chat-message', ({ username, message }) =>
      setChat(prev => [...prev, { username, message }])
    );

    return () => {
      socket.off('user-joined user-disconnected signal chat-message'.split(' '));
    };
  }, [roomId, username]);

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('chat-message', { roomId, username, message });
    setChat(prev => [...prev, { username, message }]);
    setMessage('');
  };

  const toggleMute = () => {
    const s = localStreamRef.current;
    s && s.getAudioTracks().forEach(t => (t.enabled = isMuted));
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    const s = localStreamRef.current;
    s && s.getVideoTracks().forEach(t => (t.enabled = isCameraOff));
    setIsCameraOff(!isCameraOff);
  };

  const leaveRoom = () => {
    Object.values(peersRef.current).forEach(p => p.close());
    peersRef.current = {};
    localStreamRef.current.getTracks().forEach(t => t.stop());
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
          <h3>Chat</h3>
          <div className="chat-messages">
            {chat.map((msg,i)=><p key={i}><b>{msg.username==='Anonymous'?'Me':msg.username}:</b> {msg.message}</p>)}
          </div>
          <div className="chat-input">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter') sendMessage(); }}
              placeholder="Type a message…"
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
      <div className="controls-bar">
        <div className="footer">
          <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCamera}>{isCameraOff ? 'Turn Cam On' : 'Turn Cam Off'}</button>
          <button onClick={switchCamera}>Switch Camera</button>
          <button onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}
