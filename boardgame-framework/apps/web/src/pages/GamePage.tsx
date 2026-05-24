import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGame } from '../store/game.js';
import { Board } from '../components/Board.js';
import { PlayerList } from '../components/PlayerList.js';
import { DiceTray } from '../components/DiceTray.js';
import { CardHand } from '../components/CardHand.js';

export function GamePage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  const { connect, disconnect, events } = useGame();

  useEffect(() => {
    if (!gameId) return;
    connect(gameId);
    return () => disconnect();
  }, [gameId, connect, disconnect]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
      <section>
        <h2>board</h2>
        <Board />
        <DiceTray />
        <CardHand />
      </section>
      <aside>
        <h3>players</h3>
        <PlayerList />
        <h3 style={{ marginTop: 24 }}>event log</h3>
        <div className="panel" style={{ maxHeight: 320, overflow: 'auto', fontSize: 12 }}>
          {events.length === 0 ? (
            <span className="muted">waiting for events…</span>
          ) : (
            events.map((e) => (
              <div key={`${e.seq}-${e.type}`} style={{ marginBottom: 4 }}>
                <span className="muted">[{e.seq}]</span> {e.type}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
