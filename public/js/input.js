class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.moveX = 0;
    this.moveY = 0;
    this.turretAngle = 0;
    this.mouseX = 0;
    this.mouseY = 0;

    // One-shot fire queue
    this._fireQueued = false;

    // Virtual joystick (left side)
    this.joystickActive = false;
    this.joystickStartX = 0;
    this.joystickStartY = 0;
    this.joystickX = 0;
    this.joystickY = 0;
    this.joystickTouchId = null;

    // Right side dial: hold+drag = aim, tap = fire
    this.dialTouchId = null;
    this.dialCenterX = 0;
    this.dialCenterY = 0;
    this.dialCurrentX = 0;
    this.dialCurrentY = 0;
    this.dialActive = false;
    this.dialAiming = false;  // dragged past dead zone → aiming mode
    this.dialTouchStart = 0;  // timestamp of touch start

    // Dial visual position
    this.dialScreenX = 0;
    this.dialScreenY = 0;
    this.dialOuterRadius = 70;
    this.dialDeadZone = 12;
    this.tapThreshold = 200; // ms - shorter than this = tap (fire)

    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._initKeyboard();
    this._initMouse();
    if (this.isMobile) {
      this._initTouch();
    }
  }

  _updateDialPos() {
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const ox = window.visualViewport ? window.visualViewport.offsetLeft : 0;
    const oy = window.visualViewport ? window.visualViewport.offsetTop : 0;
    this.dialScreenX = ox + vw - 100;
    this.dialScreenY = oy + vh - 110;
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        e.preventDefault();
        this._fireQueued = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  _initMouse() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    this.canvas.addEventListener('click', (e) => {
      if (e.button === 0) this._fireQueued = true;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _isGameActive() {
    return this.canvas.style.display !== 'none' &&
           document.getElementById('overlay').style.display === 'none';
  }

  _initTouch() {
    document.addEventListener('touchstart', (e) => {
      if (!this._isGameActive()) return;
      e.preventDefault();
      this._updateDialPos();

      for (const touch of e.changedTouches) {
        const x = touch.clientX;
        const y = touch.clientY;
        const screenW = window.innerWidth;

        // Right side → fire dial
        if (x > screenW * 0.5 && this.dialTouchId === null) {
          this.dialTouchId = touch.identifier;
          this.dialActive = true;
          this.dialAiming = false;
          this.dialCenterX = x;
          this.dialCenterY = y;
          this.dialCurrentX = x;
          this.dialCurrentY = y;
          this.dialTouchStart = Date.now();
          continue;
        }

        // Left side → joystick
        if (x <= screenW * 0.5 && this.joystickTouchId === null) {
          this.joystickActive = true;
          this.joystickStartX = x;
          this.joystickStartY = y;
          this.joystickX = x;
          this.joystickY = y;
          this.joystickTouchId = touch.identifier;
        }
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!this._isGameActive()) return;
      e.preventDefault();

      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joystickTouchId) {
          this.joystickX = touch.clientX;
          this.joystickY = touch.clientY;
        } else if (touch.identifier === this.dialTouchId) {
          this.dialCurrentX = touch.clientX;
          this.dialCurrentY = touch.clientY;
          const dx = this.dialCurrentX - this.dialCenterX;
          const dy = this.dialCurrentY - this.dialCenterY;
          if (dx * dx + dy * dy > this.dialDeadZone * this.dialDeadZone) {
            this.dialAiming = true;
          }
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joystickTouchId) {
          this.joystickActive = false;
          this.joystickTouchId = null;
        } else if (touch.identifier === this.dialTouchId) {
          // Tap (short + no drag) = fire
          const elapsed = Date.now() - this.dialTouchStart;
          if (!this.dialAiming || elapsed < this.tapThreshold) {
            this._fireQueued = true;
          }
          // Long hold+drag = aim only, no fire on release
          this.dialTouchId = null;
          this.dialActive = false;
          this.dialAiming = false;
        }
      }
    };

    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);
  }

  update(playerTank, scaleX, scaleY) {
    if (!this.isMobile) {
      this.moveX = 0;
      this.moveY = 0;
      if (this.keys['w'] || this.keys['arrowup']) this.moveY = -1;
      if (this.keys['s'] || this.keys['arrowdown']) this.moveY = 1;
      if (this.keys['a'] || this.keys['arrowleft']) this.moveX = -1;
      if (this.keys['d'] || this.keys['arrowright']) this.moveX = 1;

      if (playerTank) {
        const worldMouseX = this.mouseX / scaleX;
        const worldMouseY = this.mouseY / scaleY;
        this.turretAngle = Math.atan2(worldMouseY - playerTank.y, worldMouseX - playerTank.x);
      }
    } else {
      if (this.joystickActive) {
        const dx = this.joystickX - this.joystickStartX;
        const dy = this.joystickY - this.joystickStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 60;
        if (dist > 5) {
          this.moveX = Math.max(-1, Math.min(1, dx / maxDist));
          this.moveY = Math.max(-1, Math.min(1, dy / maxDist));
        } else {
          this.moveX = 0;
          this.moveY = 0;
        }
      } else {
        this.moveX = 0;
        this.moveY = 0;
      }

      // Hold+drag adjusts turret direction
      if (this.dialActive && this.dialAiming) {
        const dx = this.dialCurrentX - this.dialCenterX;
        const dy = this.dialCurrentY - this.dialCenterY;
        this.turretAngle = Math.atan2(dy, dx);
      }
    }
  }

  getInput() {
    const fire = this._fireQueued;
    this._fireQueued = false;
    return {
      moveX: this.moveX,
      moveY: this.moveY,
      turretAngle: this.turretAngle,
      firing: fire,
    };
  }

  drawControls(ctx) {
    if (!this.isMobile) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const rect = this.canvas.getBoundingClientRect();
    const toCanvasX = (sx) => (sx - rect.left) / rect.width * w;
    const toCanvasY = (sy) => (sy - rect.top) / rect.height * h;

    ctx.save();

    // ── Left joystick ──
    if (this.joystickActive) {
      const baseX = toCanvasX(this.joystickStartX);
      const baseY = toCanvasY(this.joystickStartY);
      const knobX = toCanvasX(this.joystickX);
      const knobY = toCanvasY(this.joystickY);

      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(baseX, baseY, 55, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Right fire dial ──
    this._updateDialPos();
    const cx = toCanvasX(this.dialScreenX);
    const cy = toCanvasY(this.dialScreenY);
    const outerR = this.dialOuterRadius;

    // Outer ring
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks
    ctx.globalAlpha = 0.15;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const ix = cx + Math.cos(a) * (outerR - 8);
      const iy = cy + Math.sin(a) * (outerR - 8);
      const ox = cx + Math.cos(a) * (outerR + 2);
      const oy = cy + Math.sin(a) * (outerR + 2);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }

    if (this.dialActive) {
      // Glow background
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      if (this.dialAiming) {
        // Direction indicator
        const dx = this.dialCurrentX - this.dialCenterX;
        const dy = this.dialCurrentY - this.dialCenterY;
        const angle = Math.atan2(dy, dx);
        const tipX = cx + Math.cos(angle) * (outerR - 5);
        const tipY = cy + Math.sin(angle) * (outerR - 5);

        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Arrow
        const as = 10;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(angle - 0.4) * as, tipY - Math.sin(angle - 0.4) * as);
        ctx.lineTo(tipX - Math.cos(angle + 0.4) * as, tipY - Math.sin(angle + 0.4) * as);
        ctx.closePath();
        ctx.fill();

        // Knob
        const dCx = toCanvasX(this.dialCenterX);
        const dCy = toCanvasY(this.dialCenterY);
        const dKx = toCanvasX(this.dialCurrentX);
        const dKy = toCanvasY(this.dialCurrentY);
        const dist = Math.sqrt((dKx - dCx) ** 2 + (dKy - dCy) ** 2);
        const clampDist = Math.min(dist, outerR - 10);
        const knobX = cx + Math.cos(angle) * clampDist;
        const knobY = cy + Math.sin(angle) * clampDist;

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(knobX, knobY, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center label
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.dialAiming ? 'AIM' : 'FIRE', cx, cy);
    } else {
      // Idle
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIRE', cx, cy);
    }

    ctx.restore();
  }
}
