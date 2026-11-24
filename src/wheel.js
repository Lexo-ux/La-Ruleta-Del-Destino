const POINTER_ANGLE = -Math.PI / 2; // 12 o'clock (top)
const WHEEL_FONT_FAMILY =
  "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif";

export const SLICE_PALETTE = [
  { bg: '#8e2426', text: '#f7edd8' }, // Royal Crimson
  { bg: '#1f4e79', text: '#f7edd8' }, // Knight Sapphire
  { bg: '#d4a238', text: '#1c1208' }, // Burnished Gold
  { bg: '#275d38', text: '#f7edd8' }, // Sherwood Emerald
  { bg: '#5d346b', text: '#f7edd8' }, // Imperial Plum
  { bg: '#b55422', text: '#f7edd8' }, // Copper Amber
  { bg: '#d9c398', text: '#1c1208' }, // Aged Parchment
  { bg: '#1f6363', text: '#f7edd8' }, // Verdigris Teal
  { bg: '#6b3b24', text: '#f7edd8' }, // Chestnut Oak
  { bg: '#9e7b22', text: '#1c1208' }, // Antique Brass
];

export function normalizeAngle(rad) {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

/**
 * Returns a slice palette entry guaranteeing adjacent slices (including last->first)
 * never share the same background color.
 */
export function getSlicePalette(index, total) {
  const len = SLICE_PALETTE.length;
  if (total > 2 && index === total - 1 && index % len === 0) {
    return SLICE_PALETTE[4];
  }
  return SLICE_PALETTE[index % len];
}

/**
 * Computes exact winner index under the top pointer (-PI/2) for a wheel at `angle`.
 */
export function getWinnerIndex(angle, count) {
  if (!count || count <= 0) return -1;
  const sliceArc = (Math.PI * 2) / count;
  const relative = normalizeAngle(POINTER_ANGLE - angle);
  return Math.floor(relative / sliceArc) % count;
}

function secureRandomUnit() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

function easeOutQuartic(t) {
  return 1 - Math.pow(1 - t, 4.3);
}

export class RouletteWheel {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTick = callbacks.onTick || (() => {});
    this.onComplete = callbacks.onComplete || (() => {});
    this.onCenterClick = callbacks.onCenterClick || (() => {});

    this.options = [];
    this.angle = 0;
    this.logicalSize = 360;
    this.dpr = 1;

    this.isSpinning = false;
    this.spinStartTime = 0;
    this.spinDuration = 5200;
    this.startAngle = 0;
    this.targetAngle = 0;
    this.lastUnwrappedSlice = null;

    // Top pointer spring physics
    this.pointerAngle = 0;
    this.pointerVelocity = 0;
    this.isHoveringHub = false;

    this.rafId = null;
    this.lastFrameTime = 0;

    this.animate = this.animate.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleClick = this.handleClick.bind(this);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', () => {
      if (this.isHoveringHub) {
        this.isHoveringHub = false;
        this.canvas.style.cursor = 'default';
        this.draw();
      }
    });
    this.canvas.addEventListener('click', this.handleClick);
  }

  setOptions(options) {
    this.options = [...options];
    if (!this.isSpinning) {
      this.draw();
    }
  }

  resize(size) {
    const clampedSize = Math.max(120, Math.floor(size));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.logicalSize = clampedSize;
    this.dpr = dpr;

    this.canvas.width = Math.round(clampedSize * dpr);
    this.canvas.height = Math.round(clampedSize * dpr);
    this.canvas.style.width = `${clampedSize}px`;
    this.canvas.style.height = `${clampedSize}px`;

    this.draw();
  }

  getGeometry() {
    const size = this.logicalSize;
    const cx = size / 2;
    const topSpace = Math.max(14, size * 0.055);
    const cy = size / 2 + topSpace * 0.32;
    const maxR = Math.min(cx - 8, size - cy - 8, cy - topSpace * 0.72);
    const outerRimR = Math.max(44, maxR);
    const rimThickness = Math.max(6, outerRimR * 0.055);
    const wheelR = outerRimR - rimThickness;
    const hubR = Math.max(18, wheelR * 0.175);

    return { size, cx, cy, outerRimR, rimThickness, wheelR, hubR };
  }

  isPointInHub(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { cx, cy, hubR } = this.getGeometry();
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= hubR * hubR;
  }

  handlePointerMove(e) {
    const canSpin = !this.isSpinning && this.options.length >= 2;
    const overHub = canSpin && this.isPointInHub(e.clientX, e.clientY);
    if (overHub !== this.isHoveringHub) {
      this.isHoveringHub = overHub;
      this.canvas.style.cursor = overHub ? 'pointer' : 'default';
      if (!this.isSpinning) this.draw();
    }
  }

  handleClick(e) {
    if (!this.isSpinning && this.options.length >= 2 && this.isPointInHub(e.clientX, e.clientY)) {
      this.onCenterClick();
    }
  }

  setAngle(angle) {
    if (this.isSpinning || typeof angle !== 'number' || !Number.isFinite(angle)) return;
    this.angle = angle;
    this.draw();
  }

  startSyncedSpin({ startRotation, targetRotation, duration, elapsedMs = 0, winner = null }) {
    if (this.options.length < 2) return false;

    const count = this.options.length;
    const sliceArc = (Math.PI * 2) / count;
    const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
    const now = performance.now();

    this.startAngle = startRotation;
    this.targetAngle = targetRotation;
    this.spinDuration = Math.max(100, duration);
    this.spinStartTime = now - safeElapsed;
    this.lastFrameTime = now;
    this.pendingWinner = winner;

    const initialT = Math.min(1, safeElapsed / this.spinDuration);
    this.angle = this.startAngle + (this.targetAngle - this.startAngle) * easeOutQuartic(initialT);
    this.isSpinning = true;
    this.isHoveringHub = false;
    this.canvas.style.cursor = 'default';
    this.lastUnwrappedSlice = Math.floor((POINTER_ANGLE - this.angle) / sliceArc);

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.animate);
    return true;
  }

  spin() {
    if (this.isSpinning || this.options.length < 2) return false;

    const count = this.options.length;
    const sliceArc = (Math.PI * 2) / count;

    // Pick a strictly uniform winner slice & safe interior position away from divider pins
    const chosenIndex = Math.floor(secureRandomUnit() * count);
    const intraFraction = 0.1 + secureRandomUnit() * 0.8;

    const desiredMod = normalizeAngle(
      POINTER_ANGLE - (chosenIndex + intraFraction) * sliceArc
    );
    const currentMod = normalizeAngle(this.angle);
    const forwardDiff = normalizeAngle(desiredMod - currentMod);
    const extraTurns = 6 + Math.floor(secureRandomUnit() * 4);

    this.startAngle = this.angle;
    this.targetAngle = this.angle + extraTurns * Math.PI * 2 + forwardDiff;
    this.spinDuration = 4800 + Math.floor(secureRandomUnit() * 900);
    this.spinStartTime = performance.now();
    this.lastFrameTime = this.spinStartTime;
    this.pendingWinner = null;
    this.isSpinning = true;
    this.isHoveringHub = false;
    this.canvas.style.cursor = 'default';
    this.lastUnwrappedSlice = Math.floor((POINTER_ANGLE - this.angle) / sliceArc);

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.animate);
    return true;
  }

  animate(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    const count = this.options.length;
    const sliceArc = count > 0 ? (Math.PI * 2) / count : Math.PI * 2;

    if (this.isSpinning) {
      const elapsed = now - this.spinStartTime;
      const t = Math.min(1, elapsed / this.spinDuration);
      const eased = easeOutQuartic(t);

      this.angle = this.startAngle + (this.targetAngle - this.startAngle) * eased;

      // Detect divider crossings under the top pointer
      const currentUnwrapped = Math.floor((POINTER_ANGLE - this.angle) / sliceArc);
      if (currentUnwrapped !== this.lastUnwrappedSlice) {
        this.lastUnwrappedSlice = currentUnwrapped;
        const speedRatio = Math.pow(1 - t, 2.2);
        this.onTick(speedRatio);

        // Deflect pointer tip to the right (+X) as clockwise wheel pegs push past 12 o'clock
        const kick = -(0.28 + 0.22 * speedRatio);
        this.pointerAngle = Math.min(this.pointerAngle, kick);
        this.pointerVelocity = -3.8 - 4.5 * speedRatio;
      }

      if (t >= 1) {
        this.angle = this.targetAngle;
        this.isSpinning = false;
        const winnerIdx = getWinnerIndex(this.angle, count);
        const palette = getSlicePalette(winnerIdx, count);
        const resolvedWinner = this.pendingWinner || {
          index: winnerIdx,
          label: this.options[winnerIdx],
          color: palette.bg,
        };
        this.pendingWinner = null;
        this.onComplete(resolvedWinner);
      }
    }

    // Damped spring physics for the pointer
    const springK = 220;
    const damping = 20;
    const accel = -springK * this.pointerAngle - damping * this.pointerVelocity;
    this.pointerVelocity += accel * dt;
    this.pointerAngle += this.pointerVelocity * dt;
    this.pointerAngle = Math.max(-0.62, Math.min(0.24, this.pointerAngle));

    this.draw();

    const pointerSettled =
      Math.abs(this.pointerAngle) < 0.003 && Math.abs(this.pointerVelocity) < 0.02;

    if (this.isSpinning || !pointerSettled) {
      this.rafId = requestAnimationFrame(this.animate);
    } else {
      this.pointerAngle = 0;
      this.pointerVelocity = 0;
      this.rafId = null;
      this.draw();
    }
  }

  fitLabel(ctx, text, maxWidth, baseFontSize) {
    let fontSize = baseFontSize;
    const minFont = Math.max(5.5, baseFontSize * 0.48);

    ctx.font = `700 ${fontSize}px ${WHEEL_FONT_FAMILY}`;
    while (ctx.measureText(text).width > maxWidth && fontSize > minFont) {
      fontSize -= 0.5;
      ctx.font = `700 ${fontSize}px ${WHEEL_FONT_FAMILY}`;
    }

    if (ctx.measureText(text).width <= maxWidth) {
      return { text, fontSize };
    }

    let trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return { text: `${trimmed}…`, fontSize };
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    const { size, cx, cy, outerRimR, rimThickness, wheelR, hubR } = this.getGeometry();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Outer ambient shadow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + 5, outerRimR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 3, 1, 0.58)';
    ctx.filter = 'blur(9px)';
    ctx.fill();
    ctx.restore();

    // Carved dark oak outer rim with turned wood gradient
    ctx.save();
    const oakGrad = ctx.createRadialGradient(
      cx - outerRimR * 0.2,
      cy - outerRimR * 0.2,
      wheelR * 0.85,
      cx,
      cy,
      outerRimR
    );
    oakGrad.addColorStop(0, '#5a3a21');
    oakGrad.addColorStop(0.55, '#3b2413');
    oakGrad.addColorStop(1, '#201208');

    ctx.beginPath();
    ctx.arc(cx, cy, outerRimR, 0, Math.PI * 2);
    ctx.fillStyle = oakGrad;
    ctx.fill();

    // Outer burnished gold trim ring
    const outerGoldGrad = ctx.createLinearGradient(
      cx - outerRimR,
      cy - outerRimR,
      cx + outerRimR,
      cy + outerRimR
    );
    outerGoldGrad.addColorStop(0, '#f7e094');
    outerGoldGrad.addColorStop(0.35, '#c5922b');
    outerGoldGrad.addColorStop(0.7, '#7c5514');
    outerGoldGrad.addColorStop(1, '#e8c468');
    ctx.lineWidth = Math.max(2, rimThickness * 0.16);
    ctx.strokeStyle = outerGoldGrad;
    ctx.stroke();

    // Subtle concentric wood lathe groove on oak rim
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR + rimThickness * 0.45, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(15, 8, 3, 0.48)';
    ctx.stroke();

    // Inner gold bezel ring framing the painted slices
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1b1109';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, rimThickness * 0.14);
    ctx.strokeStyle = '#c89832';
    ctx.stroke();
    ctx.restore();

    const count = this.options.length;

    if (count === 0) {
      // Empty oak disc
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
      ctx.fillStyle = '#291c12';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#8c651c';
      ctx.stroke();

      ctx.fillStyle = '#c8b79b';
      ctx.font = `700 14px ${WHEEL_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Agrega opciones para girar', cx, cy + hubR + 26);
      ctx.restore();
    } else {
      const sliceArc = (Math.PI * 2) / count;

      // Draw painted oak slices
      for (let i = 0; i < count; i++) {
        const start = this.angle + i * sliceArc;
        const end = start + sliceArc;
        const palette = getSlicePalette(i, count);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, wheelR, start, end);
        ctx.closePath();
        ctx.fillStyle = palette.bg;
        ctx.fill();

        // Carved dark & gilded seam between wedges
        if (count > 1) {
          ctx.lineWidth = count > 24 ? 1 : 2;
          ctx.strokeStyle = 'rgba(20, 11, 5, 0.65)';
          ctx.stroke();

          if (count <= 28) {
            ctx.lineWidth = 0.75;
            ctx.strokeStyle = 'rgba(245, 215, 127, 0.3)';
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Wood grain lathe rings & warm lacquered varnish shading
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
      ctx.clip();

      const varnishGrad = ctx.createRadialGradient(
        cx - wheelR * 0.15,
        cy - wheelR * 0.15,
        hubR,
        cx,
        cy,
        wheelR
      );
      varnishGrad.addColorStop(0, 'rgba(20, 10, 4, 0.28)');
      varnishGrad.addColorStop(0.45, 'rgba(255, 232, 180, 0.08)');
      varnishGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.04)');
      varnishGrad.addColorStop(1, 'rgba(18, 9, 3, 0.34)');
      ctx.fillStyle = varnishGrad;
      ctx.fillRect(cx - wheelR, cy - wheelR, wheelR * 2, wheelR * 2);

      // Subtle concentric wood grain lines rotating with the wheel
      [0.42, 0.64, 0.81].forEach((ratio, idx) => {
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          wheelR * ratio,
          this.angle + idx * 0.7,
          this.angle + idx * 0.7 + Math.PI * 1.65
        );
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(24, 12, 4, 0.12)';
        ctx.stroke();
      });
      ctx.restore();

      // Draw auto-fitted slice labels with clearance from hub and pointer tip
      const pointerLen = Math.max(12, outerRimR * 0.16);
      const pointerOverlap = Math.max(0, pointerLen - rimThickness - 2);
      const outerTextR = Math.min(
        wheelR * (count > 28 ? 0.92 : 0.87),
        wheelR - pointerOverlap * 0.85
      );
      const innerTextR = hubR + Math.max(8, wheelR * 0.08);
      const maxTextWidth = Math.max(20, outerTextR - innerTextR);

      const chordCheckR = innerTextR + maxTextWidth * 0.42;
      const chordHeight =
        count === 1 ? wheelR * 0.25 : 2 * chordCheckR * Math.sin(sliceArc / 2);
      const maxFontByChord = chordHeight * 0.62;
      const maxFontByWheel = wheelR * 0.095;
      const baseFontSize = Math.max(6.5, Math.min(18, maxFontByWheel, maxFontByChord));

      for (let i = 0; i < count; i++) {
        const midAngle = this.angle + (i + 0.5) * sliceArc;
        const normMid = normalizeAngle(midAngle);
        const isLeftHalf = normMid > Math.PI / 2 && normMid < (Math.PI * 3) / 2;
        const palette = getSlicePalette(i, count);

        ctx.save();
        ctx.translate(cx, cy);

        if (isLeftHalf) {
          ctx.rotate(midAngle + Math.PI);
          ctx.textAlign = 'left';
        } else {
          ctx.rotate(midAngle);
          ctx.textAlign = 'right';
        }

        ctx.textBaseline = 'middle';
        const { text, fontSize } = this.fitLabel(
          ctx,
          this.options[i],
          maxTextWidth,
          baseFontSize
        );
        ctx.font = `700 ${fontSize}px ${WHEEL_FONT_FAMILY}`;

        if (palette.text !== '#1c1208') {
          ctx.shadowColor = 'rgba(12, 6, 2, 0.72)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
        }

        ctx.fillStyle = palette.text;
        const xPos = isLeftHalf ? -outerTextR : outerTextR;
        ctx.fillText(text, xPos, 0);
        ctx.restore();
      }

      // Draw polished golden brass studs along the oak rim
      if (count > 1) {
        const pegR = Math.max(
          2,
          Math.min(4.2, (rimThickness * 0.3 * 14) / Math.max(14, count * 0.7))
        );
        const pegDist = wheelR + rimThickness * 0.48;
        for (let i = 0; i < count; i++) {
          const pegAngle = this.angle + i * sliceArc;
          const px = cx + Math.cos(pegAngle) * pegDist;
          const py = cy + Math.sin(pegAngle) * pegDist;

          ctx.save();
          const pegGrad = ctx.createRadialGradient(
            px - pegR * 0.3,
            py - pegR * 0.3,
            pegR * 0.1,
            px,
            py,
            pegR
          );
          pegGrad.addColorStop(0, '#fff5c8');
          pegGrad.addColorStop(0.55, '#d4a843');
          pegGrad.addColorStop(1, '#68470f');

          ctx.beginPath();
          ctx.arc(px, py, pegR, 0, Math.PI * 2);
          ctx.fillStyle = pegGrad;
          ctx.fill();
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = '#140c06';
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Ornate Carved Oak & Gilded Gold Center Medallion
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, hubR + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#160e08';
    ctx.fill();

    const hubGrad = ctx.createRadialGradient(
      cx - hubR * 0.25,
      cy - hubR * 0.25,
      hubR * 0.1,
      cx,
      cy,
      hubR
    );
    if (this.isHoveringHub) {
      hubGrad.addColorStop(0, '#5a3a1e');
      hubGrad.addColorStop(1, '#2b1a0d');
    } else {
      hubGrad.addColorStop(0, '#3e2715');
      hubGrad.addColorStop(1, '#1d1108');
    }

    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    const hubGoldGrad = ctx.createLinearGradient(
      cx - hubR,
      cy - hubR,
      cx + hubR,
      cy + hubR
    );
    if (this.options.length >= 2 && !this.isSpinning) {
      hubGoldGrad.addColorStop(0, '#fae49c');
      hubGoldGrad.addColorStop(0.5, '#c8942a');
      hubGoldGrad.addColorStop(1, '#7a5413');
    } else {
      hubGoldGrad.addColorStop(0, '#7e6a46');
      hubGoldGrad.addColorStop(1, '#4a3d28');
    }
    ctx.lineWidth = Math.max(2.2, hubR * 0.1);
    ctx.strokeStyle = hubGoldGrad;
    ctx.stroke();

    // Inner hairline gold ring inside center boss
    ctx.beginPath();
    ctx.arc(cx, cy, hubR * 0.82, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(245, 215, 127, 0.32)';
    ctx.stroke();

    ctx.fillStyle =
      this.options.length >= 2 && !this.isSpinning ? '#f5d77f' : '#9c8b70';
    const hubFontSize = Math.max(8.5, Math.min(13, hubR * 0.34));
    ctx.font = `700 ${hubFontSize}px ${WHEEL_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 2;
    ctx.fillText(this.isSpinning ? '•••' : 'GIRAR', cx, cy + 0.5);
    ctx.restore();

    // Top pointer (forged golden crest hinged above 12 o'clock)
    this.drawPointer(ctx, cx, cy, outerRimR, rimThickness);
  }

  drawPointer(ctx, cx, cy, outerRimR, rimThickness) {
    const pivotY = cy - outerRimR - Math.max(2, rimThickness * 0.22);
    const pointerLen = Math.max(12, outerRimR * 0.16);
    const pointerHalfW = Math.max(5.5, pointerLen * 0.44);

    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(this.pointerAngle);

    // Drop shadow
    ctx.save();
    ctx.translate(0, 2.5);
    ctx.beginPath();
    ctx.moveTo(0, pointerLen);
    ctx.lineTo(-pointerHalfW, 2);
    ctx.arc(0, 2, pointerHalfW, Math.PI, 0, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 4, 2, 0.6)';
    ctx.fill();
    ctx.restore();

    // Sculpted gilded spearhead pointer
    const ptrGrad = ctx.createLinearGradient(-pointerHalfW, 0, pointerHalfW, pointerLen);
    ptrGrad.addColorStop(0, '#fff2b8');
    ptrGrad.addColorStop(0.45, '#d4a843');
    ptrGrad.addColorStop(1, '#825711');

    ctx.beginPath();
    ctx.moveTo(0, pointerLen);
    ctx.lineTo(-pointerHalfW, 2);
    ctx.arc(0, 2, pointerHalfW, Math.PI, 0, false);
    ctx.closePath();
    ctx.fillStyle = ptrGrad;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#180f08';
    ctx.stroke();

    // Center ridge gleam
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, pointerLen - 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 248, 215, 0.55)';
    ctx.stroke();

    // Brass pivot rivet with crimson jewel core
    ctx.beginPath();
    ctx.arc(0, 2, Math.max(3.5, pointerHalfW * 0.34), 0, Math.PI * 2);
    ctx.fillStyle = '#24160b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 2, Math.max(1.8, pointerHalfW * 0.17), 0, Math.PI * 2);
    ctx.fillStyle = '#c83e3b';
    ctx.fill();

    ctx.restore();
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }
}
