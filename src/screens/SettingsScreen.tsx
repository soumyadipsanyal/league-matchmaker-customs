import { AssetImg, RoleGlyph, monogram, useBrokenImages } from '../components/Icons.tsx';
import { DEFAULT_STEP_DROP, STEP_DROP_MAX, STEP_DROP_MIN } from '../engine/constants.ts';
import { assetState, backgroundFiles, backgroundLabel, imageSpecs } from '../lib/assets.ts';
import { fmt } from '../lib/format.ts';
import { ROLES, ROLE_FILE } from '../lib/roles.ts';
import type { PublicPlayer } from '../lib/roster.ts';

interface Props {
  players: PublicPlayer[];
  drop: number;
  onDrop: (d: number) => void;
  /** 'random', 'none' or a background file path. */
  background: string;
  onBackground: (b: string) => void;
}

function Placeholder({ path }: { path: string }) {
  const role = ROLES.find((r) => path.endsWith(`/${ROLE_FILE[r]}.png`) && path.includes('/roles/'));
  if (role) return <RoleGlyph role={role} className="gl big" />;
  if (path.includes('/champions/')) {
    const key = path.split('/').pop()!.replace(/\.png$/, '');
    return (
      <span className="hx big">
        <span className="mono">{monogram(key.replace(/([a-z])([A-Z])/g, '$1 $2'))}</span>
      </span>
    );
  }
  return <span className="mapph" />;
}

export function SettingsScreen({ players, drop, onDrop, background, onBackground }: Props) {
  const broken = useBrokenImages();
  const pct = Math.round(drop * 100);
  const groups = imageSpecs(players);
  const all = groups.flatMap((g) => g.items);
  const found = all.filter((i) => assetState(i.path).kind === 'found' && !broken.has(i.path)).length;

  return (
    <section className="band">
      <div className="wrap settings">
        <div className="sec-head">
          <h1>Settings</h1>
          <p className="sub">Saved on this device.</p>
        </div>

        <div className="card">
          <h2>Drop per step</h2>
          <p className="sub">
            Each step down a player's list of roles takes this much off their main rating. A 10 one step off main counts as {fmt(10 * (1 - drop))}; two
            steps off, {fmt(Math.max(0, 10 * (1 - 2 * drop)))}.
          </p>
          <div className="range">
            <input
              type="range"
              min={STEP_DROP_MIN * 100}
              max={STEP_DROP_MAX * 100}
              step={1}
              value={pct}
              onChange={(e) => onDrop(Number(e.target.value) / 100)}
              aria-label="Drop per step, in per cent"
            />
            <output className="big-n">{pct}%</output>
            <button type="button" className="btn ghost sm" onClick={() => onDrop(DEFAULT_STEP_DROP)} disabled={pct === Math.round(DEFAULT_STEP_DROP * 100)}>
              Reset to {Math.round(DEFAULT_STEP_DROP * 100)}%
            </button>
          </div>
          <p className="note">Changing this re-rates everyone straight away, including teams already on the board. Press Make teams again to rebalance.</p>
        </div>

        <div className="card">
          <h2>Background</h2>
          <p className="sub">
            Champion splash art behind the page, darkened so everything stays readable. Add JPG or PNG files to <code>public/assets/backgrounds</code>{' '}
            (any file names).
          </p>
          {backgroundFiles.length === 0 ? (
            <p className="note">No backgrounds added yet, so the page is plain navy.</p>
          ) : (
            <div className="bgpick" role="group" aria-label="Background">
              <button type="button" className="bgtile" aria-pressed={background === 'random'} onClick={() => onBackground('random')}>
                <span className="bgthumb word">Random</span>
                <span>A different one each visit</span>
              </button>
              <button type="button" className="bgtile" aria-pressed={background === 'none'} onClick={() => onBackground('none')}>
                <span className="bgthumb word">None</span>
                <span>Plain navy</span>
              </button>
              {backgroundFiles.map((f) => (
                <button key={f} type="button" className="bgtile" aria-pressed={background === f} onClick={() => onBackground(f)}>
                  <span className="bgthumb">
                    <AssetImg path={f} fallback={<span className="word">?</span>} />
                  </span>
                  <span>{backgroundLabel(f)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Images</h2>
          <p className="sub">
            {found} of {all.length} found. Drop official PNGs into <code>public/assets</code> using the exact file names below (letter case matters on
            GitHub Pages). Anything missing uses the drawn placeholder.
          </p>
          {groups.map((g) => (
            <div key={g.group} className="imgs">
              <h3>{g.group}</h3>
              <ul>
                {g.items.map((i) => {
                  const st = assetState(i.path);
                  const isBroken = st.kind === 'found' && broken.has(i.path);
                  return (
                    <li key={i.path} className={st.kind === 'found' && !isBroken ? 'ok' : 'miss'}>
                      <span className="thumb">
                        <AssetImg path={i.path} fallback={<Placeholder path={i.path} />} />
                      </span>
                      <span className="iinfo">
                        <b>{i.what}</b>
                        <code>public/{i.path}</code>
                      </span>
                      <span className="istate">
                        {isBroken
                          ? "Found, but it won't load"
                          : st.kind === 'found'
                            ? 'Found'
                            : st.kind === 'wrong-case'
                              ? `Rename ${st.actual.split('/').pop()} to ${i.path.split('/').pop()}`
                              : 'Missing'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="note">After adding files, refresh this page (or run the build again for the deployed site).</p>
        </div>
      </div>
    </section>
  );
}
