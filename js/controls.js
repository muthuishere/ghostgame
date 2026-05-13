/**
 * Input handling for desktop & mobile.
 *
 * Desktop:
 *   - WASD / arrow keys → move
 *   - Mouse pointer lock → look
 *   - Click → fire (if gun)
 *   - E → interact, F → flashlight, Shift → sprint
 *
 * Mobile:
 *   - Left joystick → move
 *   - Right-side drag → look
 *   - Buttons: USE / LIGHT / FIRE
 *
 * We treat tap-to-look-with-drag as the mobile input style (the user asked
 * for "tap to move in mobile" plus a "3D feel" — drag-look is what makes 3D
 * feel right; the joystick handles tap-and-hold movement).
 */

export class Controls {
  constructor(player, callbacks) {
    this.player = player;
    this.callbacks = callbacks;   // { interact, shoot, flashlight, mute }
    this.keys = new Set();
    this.pointerLocked = false;

    this.isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this._bindKeyboard();
    this._bindMouse();
    this._bindMobile();
  }

  /* ----- keyboard ----- */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.callbacks.interact?.();
      if (e.code === 'KeyF') this.callbacks.flashlight?.();
      if (e.code === 'KeyM') this.callbacks.mute?.();
      if (e.code === 'KeyB') this.callbacks.bomb?.();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.player.sprinting = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.player.sprinting = false;
    });
  }

  /* ----- mouse / pointer lock ----- */
  _bindMouse() {
    const canvas = document.getElementById('scene');

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && !this.isTouchDevice) {
        canvas.requestPointerLock?.();
      } else if (this.pointerLocked) {
        this.callbacks.shoot?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      const sens = 0.0022;
      this.player.lookDelta.x += e.movementX * sens;
      this.player.lookDelta.y += e.movementY * sens;
    });
  }

  /* ----- mobile ----- */
  _bindMobile() {
    if (!this.isTouchDevice) return;
    document.getElementById('mobile-controls').classList.remove('hidden');

    this._bindJoystick();
    this._bindLookPad();
    this._bindActionButtons();
  }

  _bindJoystick() {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let active = null;
    const rect = () => joy.getBoundingClientRect();

    const onStart = (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      active = t.identifier;
      onMove(e);
    };
    const onMove = (e) => {
      if (active == null) return;
      const touch = Array.from(e.touches || []).find(t => t.identifier === active);
      if (!touch) return;
      const r = rect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = touch.clientX - cx;
      let dy = touch.clientY - cy;
      const max = r.width / 2 - 8;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // forward = -y, strafe = x (in screen coords)
      const nx = dx / max;
      const ny = -dy / max;
      this.player.moveInput.set(nx, ny);
      this.player.sprinting = Math.hypot(nx, ny) > 0.9;
    };
    const onEnd = (e) => {
      const t = Array.from(e.changedTouches || []).find(t => t.identifier === active);
      if (!t) return;
      active = null;
      knob.style.transform = 'translate(-50%, -50%)';
      this.player.moveInput.set(0, 0);
      this.player.sprinting = false;
    };

    joy.addEventListener('touchstart', onStart, { passive: false });
    joy.addEventListener('touchmove', onMove, { passive: false });
    joy.addEventListener('touchend', onEnd);
    joy.addEventListener('touchcancel', onEnd);
  }

  _bindLookPad() {
    const pad = document.getElementById('look-pad');
    let lastX = 0, lastY = 0, active = null;
    pad.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      active = t.identifier;
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });
    pad.addEventListener('touchmove', (e) => {
      const t = Array.from(e.touches).find(t => t.identifier === active);
      if (!t) return;
      const sens = 0.005;
      this.player.lookDelta.x += (t.clientX - lastX) * sens;
      this.player.lookDelta.y += (t.clientY - lastY) * sens;
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });
    pad.addEventListener('touchend', () => { active = null; });
    pad.addEventListener('touchcancel', () => { active = null; });
  }

  _bindActionButtons() {
    document.getElementById('btn-interact').addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.interact?.();
    });
    document.getElementById('btn-flashlight').addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.flashlight?.();
    });
    document.getElementById('btn-shoot').addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.shoot?.();
    });
  }

  /** Call every frame to translate held keys into move input */
  updateKeyboard() {
    if (this.isTouchDevice) return;        // joystick handles mobile movement
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  my -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    this.player.moveInput.set(mx, my);
  }
}
