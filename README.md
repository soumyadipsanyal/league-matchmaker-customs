# Thursday Customs

A team balancer for our League of Legends 5v5 customs. Tick who's playing, pick 1–3 games, allow any one-tricks, press **Make teams**, and the teams slide onto a Summoner's Rift board you can screenshot or copy into the group chat.

It's a static site (Vite + React + TypeScript) with no backend. Anyone with the link can make teams; the ratings only show after **Unlock** with the password.

## Run it

You need Node.js 20 or newer.

```powershell
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). Anyone can make teams; press **Unlock** in the header and enter the password to see the ratings, totals and lane bars.

```powershell
npm run build      # static site in dist/
npm run preview    # serve dist/ locally to check it
npm test           # unit tests
```

## Edit the roster and re-encrypt it

The roster lives in `roster.private.json` (never committed). Each player looks like this (made-up example):

```json
{"name":"Alex","rating":6,"roles":{"top":0,"jg":1,"sp":2},
 "ot":[{"champ":"Master Yi","key":"MasterYi","role":"jg","rating":7.5}]}
```

- `rating`: out of 10, on their main role.
- `roles`: role → steps below main (0 = main). Keys are `top`, `jg`, `mid`, `adc`, `sp`. Leave it as `{}` if their roles aren't known yet.
- `ot` (optional): one-tricks, with the champion's display name, its icon file key, the role and the rating on it.

After editing, run:

```powershell
npm run encrypt-roster
```

It checks the file, asks for the password twice and writes `src/data/roster.locked.json`. Commit that file: it's the only roster the site uses. It holds names, roles and champions in the clear, plus the ratings twice: once encrypted under the password (AES-GCM, key from the password via PBKDF2), which is what Unlock checks, and once scrambled, which is what lets anyone make teams. `npm run build` stops with a reminder if the names, roles or one-tricks in `roster.private.json` no longer match the encrypted file.

## Change the password

Run `npm run encrypt-roster` and type the new password. The old one stops working as soon as the new `roster.locked.json` is deployed. The password isn't stored anywhere in the code; to run a script without the prompt, set it for that terminal only:

```powershell
$env:ROSTER_PASSWORD = 'your password'; npm run check-dist; Remove-Item Env:ROSTER_PASSWORD
```

**How private are the ratings?** Hidden, not secret. Because anyone can make teams, the site has to carry a copy of the ratings the browser can use without the password. That copy is scrambled so the numbers aren't readable at a glance, but someone who digs into the site's code could unscramble them. The password decides whether the app shows the numbers. If you ever need them truly secret again, team-making would have to move behind the password or onto a small server.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch:

   ```powershell
   git init
   git add .
   git status     # roster.private.json, claude-code-prompt.md and reference-page.html must NOT be listed
   git commit -m "Thursday Customs"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes on every push to `main`. The site appears at `https://<you>.github.io/<repo>/`.

All paths are relative, so it works from any repository name. Optional: add a repository secret `ROSTER_PASSWORD` and the workflow also runs the leak check below on each deploy.

## Check the build doesn't leak

```powershell
npm run build
npm run check-dist
```

`check-dist` asks for the password, proves it opens the shipped roster, then searches every file in `dist/` for the password (any letter case) and for plaintext ratings, steps or one-trick ratings, and checks both roster copies are there. It proves nothing is readable as-is; it can't make the scrambled copy secret.

## Tests

`npm test` covers the rating maths, game scoring, the exact balancer (against brute force), the sit-out rotation rules, Shuffle, the lock (right password decrypts, wrong one fails) and the scrambled copy. Two parts need private data and skip themselves without it:

- `tests/roster.private.test.ts` checks the rating maths on real players from the roster. It's gitignored because it spells out their ratings.
- Opening the shipped roster with the real password runs when `ROSTER_PASSWORD` is set.

## Images

Official icons are optional. Drop PNGs into `public/assets` with these exact names (letter case matters on GitHub Pages); anything missing shows a drawn placeholder. **Settings → Images** shows what was found.

- `public/assets/champions/<key>.png`: champion icons, using each one-trick's `key` (e.g. `MasterYi.png`).
- `public/assets/roles/top.png`, `jungle.png`, `mid.png`, `adc.png`, `support.png`.
- `public/assets/map/summoners-rift.png` (optional): replaces the drawn board. If the magnets don't sit on its lanes, nudge the positions in `src/board/slots.ts`.
- `public/assets/backgrounds/` (optional): any JPG or PNG files, any names, shown as a darkened backdrop behind the page. By default a random one shows on each visit; **Settings → Background** lets you pick one or turn it off. Champion splash art from Riot's Data Dragon works well, e.g. `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Udyr_0.jpg` (change the champion key, and the number for other skins).

