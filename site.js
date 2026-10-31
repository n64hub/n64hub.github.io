// Reads the Games table from main's README.md and draws a tile a game; Play opens the game's page in a frame, or goes
// to it in this tab where a frame can't play it (below: a page on another origin, or this page not cross-origin
// isolated because the browser refused its coi_serviceworker.js), never in a new tab: Back returns to the grid.
//
// The frame: every game's page is a folder beside this one in the hub (tools/publish_site.sh), so it can play here,
// but threads need it cross-origin isolated, and a frame is only that inside a page that is (this one, by its
// coi_serviceworker.js). A game's page gets its headers from its own coi_serviceworker.js, which on a first visit
// registers and then reloads it; inside this page that first load has no headers yet, so the frame would be refused.
// So Play registers the game's worker for its folder first, and the frame's first load is already isolated.
//
// Signing in with Google (below, and frontend/save_sync.js) keeps the player's saves in their own Google Drive.
'use strict';

// Served locally (tools/serve_site.mjs), the checkout's own README.md, so a change to the table shows before it lands.
const README = location.hostname === 'localhost' ? 'README.md'
  : 'https://raw.githubusercontent.com/n64hub/N64Recomp-browser/main/README.md';

// The table's columns, found by their headers: Game, Recomp (the upstream recomp, "[name](url) by owner"), Repo,
// Page (the page's header says how the games play).
function parseGames(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Games');
  const games = [];
  let header = null;
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (!header) { header = cells; continue; }
    if (/^-+$/.test(cells[0])) continue;
    const link = (cell) => (cell.match(/\]\((.*?)\)/) || [])[1];
    const col = (re) => cells[header.findIndex((h) => re.test(h))] ?? '';
    const repo = col(/^Repo$/);
    const repoName = repo.replace(/^\[(.*?)\].*$/, '$1');
    const page = localPage(link(col(/^Page$/)));
    games.push({
      name: col(/^Game$/), recomp: col(/^Recomp$/), repoName, repo: link(repo), page,
      // Its name in this page's address (#<id>, below): its page's folder (f-zero-x), or its repo's name for a page
      // at the top of a site.
      id: new URL(page, location.href).pathname.split('/').filter(Boolean).pop() ?? repoName,
    });
  }
  return games;
}

function el(tag, props, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function tile(game, index) {
  // Its colour: the golden angle on from the tile before's, so neighbours never share one.
  const h = Math.round(index * 137.5) % 360;
  // The game's art (ART), on a title card, its name on a colour of its own, where the art doesn't name it. The tile has
  // no name line. The art is the Play button: a click on it, or Enter or Space on it, plays.
  const kind = ART[game.repoName];
  const cover = el('div', { className: 'art' + (kind ? ' ' + kind : ''), style: `--h:${h}`, title: 'Play ' + game.name,
    role: 'button', tabIndex: 0, ariaLabel: 'Play ' + game.name });
  if (kind) {
    const art = el('img', { src: `img/${game.repoName}.webp`, alt: game.name, loading: 'lazy' });
    art.addEventListener('error', () => { art.remove(); cover.className = 'art'; });
    cover.append(art);
  }
  cover.append(el('span', { className: 'card-title' }, ...titleCard(game.name)));
  cover.addEventListener('click', () => openGame(game));
  cover.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openGame(game);
  });
  return el('article', { className: 'tile', ariaLabel: game.name }, cover,
    el('div', { className: 'body' },
      el('p', { className: 'recomp', title: game.recomp.replace(/\[(.*?)\]\(.*?\)/, '$1') }, ...credit(game.recomp, game.repo))));
}

// Each game's art, img/<its Repo cell>.webp (docs/playing.md), by how the tile shows it: "cover" fills the tile and
// shows the name, "cover unnamed" fills it with the name over it, "logo" shows the name on the tile's colour, "icon"
// stands beside the title card. A game without one gets the title card alone.
const ART = {
  'BanjoRecomp-web': 'cover', 'BanjoTooieRecompiled-web': 'cover', 'Donkey-Kong-64-Recompiled-web': 'cover',
  'CBFD-Recompiled-web': 'cover', 'DKR-R-web': 'cover',
  'pilotwings-64-recomp-web': 'cover unnamed', 'wave-race-64-recomp-web': 'cover unnamed',
  'JetForceGemini-Recomp-web': 'logo', 'Snap64Recomp-web': 'logo', 'rush2recompiled-web': 'logo',
  '1080-Snowboarding-recomp-web': 'icon',
  'GoldenEye64Recomp-web': 'icon', 'MarioKart64Recomp-web': 'icon', 'Starfox64Recomp-web': 'icon', 'Zelda64Recomp-web': 'icon',
};

