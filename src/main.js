import shaderCode from "./render/basic.wgsl?raw";
import {createCubeVertices, createAxesVertices, createColoredCubeVertices, createSphereVertices} from "./render/geometry.js";
import {multiply, translate, rotateX, rotateY, rotateZ, scale, lookAt, perspective, orthographic} from "./math/mat4.js";
import {SceneNode} from "./scene/SceneNode.js";
import {cubicBezier, cubicBezierTangent, sampleBezier, deCasteljau, catmullRomSegment, moveBezierControl} from "./curves/bezier.js";
import {createPainting, paintingHeight, paintingCenterY, paintingZ} from "./render/painting.js";
import {target, near, far, fov, intersectPlane, frustumVertices} from "./camera.js";
import {bindReset, createPerformanceReadout} from "./ui.js";
import preset from "../curve.json";
async function main() {
  const status = document.getElementById("status");
  const canvas = document.getElementById("webgpu-canvas");
  if (!navigator.gpu) {
    status.textContent = "WebGPU is not supported.";
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    status.textContent = "No WebGPU adapter found.";
    return;
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({device, format, alphaMode: "opaque"});
  const painting = await createPainting(device, format);
  const readPerformance = createPerformanceReadout(adapter);
  const traceZ = paintingZ + 0.015;
  const curveFamily = document.getElementById("curve-family");
  const parameter = document.getElementById("curve-t");
  const segmentSelect = document.getElementById("curve-segment");
  const showTrace = document.getElementById("show-trace");
  const inspection = document.getElementById("inspection");
  const cameraInfo = document.getElementById("camera-info");
  const pose = document.getElementById("freeze");
  const curvePoints = preset.controlPoints.map(([u, v]) => [(u - 0.5) * painting.width, (0.5 - v) * paintingHeight + paintingCenterY, traceZ]);
  const initialPoints = curvePoints.map(point => [...point]);
  const paintingBounds = [[-painting.width / 2, painting.width / 2], [paintingCenterY - paintingHeight / 2, paintingCenterY + paintingHeight / 2]];
  const segments = preset.segments;
  const samplesPerSegment = 48;
  function getSegments() {
    if (curveFamily.value === "bezier") {
      return segments.map(indices => indices.map(index => curvePoints[index]));
    }
    const anchors = [0, 3, 6, 9].map(index => curvePoints[index]);
    return segments.map((_, index) => catmullRomSegment(anchors, index));
  }
  function getCurveSamples() {
    return getSegments().flatMap((points, i) => {
      const samples = sampleBezier(...points, samplesPerSegment);
      return i === 0 ? samples : samples.slice(1);
    });
  }
  // Convert sampled points into line-list vertices.
  function createCurveVertices(points, color = [0.35, 1, 0.93]) {
    const data = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      data.push(...a, ...color);
      data.push(...b, ...color);
    }
    return new Float32Array(data);
  }
  function createControlPolygonVertices(points) {
    const data = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      data.push(...a, 0.7, 0.7, 0.7);
      data.push(...b, 0.7, 0.7, 0.7);
    }
    return new Float32Array(data);
  }
  const curveVertices = createCurveVertices(getCurveSamples());
  const controlPolygonVertices = createControlPolygonVertices(curvePoints);
  // Part D: Visible Bezier control points.
  const controlPointObjects = curvePoints.map((point, index) => ({index, position: point, size: 0.055, uniformBuffer: null, bindGroup: null}));
  const curveMarker = {};
  const constructionMarker = {};
  const vertices = createCubeVertices();
  function lineBuffer(vertexCount) {
    return device.createBuffer({size: vertexCount * 24, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
  }
  const constructionBuffer = lineBuffer(6);
  const frustumBuffer = lineBuffer(24);
  const vertexBuffer = device.createBuffer({size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(vertexBuffer, 0, vertices);
  const curveBuffer = device.createBuffer({size: curveVertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(curveBuffer, 0, curveVertices);
  const controlPolygonBuffer = device.createBuffer({size: controlPolygonVertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(controlPolygonBuffer, 0, controlPolygonVertices);
  const shaderModule = device.createShaderModule({code: shaderCode});
  const pipeline = device.createRenderPipeline({layout: "auto", vertex: {module: shaderModule, entryPoint: "vertexMain",
    buffers: [{arrayStride: 24, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}, {shaderLocation: 1, offset: 12, format: "float32x3"}]}]},
    fragment: {module: shaderModule, entryPoint: "fragmentMain", targets: [{format}]}, primitive: {topology: "triangle-list", cullMode: "back", frontFace: "ccw"},
    depthStencil: {format: "depth24plus", depthWriteEnabled: true, depthCompare: "less"}});
  const axesPipeline = device.createRenderPipeline({layout: "auto", vertex: {module: shaderModule, entryPoint: "vertexMain",
    buffers: [{arrayStride: 24, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}, {shaderLocation: 1, offset: 12, format: "float32x3"}]}]},
    fragment: {module: shaderModule, entryPoint: "fragmentMain", targets: [{ format }]}, primitive: {topology: "line-list"},
    depthStencil: {format: "depth24plus", depthWriteEnabled: false, depthCompare: "less-equal"}});
  // Part D: Curve transformation uniform.
  const curveUniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
  const curveBindGroup = device.createBindGroup({layout: axesPipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: curveUniformBuffer}}]});
  for (const point of [...controlPointObjects, curveMarker, constructionMarker]) {
    point.uniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    point.bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: point.uniformBuffer}}]});
  }
  const axesVertices = createAxesVertices();
  const axesBuffer = device.createBuffer({size: axesVertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(axesBuffer, 0, axesVertices);
  let depthTexture;
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const maxSize = device.limits.maxTextureDimension2D;
    const width = Math.max(1, Math.min(maxSize, Math.round(canvas.clientWidth * dpr)));
    const height = Math.max(1, Math.min(maxSize, Math.round(canvas.clientHeight * dpr)));
    if (depthTexture && canvas.width === width && canvas.height === height) return;
    depthTexture?.destroy();
    canvas.width = width;
    canvas.height = height;
    depthTexture = device.createTexture({size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT});
  }
  resizeCanvas();
    const controls = {tx: document.getElementById("tx"), ty: document.getElementById("ty"), tz: document.getElementById("tz"),
      rotation: document.getElementById("rotation"), scale: document.getElementById("scale"), order: document.getElementById("matrix-order")};
  function getControlValues() {
    return {tx: Number(controls.tx.value), ty: Number(controls.ty.value), tz: Number(controls.tz.value),
      rotation: Number(controls.rotation.value), scale: Number(controls.scale.value), order: controls.order.value};
  }
  function formatMatrix(m) {
    const rows = [];
    for (let row = 0; row < 4; row++) {
      const values = [];
      for (let col = 0; col < 4; col++) {
        values.push(m[col * 4 + row].toFixed(2).padStart(7));
      }
      rows.push(values.join(" "));
    }
    return rows.join("\n");
  }
  // Part E: Painting-inspired forest scene.
  const forestObjects = [];
  forestObjects.push({name: "Forest Ground", shape: "cube", position: [0, -2.1, 0], size: [9, 0.2, 7], color: [0.22, 0.32, 0.16]});
  // Add a tree using a trunk and three foliage blocks.
  function addTree(x, z, height = 2.5) {
    forestObjects.push({name: "Tree Trunk", shape: "cube", position: [x, -2.0 + height / 2, z], size: [0.35, height, 0.35], color: [0.35, 0.20, 0.10]});
    forestObjects.push({name: "Tree Leaves Lower", shape: "sphere", position: [x, -2.0 + height, z], size: [0.95, 0.65, 0.85], color: [0.10, 0.28, 0.12]});
    forestObjects.push({name: "Tree Leaves Middle", shape: "sphere", position: [x - 0.25, -1.55 + height, z], size: [0.8, 0.65, 0.7], color: [0.13, 0.34, 0.15]});
    forestObjects.push({name: "Tree Leaves Top", shape: "sphere", position: [x + 0.2, -1.15 + height, z], size: [0.65, 0.6, 0.65], color: [0.17, 0.40, 0.18]});
  }
  addTree(-3.5, -2.5, 3.8);
  addTree(-2.7, -1.2, 3.2);
  addTree(-3.8,  1.5, 2.6);
  addTree(-1.5, -3.0, 3.5);
  addTree( 0.2, -3.2, 3.0);
  addTree( 1.6, -3.0, 3.7);
  addTree(3.2, -2.2, 4.0);
  addTree(3.8,  0.8, 3.0);
  addTree(2.7,  2.0, 2.8);
  // Part E: Curved forest path using a cubic Bezier curve.
  const pathPoints = sampleBezier([-1.8, -1.985, -3.2], [-2.5, -1.985, -1.0], [-0.8, -1.985,  1.0], [-1.5, -1.985,  3.2], 60);
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p0 = pathPoints[i];
    const p1 = pathPoints[i + 1];
    const centerX = (p0[0] + p1[0]) / 2;
    const centerZ = (p0[2] + p1[2]) / 2;
    const dx = p1[0] - p0[0];
    const dz = p1[2] - p0[2];
    const segmentLength = Math.sqrt(dx * dx + dz * dz);
    forestObjects.push({name: "Bezier Forest Path " + i, shape: "cube", position: [centerX, -1.985, centerZ],
      size: [0.65, 0.025, segmentLength + 0.035], rotationY: Math.atan2(dx, dz), color: [0.42, 0.30, 0.19]});
  }
  // Part E: Deer model.
  function addDeer(x, z) {
    const brown = [0.52, 0.30, 0.16];
    const lightBrown = [0.70, 0.48, 0.28];
    const darkBrown = [0.34, 0.19, 0.10];
    const cream = [0.83, 0.70, 0.51];
    function addPart(name, offset, size, color, shape = "sphere") {
      forestObjects.push({name: "Deer " + name, shape, position: [x + offset[0], -2.0 + offset[1], z + offset[2]], size, color});
    }
    addPart("Body", [0, 1.35, 0], [0.82, 0.38, 0.32], brown);
    addPart("Chest", [0.57, 1.28, 0], [0.29, 0.40, 0.30], lightBrown);
    addPart("Belly", [0, 1.13, 0], [0.60, 0.16, 0.27], cream);
    addPart("Neck", [0.68, 1.75, 0], [0.19, 0.44, 0.19], brown);
    addPart("Head", [0.83, 2.13, 0], [0.27, 0.19, 0.19], brown);
    addPart("Muzzle", [1.08, 2.05, 0], [0.17, 0.10, 0.13], lightBrown);
    addPart("Left Ear", [0.68, 2.36, -0.17], [0.11, 0.20, 0.09], lightBrown);
    addPart("Right Ear", [0.68, 2.36, 0.17], [0.11, 0.20, 0.09], lightBrown);
    const legPositions = [[-0.55, -0.21], [-0.55,  0.21], [ 0.53, -0.21], [ 0.53,  0.21]];
    for (let i = 0; i < legPositions.length; i++) {
      const [lx, lz] = legPositions[i];
      addPart("Upper Leg " + (i + 1), [lx, 1.02, lz], [0.18, 0.35, 0.15], brown, "sphere");
      addPart("Lower Leg " + (i + 1), [lx, 0.40, lz], [0.09, 0.80, 0.09], darkBrown, "cube");
    }
    addPart("Tail", [-0.84, 1.47, 0], [0.14, 0.13, 0.14], cream);
  }
  addDeer(0.4, 1.2);
  // Part E: Deer scene graph hierarchy.
  const deerRoot = new SceneNode("Deer Root");
  const deerBody = new SceneNode("Deer Body");
  const deerNeck = new SceneNode("Deer Neck");
  const deerHead = new SceneNode("Deer Head");
  const deerMuzzle = new SceneNode("Deer Muzzle");
  const deerLeftEar = new SceneNode("Deer Left Ear");
  const deerRightEar = new SceneNode("Deer Right Ear");
  const deerLegs = [new SceneNode("Deer Leg 1"), new SceneNode("Deer Leg 2"), new SceneNode("Deer Leg 3"), new SceneNode("Deer Leg 4")];
  const deerTail = new SceneNode("Deer Tail");
  deerRoot.addChild(deerBody);
  deerBody.addChild(deerNeck);
  deerNeck.addChild(deerHead);
  deerHead.addChild(deerMuzzle);
  deerHead.addChild(deerLeftEar);
  deerHead.addChild(deerRightEar);
  for (const leg of deerLegs) {
    deerBody.addChild(leg);
  }
  deerBody.addChild(deerTail);
  deerRoot.updateWorldMatrix();
  const headPivot = [1.23, 0.13, 1.2];
  deerHead.setLocalMatrix(translate(headPivot[0], headPivot[1], headPivot[2]));
  for (const obj of forestObjects) {
    if (!obj.name.startsWith("Deer ")) {
      continue;
    }
    const partName = obj.name.substring(5);
    obj.node = deerBody;
    obj.localPosition = [...obj.position];
    if (partName === "Head") {
      obj.node = deerHead;
    } else if (partName === "Muzzle") {
      obj.node = deerMuzzle;
    } else if (partName === "Left Ear") {
      obj.node = deerLeftEar;
    } else if (partName === "Right Ear") {
      obj.node = deerRightEar;
    } else if (partName === "Neck") {
      obj.node = deerNeck;
    } else if (partName === "Tail") {
      obj.node = deerTail;
    } else {
      const match = partName.match(/Leg (\d+)$/);
      if (match) {
        obj.node = deerLegs[Number(match[1]) - 1];
      }
    }
    if (obj.node === deerHead || obj.node === deerMuzzle || obj.node === deerLeftEar || obj.node === deerRightEar) {
      obj.localPosition = [obj.position[0] - headPivot[0], obj.position[1] - headPivot[1], obj.position[2] - headPivot[2]];
    }
  }
  const objects = [{x: -1.7, y: 0, z: 0, size: 0.8, speed: 0.6}, {x: 0, y: 0, z: 0, size: 1.0, speed: 1.0}, {x: 1.7, y: 0, z: 0, size: 0.8, speed: -0.8}];
  // Part B: Hierarchical scene graph.
  const root = new SceneNode("Root");
  const base = new SceneNode("Base", translate(0, 0, 1.5));
  const arm = new SceneNode("Rotating Arm");
  const leftChild = new SceneNode("Left Child", translate(-1.2, 0, 0));
  const rightChild = new SceneNode("Right Child", translate(1.2, 0, 0));
  root.addChild(base);
  base.addChild(arm);
  arm.addChild(leftChild);
  arm.addChild(rightChild);
  const satellite = new SceneNode("Satellite", translate(0, 0.8, 0));
  rightChild.addChild(satellite);
  const graphNodes = [{node: root, size: 0}, {node: base, size: 0.35}, {node: arm, size: 0}, {node: leftChild, size: 0.4}, {node: rightChild, size: 0.4}, {node: satellite, size: 0.2}];
  for (const item of graphNodes) {
    item.uniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    item.bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: item.uniformBuffer}}]});
    item.axesUniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    item.axesBindGroup = device.createBindGroup({layout: axesPipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: item.axesUniformBuffer}}]});
  }
  for (const obj of forestObjects) {
    const coloredVertices = obj.shape === "sphere" ? createSphereVertices(1, 10, 14, obj.color) : createColoredCubeVertices(obj.color[0], obj.color[1], obj.color[2]);
    obj.vertexCount = coloredVertices.length / 6;
    obj.vertexBuffer = device.createBuffer({size: coloredVertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(obj.vertexBuffer, 0, coloredVertices);
    obj.uniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    obj.bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: obj.uniformBuffer}}]});
  }
  for (const obj of objects) {
    obj.uniformBuffer = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    obj.bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: obj.uniformBuffer}}]});
  }
  const sceneMode = document.getElementById("scene-mode");
  // Part C: Camera and projection controls.
  const cameraControls = {mode: document.getElementById("projection-mode"), yaw: document.getElementById("camera-yaw"),
    pitch: document.getElementById("camera-pitch"), distance: document.getElementById("camera-distance")};
  let orthoZoom = 1;
  function getCameraMatrices() {
    const yaw = Number(cameraControls.yaw.value) * Math.PI / 180;
    const pitch = Number(cameraControls.pitch.value) * Math.PI / 180;
    const distance = Number(cameraControls.distance.value);
    const eye = [distance * Math.cos(pitch) * Math.sin(yaw), target[1] + distance * Math.sin(pitch), distance * Math.cos(pitch) * Math.cos(yaw)];
    const view = lookAt(eye, target, [0, 1, 0]);
    const aspect = canvas.width / canvas.height;
    const halfHeight = 3.5 / orthoZoom;
    const halfWidth = halfHeight * aspect;
    const projection = cameraControls.mode.value === "perspective" ? perspective(fov, aspect, near, far) : orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, near, far);
    document.getElementById("camera-yaw-value").textContent = cameraControls.yaw.value + "°";
    document.getElementById("camera-pitch-value").textContent = cameraControls.pitch.value + "°";
    document.getElementById("camera-distance-value").textContent = distance.toFixed(1);
    return {view, projection, eye};
  }
  // Part C: Mouse orbit and zoom controls.
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let selectedControlPoint = -1;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    selectedControlPoint = showTrace.checked && !inspection.checked ? pickControlPoint(mouseX, mouseY) : -1;
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    if (selectedControlPoint !== -1) {
      const { view, projection } = getCameraMatrices();
      const rect = canvas.getBoundingClientRect();
      const x = 2 * (event.clientX - rect.left) / rect.width - 1;
      const y = 1 - 2 * (event.clientY - rect.top) / rect.height;
      const position = intersectPlane(x, y, traceZ, view, projection);
      if (position) {
        moveBezierControl(curvePoints, selectedControlPoint, position, [3, 6], paintingBounds);
        updateBezierCurve();
      }
      return;
    }
    const yaw = Number(cameraControls.yaw.value);
    const pitch = Number(cameraControls.pitch.value);
    const newYaw = ((yaw + dx * 0.4 + 180) % 360 + 360) % 360 - 180;
    const newPitch = Math.max(-80, Math.min(80, pitch - dy * 0.4));
    cameraControls.yaw.value = String(newYaw);
    cameraControls.pitch.value = String(newPitch);
  });
  function stopDragging() {
    isDragging = false;
    selectedControlPoint = -1;
  }
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  canvas.addEventListener("lostpointercapture", stopDragging);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const zoomFactor = Math.exp(event.deltaY * 0.001);
    if (cameraControls.mode.value === "perspective") {
      const current = Number(cameraControls.distance.value);
      const next = Math.max(3, Math.min(15, current * zoomFactor));
      cameraControls.distance.value = String(next);
    } else {
      orthoZoom = Math.max(0.5, Math.min(4, orthoZoom / zoomFactor));
    }
  }, {passive: false});
  function updateBezierCurve() {
    device.queue.writeBuffer(curveBuffer, 0, createCurveVertices(getCurveSamples()));
    device.queue.writeBuffer(controlPolygonBuffer, 0, createControlPolygonVertices(curvePoints));
  }
  function updateCurveMode() {
    const isBezier = curveFamily.value === "bezier";
    parameter.disabled = segmentSelect.disabled = !isBezier;
    updateBezierCurve();
  }
  curveFamily.addEventListener("change", updateCurveMode);
  bindReset(() => {
    orthoZoom = 1;
    curvePoints.forEach((point, index) => point.splice(0, 3, ...initialPoints[index]));
    updateCurveMode();
  });
  function exportBezierCurve() {
    const normalized = ([x, y]) => [Number((x / painting.width + 0.5).toFixed(8)), Number((0.5 - (y - paintingCenterY) / paintingHeight).toFixed(8))];
    const data = {type: curveFamily.value === "bezier" ? preset.type : "uniform-catmull-rom", coordinateSystem: preset.coordinateSystem,
      controlPoints: (curveFamily.value === "bezier" ? curvePoints : [0, 3, 6, 9].map(index => curvePoints[index])).map(normalized),
      ...(curveFamily.value === "bezier" ? {segments} : {endpointPolicy: "repeat-endpoints"})};
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "curve.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  document
    .getElementById("export-curve")
    .addEventListener("click", exportBezierCurve);
  // Convert a 3D world position to canvas pixel coordinates.
  function worldToScreen(position, view, projection) {
    const vp = multiply(projection, view);
    const x = position[0];
    const y = position[1];
    const z = position[2];
    const clipX = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const clipY = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const clipZ = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
    const clipW = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (clipW <= 0.000001) {
      return null;
    }
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    const ndcZ = clipZ / clipW;
    if (ndcZ < 0 || ndcZ > 1) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {x: (ndcX * 0.5 + 0.5) * rect.width, y: (1 - (ndcY * 0.5 + 0.5)) * rect.height};
  }
  // Find the nearest control point to a mouse position.
  function pickControlPoint(mouseX, mouseY) {
    const { view, projection } = getCameraMatrices();
    let selectedIndex = -1;
    let closestDistance = 18;
    const indices = curveFamily.value === "bezier" ? curvePoints.map((_, i) => i) : [0, 3, 6, 9];
    for (const i of indices) {
      const screen = worldToScreen(curvePoints[i], view, projection);
      if (!screen) continue;
      const distance = Math.hypot(mouseX - screen.x, mouseY - screen.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        selectedIndex = i;
      }
    }
    return selectedIndex;
  }
  function render(time) {
    resizeCanvas();
    const t = pose.checked ? 0 : time * 0.001;
    const orbit = getCameraMatrices();
    const aspect = canvas.width / canvas.height;
    const span = 14 * Math.max(1, 1 / aspect);
    const view = inspection.checked ? lookAt([19, 14, 16], [0, 0.3, -2], [0, 1, 0]) : orbit.view;
    const projection = inspection.checked ? orthographic(-span * aspect, span * aspect, -span, span, 0.1, 75) : orbit.projection;
    const vp = multiply(projection, view);
    cameraInfo.textContent = `Eye [${orbit.eye.map(x => x.toFixed(2)).join(", ")}] · Target [${target.join(", ")}]\nFOV ${Math.round(fov * 180 / Math.PI)}° · Near ${near} · Far ${far}`;
    document.getElementById("curve-t-value").textContent = Number(parameter.value).toFixed(2);
    if (inspection.checked) {
      device.queue.writeBuffer(frustumBuffer, 0, frustumVertices(orbit.view, orbit.projection));
    }
    if (inspection.checked || showTrace.checked) {
      device.queue.writeBuffer(curveUniformBuffer, 0, vp);
    }
    const visiblePoints = curveFamily.value === "bezier" ? controlPointObjects : [0, 3, 6, 9].map(index => controlPointObjects[index]);
    function updateMarker(marker, position, size, angle = 0, length = size) {
      const model = multiply(translate(...position), multiply(rotateZ(angle), scale(length, size, size)));
      device.queue.writeBuffer(marker.uniformBuffer, 0, multiply(vp, model));
    }
    if (showTrace.checked) {
      for (const point of visiblePoints) updateMarker(point, point.position, point.size);
      const activeSegments = getSegments();
      const phase = (t * 0.55) % (activeSegments.length * 2);
      const progress = Math.min(phase, activeSegments.length * 2 - phase);
      const index = Math.min(Math.floor(progress), activeSegments.length - 1);
      const controls = activeSegments[index];
      const u = progress - index;
      const p = cubicBezier(...controls, u);
      const tangent = cubicBezierTangent(...controls, u);
      const angle = Math.atan2(tangent[1], tangent[0]) + (phase > activeSegments.length ? Math.PI : 0);
      updateMarker(curveMarker, [p[0], p[1], p[2] + 0.07], 0.045, angle, 0.18);
      if (curveFamily.value === "bezier") {
        const [level1, level2, p] = deCasteljau(activeSegments[Number(segmentSelect.value)], Number(parameter.value));
        const lines = new Float32Array([...createCurveVertices(level1, [1, 0.68, 0.22]), ...createCurveVertices(level2, [1, 0.36, 0.68])]);
        device.queue.writeBuffer(constructionBuffer, 0, lines);
        updateMarker(constructionMarker, [p[0], p[1], p[2] + 0.05], 0.068);
      }
    }
    const headAngle = Math.sin(t * 0.8) * 0.18;
    const headTranslation = translate(headPivot[0], headPivot[1], headPivot[2]);
    const headRotation = rotateY(headAngle);
    deerHead.setLocalMatrix(multiply(headTranslation, headRotation));
    deerRoot.updateWorldMatrix();
    for (const obj of forestObjects) {
      const position = obj.localPosition ?? obj.position;
      const T = translate(position[0], position[1], position[2]);
      const S = scale(obj.size[0], obj.size[1], obj.size[2]);
      const R = rotateY(obj.rotationY ?? 0);
      let model = multiply(T, multiply(R, S));
      if (obj.node) {
        model = multiply(obj.node.worldMatrix, model);
      }
      const mvp = multiply(projection, multiply(view, model));
      device.queue.writeBuffer(obj.uniformBuffer, 0, mvp);
    }
    arm.setLocalMatrix(rotateY(t * 0.8));
    root.updateWorldMatrix();
    for (const item of graphNodes) {
      const S = scale(item.size, item.size, item.size);
      const model = multiply(item.node.worldMatrix, S);
      const mvp = multiply(projection, multiply(view, model));
      device.queue.writeBuffer(item.uniformBuffer, 0, mvp);
      const axesMvp = multiply(projection, multiply(view, item.node.worldMatrix));
      device.queue.writeBuffer(item.axesUniformBuffer, 0, axesMvp);
    }
    const values = getControlValues();
    document.getElementById("tx-value").textContent = values.tx.toFixed(1);
    document.getElementById("ty-value").textContent = values.ty.toFixed(1);
    document.getElementById("tz-value").textContent = values.tz.toFixed(1);
    document.getElementById("rotation-value").textContent = values.rotation + "°";
    document.getElementById("scale-value").textContent = values.scale.toFixed(1);
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      let model;
      if (i === 1) {
        const T = translate(values.tx, values.ty, values.tz);
        const R = rotateY(values.rotation * Math.PI / 180);
        const S = scale(values.scale, values.scale, values.scale);
        const TRS = multiply(multiply(T, R), S);
        const SRT = multiply(multiply(S, R), T);
        model = values.order === "TRS" ? TRS : SRT;
        document.getElementById("trs-matrix").textContent = formatMatrix(TRS);
        document.getElementById("srt-matrix").textContent = formatMatrix(SRT);
        document.getElementById("trs-matrix") .classList.toggle("active", values.order === "TRS");
        document.getElementById("srt-matrix") .classList.toggle("active", values.order === "SRT");
      } else {
        const T = translate(obj.x, obj.y, obj.z);
        const R = multiply(rotateY(t * obj.speed), rotateX(0.3));
        const S = scale(obj.size, obj.size, obj.size);
        model = multiply(multiply(T, R), S);
      }
      const mvp = multiply(projection, multiply(view, model));
      device.queue.writeBuffer(obj.uniformBuffer, 0, mvp);
    }
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{view: context.getCurrentTexture().createView(), clearValue: { r: 0.07, g: 0.09, b: 0.14, a: 1 }, loadOp: "clear", storeOp: "store"}],
      depthStencilAttachment: {view: depthTexture.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store"}});
    painting.draw(pass, vp);
    let submittedVertices = 6;
    function draw(count) {
      pass.draw(count);
      submittedVertices += count;
    }
    if (sceneMode.value === "demo") {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, vertexBuffer);
      for (const obj of objects) {
        pass.setBindGroup(0, obj.bindGroup);
        draw(vertices.length / 6);
      }
      for (const item of graphNodes) {
        if (item.size <= 0) continue;
        pass.setBindGroup(0, item.bindGroup);
        draw(vertices.length / 6);
      }
      if (document.getElementById("debug-axes").checked) {
        pass.setPipeline(axesPipeline);
        pass.setVertexBuffer(0, axesBuffer);
        for (const item of graphNodes) {
          pass.setBindGroup(0, item.axesBindGroup);
          draw(6);
        }
      }
    }
    if (sceneMode.value === "painting") {
      pass.setPipeline(pipeline);
      for (const obj of forestObjects) {
        pass.setVertexBuffer(0, obj.vertexBuffer);
        pass.setBindGroup(0, obj.bindGroup);
        draw(obj.vertexCount);
      }
    }
    if (showTrace.checked) {
      pass.setPipeline(axesPipeline);
      pass.setBindGroup(0, curveBindGroup);
      pass.setVertexBuffer(0, curveBuffer);
      draw(curveVertices.length / 6);
      if (curveFamily.value === "bezier") {
        pass.setVertexBuffer(0, controlPolygonBuffer);
        draw(controlPolygonVertices.length / 6);
        pass.setVertexBuffer(0, constructionBuffer);
        draw(6);
      }
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, vertexBuffer);
      const markers = curveFamily.value === "bezier" ? [...visiblePoints, curveMarker, constructionMarker] : [...visiblePoints, curveMarker];
      for (const point of markers) {
        pass.setBindGroup(0, point.bindGroup);
        draw(vertices.length / 6);
      }
    }
    if (inspection.checked) {
      pass.setPipeline(axesPipeline);
      pass.setBindGroup(0, curveBindGroup);
      pass.setVertexBuffer(0, frustumBuffer);
      draw(24);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
    readPerformance(time, submittedVertices);
    requestAnimationFrame(render);
  }
  status.textContent = "WebGPU ready";
  requestAnimationFrame(render);
}
main().catch(error => {
  console.error(error);
  document.getElementById("status").textContent = error.message;
});