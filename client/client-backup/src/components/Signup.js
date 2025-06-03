// src/pages/Signup.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSignup = (e) => {
    e.preventDefault();

    // Dummy signup logic (replace with real backend logic later)
    if (email && password) {
      alert('Account created!');
      navigate('/lobby'); // Redirect to lobby after signup
    } else {
      alert('Please fill in all fields.');
    }
  };

  return (
    <div className="auth-container">
        <div className='auth-box'>
      
      <form onSubmit={handleSignup}>
        <h2>Sign Up</h2>
        <input
          type="email"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Sign Up</button>
        <p onClick={() => navigate('/')}>← Back to Home</p>
      </form>
      </div>
    </div>
  );
}