// A title card's text: "The Legend of Zelda: Majora's Mask" as the series, small, over "Majora's Mask".
function titleCard(name) {
  const [series, title] = name.split(/: (.*)/);
  return title ? [el('small', { textContent: series }), title] : [name];
}

// "[Banjo: Recompiled](url) by BanjoRecomp" as "<a>Web port</a>, based on <a>Banjo: Recompiled</a> by BanjoRecomp",
// the first the game's repo; a cell without a link ("this project's own recomp") is the link to it.
function credit(cell, repo) {
  const m = cell.match(/^\[(.*?)\]\((.*?)\)(.*)$/);
  if (!m) return cell ? [el('a', { href: repo, textContent: cell[0].toUpperCase() + cell.slice(1) })] : [];
  return [el('a', { href: repo, textContent: 'Web port' }), ', based on ', el('a', { href: m[2], textContent: m[1] }),
    ...m[3].split(/(\S*-\S*)/).map((part, i) => i % 2 ? el('span', { className: 'whole', textContent: part }) : part)];
}

// A game's page in the hub, at either of its addresses, is played from the folder beside this page: the same one on
// Pages, tools/serve_site.mjs's when served locally.
const HUBS = ['https://n64hub.github.io/', 'https://n64hub.com/'];
function localPage(page) {
  const hub = HUBS.find((h) => page.startsWith(h));
  return hub ? new URL(page.slice(hub.length), location.href).href : page;
}

// The game's folder on this origin, or null when its page is elsewhere (this tab then goes to it).
function sameOriginFolder(page) {
  const url = new URL(page, location.href);
  return url.origin === location.origin ? url.pathname.replace(/[^/]*$/, '') : null;
}

async function registerGameWorker(folder) {
  const registration = await navigator.serviceWorker.register(folder + 'coi_serviceworker.js', { scope: folder });
  const worker = registration.active || registration.waiting || registration.installing;
  if (worker && worker.state !== 'activated') {
    await new Promise((resolve) => worker.addEventListener('statechange', () => worker.state === 'activated' && resolve()));
  }
}

const player = document.getElementById('player');
const frame = document.getElementById('player-frame');
let games = [];

// History: opening a game from the grid adds one entry (#<id>, the game's folder: #f-zero-x), and Back or ✕ goes back
// to the grid. The frame is only ever navigated with location.replace, since a frame's own navigations join the page's
// history, and Back then stepped through the games played before.
function showFrame(url) {
  frame.contentWindow.location.replace(url);
}

// On a phone or tablet a game plays fullscreen in landscape, as it is laid out: the tap that opens it fullscreens this
// page and then locks it to landscape, before the frame loads, so the game starts at that size. Chrome on Android locks
// only in fullscreen and grants that only from a tap, and here, at the top, neither depends on what a frame may do. A
// phone is where the pointer is a finger: never a computer, a laptop's touch screen included, whose pointer is its
// mouse. Closing the game leaves fullscreen.
// Android leaves fullscreen, and so the lock, by itself: for the ROM picker, which hides the page, and at Back. So a
// game is never shown upright: #player-turn covers it while a finger's screen is in portrait (site.css), and its tap
// is the one that fullscreens and locks again. Where either is refused (an iPhone has neither) it asks for the phone
// to be turned instead, as the game's own page does (frontend/shell.html, whose own tap fullscreens a page opened on
// its own).
const phone = matchMedia('(pointer: coarse)');
const turn = document.getElementById('player-turn');
const refused = (e) => {
  console.log(`fullscreen or landscape refused: ${e.name}: ${e.message}`);
  turn.textContent = 'Turn your phone sideways to play.';
};
function landscape() {
  if (!phone.matches) return Promise.resolve();
  if (!document.documentElement.requestFullscreen || !screen.orientation?.lock) {
    refused({ name: 'NotSupportedError', message: 'no fullscreen or orientation lock' });
    return Promise.resolve();
  }
  return (document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen())
    .then(() => screen.orientation.lock('landscape')).catch(refused);
}
turn.addEventListener('click', landscape);

