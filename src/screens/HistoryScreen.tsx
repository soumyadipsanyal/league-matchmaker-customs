import { useState } from 'react';
import manifest, { historyNights } from 'virtual:asset-manifest';
import statsData from '../data/match-stats.json';
import { assetUrl } from '../lib/assets.ts';
import { plural } from '../lib/format.ts';
import { nightLabel, shotsFor } from '../lib/history.ts';
import type { StatGame, StatsFile } from '../lib/stats.ts';

const STATS = statsData as StatsFile;

/** Nights with a screenshot folder or recorded stats, newest first. */
const NIGHTS = [...new Set([...historyNights, ...STATS.nights.map((n) => n.date)])].sort().reverse();

function Shots({ paths, label }: { paths: string[]; label: string }) {
  return (
    <div className="shots">
      {paths.map((p, i) => {
        const url = assetUrl(p);
        if (!url) return null;
        return (
          <a key={p} href={url} target="_blank" rel="noopener" title="Open full size">
            <img src={url} loading="lazy" decoding="async" alt={`${label} screenshot${paths.length > 1 ? ` ${i + 1}` : ''}`} />
          </a>
        );
      })}
    </div>
  );
}

function Night({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const shots = shotsFor(date, manifest);
  const recorded = STATS.nights.find((n) => n.date === date)?.games ?? [];
  const games = [...new Set([...shots.games.keys(), ...recorded.map((g) => g.game)])].sort((a, b) => a - b);
  const shotCount = [...shots.games.values()].reduce((s, l) => s + l.length, 0) + shots.other.length;
  const result = (g: StatGame | undefined) =>
    g ? <span className={`res ${g.winner}`}>{g.winner === 'blue' ? 'Blue' : 'Red'} side won · {g.duration}</span> : null;

  return (
    <details className="night" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="nt">{nightLabel(date)}</span>
        <span className="nmeta">
          {games.length ? plural(games.length, 'game') : 'No games yet'}
          {shotCount > 0 && ` · ${plural(shotCount, 'screenshot')}`}
        </span>
        <svg className="gl chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      {open && (
        <div className="nbody">
          {games.length === 0 && shots.other.length === 0 && <p className="note">No screenshots for this night yet.</p>}
          {games.map((n) => {
            const paths = shots.games.get(n) ?? [];
            return (
              <section className="hgame" key={n}>
                <h3>
                  Game {n} {result(recorded.find((g) => g.game === n))}
                </h3>
                {paths.length ? <Shots paths={paths} label={`Game ${n}`} /> : <p className="note">No screenshot for this game yet.</p>}
              </section>
            );
          })}
          {shots.other.length > 0 && (
            <section className="hgame">
              <h3>More from the night</h3>
              <Shots paths={shots.other} label={nightLabel(date)} />
            </section>
          )}
        </div>
      )}
    </details>
  );
}

export function HistoryScreen() {
  return (
    <section className="band">
      <div className="wrap">
        <div className="sec-head">
          <h1>Match history</h1>
          <p className="sub">Every Thursday, with the screenshots from each game. Tap a night to open it, and a screenshot to see it full size.</p>
        </div>
        {NIGHTS.length === 0 ? (
          <p className="note">No nights yet.</p>
        ) : (
          <div className="nights">
            {NIGHTS.map((d) => (
              <Night key={d} date={d} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
