import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { useLobby } from '../store/lobby.js';

export function LobbyPage(): JSX.Element {
  const { token, username, logout } = useAuth();
  const { rooms, refresh } = useLobby();

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  if (!token) {
    return (
      <div>
        <h1>sign in</h1>
        <p className="lede">Auth wiring is scaffolded but not yet hooked into a form. <span className="todo">todo</span></p>
        <pre className="panel" style={{ overflowX: 'auto', fontSize: 12 }}>
          {`useAuth.getState().register({ username: 'alice', password: 'hunter2' })`}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>lobby</h1>
        <span className="muted">
          {username} · <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>sign out</a>
        </span>
      </div>

      {rooms.length === 0 ? (
        <p className="muted">No open rooms. <span className="todo">todo</span> create-room form.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {rooms.map((r) => (
            <li key={r.roomId} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {r.scenarioId} · {r.playerCount}/{r.maxPlayers} · {r.status}
                </div>
              </div>
              <Link to={`/games/${r.roomId}`} className="btn btn--ghost">join</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
