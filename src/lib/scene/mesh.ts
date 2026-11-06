import { clamp, lerp, sat } from './math';

export interface Mesh {
  pos: Float32Array;
  nor: Float32Array;
  idx: Uint16Array;
  count: number;
}

/**
 * The boomerang. Its outline is traced from a clean 2D shape: two bowed arms
 * tapering from a rounded elbow to rounded tips, filleted where they meet.
 * The body is a thin slab whose edges round over from the top face to the
 * bottom, so it reads as one solid piece from any angle, edge-on included.
 */
export function boomerangMesh(): Mesh {
  const SEG = 48;
  const N = 72;
  const R = 0.065;
  const arms = [-1, 1].map((side) =>
    Array.from({ length: SEG + 1 }, (_, k) => {
      const s = k / SEG;
      return [side * 0.98 * s, 0.42 - 0.84 * s + 0.16 * Math.sin(Math.PI * s), lerp(0.25, 0.12, s)];
    }),
  );
  const armD = (pts: number[][], x: number, y: number) => {
    let best = Infinity;
    for (let k = 0; k < SEG; k++) {
      const [ax, ay, aw] = pts[k];
      const [bx, by, bw] = pts[k + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const h = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      const d = Math.hypot(x - ax - dx * h, y - ay - dy * h) - lerp(aw, bw, h);
      if (d < best) best = d;
    }
    return best;
  };
  const sdf = (x: number, y: number) => {
    const a = armD(arms[0], x, y);
    const b = armD(arms[1], x, y);
    const k = 0.1;
    const h = sat(0.5 + (0.5 * (b - a)) / k);
    return lerp(b, a, h) - k * h * (1 - h);
  };

  // Trace the zero contour with marching squares, then chain the crossings.
  const X0 = -1.2;
  const Y0 = -0.72;
  const G = 0.01;
  const NX = 240;
  const NY = 146;
  const v = new Float64Array((NX + 1) * (NY + 1));
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) v[j * (NX + 1) + i] = sdf(X0 + i * G, Y0 + j * G);
  const V = (i: number, j: number) => v[j * (NX + 1) + i];
  const pt = new Map<number, [number, number]>();
  const link = new Map<number, number[]>();
  const edge = (i: number, j: number, vert: boolean) => {
    const key = (j * (NX + 1) + i) * 2 + (vert ? 1 : 0);
    if (!pt.has(key)) {
      const va = V(i, j);
      const vb = vert ? V(i, j + 1) : V(i + 1, j);
      const f = va / (va - vb);
      pt.set(key, [X0 + (i + (vert ? 0 : f)) * G, Y0 + (j + (vert ? f : 0)) * G]);
    }
    return key;
  };
  const join = (a: number, b: number) => {
    if (!link.has(a)) link.set(a, []);
    if (!link.has(b)) link.set(b, []);
    link.get(a)!.push(b);
    link.get(b)!.push(a);
  };
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const ins = [V(i, j) < 0, V(i + 1, j) < 0, V(i + 1, j + 1) < 0, V(i, j + 1) < 0];
      // Edges: 0 bottom, 1 right, 2 top, 3 left, each between two corners.
      const E: (number | undefined)[] = [];
      if (ins[0] !== ins[1]) E[0] = edge(i, j, false);
      if (ins[1] !== ins[2]) E[1] = edge(i + 1, j, true);
      if (ins[3] !== ins[2]) E[2] = edge(i, j + 1, false);
      if (ins[0] !== ins[3]) E[3] = edge(i, j, true);
      const crossed = [0, 1, 2, 3].filter((k) => E[k] !== undefined);
      if (crossed.length === 2) join(E[crossed[0]]!, E[crossed[1]]!);
      else if (crossed.length === 4) {
        const mid = V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1) < 0;
        if (mid === ins[0]) {
          join(E[0]!, E[1]!);
          join(E[2]!, E[3]!);
        } else {
          join(E[3]!, E[0]!);
          join(E[1]!, E[2]!);
        }
      }
    }
  }
  const start = link.keys().next().value as number;
  const loop: [number, number][] = [];
  for (let prev = -1, cur = start; ; ) {
    loop.push(pt.get(cur)!);
    const nb = link.get(cur)!;
    const next = nb[0] !== prev ? nb[0] : nb[1];
    prev = cur;
    cur = next;
    if (cur === start) break;
  }
  // Even spacing by arc length, counter-clockwise.
  let area = 0;
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % loop.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) loop.reverse();
  const cum = [0];
  for (let k = 1; k <= loop.length; k++) {
    const a = loop[k - 1];
    const b = loop[k % loop.length];
    cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const outline: [number, number][] = [];
  for (let n = 0, k = 0; n < N; n++) {
    const target = (cum[loop.length] * n) / N;
    while (cum[k + 1] < target) k++;
    const f = (target - cum[k]) / (cum[k + 1] - cum[k]);
    const a = loop[k];
    const b = loop[(k + 1) % loop.length];
    outline.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
  }
  const nrm2 = outline.map(([x, y]) => {
    const e = 1e-3;
    const gx = sdf(x + e, y) - sdf(x - e, y);
    const gy = sdf(x, y + e) - sdf(x, y - e);
    const L = Math.hypot(gx, gy);
    return [gx / L, gy / L];
  });

  // Rings round the rounded edge, from the top face (0) to the bottom (4).
  // The faces' own normals lean out a little at the rim, which domes them.
  const PHI = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];
  const PSI = [0.32, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI - 0.32];
  const pos: number[] = [];
  const nor: number[] = [];
  PHI.forEach((ph, j) =>
    outline.forEach(([x, y], i) => {
      const [nx, ny] = nrm2[i];
      const inset = R * (1 - Math.sin(ph));
      pos.push(x - nx * inset, y - ny * inset, R * Math.cos(ph));
      nor.push(nx * Math.sin(PSI[j]), ny * Math.sin(PSI[j]), Math.cos(PSI[j]));
    }),
  );
  const tris: number[][] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * N + i;
      const b = j * N + ((i + 1) % N);
      tris.push([a, b, b + N], [a, b + N, a + N]);
    }
  }
  // The faces: clip ears off the top face's outline, shortest cut first.
  const face = outline.map((_, i) => [pos[i * 3], pos[i * 3 + 1]]);
  const cr = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const idx = face.map((_, i) => i);
  const cap: number[][] = [];
  while (idx.length > 3) {
    let best = -1;
    let bestL = Infinity;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const a = face[i0];
      const b = face[i1];
      const c = face[i2];
      if (cr(a, b, c) <= 1e-9) continue;
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L >= bestL) continue;
      let clear = true;
      for (const m of idx) {
        if (m === i0 || m === i1 || m === i2) continue;
        const p = face[m];
        if (cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0) {
          clear = false;
          break;
        }
      }
      if (clear) {
        best = k;
        bestL = L;
      }
    }
    if (best < 0) break;
    cap.push([idx[(best + idx.length - 1) % idx.length], idx[best], idx[(best + 1) % idx.length]]);
    idx.splice(best, 1);
  }
  if (idx.length === 3) cap.push(idx.slice());
  for (const [a, b, c] of cap) {
    tris.push([a, b, c]);
    tris.push([a + 4 * N, b + 4 * N, c + 4 * N]);
  }
  // Wind every triangle to face out along its normals.
  const out = new Uint16Array(tris.length * 3);
  tris.forEach(([a, b, c], k) => {
    const P = (q: number) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    const pa = P(a);
    const pb = P(b);
    const pc = P(c);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    let dot = 0;
    for (const q of [a, b, c]) dot += g[0] * nor[q * 3] + g[1] * nor[q * 3 + 1] + g[2] * nor[q * 3 + 2];
    out.set(dot >= 0 ? [a, b, c] : [a, c, b], k * 3);
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: out, count: out.length };
}