## Organiser mode: saving games

The master password unlocks everything the normal one does, plus a **Save game** button on the Teams tab. It adds the game on screen (names, roles and who sat out) to today's record in `src/data/match-records.json`, straight into the GitHub repo, so it shows in **Match history** for everyone after the site rebuilds (about 2 minutes). Games played after midnight count for the night before (the day changes at 6 am).

On the Tonight tab, **Use today's match record** makes the next teams carry on from today's saved games, read fresh from GitHub:

1. Nobody who sat out the last saved game sits out again (this wins any clash).
2. Sit-outs stay fair across the whole night (nobody sits out twice before everyone has sat out once).
3. Nobody who was off their main role in their last saved game is off it again.

### Setting up saving (once)

Saving needs a GitHub token that can write to this repo. The token is stored encrypted under the master password, never in readable form.

1. On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it (e.g. "Thursday Customs saves"), pick an expiry, choose **Only select repositories** and pick this repo.
3. Under **Repository permissions**, set **Contents** to **Read and write**. Generate it and copy it.
4. In the project folder run `npm run set-save-token`, type the master password twice and paste the token. It checks the token can write to the repo before saving anything.
5. Commit and push `src/data/save-lock.json`.

To change the master password or replace an expired token, run `npm run set-save-token` again. Anyone who cracks the master password could use the token to change files in this repo, so a long master password is safest; the token is limited to this one repo, and you can revoke it on GitHub at any time.

Saves are commits to the repo, so run `git pull` before pushing your own changes.

## Match history

Each night is a folder named by its date under `public/assets/history/`, e.g. `public/assets/history/2026-11-26/`. Every folder becomes a dropdown on the **Match history** tab, newest first, even before it has screenshots.

Put the screenshots in that folder named by game: `game-1.png`, `game-2.jpg`, and so on (`game-2-b.png` adds a second picture to game 2). Anything not starting with `game-` shows under "More from the night". JPGs are much smaller than PNGs, which helps on phones. Then commit and push, or upload them on GitHub with **Add file → Upload files** inside that folder.

## Stats

The **Stats** tab shows gol.gg-style player and champion tables (games, win rate, KDA, average kills/deaths/assists, CS and gold per minute, kill participation, damage and gold share, damage and vision per minute) built from `src/data/match-stats.json`. Each game in that file lists the duration, the winning side and, for each player, the champion, K/D/A, CS, gold and, if the scoreboard shows them, damage to champions and vision score:

```json
{"nights": [{"date": "2026-11-26", "games": [
  {"game": 1, "duration": "31:24", "winner": "blue",
   "blue": [{"player": "Alex", "champ": "Master Yi", "role": "jg", "k": 7, "d": 2, "a": 5, "cs": 210, "gold": 12400, "dmg": 18300, "vision": 22}, "...4 more"],
   "red":  ["...5 players"]}]}]}
```

`npm test` checks the file is well formed. Stats that need the game's timeline (gold difference at 15, first blood) can't come from the post-game scoreboard, so they aren't tracked.

## How teams are made

- A player's rating in a role is main × (1 − 15% × steps). The 15% is editable in Settings.
- Unlisted roles are a last resort, rated one step below the player's lowest role and flagged. A player with no roles set counts one step below main anywhere, also flagged.
- An allowed one-trick counts at its rating (or the role rating if higher) when the player lands in that role.
- Each game scores `4 × team gap + biggest lane gap + 0.4 × average lane gap + off-role cost + 10 × unlisted roles` (bot lane counts as a duo), and the lowest wins. The off-role cost is `0.6 + 0.8 × steps off main` for each player not on their main role, so main roles are preferred over a little balance (on our roster about 8.5 of 10 players get their main role).
- **Nobody off-role two games running:** anyone who was off their main role in the last game they played costs an extra 8 if they're off it again, so it only happens when there's no reasonable alternative. Games in one Make teams are filled in order, and the last game of the previous Make teams counts too (until the page is refreshed), or today's saved games when **Use today's match record** is on.
- Each ten is solved exactly. With more than ten, sit-outs rotate (nobody sits twice before everyone has sat once, and whoever sat out plays next); up to 14 players every schedule is checked, beyond that a time-boxed search runs in a Web Worker.
- **Shuffle** picks another lineup within 0.5 of the best.
- **Adjust for tonight** (under the player list) lowers a player's overall skill by up to 50% for tonight's teams only, e.g. if someone's ill or on a borrowed laptop. Every role and one-trick drops by that much; saved ratings don't change. The teams remember the adjustments they were made with, and a small "−20%" tag shows next to that player.

---

Thursday Customs was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
