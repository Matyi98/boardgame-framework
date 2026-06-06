import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { useLobby } from '../store/lobby.js';
import type { RoomDetail } from '@bgf/shared-types';

// ── Auth panel ────────────────────────────────────────────────────────────────

function AuthPanel(): JSX.Element {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login({ username, password });
      } else {
        await register({ username, password });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h1 style={{ marginBottom: 8 }}>sign in</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Create an account or sign in to join or host a game.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['login', 'register'] as const).map((t) => (
          <button
            key={t}
            className={`btn ${tab === t ? '' : 'btn--ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => { setTab(t); setError(''); }}
          >
            {t === 'login' ? 'sign in' : 'register'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <input
          style={{ padding: '8px 12px', fontSize: 13, background: 'var(--bg-soft)', color: 'var(--fg)', border: '1px solid var(--rule)', borderRadius: 4 }}
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />
        <input
          type="password"
          style={{ padding: '8px 12px', fontSize: 13, background: 'var(--bg-soft)', color: 'var(--fg)', border: '1px solid var(--rule)', borderRadius: 4 }}
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: '#e74c3c', fontSize: 12, margin: 0 }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'please wait…' : tab === 'login' ? 'sign in →' : 'create account →'}
        </button>
      </form>
    </div>
  );
}

// ── Create-room form ──────────────────────────────────────────────────────────

function CreateRoomForm({ onCreated }: { onCreated: (room: RoomDetail) => void }): JSX.Element {
  const { create } = useLobby();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const room = await create({ name: name || 'New Room', scenarioId: 'demo-v1', maxPlayers });
      onCreated(room);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>room name</div>
        <input
          style={{ padding: '7px 10px', fontSize: 13, background: 'var(--bg-soft)', color: 'var(--fg)', border: '1px solid var(--rule)', borderRadius: 4, width: 180 }}
          placeholder="My Room"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>players</div>
        <select
          style={{ padding: '7px 10px', fontSize: 13, background: 'var(--bg-soft)', color: 'var(--fg)', border: '1px solid var(--rule)', borderRadius: 4 }}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? '…' : 'create room'}
      </button>
      {error && <span style={{ color: '#e74c3c', fontSize: 12 }}>{error}</span>}
    </form>
  );
}

// ── Room detail panel ─────────────────────────────────────────────────────────

function RoomDetailPanel({
  room,
  onRefresh,
}: {
  room: RoomDetail;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const { userId } = useAuth();
  const { setReady, start, closeRoom, leaveRoom } = useLobby();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const me = room.players.find((p) => p.userId === userId);
  const isHost = room.hostId === userId;
  const allReady = room.players.length > 1 && room.players.every((p) => p.ready);

  // Auto-poll every 2.5s while waiting; auto-redirect when game starts
  useEffect(() => {
    if (room.status === 'starting' && room.gameId) {
      navigate(`/games/${room.gameId}`);
      return;
    }
    pollRef.current = setInterval(() => { void onRefresh(); }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [room.status, room.gameId, navigate, onRefresh]);

  const startBlockReason = !isHost
    ? null
    : room.players.length < 2
      ? 'Need at least 2 players — share the room ID below'
      : !allReady
        ? 'Waiting for all players to ready up'
        : null;

  async function toggleReady(): Promise<void> {
    if (!me) return;
    setLoading(true);
    setError('');
    try {
      await setReady(room.roomId, !me.ready);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const updated = await start(room.roomId);
      if (updated.gameId) navigate(`/games/${updated.gameId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start game');
    } finally {
      setLoading(false);
    }
  }

  async function handleLeave(): Promise<void> {
    setLoading(true);
    try {
      await leaveRoom(room.roomId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not leave room');
      setLoading(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (!confirm('Close this room? All players will be kicked.')) return;
    setLoading(true);
    try {
      await closeRoom(room.roomId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not close room');
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{room.name}</h3>
        <span className="muted" style={{ fontSize: 11 }}>
          {room.scenarioId} · {room.playerCount}/{room.maxPlayers}
          <span style={{ marginLeft: 6, color: '#2ecc71' }} title="Live — refreshing every 2.5s">●</span>
        </span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 6 }}>
        {room.players.map((p) => (
          <li key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span>
              {p.username}
              {p.userId === room.hostId && <span className="muted"> (host)</span>}
            </span>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.ready ? '#2ecc71' : 'var(--fg-dim)' }}>
              {p.ready ? '✓ ready' : 'not ready'}
            </span>
          </li>
        ))}
      </ul>

      {error && <p style={{ color: '#e74c3c', fontSize: 12, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {me && (
          <button className={`btn ${me.ready ? 'btn--ghost' : ''}`} onClick={toggleReady} disabled={loading}>
            {me.ready ? 'unready' : 'ready up'}
          </button>
        )}
        {isHost && (
          <button className="btn" onClick={handleStart} disabled={loading || !!startBlockReason}>
            {loading ? '…' : 'start game →'}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onRefresh} style={{ fontSize: 12 }} disabled={loading}>
          refresh
        </button>
        {isHost && (
          <button className="btn btn--ghost" onClick={handleClose} disabled={loading} style={{ fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}>
            close room
          </button>
        )}
        {!isHost && me && (
          <button className="btn btn--ghost" onClick={handleLeave} disabled={loading} style={{ fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}>
            leave room
          </button>
        )}
      </div>

      {startBlockReason && (
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>{startBlockReason}</p>
      )}

      {room.players.length < 2 && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Room ID: <span style={{ color: 'var(--accent)', userSelect: 'all' }}>{room.roomId}</span>
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LobbyPage(): JSX.Element {
  const { token, username, logout } = useAuth();
  const { rooms, current, refresh, refreshCurrent, join, clearCurrent } = useLobby();
  const [showCreate, setShowCreate] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  if (!token) return <AuthPanel />;

  async function handleJoin(roomId: string): Promise<void> {
    setJoinError('');
    setJoiningId(roomId);
    try {
      await join(roomId);
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  }

  async function handleRefreshCurrent(): Promise<void> {
    try {
      await refreshCurrent();
    } catch { /* ignore — refreshCurrent handles 404 itself */ }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>lobby</h1>
        <span className="muted" style={{ fontSize: 13 }}>
          {username} ·{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>sign out</a>
        </span>
      </div>

      {/* Room you're currently in */}
      {current && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>your room</span>
            <button className="btn btn--ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={clearCurrent}>
              leave view
            </button>
          </div>
          <RoomDetailPanel room={current} onRefresh={handleRefreshCurrent} />
        </div>
      )}

      {/* Create room */}
      <div style={{ marginBottom: 28 }}>
        {!showCreate ? (
          <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setShowCreate(true)}>
            + new room
          </button>
        ) : (
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>Create Room</span>
              <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <CreateRoomForm onCreated={() => { setShowCreate(false); void refresh(); }} />
          </div>
        )}
      </div>

      {/* Room list */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>open rooms</span>
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => void refresh()}>
            refresh
          </button>
        </div>

        {joinError && <p style={{ color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>{joinError}</p>}

        {rooms.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No open rooms. Create one above!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
            {rooms.map((r) => (
              <li key={r.roomId} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {r.scenarioId} · {r.playerCount}/{r.maxPlayers} · {r.status}
                  </div>
                </div>
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 12 }}
                  disabled={joiningId === r.roomId || r.status !== 'open' || r.playerCount >= r.maxPlayers}
                  onClick={() => void handleJoin(r.roomId)}
                >
                  {joiningId === r.roomId ? '…' : r.status !== 'open' ? r.status : r.playerCount >= r.maxPlayers ? 'full' : 'join'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
