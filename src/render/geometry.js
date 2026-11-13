export function createCubeVertices() {
  const faces = [
    // Front
    { corners: [0, 1, 2, 3], color: [1, 0.35, 0.35] },
    // Back
    { corners: [5, 4, 7, 6], color: [0.35, 0.8, 1] },
    // Left
    { corners: [4, 0, 3, 7], color: [0.4, 1, 0.5] },
    // Right
    { corners: [1, 5, 6, 2], color: [1, 0.85, 0.3] },
    // Top
    { corners: [3, 2, 6, 7], color: [0.8, 0.4, 1] },
    // Bottom
    { corners: [4, 5, 1, 0], color: [0.3, 0.7, 0.8] }
  ];
  const p = [
    [-0.5, -0.5,  0.5],
    [ 0.5, -0.5,  0.5],
    [ 0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5],
    [-0.5, -0.5, -0.5],
    [ 0.5, -0.5, -0.5],
    [ 0.5,  0.5, -0.5],
    [-0.5,  0.5, -0.5]
  ];
  const vertices = [];
  for (const face of faces) {
    const [a, b, c, d] = face.corners;
    for (const index of [a, b, c, a, c, d]) {
      vertices.push(...p[index], ...face.color);
    }
  }
  return new Float32Array(vertices);
}
export function createAxesVertices(length = 0.65) {
  return new Float32Array([
    // X axis: red
    0, 0, 0,  1, 0, 0,
    length, 0, 0,  1, 0, 0,
    // Y axis: green
    0, 0, 0,  0, 1, 0,
    0, length, 0,  0, 1, 0,
    // Z axis: blue
    0, 0, 0,  0, 0, 1,
    0, 0, length,  0, 0, 1
  ]);
}
// Create a colored cube with adjustable RGB values.
export function createColoredCubeVertices(r, g, b) {
  const vertices = createCubeVertices();
  const result = new Float32Array(vertices);
  for (let i = 0; i < result.length; i += 6) {
    result[i + 3] = r;
    result[i + 4] = g;
    result[i + 5] = b;
  }
  return result;
}
// Create a low-poly sphere with position and RGB color.
export function createSphereVertices(radius = 1, latSegments = 10, lonSegments = 14, color = [0.2, 0.5, 0.2]) {
  const vertices = [];
  function point(theta, phi) {
    return [radius * Math.sin(theta) * Math.cos(phi), radius * Math.cos(theta), radius * Math.sin(theta) * Math.sin(phi)];
  }
  function addVertex(p) {
    vertices.push(...p, ...color);
  }
  for (let lat = 0; lat < latSegments; lat++) {
    const theta1 = Math.PI * lat / latSegments;
    const theta2 = Math.PI * (lat + 1) / latSegments;
    for (let lon = 0; lon < lonSegments; lon++) {
      const phi1 = 2 * Math.PI * lon / lonSegments;
      const phi2 = 2 * Math.PI * (lon + 1) / lonSegments;
      const p1 = point(theta1, phi1);
      const p2 = point(theta2, phi1);
      const p3 = point(theta2, phi2);
      const p4 = point(theta1, phi2);
      addVertex(p1);
      addVertex(p3);
      addVertex(p2);
      addVertex(p1);
      addVertex(p4);
      addVertex(p3);
    }
  }
  return new Float32Array(vertices);
}