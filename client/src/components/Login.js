// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();

    // Dummy login logic (replace with real backend logic later)
    if (email && password) {
      alert('Login successful!');
      navigate('/lobby'); // Redirect to lobby after login
    } else {
      alert('Please fill in all fields.');
    }
  };

  return (
    <div className="auth-container">
        <div className='auth-box'>
      {/* <h2>Login</h2> */}
      <form onSubmit={handleLogin}>
        <h2>Login</h2>
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
        <button type="submit">Login</button>
        <p onClick={() => navigate('/')}>← Back to Home</p>
      </form>
     
      {/* <p onClick={() => navigate('/')}>← Back to Home</p> */}
       </div>
    </div>
  );
}
