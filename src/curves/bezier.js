// Part D: Cubic Bezier curve mathematics.
export function cubicBezier(p0, p1, p2, p3, t) {
  if (t < 0 || t > 1) {
    throw new RangeError("Bezier parameter t must be between 0 and 1");
  }
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return [0, 1, 2].map(i => b0 * p0[i] + b1 * p1[i] + b2 * p2[i] + b3 * p3[i]);
}
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  if (t < 0 || t > 1) {
    throw new RangeError("Bezier parameter t must be between 0 and 1");
  }
  const u = 1 - t;
  return [0, 1, 2].map(i => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]));
}
export function sampleBezier(p0, p1, p2, p3, segments = 50) {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError("segments must be a positive integer");
  }
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(cubicBezier(p0, p1, p2, p3, t));
  }
  return points;
}
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
export function deCasteljau(points, t) {
  const first = points.slice(0, 3).map((point, i) => mix(point, points[i + 1], t));
  const second = [mix(first[0], first[1], t), mix(first[1], first[2], t)];
  return [first, second, mix(second[0], second[1], t)];
}
export function catmullRomSegment(anchors, index) {
  const a = anchors[Math.max(0, index - 1)];
  const b = anchors[index];
  const c = anchors[index + 1];
  const d = anchors[Math.min(anchors.length - 1, index + 2)];
  return [b, b.map((value, i) => value + (c[i] - a[i]) / 6), c.map((value, i) => value - (d[i] - b[i]) / 6), c];
}
export function moveBezierControl(points, index, target, joints, bounds) {
  const point = points[index];
  const joint = joints.find(candidate => Math.abs(index - candidate) <= 1);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  if (joint === undefined) {
    point.splice(0, 2, ...target.map((value, i) => clamp(value, ...bounds[i])));
    return;
  }
  const anchor = points[joint];
  if (index === joint) {
    const group = points.slice(joint - 1, joint + 2);
    const delta = target.map((value, i) => clamp(value - anchor[i], bounds[i][0] - Math.min(...group.map(p => p[i])), bounds[i][1] - Math.max(...group.map(p => p[i]))));
    for (const p of group) {
      p[0] += delta[0];
      p[1] += delta[1];
    }
    return;
  }
  const bounded = target.map((value, i) => {
    const radius = Math.min(anchor[i] - bounds[i][0], bounds[i][1] - anchor[i]);
    return clamp(value, anchor[i] - radius, anchor[i] + radius);
  });
  point.splice(0, 2, ...bounded);
  points[2 * joint - index].splice(0, 2, ...bounded.map((value, i) => 2 * anchor[i] - value));
}