import { Link, Route, Routes, Outlet } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { GamePage } from './pages/GamePage.js';
import { KingdomsPage } from './pages/KingdomsPage.js';

function AppShell(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">bgf</span>
        </Link>
        <nav className="app-nav">
          <Link to="/lobby">Lobby</Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>board game framework · skeleton build</span>
      </footer>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      {/* Full-viewport game page — no shell padding */}
      <Route path="/kingdoms/:gameId" element={<KingdomsPage />} />
      {/* Shell-wrapped pages */}
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/games/:gameId" element={<GamePage />} />
      </Route>
    </Routes>
  );
}
