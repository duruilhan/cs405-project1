import { inverseRigid } from "./math/mat4.js";
export const target = [0, 0.3, 0];
export const near = 0.2;
export const far = 20;
export const fov = Math.PI / 3;
// Invert the x/y projection at a known camera-space depth and undo the view.
export function unprojectAtDistance(x, y, distance, inverseView, projection) {
  const w = projection[11] === -1 ? distance : 1;
  const vx = (x * w - projection[12]) / projection[0];
  const vy = (y * w - projection[13]) / projection[5];
  return [0, 1, 2].map(i => inverseView[i] * vx + inverseView[4 + i] * vy - inverseView[8 + i] * distance + inverseView[12 + i]);
}
export function intersectPlane(x, y, z, view, projection) {
  const inverseView = inverseRigid(view);
  const a = unprojectAtDistance(x, y, near, inverseView, projection);
  const b = unprojectAtDistance(x, y, far, inverseView, projection);
  if (Math.abs(b[2] - a[2]) < 1e-6) return null;
  const t = (z - a[2]) / (b[2] - a[2]);
  if (t < 0 || t > 1) return null;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
export function frustumVertices(view, projection) {
  const inverseView = inverseRigid(view);
  const corners = [near, far].flatMap(distance => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => unprojectAtDistance(x, y, distance, inverseView, projection)));
  const vertices = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    for (const [a, b] of [[i, next], [i + 4, next + 4], [i, i + 4]]) {
      vertices.push(...corners[a], 1, 0.65, 0.22, ...corners[b], 1, 0.65, 0.22);
    }
  }
  return new Float32Array(vertices);
}