// Firefox on a phone or tablet plays no game: its WebGPU fails as the game's page starts, behind that page's notice to
// turn the phone. So the header says so before a game is picked, more strongly than the built-in graphics warning
// (below), and a tile only points at it. That is Firefox for Android, or it asking for a desktop site, whose UA then
// names no Android but whose pointer is still a finger; Firefox on an iPhone is Safari's engine (its UA says FxiOS).
const firefox = /\bFirefox\//.test(navigator.userAgent);
const noGames = firefox && (phone.matches || /Android/.test(navigator.userAgent));
const noGamesNote = document.getElementById('phone-firefox-note');
noGamesNote.hidden = !noGames;
document.body.classList.toggle('no-games', noGames);
function pointAtNoGames() {
  noGamesNote.scrollIntoView({ behavior: 'smooth', block: 'center' });
  noGamesNote.classList.remove('flash');
  void noGamesNote.offsetWidth;  // so the animation starts again
  noGamesNote.classList.add('flash');
}

async function openGame(game, push = true) {
  if (noGames) {
    pointAtNoGames();
    return;
  }
  const folder = sameOriginFolder(game.page);
  if (!folder || !window.crossOriginIsolated) {
    location.assign(game.page);
    return;
  }
  // A token with less than a quarter of an hour left is renewed first, and the game opens on the way back (#<id>).
  const record = SaveSync.stored();
  if (GOOGLE_CLIENT_ID && record?.token && record.expires < Date.now() + 15 * 60000 && !triedLately()) {
    signIn(hub + '#' + encodeURIComponent(game.id), true);
    return;
  }
  if (push) {
    landscape();
    history.pushState({ game: game.id }, '', '#' + encodeURIComponent(game.id));
  }
  frame.title = game.name;
  player.hidden = false;
  document.body.classList.add('playing');
  try {
    await registerGameWorker(folder);
  } catch (error) {
    console.error("The game page's service worker could not register: " + error);
  }
  if (!player.hidden) {
    showFrame(game.page);
    frame.focus();
  }
}

function hideGame() {
  if (frame.contentDocument?.fullscreenElement) frame.contentDocument.exitFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen();  // a phone's (landscape()); it unlocks the orientation
  frame.addEventListener('load', uploadSaves, { once: true });
  showFrame('about:blank');  // ends the game: its threads and sound go with the document
  player.hidden = true;
  document.body.classList.remove('playing');
}

