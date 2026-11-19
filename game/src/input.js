// Keyboard and mouse: held keys, edge-triggered presses, and camera look
// from pointer lock (with a drag fallback when the pointer is not locked).
// The game polls this once a frame and calls endFrame() when it is done.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.clicked = true;
      if (!this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked || this.mouseDown) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Is the key held down right now? */
  down(code) {
    return this.keys.has(code);
  }

  /** Was the key pressed since the last endFrame()? */
  hit(code) {
    return this.pressed.has(code);
  }

  /** Movement axes in -1..1: x is strafe right, y is forward. */
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    return { x, y };
  }

  /** Take the look delta built up since the last frame (and clear it). */
  takeLook() {
    const out = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  /** Was the left mouse button clicked since the last call? */
  takeClick() {
    const was = this.clicked;
    this.clicked = false;
    return was;
  }

  /** End of frame: forget this frame's edge-triggered presses. */
  endFrame() {
    this.pressed.clear();
  }
}
