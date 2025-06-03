// src/pages/Welcome.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Welcome.css';


export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="welcome-container">
      <h1>Welcome to Virtual Classroom System</h1>
      <div className="welcome-buttons">
        <button className="login-button" onClick={() => navigate('/login')}>Login</button>
        <button className="signup-button" onClick={() => navigate('/signup')}>Sign Up</button>
        <p className="guest-link" onClick={() => navigate('/lobby')}>
          Continue as Guest →
        </p>
      </div>
    </div>
  );
}
