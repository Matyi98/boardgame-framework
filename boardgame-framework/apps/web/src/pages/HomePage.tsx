import { Link } from 'react-router-dom';

export function HomePage(): JSX.Element {
  return (
    <div>
      <h1>
        a board game<br />
        framework.
      </h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Hex maps, players, pieces, resources, dice, cards, rounds — wired together by a
        message bus and exposed to the browser through a websocket gateway. Pick a
        scenario, host a room, play with friends. The pieces are yours to compose.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
        <Tile k="01" title="modular core">
          Map, pieces, players, resources, cards, dice, rounds — each in its own folder
          under <span className="kbd">@bgf/game-core</span>.
        </Tile>
        <Tile k="02" title="bus-driven">
          RabbitMQ topic exchanges fan game events out to every connected client.
        </Tile>
        <Tile k="03" title="horizontally scaled">
          Stateless services behind Traefik. Add replicas; sticky cookies handle
          WebSocket affinity.
        </Tile>
        <Tile k="04" title="bring your own rules">
          Define a <span className="kbd">Scenario</span> — registries of validators,
          executors, rules, victory conditions. The engine runs it.
        </Tile>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Link to="/lobby" className="btn">enter lobby →</Link>
        <a className="btn btn--ghost" href="https://github.com/" target="_blank" rel="noreferrer">
          read the docs
        </a>
      </div>
    </div>
  );
}

function Tile({ k, title, children }: { k: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="panel">
      <div className="muted" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
      <h3 style={{ marginTop: 8 }}>{title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{children}</p>
    </div>
  );
}
