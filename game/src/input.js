// Solmar Bay — keyboard, mouse and touch input, unified into one state object.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };
    this.touch = { active: false, moveX: 0, moveY: 0, fire: false, run: false };
    this.pressed = {}; // edge-triggered keys, consumed by the game each frame
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.key.toLowerCase()] = true;
      this.pressed[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  _bindMouse() {
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
      this.mouse.x = e.clientX - this.canvas.getBoundingClientRect().left;
      this.mouse.y = e.clientY - this.canvas.getBoundingClientRect().top;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  _bindTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!stick || !knob) return;
    let stickId = null;
    const setKnob = (dx, dy) => {
      knob.style.left = 38 + dx + 'px';
      knob.style.top = 38 + dy + 'px';
    };
    const update = (t) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      const max = 44;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      setKnob(dx, dy);
      this.touch.moveX = dx / max;
      this.touch.moveY = dy / max;
      this.touch.active = true;
    };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      update(t);
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === stickId) update(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          setKnob(0, 0);
          this.touch.moveX = 0; this.touch.moveY = 0; this.touch.active = false;
        }
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);

    const bindButton = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (up) up(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); down(); });
      el.addEventListener('mouseup', () => { if (up) up(); });
    };
    bindButton('btn-fire', () => { this.touch.fire = true; }, () => { this.touch.fire = false; });
    bindButton('btn-run', () => { this.touch.run = true; }, () => { this.touch.run = false; });
    bindButton('btn-enter', () => { this.pressed['e'] = true; });
    bindButton('btn-swap', () => { this.pressed['q'] = true; });
  }

  // Axis -1..1 for movement (keyboard or stick).
  moveAxis() {
    let x = 0, y = 0;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.touch.active) { x += this.touch.moveX; y += this.touch.moveY; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  get run() { return !!(this.keys['shift'] || this.touch.run); }
  get firing() { return this.mouse.down || this.touch.fire; }

  wasPressed(key) {
    const k = key.toLowerCase();
    if (this.pressed[k]) { this.pressed[k] = false; return true; }
    return false;
  }

  endFrame() { this.pressed = {}; }
}
