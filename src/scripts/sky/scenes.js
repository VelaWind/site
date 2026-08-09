/**
 * The card scenes: one small live drawing per project, showing the thing the
 * project actually is rather than a coloured rectangle.
 *
 * Every scene is a pure function of (ctx, w, h, t, hot) with no state of its
 * own, so it cannot leak between cards and Node can call it against a stub
 * context in the tests. Colour is the caller's job: the driver sets fillStyle
 * and strokeStyle to the card's own accent before calling, and a scene may
 * only modulate globalAlpha — that keeps the palette in the stylesheet, where
 * it lives, instead of a second copy here.
 *
 * `t` is seconds; `hot` is 0 or 1 and roughly doubles the pace when the card
 * is hovered or focused.
 */

/**
 * Kepler's equation, two fixed-point iterations then the true anomaly. Two
 * passes is visually indistinguishable from convergence at e = 0.5 and keeps
 * the scene a handful of flops.
 */
function trueAnomaly(meanAnomaly, e) {
  let E = meanAnomaly;
  E = meanAnomaly + e * Math.sin(E);
  E = meanAnomaly + e * Math.sin(E);
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/**
 * Lodestar: bodies on Kepler orbits around a fixed star.
 *
 * The star is at the FOCUS of each ellipse, not the centre, and the bodies
 * run faster near it — deliberately. Lodestar's Kepler module exists to teach
 * why the star sits off-centre, so a card that drew centred circles would be
 * the exact misconception the project corrects, on the project's own card.
 * What never moves is the star itself: that is the whole idea of a lodestar.
 */
export function lodestar(ctx, w, h, t, hot) {
  const fx = w * 0.44;
  const fy = h * 0.52;
  const unit = Math.min(w, h);
  const e = 0.5;
  const rate = (hot ? 2 : 1) * 0.55;

  // The star. A dot and a quiet halo; the one fixed thing in the frame.
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(fx, fy, Math.max(1.5, unit * 0.02), 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 3; i += 1) {
    const a = unit * (0.16 + 0.11 * i);
    const b = a * Math.sqrt(1 - e * e);
    // The ellipse's centre sits a·e from the focus, along the major axis.
    const cx = fx - a * e;

    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, fy, a, b, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Kepler's third law, loosely: outer bodies run slower by a^1.5.
    const M = (t * rate) / (0.4 + 0.6 * i) + i * 2.1;
    const th = trueAnomaly(M, e);
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(fx + r * Math.cos(th), fy + r * Math.sin(th) * (b / a), Math.max(1, unit * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Vela Sea: layered swells and a small sail crossing them, riding the front
 * layer's actual height and slope. The game itself is a top-down chart, so
 * this is the subject rather than a screenshot of the interface — the sea and
 * the vessel on it are what the simulation simulates.
 */
export function velaSea(ctx, w, h, t, hot) {
  const speed = (hot ? 2 : 1) * 1;
  const surfaceAt = (x, layer) => {
    const base = h * (0.52 + 0.16 * layer);
    return (
      base +
      Math.sin(x * 0.02 + t * speed * (0.7 + 0.2 * layer)) * h * 0.035 +
      Math.sin(x * 0.007 - t * speed * 0.45 + layer * 2) * h * 0.05
    );
  };

  for (let layer = 2; layer >= 0; layer -= 1) {
    ctx.globalAlpha = 0.16 + 0.14 * (2 - layer);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = surfaceAt(x, layer);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // The sail, crossing at the front layer's height, heeled to its slope.
  const sx = ((t * speed * w * 0.06) % (w + 60)) - 30;
  const sy = surfaceAt(sx, 0);
  const slope = (surfaceAt(sx + 6, 0) - surfaceAt(sx - 6, 0)) / 12;
  const size = Math.max(4, Math.min(w, h) * 0.09);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan(slope) * 0.7);
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); // hull
  ctx.moveTo(-size * 0.5, 0);
  ctx.lineTo(size * 0.5, 0);
  ctx.lineTo(size * 0.3, size * 0.22);
  ctx.lineTo(-size * 0.3, size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); // sail
  ctx.moveTo(0, -size * 0.05);
  ctx.lineTo(0, -size * 1.05);
  ctx.lineTo(size * 0.55, -size * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/*
 * Veritas's graph, laid out here once rather than simulated: the scene is
 * about the edges, and a force layout would add state a pure function cannot
 * hold. Node 2 and node 5 contradict each other.
 */
const V_NODES = [
  [0.18, 0.3],
  [0.42, 0.16],
  [0.7, 0.26],
  [0.24, 0.68],
  [0.52, 0.5],
  [0.82, 0.62],
  [0.62, 0.82],
];
const V_EDGES = [
  [0, 1],
  [1, 2],
  [0, 3],
  [3, 4],
  [1, 4],
  [4, 6],
  [2, 5],
  [5, 6],
];
const V_CONTRADICTION = [2, 5];

/**
 * Veritas: a claim graph with evidence flowing along its edges, and one pair
 * of claims that contradict each other.
 *
 * The contradiction is dashed and throbbing rather than red, and that is a
 * rule, not a taste: the site's palette gives every colour exactly one meaning
 * and has no red to give, and the scene may only use the card's own accent.
 * Veritas itself keeps the same discipline — its signal palette holds "unknown"
 * to grey, never red — so encoding the conflict as pattern is truer to the
 * project than the colour would have been.
 */
export function veritas(ctx, w, h, t, hot) {
  const rate = (hot ? 2 : 1) * 0.5;
  const at = (n) => [V_NODES[n][0] * w, V_NODES[n][1] * h];

  ctx.globalAlpha = 0.2;
  for (const [a, b] of V_EDGES) {
    const [x1, y1] = at(a);
    const [x2, y2] = at(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // One traversal pulse walking the edge list, head eased along the segment.
  const walk = t * rate;
  const edge = V_EDGES[Math.floor(walk) % V_EDGES.length];
  const p = walk % 1;
  const [ax, ay] = at(edge[0]);
  const [bx, by] = at(edge[1]);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(ax + (bx - ax) * p, ay + (by - ay) * p, Math.max(1.2, Math.min(w, h) * 0.014), 0, Math.PI * 2);
  ctx.fill();

  // The contradiction, throbbing on its own clock so it never reads as part
  // of the traversal: these two claims disagree whatever the reader looks at.
  const [cx1, cy1] = at(V_CONTRADICTION[0]);
  const [cx2, cy2] = at(V_CONTRADICTION[1]);
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 3.2);
  ctx.beginPath();
  ctx.moveTo(cx1, cy1);
  ctx.lineTo(cx2, cy2);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 0.8;
  for (let n = 0; n < V_NODES.length; n += 1) {
    const [x, y] = at(n);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, Math.min(w, h) * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/*
 * A small repository, drawn as indent depth and name width. Abstract bars
 * rather than lettering, because nine rows of 9px text in a card is noise
 * pretending to be information.
 */
const A_ROWS = [
  [0, 0.32],
  [0, 0.24],
  [1, 0.3],
  [1, 0.38],
  [2, 0.26],
  [2, 0.34],
  [1, 0.28],
  [0, 0.22],
  [1, 0.36],
];

/**
 * Anchorfile: a file tree scanned row by row, and then the point of the scan —
 * one emitted file, drawn wider and brighter at the foot once the walk is
 * done. The tool reads a repository and writes one document; a tree alone
 * would be half the story.
 */
export function anchorfile(ctx, w, h, t, hot) {
  const rate = (hot ? 2 : 1) * 2.2;
  const cycle = A_ROWS.length + 4; // rows, then a beat holding the output
  const step = (t * rate) % cycle;
  const rowH = h / (A_ROWS.length + 2.5);
  const indent = w * 0.07;
  const left = w * 0.12;

  for (let i = 0; i < A_ROWS.length; i += 1) {
    // Each row eases in over its own step, so the scan reads as progress
    // rather than rows blinking on.
    const a = Math.min(1, Math.max(0, step - i));
    if (a <= 0) continue;
    const [depth, width] = A_ROWS[i];
    const y = rowH * (0.8 + i);
    ctx.globalAlpha = 0.18 * a;
    if (depth > 0) {
      // The indent guide, so depth reads as structure and not as a ragged edge.
      ctx.beginPath();
      ctx.moveTo(left + depth * indent - indent * 0.5, y - rowH * 0.35);
      ctx.lineTo(left + depth * indent - indent * 0.5, y + rowH * 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = (0.3 + 0.25 * depth) * a * 0.9;
    ctx.fillRect(left + depth * indent, y - rowH * 0.18, w * width, rowH * 0.36);
  }

  // The emitted file. Everything above was reading; this is the write.
  const outA = Math.min(1, Math.max(0, step - A_ROWS.length));
  if (outA > 0) {
    const y = rowH * (1.3 + A_ROWS.length);
    ctx.globalAlpha = 0.9 * outA;
    ctx.fillRect(left, y - rowH * 0.22, w * 0.62, rowH * 0.44);
  }
  ctx.globalAlpha = 1;
}

/** Scene by the slug ProjectCard writes into data-scene. */
export const SCENES = {
  lodestar,
  'vela-sea': velaSea,
  veritas,
  anchorfile,
};
