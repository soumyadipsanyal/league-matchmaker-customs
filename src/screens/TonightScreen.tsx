import { fmt, plural } from '../lib/format.ts';
import { ROLE_NAME } from '../lib/roles.ts';
import { otId, type Player, type PublicPlayer } from '../lib/roster.ts';
import { ChampIcon, RoleIcon } from '../components/Icons.tsx';

interface Props {
  players: PublicPlayer[];
  /** Unlocked roster, by name. */
  rated: Map<string, Player> | null;
  selected: ReadonlySet<string>;
  ots: ReadonlySet<string>;
  games: number;
  busy: boolean;
  error: string;
  onTogglePlayer: (name: string) => void;
  onToggleOt: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onGames: (g: number) => void;
  onMake: () => void;
}

export function TonightScreen(props: Props) {
  const { players, rated, selected, ots, games, busy } = props;
  const count = players.filter((p) => selected.has(p.name)).length;
  const short = Math.max(0, 10 - count);
  const allowedCount = players.reduce((n, p) => n + (selected.has(p.name) ? p.ot.filter((o) => ots.has(otId(p.name, o.key))).length : 0), 0);

  let msg = '';
  if (short > 0) msg = `Pick ${plural(short, 'more player')} to make teams.`;
  else if (count > 10) msg = `${plural(count - 10, 'player')} will sit out each game, in turn.`;
  else msg = 'Exactly ten: everyone plays every game.';

  return (
    <>
      <section className="band">
        <div className="wrap">
          <div className="sec-head">
            <h1>Who's playing tonight</h1>
            <p className="sub">Tap everyone who's in. To allow a one-trick tonight, tap the champion next to that player.</p>
          </div>
          <div className="toolbar">
            <p className="count" aria-live="polite">
              <b>{count}</b> of {players.length} selected
              {allowedCount > 0 && <span className="pill">{plural(allowedCount, 'one-trick')} allowed</span>}
            </p>
            <div className="act">
              <button type="button" className="btn ghost sm" onClick={props.onSelectAll} disabled={count === players.length}>
                Select all
              </button>
              <button type="button" className="btn ghost sm" onClick={props.onClear} disabled={count === 0}>
                Clear
              </button>
            </div>
          </div>
          <ul className="pgrid">
            {players.map((p) => {
              const on = selected.has(p.name);
              const r = rated?.get(p.name);
              const notSet = p.roles.length === 0;
              return (
                <li className="prow" key={p.name}>
                  <button
                    type="button"
                    className="ptog"
                    aria-pressed={on}
                    onClick={() => props.onTogglePlayer(p.name)}
                    title={notSet ? `${p.name}: roles not set` : `${p.name}: main ${p.mains.map((m) => ROLE_NAME[m].toLowerCase()).join(' and ')}`}
                  >
                    <span className="tick" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="gl">
                        <path d="M5 12.5 10 17.5 19 7" />
                      </svg>
                    </span>
                    <span className="pinfo">
                      <span className="pname">{p.name}</span>
                      <span className="pmeta">
                        {notSet ? (
                          <span className="tag">Roles not set</span>
                        ) : (
                          <>
                            {p.mains.map((m) => (
                              <RoleIcon key={m} role={m} title={`Main: ${ROLE_NAME[m]}`} />
                            ))}
                            <span>{p.mains.map((m) => ROLE_NAME[m]).join(' / ')}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {r && <span className="prate">{fmt(r.rating)}</span>}
                  </button>
                  {p.ot.map((o) => {
                    const id = otId(p.name, o.key);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="otog"
                        aria-pressed={ots.has(id)}
                        disabled={!on}
                        onClick={() => props.onToggleOt(id)}
                        title={on ? `Allow ${p.name} on ${o.champ} (${ROLE_NAME[o.role].toLowerCase()}) tonight` : `Select ${p.name} first`}
                      >
                        <ChampIcon champ={o.champ} champKey={o.key} />
                        <span className="otl">
                          <span>{o.champ}</span>
                          {r && r.otRating[o.key] !== undefined && <small>{fmt(r.otRating[o.key])}</small>}
                        </span>
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <div className="actionbar">
        <div className="wrap ab-row">
          <div className="games" role="group" aria-label="Number of games">
            <span>Games</span>
            <div className="tabs">
              {[1, 2, 3].map((g) => (
                <button key={g} type="button" className="tab" aria-pressed={games === g} onClick={() => props.onGames(g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <p className="ab-msg" aria-live="polite">
            {props.error || msg}
          </p>
          <button type="button" className="btn" onClick={props.onMake} disabled={short > 0 || busy}>
            {busy ? 'Making teams…' : 'Make teams'}
          </button>
        </div>
      </div>
    </>
  );
}
