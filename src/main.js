import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";

// --- Scene setup ---
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.getElementById("app").appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(1, 1, 1);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
dirLight2.position.set(-1, -0.5, -1);
scene.add(dirLight2);

// Helpers
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);
const axesLabelsGroup = new THREE.Group();
function makeAxisLabel(text, color, position) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.cssText = `font-size:13px;font-weight:bold;color:${color};text-shadow:0 0 3px #000;`;
  const label = new CSS2DObject(div);
  label.position.copy(position);
  return label;
}
axesLabelsGroup.add(
  makeAxisLabel("X", "#ff4444", new THREE.Vector3(5.5, 0, 0))
);
axesLabelsGroup.add(
  makeAxisLabel("Y", "#44ff44", new THREE.Vector3(0, 5.5, 0))
);
axesLabelsGroup.add(
  makeAxisLabel("Z", "#4488ff", new THREE.Vector3(0, 0, 5.5))
);
scene.add(axesLabelsGroup);

const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// --- State ---
let currentSide = THREE.DoubleSide;
const fileEntries = []; // { id, name, group, data }
let fileIdCounter = 0;
let globalCenter = new THREE.Vector3();

// --- UI elements ---
const wireframeCheck = document.getElementById("wireframe");
const verticesCheck = document.getElementById("showVertices");
const normalsCheck = document.getElementById("showNormals");
const axesCheck = document.getElementById("showAxes");
const gridCheck = document.getElementById("showGrid");
const indicesCheck = document.getElementById("showIndices");
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
const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");

// --- Raycaster ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
raycaster.params.Points.threshold = 0.3;

// --- LandXML parser ---
function parseLandXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const surfaces = doc.getElementsByTagName("Surface");
  const results = [];

  for (const surface of surfaces) {
    const name = surface.getAttribute("name") || "Untitled";
    const pnts = surface.getElementsByTagName("P");
    const faces = surface.getElementsByTagName("F");

    // Build vertex map (1-based id → {index, x, y, z})
    const vertexMap = new Map();
    const vertices = [];
    let idx = 0;
    for (const p of pnts) {
      const id = parseInt(p.getAttribute("id"));
      const coords = p.textContent.trim().split(/\s+/).map(Number);
      // LandXML: northing, easting, elevation → we store as x=easting, y=northing, z=elevation
      vertexMap.set(id, idx);
      vertices.push(coords[1], coords[0], coords[2]);
      idx++;
    }

    const indices = [];
    for (const f of faces) {
      const ids = f.textContent.trim().split(/\s+/).map(Number);
      indices.push(vertexMap.get(ids[0]), vertexMap.get(ids[1]), vertexMap.get(ids[2]));
    }

    results.push({ name, indices, vertices });
  }

  return results;
}

// --- Compute global center from all files ---
function computeGlobalCenter() {
  const box = new THREE.Box3();
  for (const entry of fileEntries) {
    const verts = entry.data.vertices;
    for (let i = 0; i < verts.length; i += 3) {
      box.expandByPoint(new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2]));
    }
  }
  if (box.isEmpty()) {
    globalCenter.set(0, 0, 0);
  } else {
    box.getCenter(globalCenter);
  }
}

// --- Build mesh group for a file entry ---
function buildMeshGroup(entry) {
  const group = new THREE.Group();
  const { indices, vertices } = entry.data;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    positions[i] = vertices[i] - globalCenter.x;
    positions[i + 1] = vertices[i + 1] - globalCenter.y;
    positions[i + 2] = vertices[i + 2] - globalCenter.z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

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
  mesh.name = "mesh";
  group.add(mesh);

  // Wireframe overlay
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x8ecae6,
    opacity: 0.15,
    transparent: true,
  });
  const wireOverlay = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    wireMat
  );
  wireOverlay.name = "wireOverlay";
  wireOverlay.visible = !wireframeCheck.checked;
  group.add(wireOverlay);

  // Vertex points
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.slice(), 3)
  );
  const pointsMat = new THREE.PointsMaterial({
    color: 0xffb703,
    size: parseFloat(pointSizeSlider.value),
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pointsGeometry, pointsMat);
  points.name = "vertexPoints";
  points.visible = verticesCheck.checked;
  group.add(points);

  // Normal helpers
  const radius = geometry.boundingSphere.radius;
  const normalHelper = createNormalHelper(geometry, radius * 0.05);
  normalHelper.name = "normalHelper";
  normalHelper.visible = normalsCheck.checked;
  group.add(normalHelper);

  // Index labels
  const indexLabelsGroup = new THREE.Group();
  indexLabelsGroup.name = "indexLabels";
  indexLabelsGroup.visible = indicesCheck.checked;
  const pos = geometry.attributes.position;
  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i];
    const div = document.createElement("div");
    div.textContent = String(i);
    div.style.cssText =
      "font-size:10px;color:#fff;background:rgba(0,0,0,0.6);padding:0 2px;border-radius:2px;line-height:1.2;white-space:nowrap;";
    const label = new CSS2DObject(div);
    label.position.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
    indexLabelsGroup.add(label);
  }
  group.add(indexLabelsGroup);

  return group;
}

