// Reads the Games table from main's README.md and draws a tile a game; Play opens the game's page in a frame, or goes
// to it in this tab where a frame can't play it (below: a page on another origin, or this page not cross-origin
// isolated because the browser refused its coi_serviceworker.js), never in a new tab: Back returns to the grid.
//
// The frame: every game's page is a folder beside this one in the hub (tools/publish_site.sh), so it can play here,
// but threads need it cross-origin isolated, and a frame is only that inside a page that is (this one, by its
// coi_serviceworker.js). A game's page gets its headers from its own coi_serviceworker.js, which on a first visit
// registers and then reloads it; inside this page that first load has no headers yet, so the frame would be refused.
// So Play registers the game's worker for its folder first, and the frame's first load is already isolated.
'use strict';

// Served locally (tools/serve_site.mjs), the checkout's own README.md, so a change to the table shows before it lands.
const README = location.hostname === 'localhost' ? 'README.md'
  : 'https://raw.githubusercontent.com/n64hub/N64Recomp-browser/main/README.md';

// The table's columns, found by their headers: Game, Recomp (the upstream recomp, "[name](url) by owner"), Repo,
// Page; the frame rates and Played aren't shown (the page's header says how the games play).
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
    games.push({
      name: col(/^Game$/), recomp: col(/^Recomp$/), repoName: repo.replace(/^\[(.*?)\].*$/, '$1'), repo: link(repo),
      page: localPage(link(col(/^Page$/))),
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

// History: opening a game from the grid adds one entry (#<repo>), and Back or ✕ goes back to the grid. The frame is
// only ever navigated with location.replace, since a frame's own navigations join the page's history, and Back then
// stepped through the games played before.
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
  if (push) {
    landscape();
    history.pushState({ game: game.repoName }, '', '#' + encodeURIComponent(game.repoName));
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
  showFrame('about:blank');  // ends the game: its threads and sound go with the document
  player.hidden = true;
  document.body.classList.remove('playing');
}

function closeGame() {
  if (history.state?.game) {
    history.back();  // popstate hides it
  } else {  // opened from a link to #<repo>: nothing of ours to go back to
    hideGame();
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function gameFromHash() {
  const wanted = decodeURIComponent(location.hash.slice(1));
  return games.find((g) => g.repoName === wanted);
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

async function main() {
  const grid = document.getElementById('grid');
  try {
    const response = await fetch(README, { cache: 'no-cache' });
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
    games = parseGames(await response.text());
  } catch (error) {
    grid.replaceChildren(el('p', { className: 'note' }, 'The games table could not be read: ' + error.message));
    return;
  }
  const title = (g) => g.name.replace(/^The /, '');
  const sorted = [...games].sort((a, b) => title(a).localeCompare(title(b)));
  grid.replaceChildren(...sorted.map((g, i) => tile(g, i)));
  const game = gameFromHash();
  if (game && window.crossOriginIsolated) openGame(game, false);  // not before coi_serviceworker.js's reload
}

main();
