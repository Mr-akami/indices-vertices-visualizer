import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- Scene setup ---
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(1, 1, 1);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
dirLight2.position.set(-1, -0.5, -1);
scene.add(dirLight2);

// Helpers
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);
const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355);
scene.add(gridHelper);

// --- State ---
let meshGroup = new THREE.Group();
scene.add(meshGroup);
let currentSide = THREE.DoubleSide;

// --- UI elements ---
const wireframeCheck = document.getElementById("wireframe");
const verticesCheck = document.getElementById("showVertices");
const normalsCheck = document.getElementById("showNormals");
const axesCheck = document.getElementById("showAxes");
const gridCheck = document.getElementById("showGrid");
const colorModeSelect = document.getElementById("colorMode");
const opacitySlider = document.getElementById("opacity");
const pointSizeSlider = document.getElementById("pointSize");
const resetCameraBtn = document.getElementById("resetCamera");
const fitToViewBtn = document.getElementById("fitToView");
const toggleSideBtn = document.getElementById("toggleSide");
const triCountEl = document.getElementById("triCount");
const vertCountEl = document.getElementById("vertCount");
const hoverInfoEl = document.getElementById("hoverInfo");
const dropzone = document.getElementById("dropzone");

// --- Raycaster for hover ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
raycaster.params.Points.threshold = 0.3;

// --- Load and render geometry ---
function loadGeometry(data) {
  // Clear previous
  meshGroup.clear();

  const { indices, vertices } = data;
  const numVertices = vertices.length / 3;
  const numTriangles = indices.length / 3;

  triCountEl.textContent = numTriangles;
  vertCountEl.textContent = numVertices;

  // Create buffer geometry
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Center the geometry
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  // Compute bounding sphere for camera fitting
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius;

  // Apply vertex colors
  applyColors(geometry, colorModeSelect.value);

  // Mesh
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: currentSide,
    transparent: true,
    opacity: parseFloat(opacitySlider.value),
    wireframe: wireframeCheck.checked,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "mainMesh";
  meshGroup.add(mesh);

  // Wireframe overlay (always visible when wireframe is off for edge clarity)
  const wireGeometry = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x8ecae6,
    opacity: 0.15,
    transparent: true,
  });
  const wireOverlay = new THREE.LineSegments(wireGeometry, wireMat);
  wireOverlay.name = "wireOverlay";
  wireOverlay.visible = !wireframeCheck.checked;
  meshGroup.add(wireOverlay);

  // Vertex points
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.slice(), 3)
  );
  // Apply same centering
  const posArr = pointsGeometry.attributes.position.array;
  for (let i = 0; i < posArr.length; i += 3) {
    posArr[i] -= center.x;
    posArr[i + 1] -= center.y;
    posArr[i + 2] -= center.z;
  }
  const pointsMat = new THREE.PointsMaterial({
    color: 0xffb703,
    size: parseFloat(pointSizeSlider.value),
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pointsGeometry, pointsMat);
  points.name = "vertexPoints";
  points.visible = verticesCheck.checked;
  meshGroup.add(points);

  // Normal helpers
  const normalLength = radius * 0.05;
  const normalHelper = createNormalHelper(geometry, normalLength);
  normalHelper.name = "normalHelper";
  normalHelper.visible = normalsCheck.checked;
  meshGroup.add(normalHelper);

  // Fit camera
  fitCamera(radius);

  // Scale grid/axes
  axesHelper.scale.setScalar(radius * 0.5);
  gridHelper.scale.setScalar(radius * 0.1);
}

function applyColors(geometry, mode) {
  const positions = geometry.attributes.position;
  const count = positions.count;
  const colors = new Float32Array(count * 3);
  const indices = geometry.index ? geometry.index.array : null;

  if (mode === "height") {
    // Color by Z value (height)
    let minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = positions.getZ(i);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const range = maxZ - minZ || 1;
    for (let i = 0; i < count; i++) {
      const t = (positions.getZ(i) - minZ) / range;
      const color = new THREE.Color();
      color.setHSL(0.66 - t * 0.66, 0.85, 0.55);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  } else if (mode === "index") {
    // Color by triangle index
    const numTri = indices ? indices.length / 3 : count / 3;
    for (let t = 0; t < numTri; t++) {
      const color = new THREE.Color();
      color.setHSL((t / numTri) * 0.9, 0.8, 0.55);
      for (let j = 0; j < 3; j++) {
        const vi = indices ? indices[t * 3 + j] : t * 3 + j;
        colors[vi * 3] = color.r;
        colors[vi * 3 + 1] = color.g;
        colors[vi * 3 + 2] = color.b;
      }
    }
  } else {
    // Flat color
    const color = new THREE.Color(0x219ebc);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createNormalHelper(geometry, length) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const count = positions.count;
  const linePositions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    linePositions[i * 6] = x;
    linePositions[i * 6 + 1] = y;
    linePositions[i * 6 + 2] = z;
    linePositions[i * 6 + 3] = x + normals.getX(i) * length;
    linePositions[i * 6 + 4] = y + normals.getY(i) * length;
    linePositions[i * 6 + 5] = z + normals.getZ(i) * length;
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3)
  );
  return new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.5, transparent: true })
  );
}