// --- Rebuild all meshes (after center changes) ---
function rebuildAll() {
  computeGlobalCenter();
  for (const entry of fileEntries) {
    if (entry.group) {
      scene.remove(entry.group);
      disposeGroup(entry.group);
    }
    entry.group = buildMeshGroup(entry);
    entry.group.visible = entry.visible;
    scene.add(entry.group);
  }
  updateStats();
  fitToAll();
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

// --- Add geometry data ---
function addGeometry(name, data) {
  const id = fileIdCounter++;
  const entry = { id, name, data, group: null, visible: true };
  fileEntries.push(entry);
  rebuildAll();
  updateFileListUI();
}

// --- Remove geometry ---
function removeGeometry(id) {
  const idx = fileEntries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const entry = fileEntries[idx];
  if (entry.group) {
    scene.remove(entry.group);
    disposeGroup(entry.group);
  }
  fileEntries.splice(idx, 1);
  rebuildAll();
  updateFileListUI();
}

// --- Update stats ---
function updateStats() {
  let totalTri = 0,
    totalVert = 0;
  for (const entry of fileEntries) {
    if (!entry.visible) continue;
    totalTri += entry.data.indices.length / 3;
    totalVert += entry.data.vertices.length / 3;
  }
  triCountEl.textContent = totalTri;
  vertCountEl.textContent = totalVert;
}

// --- File list UI ---
function updateFileListUI() {
  fileListEl.innerHTML = "";
  for (const entry of fileEntries) {
    const row = document.createElement("div");
    row.className = "file-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = entry.visible;
    cb.addEventListener("change", () => {
      entry.visible = cb.checked;
      if (entry.group) entry.group.visible = cb.checked;
      updateStats();
    });

    const label = document.createElement("span");
    label.className = "file-name";
    label.textContent = entry.name;
    label.title = entry.name;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "\u00d7";
    removeBtn.className = "file-remove";
    removeBtn.addEventListener("click", () => removeGeometry(entry.id));

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(removeBtn);
    fileListEl.appendChild(row);
  }
}

// --- Colors ---
function applyColors(geometry, mode) {
  const positions = geometry.attributes.position;
  const count = positions.count;
  const colors = new Float32Array(count * 3);
  const indices = geometry.index ? geometry.index.array : null;

  if (mode === "height") {
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
    new THREE.LineBasicMaterial({
      color: 0x00ff88,
      opacity: 0.5,
      transparent: true,
    })
  );
}

// --- Camera ---
function fitToAll() {
  const box = new THREE.Box3();
  for (const entry of fileEntries) {
    if (!entry.visible || !entry.group) continue;
    const mesh = entry.group.getObjectByName("mesh");
    if (mesh) {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox.clone();
      box.union(b);
    }
  }
  if (box.isEmpty()) return;

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const radius = sphere.radius;
  const center = sphere.center;

  const dist = radius * 2.5;
  camera.position.set(
    center.x + dist * 0.7,
    center.y - dist * 0.7,
    center.z + dist * 0.5
  );
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
  camera.near = radius * 0.01;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();

  // Scale helpers
  const s = radius * 0.5;
  axesHelper.scale.setScalar(s);
  axesHelper.position.set(box.min.x, box.min.y, box.min.z);
  gridHelper.scale.setScalar(radius * 0.1);
  gridHelper.position.set(center.x, center.y, box.min.z);
  const labels = axesLabelsGroup.children;
  labels[0].position.set(box.min.x + s * 1.1, box.min.y, box.min.z);
  labels[1].position.set(box.min.x, box.min.y + s * 1.1, box.min.z);
  labels[2].position.set(box.min.x, box.min.y, box.min.z + s * 1.1);
}

// --- Helpers: iterate all file meshes ---
function forEachMesh(fn) {
  for (const entry of fileEntries) {
    if (!entry.group) continue;
    fn(entry.group);
  }
}

// --- UI handlers ---
wireframeCheck.addEventListener("change", () => {
  forEachMesh((g) => {
    const m = g.getObjectByName("mesh");
    if (m) m.material.wireframe = wireframeCheck.checked;
    const w = g.getObjectByName("wireOverlay");
    if (w) w.visible = !wireframeCheck.checked;
  });
});

verticesCheck.addEventListener("change", () => {
  forEachMesh((g) => {
    const p = g.getObjectByName("vertexPoints");
    if (p) p.visible = verticesCheck.checked;
  });
});

normalsCheck.addEventListener("change", () => {
  forEachMesh((g) => {
    const n = g.getObjectByName("normalHelper");
    if (n) n.visible = normalsCheck.checked;
  });
});

indicesCheck.addEventListener("change", () => {
  forEachMesh((g) => {
    const l = g.getObjectByName("indexLabels");
    if (l) l.visible = indicesCheck.checked;
  });
});

axesCheck.addEventListener("change", () => {
  axesHelper.visible = axesCheck.checked;
  axesLabelsGroup.visible = axesCheck.checked;
});

gridCheck.addEventListener("change", () => {
  gridHelper.visible = gridCheck.checked;
});

colorModeSelect.addEventListener("change", () => {
  forEachMesh((g) => {
    const m = g.getObjectByName("mesh");
    if (m) {
      applyColors(m.geometry, colorModeSelect.value);
      m.geometry.attributes.color.needsUpdate = true;
    }
  });
});

opacitySlider.addEventListener("input", () => {
  forEachMesh((g) => {
    const m = g.getObjectByName("mesh");
    if (m) m.material.opacity = parseFloat(opacitySlider.value);
  });
});

pointSizeSlider.addEventListener("input", () => {
  forEachMesh((g) => {
    const p = g.getObjectByName("vertexPoints");
    if (p) p.material.size = parseFloat(pointSizeSlider.value);
  });
});

resetCameraBtn.addEventListener("click", fitToAll);
fitToViewBtn.addEventListener("click", fitToAll);

toggleSideBtn.addEventListener("click", () => {
  if (currentSide === THREE.DoubleSide) currentSide = THREE.FrontSide;
  else if (currentSide === THREE.FrontSide) currentSide = THREE.BackSide;
  else currentSide = THREE.DoubleSide;
  const labels = {
    [THREE.DoubleSide]: "Double",
    [THREE.FrontSide]: "Front",
    [THREE.BackSide]: "Back",
  };
  toggleSideBtn.textContent = `Side: ${labels[currentSide]}`;
  forEachMesh((g) => {
    const m = g.getObjectByName("mesh");
    if (m) {
      m.material.side = currentSide;
      m.material.needsUpdate = true;
    }
  });
});

// --- File loading ---
function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "xml" || text.trimStart().startsWith("<")) {
        const surfaces = parseLandXML(text);
        if (surfaces.length === 0) {
          alert("No surfaces found in LandXML");
          return;
        }
        for (const s of surfaces) {
          addGeometry(`${file.name} [${s.name}]`, s);
        }
      } else {
        const data = JSON.parse(text);
        if (data.indices && data.vertices) {
          addGeometry(file.name, data);
        } else {
          alert("JSON must have 'indices' and 'vertices' arrays");
        }
      }
    } catch (e) {
      alert("Failed to parse file: " + e.message);
    }
  };
  reader.readAsText(file);
}

fileInput.addEventListener("change", () => {
  for (const f of fileInput.files) loadFile(f);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () =>
  dropzone.classList.remove("dragover")
);
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  for (const f of e.dataTransfer.files) loadFile(f);
});

// --- Hover ---
canvas.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

function updateHoverInfo() {
  raycaster.setFromCamera(mouse, camera);
  const meshes = [];
  for (const entry of fileEntries) {
    if (!entry.visible || !entry.group) continue;
    const m = entry.group.getObjectByName("mesh");
    if (m) meshes.push(m);
  }
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const hit = intersects[0];
    const p = hit.point;
    const ox = p.x + globalCenter.x;
    const oy = p.y + globalCenter.y;
    const oz = p.z + globalCenter.z;
    hoverInfoEl.textContent = `Tri #${hit.faceIndex} | (${ox.toFixed(6)}, ${oy.toFixed(6)}, ${oz.toFixed(6)})`;
  } else {
    hoverInfoEl.textContent = "";
  }
}

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateHoverInfo();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// --- Init ---
fetch(import.meta.env.BASE_URL + "default-geometry.json")
  .then((r) => r.json())
  .then((data) => addGeometry("default-geometry.json", data));

animate();