function closeGame() {
  if (history.state?.game) {
    history.back();  // popstate hides it
  } else {  // opened from a link to #<id>: nothing of ours to go back to
    hideGame();
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// The game the address names: by its id, or by its repo's name, as links from before ids did (#f-zero-x-recomp), whose
// address then names it by its id.
function gameFromHash() {
  const wanted = decodeURIComponent(location.hash.slice(1));
  const game = games.find((g) => g.id === wanted);
  if (game) return game;
  const named = games.find((g) => g.repoName === wanted);
  if (named) history.replaceState(history.state, '', '#' + encodeURIComponent(named.id));
  return named;
}

window.addEventListener('popstate', () => {
  const game = gameFromHash();
  if (game) openGame(game, false);
  else if (!player.hidden) hideGame();
});
document.getElementById('player-close').addEventListener('click', closeGame);
// The game's own page fullscreens, as on its own: a fullscreen element around the frame only resized it from outside,
// and Banjo froze there (the picture, not the sound). The click's activation reaches a same-origin frame. A phone's
// fullscreen is this page's (landscape()), so that ✕ stays over the game: the frame's own hid it, and only the phone's
// Back left the game.
document.getElementById('player-full').addEventListener('click', () => {
  if (phone.matches) landscape();
  else frame.contentDocument.documentElement.requestFullscreen().catch(refused);
});
frame.addEventListener('load', () => frame.focus());
// A game's page asks for fullscreen at a phone's tap (frontend/shell.html), and inside this page its own fullscreen
// would hide ✕ as the button's did: on a phone the request is this page's instead.
frame.addEventListener('load', () => {
  if (phone.matches && frame.contentDocument) frame.contentDocument.documentElement.requestFullscreen = landscape;
});

// A phone's on-screen controller (touch_pad.js, at this page's top) goes into the game's frame from here, so every game
// played here has it whatever its page was built from, and a change to it needs no page built: the frame is the same
// origin, so the script runs in the game's own window, whose game reads it as a gamepad. A page that loads it itself
// (frontend/shell.html, since v0.104.0) shows it once its game starts, past the launcher, and is left alone, as is one
// that has a controller of its own (v0.103.0's shell, #pad). A page built before the runtime said when its game starts
// (Module.gameStarted) gets it shown from the start, over its launcher too, where Hide controls takes it away: each
// page's next build from a newer release does away with that, and no change to the controller needs one.
frame.addEventListener('load', () => {
  const page = frame.contentWindow, doc = frame.contentDocument;
  if (!phone.matches || !page.Module || doc.querySelector('#pad, script[src="/touch_pad.js"]')) return;
  if (!page.Module.gameStarted) page.Module.gameRunning = true;
  doc.head.append(Object.assign(doc.createElement('script'), { src: '/touch_pad.js' }));
});

// Firefox on built-in graphics holds every game to 30-45 (its compositor), so those players get the header's warning:
// an Intel chip's graphics but its Arc cards (A770, B580; a Core Ultra's own "Arc Graphics" is built in), or AMD's
// "Radeon Graphics" or "Radeon 780M" in a laptop chip but its RX cards. The GPU is WebGL's renderer, which Firefox gives
// rounded ("Intel(R) HD Graphics, or similar"), or not at all with fingerprinting resisted, and then there is no warning.
function builtInGraphics(renderer) {
  if (/intel/i.test(renderer)) return !/arc\S*\s+[ab]\d{3}/i.test(renderer);
  return /radeon/i.test(renderer) && !/\brx\b|\bpro\b/i.test(renderer) && /graphics|vega|\d{3}m\b/i.test(renderer);
}
function webglRenderer() {
  const gl = document.createElement('canvas').getContext('webgl');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || '';
}
document.getElementById('firefox-note').hidden = !firefox || noGames || !builtInGraphics(webglRenderer());

// Signing in keeps the player's saves in their own Google Drive (frontend/save_sync.js, loaded before this). The hub's
// OAuth client, a Google Cloud project's client of the Web application type, with this page's address (https://n64hub.com/,
// and http://localhost:8742/ to try it locally) as an authorized redirect URI and the origins as JavaScript origins, the
// Google Drive API enabled and drive.appdata among its Data Access scopes: empty, the hub offers no sign-in. While its
// consent screen is in Testing, only its test users can sign in. Published, its Branding page names the home page, the
// privacy policy (privacy.html) and n64hub.com as an authorized domain, and no logo: one needs Google to verify the brand.
// Sign-in goes to Google and back here, not in a popup: a popup's answer reaches the page that opened it through
// window.opener, which Cross-Origin-Opener-Policy: same-origin (coi_serviceworker.js) cuts. Google sends the token
// back in the address's fragment with the state it was given, the same-origin address to return to.
const GOOGLE_CLIENT_ID = '254349962821-7ms1u77vb7mhisnq7dhcs5i12qobkm49.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const hub = location.origin + location.pathname;

// To Google, which asks the player (or, silent, answers at once with a new token or an error) and comes back here. A
// silent one is tried at most once a minute, so a refused one never loops.
function signIn(back, silent) {
  SaveSync.store({ ...SaveSync.stored(), tried: Date.now() });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: GOOGLE_CLIENT_ID,
    redirect_uri: hub, response_type: 'token', scope: DRIVE_SCOPE, include_granted_scopes: 'true', state: back,
    ...(silent && { prompt: 'none' }) });
  silent ? location.replace(url) : location.assign(url);
}
const triedLately = () => Date.now() - (SaveSync.stored()?.tried || 0) < 60000;

// A sign-in's token, until the player has chosen whose saves to keep (finishSignIn): null once stored, or with none.
let signingIn = null;

