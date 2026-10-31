// The on-screen controller a game's page draws over the game on a phone or tablet, which the game reads as a gamepad.
// It is one of the hub's own files (tools/publish_site.sh), at the top of the site, and runs in the game's page only
// where the pointer is a finger: the hub (site/site.js) puts it into the frame a game plays in, whatever the page was
// built from, and a page opened on its own loads it from the site's top itself (frontend/shell.html), once it was
// built with that. So a change here reaches every game with the hub's next publish, and no game's page is built or
// published again for it. A host without it at its top serves pages with no controller, and nothing else changes.
//
// A phone has no keys and no pad, so #pad draws a controller over the game once it has started (Module.gameStarted,
// called by the runtime as the game starts: N64ModernRuntime-web's recomp.cpp; the page notes a start that comes before
// this script, Module.gameRunning, and the hub sets that for a page built before the runtime said, so there it shows
// from the start, over the launcher too), which the game reads as one more gamepad, the way it reads a real one: SDL's on
// Emscripten is the browser's Gamepad API, navigator.getGamepads() sampled at each poll, which then also gives this
// one, as a pad of the standard mapping, which SDL maps itself (its "Standard Gamepad": triggers as buttons 6 and 7).
// So it works for any recomp and its menus, and nothing in the program knows. The buttons are where RecompFrontend's
// defaults take them (input_mapping.cpp): A south, B west, Z the left trigger, R the right, L the left shoulder,
// Start, Back for its menu, the stick the left stick, the C buttons the right stick. It comes and goes as a real pad
// does, with gamepadconnected and gamepaddisconnected, and like one it connects at its first touch, not as it shows:
// SDL takes a pad that is there when it starts as added before the program reads its events, and the program never
// opened it, and the controller can show before SDL starts (the hub's, on a page that doesn't say when its game
// starts). What the game reads moves only as it reads the pad (navigator.getGamepads(), which SDL calls at each poll of
// a pad it has open, then reads the pad from what it returned): the first read after a connect, SDL's own as the
// program opens the pad, sees nothing held, since SDL_JoystickOpen updates a pad before the controller over it is made
// and a button held then is taken as down already, its press never sent (MENU as the first touch opened no menu); and a
// press is read at least once, so a tap that starts and ends between two of a slow phone's polls still reaches the game.
// It sits past the slots a browser gives real pads (Chrome has 8, Firefox none until one connects). Each finger holds
// the control it is on, so the stick and buttons go together, and slides from one button to the next; a touch on them
// never reaches the canvas, nor its mouse events (the pointerdown's default). A real pad connecting unplugs and hides it
// until the last one goes, and #pad-toggle does for a player who doesn't want it, remembered for the site. Everything
// is in a block, out of the program's global names.
if (navigator.getGamepads) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: `
    /* Sized by the screen's height (vmin, in landscape): the stick, L and Z at the left, the C buttons at the right with
       A and B under them and R and a second Z above, all at the sides, where a game's 4:3 or 16:9 picture leaves a
       phone's wider screen bare (the hub's own buttons go to the top's middle on a phone: site/site.css). */
    #pad, #pad-toggle { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none;
                        font: bold 4.5vmin/1 system-ui, sans-serif; }
    #pad { position: fixed; inset: 0; pointer-events: none; }
    #pad[hidden], #pad-toggle[hidden] { display: none; }
    #pad > div { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
                 pointer-events: auto; border: 0.5vmin solid #fff5; border-radius: 50%; background: #fff2; color: #fffb; }
    #pad > div.held { background: #fff6; }
    #pad .stick { left: 5vmin; bottom: 5vmin; width: 42vmin; height: 42vmin; }
    #pad .knob { width: 18vmin; height: 18vmin; border-radius: 50%; background: #fff5; pointer-events: none; }
    #pad .shoulder { top: 3vmin; width: 28vmin; height: 10vmin; border-radius: 4vmin; }
    #pad .z { top: 16vmin; width: 20vmin; }
    #pad .left { left: 3vmin; }
    #pad .right { right: 3vmin; }
    #pad .a { right: 6vmin; bottom: 4vmin; width: 19vmin; height: 19vmin; background: #3a6cff55; }
    #pad .b { right: 27vmin; bottom: 17vmin; width: 19vmin; height: 19vmin; background: #2db45055; }
    #pad .c { width: 12vmin; height: 12vmin; background: #f5c80040; font-size: 3.5vmin; }
    #pad .a.held, #pad .b.held, #pad .c.held { filter: brightness(1.8); }
    #pad .c-up { right: 13vmin; bottom: 54.5vmin; }
    #pad .c-down { right: 13vmin; bottom: 33.5vmin; }
    #pad .c-left { right: 23.5vmin; bottom: 44vmin; }
    #pad .c-right { right: 2.5vmin; bottom: 44vmin; }
    #pad .c-label { position: absolute; right: 16vmin; bottom: 47vmin; width: 6vmin; text-align: center; color: #f5c800aa; }
    #pad .start, #pad .menu { bottom: 3vmin; height: 8vmin; border-radius: 4vmin; font-size: 3.2vmin; }
    #pad .start { left: calc(50% - 9vmin); width: 18vmin; }
    #pad .menu { left: calc(50% - 30vmin); width: 16vmin; }
    #pad-toggle { position: fixed; left: calc(50% + 12vmin); bottom: 3vmin; padding: 2.4vmin 3vmin;
                  border: 0.4vmin solid #fff3; border-radius: 4vmin; background: #0004; color: #fff8; font-size: 3vmin; }
  ` }));
  document.body.insertAdjacentHTML('beforeend', `
    <div id="pad" hidden>
      <div class="stick" data-stick><span class="knob"></span></div>
      <div class="shoulder left" data-button="4">L</div><div class="shoulder z left" data-button="6">Z</div>
      <div class="shoulder right" data-button="7">R</div><div class="shoulder z right" data-button="6">Z</div>
      <div class="c c-up" data-axis="3 -1">▲</div><div class="c c-down" data-axis="3 1">▼</div>
      <div class="c c-left" data-axis="2 -1">◀</div><div class="c c-right" data-axis="2 1">▶</div>
      <span class="c-label">C</span>
      <div class="a" data-button="0">A</div><div class="b" data-button="2">B</div>
      <div class="menu" data-button="8">MENU</div><div class="start" data-button="9">START</div>
    </div>
    <div id="pad-toggle" hidden></div>
  `);
  const getGamepads = navigator.getGamepads.bind(navigator);
  const realPads = () => { try { return Array.from(getGamepads()); } catch { return []; } };  // a frame may forbid them
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const touchPad = { id: 'On-screen controller', index: Math.max(8, realPads().length), connected: false,
                     mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons };
  const wanted = { buttons: new Set(), axes: [0, 0, 0, 0] };  // what the fingers hold now
  const tapped = new Set();  // buttons pressed since the game last read the pad
  let unread = false;  // connected, and not read since
  const read = () => {
    if (unread) { unread = false; return; }
    const pressed = new Set([...wanted.buttons, ...tapped]);
    tapped.clear();
    let moved = false;
    buttons.forEach((b, i) => {
      if (b.pressed === pressed.has(i)) return;
      Object.assign(b, { pressed: !b.pressed, touched: !b.pressed, value: b.pressed ? 0 : 1 });
      moved = true;
    });
    wanted.axes.forEach((value, i) => {
      if (touchPad.axes[i] === value) return;
      touchPad.axes[i] = value;
      moved = true;
    });
    if (moved) touchPad.timestamp = performance.now();  // SDL reads a pad again only when its timestamp moves
  };
  navigator.getGamepads = () => {
    if (touchPad.connected) read();
    return Object.assign(realPads(), touchPad.connected ? { [touchPad.index]: touchPad } : {});
  };
  const plug = (connected) => {
    if (connected === touchPad.connected) return;
    touchPad.connected = connected;
    unread = connected;
    tapped.clear();
    for (const b of buttons) Object.assign(b, { pressed: false, touched: false, value: 0 });
    touchPad.axes.fill(0);
    dispatchEvent(Object.assign(new Event(connected ? 'gamepadconnected' : 'gamepaddisconnected'), { gamepad: touchPad }));
  };
  const pad = document.getElementById('pad');
  const toggle = document.getElementById('pad-toggle');
  const stick = pad.querySelector('.stick');
  const held = new Map();  // pointerId: { control, x, y }
  const update = () => {
    const was = new Set(wanted.buttons);
    wanted.buttons.clear();
    wanted.axes.fill(0);
    let knob = '';
    for (const { control, x, y } of held.values()) {
      if (control === stick) {
        const box = stick.getBoundingClientRect(), radius = box.width / 2;
        let dx = (x - box.left - radius) / radius, dy = (y - box.top - radius) / radius;
        const length = Math.hypot(dx, dy);
        if (length > 1) { dx /= length; dy /= length; }
        wanted.axes[0] = dx;
        wanted.axes[1] = dy;
        knob = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
      } else if (control?.dataset.button) {
        wanted.buttons.add(Number(control.dataset.button));
      } else if (control?.dataset.axis) {
        const [axis, value] = control.dataset.axis.split(' ').map(Number);
        wanted.axes[axis] = value;
      }
    }
    stick.firstElementChild.style.transform = knob;
    const controls = new Set([...held.values()].map((h) => h.control));
    for (const control of pad.children) control.classList.toggle('held', controls.has(control));
    for (const i of wanted.buttons) if (!was.has(i)) tapped.add(i);
  };
  const touch = (e) => {
    const h = held.get(e.pointerId);
    if (e.type === 'pointerdown') {
      e.preventDefault();
      plug(true);
      held.set(e.pointerId, { control: e.target.closest('#pad > div'), x: e.clientX, y: e.clientY });
    } else if (!h) {
      return;
    } else if ((e.type === 'pointerup') || (e.type === 'pointercancel')) {
      held.delete(e.pointerId);
    } else {
      Object.assign(h, { x: e.clientX, y: e.clientY });
      if (h.control !== stick) h.control = document.elementFromPoint(e.clientX, e.clientY)?.closest('#pad > div:not(.stick)');
    }
    update();
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) pad.addEventListener(type, touch);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  let started = false;
  const show = () => {
    const realPad = realPads().some((p) => p?.connected);
    let hidden = false;
    try { hidden = localStorage.getItem('touch-pad') === 'hidden'; } catch {}
    pad.hidden = !started || realPad || hidden;
    toggle.hidden = !started || realPad;
    toggle.textContent = hidden ? 'Show controls' : 'Hide controls';
    if (pad.hidden) { held.clear(); update(); }
    if (pad.hidden) plug(false);
  };
  toggle.addEventListener('click', () => {
    try { localStorage.setItem('touch-pad', pad.hidden ? 'shown' : 'hidden'); } catch {}
    show();
  });
  for (const type of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(type, (e) => (e.gamepad !== touchPad) && show());
  const start = () => { started = true; show(); };
  if (Module.gameRunning) start();
  Module.gameStarted = start;
}