function fitCamera(radius) {
  const dist = radius * 2.5;
  camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
  camera.near = radius * 0.01;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
}

function getMainMesh() {
  return meshGroup.getObjectByName("mainMesh");
}

// --- UI handlers ---
wireframeCheck.addEventListener("change", () => {
  const mesh = getMainMesh();
  if (mesh) mesh.material.wireframe = wireframeCheck.checked;
  const overlay = meshGroup.getObjectByName("wireOverlay");
  if (overlay) overlay.visible = !wireframeCheck.checked;
});

verticesCheck.addEventListener("change", () => {
  const pts = meshGroup.getObjectByName("vertexPoints");
  if (pts) pts.visible = verticesCheck.checked;
});

normalsCheck.addEventListener("change", () => {
  const nh = meshGroup.getObjectByName("normalHelper");
  if (nh) nh.visible = normalsCheck.checked;
});

axesCheck.addEventListener("change", () => {
  axesHelper.visible = axesCheck.checked;
});

gridCheck.addEventListener("change", () => {
  gridHelper.visible = gridCheck.checked;
});

colorModeSelect.addEventListener("change", () => {
  const mesh = getMainMesh();
  if (mesh) {
    applyColors(mesh.geometry, colorModeSelect.value);
    mesh.geometry.attributes.color.needsUpdate = true;
  }
});

opacitySlider.addEventListener("input", () => {
  const mesh = getMainMesh();
  if (mesh) mesh.material.opacity = parseFloat(opacitySlider.value);
});

pointSizeSlider.addEventListener("input", () => {
  const pts = meshGroup.getObjectByName("vertexPoints");
  if (pts) pts.material.size = parseFloat(pointSizeSlider.value);
});

resetCameraBtn.addEventListener("click", () => {
  const mesh = getMainMesh();
  if (mesh) {
    mesh.geometry.computeBoundingSphere();
    fitCamera(mesh.geometry.boundingSphere.radius);
  }
});

fitToViewBtn.addEventListener("click", () => {
  const mesh = getMainMesh();
  if (mesh) {
    mesh.geometry.computeBoundingSphere();
    fitCamera(mesh.geometry.boundingSphere.radius);
  }
});

toggleSideBtn.addEventListener("click", () => {
  const mesh = getMainMesh();
  if (!mesh) return;
  if (currentSide === THREE.DoubleSide) currentSide = THREE.FrontSide;
  else if (currentSide === THREE.FrontSide) currentSide = THREE.BackSide;
  else currentSide = THREE.DoubleSide;
  mesh.material.side = currentSide;
  mesh.material.needsUpdate = true;
  const labels = {
    [THREE.DoubleSide]: "Double",
    [THREE.FrontSide]: "Front",
    [THREE.BackSide]: "Back",
  };
  toggleSideBtn.textContent = `Side: ${labels[currentSide]}`;
});

// --- Drag & drop ---
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.indices && data.vertices) {
        loadGeometry(data);
      } else {
        alert("JSON must have 'indices' and 'vertices' arrays");
      }
    } catch {
      alert("Invalid JSON file");
    }
  };
  reader.readAsText(file);
});

// --- Hover info ---
canvas.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

function updateHoverInfo() {
  const mesh = getMainMesh();
  if (!mesh) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(mesh);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const triIdx = hit.faceIndex;
    const p = hit.point;
    hoverInfoEl.textContent = `Tri #${triIdx} | (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
  } else {
    hoverInfoEl.textContent = "";
  }
}

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateHoverInfo();
  renderer.render(scene, camera);
}

// --- Init ---
fetch(import.meta.env.BASE_URL + "default-geometry.json")
  .then((r) => r.json())
  .then((data) => loadGeometry(data));

animate();
