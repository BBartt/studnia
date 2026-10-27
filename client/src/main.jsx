import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './net/GameProvider.jsx';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);
