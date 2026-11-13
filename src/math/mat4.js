// Matrices are stored in column-major order as required by WebGPU.
export function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);
}
export function multiply(a, b) {
  const result = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      result[col * 4 + row] = sum;
    }
  }
  return result;
}
export function translate(x, y, z) {
  const m = identity();
  // Translation is stored in the last column.
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
export function scale(x, y, z) {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}
export function rotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}
export function rotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}
export function rotateZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
export function transpose(m) {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      result[col * 4 + row] = m[row * 4 + col];
    }
  }
  return result;
}
export function inverseRigid(m) {
  const result = identity();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      result[col * 4 + row] = m[row * 4 + col];
    }
  }
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  result[12] = -(result[0] * tx + result[4] * ty + result[8] * tz);
  result[13] = -(result[1] * tx + result[5] * ty + result[9] * tz);
  result[14] = -(result[2] * tx + result[6] * ty + result[10] * tz);
  return result;
}
export function lookAt(eye, target, up) {
  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]);
    if (length < 0.000001) {
      throw new Error("Can't normalize a zero vector");
    }
    return [
      v[0] / length,
      v[1] / length,
      v[2] / length
    ];
  }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  const z = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2]
  ]);
  let right = cross(up, z);
  if (Math.hypot(...right) < 1e-6) {
    const fallback = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    right = cross(fallback, z);
  }
  const x = normalize(right);
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(
      x[0] * eye[0] +
      x[1] * eye[1] +
      x[2] * eye[2]
    ),
    -(
      y[0] * eye[0] +
      y[1] * eye[1] +
      y[2] * eye[2]
    ),
    -(
      z[0] * eye[0] +
      z[1] * eye[1] +
      z[2] * eye[2]
    ),
    1
  ]);
}
export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}
export function orthographic(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = 1 / (near - far);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = near / (near - far);
  m[15] = 1;
  return m;
}