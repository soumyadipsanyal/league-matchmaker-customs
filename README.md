# Thursday Customs

A team balancer for our League of Legends 5v5 customs. Tick who's playing, pick 1–3 games, allow any one-tricks, press **Make teams**, and the teams slide onto a Summoner's Rift board you can screenshot or copy into the group chat.

It's a static site (Vite + React + TypeScript) with no backend. The ratings ship encrypted and only unlock with the password.

## Run it

You need Node.js 20 or newer.

```powershell
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). Press **Unlock** in the header and enter the password to see ratings and make teams.

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

It checks the file, asks for the password twice and writes `src/data/roster.locked.json`. Commit that file: it's the only roster the site uses, and it holds names, roles and champions in the clear, with all ratings encrypted (AES-GCM, key from the password via PBKDF2). `npm run build` stops with a reminder if the names, roles or one-tricks in `roster.private.json` no longer match the encrypted file.

## Change the password

Run `npm run encrypt-roster` and type the new password. The old one stops working as soon as the new `roster.locked.json` is deployed. The password isn't stored anywhere in the code; to run a script without the prompt, set it for that terminal only:

```powershell
$env:ROSTER_PASSWORD = 'your password'; npm run check-dist; Remove-Item Env:ROSTER_PASSWORD
```

The lock is only as strong as the password: anyone can download the site and try guesses offline, so a short dictionary word can be cracked quickly. A passphrase of four or more random words keeps the ratings properly private.

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

`check-dist` asks for the password, proves it opens the shipped roster, then searches every file in `dist/` for the password (any letter case) and for plaintext ratings, steps or one-trick ratings.

## Tests

`npm test` covers the rating maths, game scoring, the exact balancer (against brute force), the sit-out rotation rules, Shuffle, and the lock (right password decrypts, wrong one fails). Two parts need private data and skip themselves without it:

- `tests/roster.private.test.ts` checks the rating maths on real players from the roster. It's gitignored because it spells out their ratings.
- Opening the shipped roster with the real password runs when `ROSTER_PASSWORD` is set.

## Images

Official icons are optional. Drop PNGs into `public/assets` with these exact names (letter case matters on GitHub Pages); anything missing shows a drawn placeholder. **Settings → Images** shows what was found.

- `public/assets/champions/<key>.png`: champion icons, using each one-trick's `key` (e.g. `MasterYi.png`).
- `public/assets/roles/top.png`, `jungle.png`, `mid.png`, `adc.png`, `support.png`.
- `public/assets/map/summoners-rift.png` (optional): replaces the drawn board. If the magnets don't sit on its lanes, nudge the positions in `src/board/slots.ts`.

## How teams are made

- A player's rating in a role is main × (1 − 15% × steps). The 15% is editable in Settings.
- Unlisted roles are a last resort, rated one step below the player's lowest role and flagged. A player with no roles set counts one step below main anywhere, also flagged.
- An allowed one-trick counts at its rating (or the role rating if higher) when the player lands in that role.
- Each game scores `4 × team gap + biggest lane gap + 0.4 × average lane gap + 0.6 × steps off main + 10 × unlisted roles` (bot lane counts as a duo), and the lowest wins. Each ten is solved exactly. With more than ten, sit-outs rotate (nobody sits twice before everyone has sat once, and whoever sat out plays next); up to 14 players every schedule is checked, beyond that a time-boxed search runs in a Web Worker.
- **Shuffle** picks another lineup within 0.5 of the best.

---

Thursday Customs was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
