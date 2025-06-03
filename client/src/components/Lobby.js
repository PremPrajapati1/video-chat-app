import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import './Lobby.css';

const quotes = [
  "Connect, Learn, Collaborate",
  "Building Bridges Through Virtual Classrooms",
  "Your virtual meeting place",
  "Step Into Your Interactive Classroom",
  "Learn anywhere, anytime",
  "Unlock Your Classroom Without Walls"
];

export default function Lobby() {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [typing, setTyping] = useState(true);

  const navigate = useNavigate();

  // Typing effect logic
  useEffect(() => {
    let timeout;
    if (typing) {
      // Add one letter at a time
      if (displayedText.length < quotes[currentQuoteIndex].length) {
        timeout = setTimeout(() => {
          setDisplayedText(quotes[currentQuoteIndex].slice(0, displayedText.length + 1));
        }, 100); // typing speed in ms
      } else {
        // Finished typing, pause then start deleting
        timeout = setTimeout(() => setTyping(false), 1500);
      }
    } else {
      // Deleting effect
      if (displayedText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayedText(displayedText.slice(0, displayedText.length - 1));
        }, 50); // deleting speed faster than typing
      } else {
        // Finished deleting, switch to next quote and start typing
        setCurrentQuoteIndex((currentQuoteIndex + 1) % quotes.length);
        setTyping(true);
      }
    }
    return () => clearTimeout(timeout);
  }, [displayedText, typing, currentQuoteIndex]);

  const handleHost = () => {
    const newRoomId = uuidv4();
    if (username) navigate(`/room/${newRoomId}`, { state: { username } });
  };

  const handleJoin = () => {
    if (roomId && username) navigate(`/room/${roomId}`, { state: { username } });
  };

  return (
    <div className="lobby-container">
      <h2 className="animated-quote">{displayedText}<span className="cursor">|</span></h2>

      <div className="form-container">
        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="lobby-input"
            placeholder="Enter your username"
            onChange={e => setUsername(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="roomId">Room ID</label>
          <input
            id="roomId"
            className="lobby-input"
            placeholder="Enter room ID"
            onChange={e => setRoomId(e.target.value)}
          />
        </div>

        <div className="button-group">
          <button className="lobby-button" onClick={handleHost}>Host Room</button>
          <button className="lobby-button" onClick={handleJoin}>Join Room</button>
        </div>
      </div>
    </div>
  );
}