// Google's answer, a page asking for a new token (#sync-refresh=<its address>, frontend/shell.html), or an old token:
// true when this goes elsewhere, and the hub isn't drawn. A new token where this browser had one is a renewal, and is
// stored at once; one where it had none is a sign-in, which main() finishes.
function syncStart() {
  if (!GOOGLE_CLIENT_ID) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const sameOrigin = (url) => {
    try { return new URL(url).origin === location.origin ? url : hub; } catch { return hub; }
  };
  if (params.has('access_token') || params.has('error')) {
    const back = sameOrigin(params.get('state'));
    if (params.get('scope')?.split(' ').includes(DRIVE_SCOPE)) {
      const token = { token: params.get('access_token'), hub,
                      expires: Date.now() + Number(params.get('expires_in')) * 1000 };
      if (SaveSync.stored()?.token) SaveSync.store({ ...SaveSync.stored(), ...token });
      else signingIn = token;
    } else if (params.has('error')) {
      console.log('Google sign-in: ' + params.get('error'));
    }
    if (new URL(back).pathname !== location.pathname) {
      location.replace(back);
      return true;
    }
    history.replaceState(null, '', back);
    return false;
  }
  if (params.has('sync-refresh')) {
    const back = sameOrigin(params.get('sync-refresh'));
    if (SaveSync.stored()?.token && !triedLately()) signIn(back, true);
    else location.replace(back);
    return true;
  }
  const record = SaveSync.stored();
  if (record?.token && record.expires < Date.now() + 15 * 60000 && !triedLately()) {
    signIn(location.href, true);
    return true;
  }
  return false;
}

// The saves this browser holds, in every game's database on this origin (frontend/persistent_home.js, each named
// '/home/web_user <its page's folder>'): saves, path -> { data, time, played, page } (page its page's folder), and
// folders, program id -> its page's folder. A database holds a game's saves only where it is that game's page
// (SaveSync.owns()): a page built before that took the Drive's saves of every game. One that owns several games (another
// game's page was once played at its folder and left its settings, ROM and saves there) is the page of the one whose
// folder changed last: a page's start reads every folder in at the time it starts, and only its own game writes to its
// folder after that.
async function localSaves() {
  const home = '/home/web_user/', ask = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const local = new Map(), folders = new Map();
  for (const { name } of (await indexedDB.databases?.()) ?? []) {
    if (!name?.startsWith(home.slice(0, -1))) continue;
    const open = indexedDB.open(name);
    open.onupgradeneeded = () => open.transaction.abort();  // gone since it was listed
    const db = await ask(open).catch(() => null);
    if (!db?.objectStoreNames.contains('FILE_DATA')) { db?.close(); continue; }
    const files = () => db.transaction('FILE_DATA').objectStore('FILE_DATA');
    const keys = (await ask(files().getAllKeys())).map(String).filter((key) => key.startsWith(home));
    let owner, newest = -Infinity;
    for (const id of SaveSync.owns(keys.map((key) => key.slice(home.length)))) {
      const time = new Date((await ask(files().get(home + '.config/' + id)))?.timestamp).getTime();
      if (owner === undefined || time > newest) owner = id, newest = time;
    }
    for (const key of keys) {
      const path = key.slice(home.length);
      if (!SaveSync.isSave(path, 0) || SaveSync.game(path) !== owner) continue;
      const entry = await ask(files().get(key));
      const time = new Date(entry?.timestamp).getTime();
      if (entry?.contents && SaveSync.isSave(path, entry.contents.byteLength) && !(local.get(path)?.time >= time)) {
        const page = name.slice(home.length);
        local.set(path, { data: entry.contents, time, played: SaveSync.played(page), page });
        folders.set(SaveSync.game(path), name.slice(home.length));
      }
    }
    db.close();
  }
  return { saves: local, folders };
}

// Signed in, the saves this browser holds that changed since they last synced go up, as a game's page sends them: when
// the hub loads without opening a game, and when a game closes. A page built before frontend/save_sync.js sends none of
// its own, and one that does has sent them already. The Drive's that changed, and a save changed on both sides, are
// left for the game's page to settle at its start.
function uploadSaves() {
  if (!GOOGLE_CLIENT_ID || signingIn || !SaveSync.token()) return;
  localSaves().then(({ saves }) => SaveSync.sync(saves))
    .catch((error) => console.error('Save sync: could not upload: ' + error.message));
}

