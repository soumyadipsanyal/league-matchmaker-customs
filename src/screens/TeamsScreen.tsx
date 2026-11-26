import { useState } from 'react';
import { FaceOff } from '../components/FaceOff.tsx';
import { RiftBoard } from '../components/RiftBoard.tsx';
import { plural } from '../lib/format.ts';
import { ROLES, ROLE_NAME } from '../lib/roles.ts';
import type { Player, PublicPlayer } from '../lib/roster.ts';
import { champName, gameView, teamsToText, type Placement, type Teams } from '../lib/teams.ts';

interface Props {
  teams: Teams | null;
  pub: Map<string, PublicPlayer>;
  rated: Map<string, Player> | null;
  drop: number;
  gameIndex: number;
  onGame: (i: number) => void;
  onShuffle: () => void;
  busy: boolean;
  notice: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or plain http: fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function TeamsScreen({ teams, pub, rated, drop, gameIndex, onGame, onShuffle, busy, notice }: Props) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const game = teams?.games[Math.min(gameIndex, teams.games.length - 1)] ?? null;
  const view = game && rated ? gameView(game, rated, drop, teams?.adjust) : null;
  const name = (p: Placement) => (p.champ ? champName(pub, p.name, p.champ) : '');
  const unlocked = Boolean(rated);

  const label = game
    ? `Game ${gameIndex + 1} on the board. ` +
      ROLES.map((r, k) => `${ROLE_NAME[r]}: ${game.blue[k].name} for blue, ${game.red[k].name} for red`).join('. ')
    : "Summoner's Rift board, waiting for teams";

  async function copy() {
    if (!teams) return;
    const ok = await copyText(teamsToText(teams, pub));
    setCopied(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopied(''), 2500);
  }

  return (
    <section className="band">
      <div className="wrap">
        <div className="teams-head">
          <h1>Teams</h1>
          {teams && teams.games.length > 1 && (
            <div className="tabs" role="group" aria-label="Choose a game">
              {teams.games.map((_, i) => (
                <button key={i} type="button" className="tab" aria-pressed={i === gameIndex} onClick={() => onGame(i)}>
                  Game {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="stage">
          <RiftBoard game={game} view={view} animKey={`${teams?.seq ?? 0}:${gameIndex}`} champName={name} label={label} />
          <section className="sheet" aria-labelledby="sheet-title">
            {teams && game ? (
              <>
                <div className="sh-head">
                  <div>
                    <h2 id="sheet-title">{teams.games.length > 1 ? `Game ${gameIndex + 1} of ${teams.games.length}` : 'The game'}</h2>
                    <div className="pills">
                      <span className="pill">{plural(teams.players.length, 'player')}</span>
                      <span className="pill">{teams.allowed.length ? plural(teams.allowed.length, 'one-trick') + ' allowed' : 'No one-tricks'}</span>
                      {!unlocked && <span className="pill lockpill">Ratings hidden</span>}
                    </div>
                  </div>
                </div>
                <FaceOff game={game} view={view} pub={pub} champName={name} adjust={teams.adjust} />
                <div className="act">
                  <button type="button" className="btn" onClick={copy}>
                    {copied === 'ok' ? 'Copied' : copied === 'fail' ? "Couldn't copy" : 'Copy teams'}
                  </button>
                  <button type="button" className="btn ghost" onClick={onShuffle} disabled={busy}>
                    {busy ? 'Shuffling…' : 'Shuffle'}
                  </button>
                </div>
                <p className="note" aria-live="polite">
                  {notice || 'Copy teams copies every game as plain text for the group chat, without ratings.'}
                </p>
              </>
            ) : (
              <div className="pre">
                <h2 id="sheet-title">No teams yet</h2>
                <p className="sub">Pick who's playing on the Tonight screen, then press Make teams. The magnets slide into their lanes here.</p>
                <a className="btn" href="#tonight">
                  Pick players
                </a>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
