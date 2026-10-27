import { PHASE } from '@studnia/shared/protocol';
import { useGame } from './net/GameProvider.jsx';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import Game from './screens/Game.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import Toast from './components/Toast.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import IdentityBar from './components/IdentityBar.jsx';

export default function App() {
  const { room, status } = useGame();

  let screen = <Home />;
  if (room?.phase === PHASE.LOBBY) screen = <Lobby />;
  else if (room) screen = <Game />;

  return (
    <>
      <IdentityBar />
      <ThemeToggle />
      {status !== 'open' && <ConnectionBanner status={status} />}
      {screen}
      <Toast />
    </>
  );
}