// A game by its program id, from its page's folder: where its saves are in this browser (folders, localSaves()), or
// else the one its saves in the Drive name (files, SaveSync.listing()'s), but for a page this browser holds another
// game's saves in (a page built before SaveSync.owns() put every game's saves in the Drive as its own).
const gameOf = (id, folders, files = []) => {
  const others = new Set([...folders].filter(([other]) => other !== id).map(([, folder]) => folder));
  const folder = folders.get(id) ??
    files.find((f) => SaveSync.game(f.path) === id && f.page && !others.has(f.page))?.page;
  return games.find((g) => sameOriginFolder(g.page) === folder);
};
// A game's heading in a popup: its art, where it has one, and its name.
const gameHeading = (game, id) => el('h3', {},
  ...(game && ART[game.repoName] ? [el('img', { src: `img/${game.repoName}.webp`, alt: '', className: ART[game.repoName] })]
    : []), game?.name ?? id);
// Seconds played, in words.
const playTime = (s) => s < 60 ? 'under a minute' : s < 3600 ? Math.round(s / 60) + ' min'
  : (s / 3600).toFixed(1).replace(/\.0$/, '') + ' h';
const savedAt = (time) => new Date(time).toLocaleString(undefined,
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Manage saves, from the account menu: each game's saves in the Drive, and under them the earlier saves it kept, any of
// which can be made the game's save again.
async function manageSaves() {
  const dialog = document.getElementById('manage-saves'), list = dialog.querySelector('.choices');
  if (!dialog.open) dialog.showModal();
  list.replaceChildren(el('p', { className: 'note' }, 'Reading your Google Drive…'));
  let folders, saves, copies;
  try {
    [{ folders }, { saves, copies }] = await Promise.all([localSaves(), SaveSync.listing()]);
  } catch (error) {
    console.error('Save sync: could not list the saves in the Drive: ' + error.message);
    list.replaceChildren(el('p', { className: 'note' }, `Your Google Drive couldn't be read (${error.message}).`));
    return;
  }
  const files = [...saves, ...copies], name = (id) => gameOf(id, folders, files)?.name ?? id;
  const about = (f) => [f.path.replace(/^.*\/saves\//, ''), 'saved ' + savedAt(f.time) + (f.from ? ' in ' + f.from : ''),
    f.played !== undefined && 'played ' + playTime(f.played)].filter(Boolean).join(', ');
  const restore = (copy) => {
    const b = el('button', { type: 'button', textContent: 'Use this one' });
    b.addEventListener('click', async () => {
      for (const other of list.querySelectorAll('button')) other.disabled = true;
      try {
        await SaveSync.restore(copy);
      } catch (error) {
        console.error('Save sync: could not restore: ' + error.message);
      }
      manageSaves();
    });
    return b;
  };
  const ids = [...new Set(files.map((f) => SaveSync.game(f.path)))].sort((a, b) => name(a).localeCompare(name(b)));
  list.replaceChildren(...(ids.length ? ids.map((id) => {
    const mine = (f) => SaveSync.game(f.path) === id, earlier = copies.filter(mine);
    return el('section', {}, gameHeading(gameOf(id, folders, files), id),
      ...saves.filter(mine).map((f) => el('p', { className: 'save' }, about(f))),
      ...(earlier.length ? [el('p', { className: 'earlier' }, 'Earlier saves'),
        ...earlier.map((c) => el('p', { className: 'save' }, about(c) + ' ', restore(c)))] : []));
  }) : [el('p', { className: 'note' }, 'Your Google Drive has no saves yet. A game you play here puts its saves there.')]));
}

// A sign-in's last step (frontend/save_sync.js): this browser's saves are compared with the Drive's, those of a game the
// Drive has none of go up, and where a game's differ the player picks whose to keep in a popup, the Drive's
// recommended. It closes only by a choice or by Cancel, which signs out, and the token is stored only once the player
// has chosen, so a tab closed before that leaves them signed out.
async function finishSignIn() {
  const pending = signingIn;
  const revoke = () => fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(pending.token),
    { method: 'POST' }).catch(() => {});
  const signedIn = async (local, keep = []) => {
    SaveSync.store({ ...SaveSync.stored(), ...pending });
    signingIn = null;
    for (const id of keep) await SaveSync.settle(local, id);
    await SaveSync.sync(local).catch((error) => console.error('Save sync: could not upload: ' + error.message));
  };
  let local, folders, conflicts, only;
  try {
    ({ saves: local, folders } = await localSaves());
    ({ conflicts, only } = await SaveSync.compare(local, pending.token));
  } catch (error) {
    console.error('Save sync: could not compare the saves: ' + error.message);
    revoke();
    signingIn = null;
    showAccount(`Your Google Drive couldn't be reached (${error.message}), so you aren't signed in.`);
    return;
  }
  if (!conflicts.size) {
    await signedIn(local);
    showAccount();
    return;
  }

  const dialog = document.getElementById('save-choice'), [cancel, keep] = dialog.querySelectorAll('.foot button');
  const lead = dialog.querySelector('.lead'), choices = dialog.querySelector('.choices');
  const name = (id) => gameOf(id, folders)?.name ?? id;
  const n = conflicts.size;
  lead.textContent = `Your Google Drive already has saves for ${n === 1 ? 'a game' : n + ' games'}, and this browser ` +
    `has different ones. Pick one for ${n === 1 ? 'it' : 'each game'} to finish signing in.`;
  // A side of a game's choice: whose, when it was last saved, from which browser and how long it was played.
  const option = (id, mine, side) => {
    const about = [`Last saved ${savedAt(side.time)}`, side.from && (mine ? side.from : 'from ' + side.from),
      side.played !== undefined && 'Played ' + playTime(side.played)].filter(Boolean);
    return el('label', { className: 'option' },
      el('input', { type: 'radio', name: id, value: mine ? 'mine' : 'drive', checked: !mine }),
      el('span', { className: 'side' }, mine ? 'This browser' : 'Your Google Drive',
        ...(mine ? [] : [el('span', { className: 'recommended' }, 'Recommended')])),
      el('span', { className: 'about' }, ...about.flatMap((s) => [el('br'), s]).slice(1)));
  };
  const sections = [...conflicts].map(([id, { mine, theirs }]) => {
    return el('section', {}, gameHeading(gameOf(id, folders), id),
      el('div', { className: 'options' }, option(id, false, theirs), option(id, true, mine)));
  });
  const uploaded = [...only].map(name).sort(), many = uploaded.length > 1;
  const said = many ? uploaded.slice(0, -1).join(', ') + ' and ' + uploaded.at(-1) : uploaded[0];
  choices.replaceChildren(...(uploaded.length ? [el('p', { className: 'uploaded' }, `${said} ${many ? 'have' : 'has'} ` +
    `saves only in this browser, so ${many ? 'they go' : 'it goes'} to your Drive too.`)] : []), ...sections);

  let chosen = false;
  const busy = (on) => { cancel.disabled = keep.disabled = on; };
  const signOut = () => {
    chosen = true;
    revoke();
    SaveSync.store(null);
    signingIn = null;
    dialog.close();
    showAccount();
  };
  cancel.onclick = signOut;
  dialog.oncancel = (event) => event.preventDefault();  // Escape
  dialog.onclose = () => chosen || signOut();  // closed some other way: the browser's own close request
  keep.onclick = async () => {
    busy(true);
    try {
      const mine = (id) => dialog.querySelector(`input[name="${CSS.escape(id)}"][value="mine"]`).checked;
      await signedIn(local, [...conflicts.keys()].filter(mine));
    } catch (error) {
      console.error('Save sync: ' + error.message);
      lead.textContent = `Your choice couldn't be saved to your Drive (${error.message}). Try again, or cancel to ` +
        'sign out.';
      busy(false);
      return;
    }
    chosen = true;
    dialog.close();
    showAccount();
  };
  busy(false);
  dialog.showModal();
}

// The account, at the top bar's right (frontend/save_sync.js): Sign in with Google, or the player's name, which opens a
// menu with Manage saves and Sign out. A note beside it says why a sign-in didn't finish.
let askingUser = false;
function showAccount(note) {
  const box = document.getElementById('account');
  if (!GOOGLE_CLIENT_ID) return;
  box.hidden = false;
  const button = (text, click, props) => {
    const b = el('button', { type: 'button', textContent: text, ...props });
    b.addEventListener('click', click);
    return b;
  };
  const record = SaveSync.stored(), valid = SaveSync.token();
  if (signingIn || !record?.token) {
    box.replaceChildren(...(note ? [el('span', { className: 'note' }, note)] : []), signingIn
      ? el('span', { className: 'note' }, 'Checking your saves…')
      : el('span', { className: 'invite' }, button('Sign in with Google', () => signIn(hub, false), { className: 'link' }),
        ' to sync your saves'));
    return;
  }
  // The player's name, asked for once a sign-in has a token.
  if (valid && !record.user && !askingUser) {
    askingUser = true;
    SaveSync.user().then((user) => {
      SaveSync.store({ ...SaveSync.stored(), user });
      showAccount();
    }).catch((error) => console.error('Save sync: could not read the account\'s name: ' + error.message))
      .finally(() => { askingUser = false; });
  }
  const name = record.user?.name || 'Signed in';
  const menu = el('div', { className: 'menu', role: 'menu', hidden: true },
    el('p', {}, el('strong', {}, name), ...(record.user?.email ? [el('br'), record.user.email] : []),
      ...(valid ? [] : [el('br'), 'Your saves sync again once you sign in again.'])),
    valid ? button('Manage saves', () => { menu.hidden = true; manageSaves(); }, { role: 'menuitem' })
      : button('Sign in again', () => signIn(hub, false), { role: 'menuitem' }),
    button('Sign out', () => {
      fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(record.token), { method: 'POST' })
        .catch(() => {});
      SaveSync.store(null);
      document.getElementById('manage-saves').close();
      showAccount();
    }, { role: 'menuitem' }));
  const who = el('button', { type: 'button', className: 'who', title: name, ariaHasPopup: 'menu', ariaExpanded: 'false' },
    el('span', { className: 'avatar', ariaHidden: 'true' }, name[0].toUpperCase()), el('span', { className: 'name' }, name));
  who.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    who.ariaExpanded = String(!menu.hidden);
  });
  box.replaceChildren(who, menu);
}
// The account's menu closes at a click elsewhere, or Escape.
addEventListener('click', (event) => {
  const box = document.getElementById('account'), menu = box.querySelector('.menu');
  if (menu && !box.contains(event.target)) menu.hidden = true;
});
addEventListener('keydown', (event) => {
  const menu = document.querySelector('#account .menu');
  if (event.key === 'Escape' && menu) menu.hidden = true;
});
// Manage saves closes by its button, Escape, or a click outside it that started outside it too (a drag from its text
// that ends outside leaves it open).
{
  const dialog = document.getElementById('manage-saves');
  const outside = (event) => {
    const r = dialog.getBoundingClientRect();
    return event.target === dialog &&
      (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
  };
  let pressed = false;
  dialog.addEventListener('pointerdown', (event) => { pressed = outside(event); });
  dialog.addEventListener('click', (event) => { if (pressed && outside(event)) dialog.close(); });
  dialog.querySelector('.foot button').addEventListener('click', () => dialog.close());
}

async function main() {
  showAccount();
  // A sign-in is finished once the games are known, which the popup names.
  const listSaves = () => GOOGLE_CLIENT_ID && signingIn && finishSignIn()
    .catch((error) => console.error('Save sync: could not finish the sign-in: ' + error.message));
  const grid = document.getElementById('grid');
  try {
    const response = await fetch(README, { cache: 'no-cache' });
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
    games = parseGames(await response.text());
  } catch (error) {
    grid.replaceChildren(el('p', { className: 'note' }, 'The games table could not be read: ' + error.message));
    listSaves();
    return;
  }
  listSaves();
  const title = (g) => g.name.replace(/^The /, '');
  const sorted = [...games].sort((a, b) => title(a).localeCompare(title(b)));
  grid.replaceChildren(...sorted.map((g, i) => tile(g, i)));
  const game = gameFromHash();
  // Not before coi_serviceworker.js's reload, nor while a sign-in asks whose saves to keep.
  if (game && window.crossOriginIsolated && !signingIn) openGame(game, false);
  else uploadSaves();
}

// What's new: the first few entries of news.html's list, which holds them all, above the grid.
async function showNews() {
  const response = await fetch('news.html', { cache: 'no-cache' });
  if (!response.ok) return;
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const entries = [...page.querySelectorAll('#news li')].slice(0, 3);
  if (!entries.length) return;
  document.querySelector('#news .news').replaceChildren(...entries);
  document.getElementById('news').hidden = false;
}

showNews().catch(() => {});
if (!syncStart()) main();
