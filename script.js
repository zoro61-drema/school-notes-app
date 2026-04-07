const STORAGE_KEY = "schoolNotesApp";

const classListEl = document.getElementById("class-list");
const noteListEl = document.getElementById("note-list");
const addClassBtn = document.getElementById("add-class-btn");
const addNoteBtn = document.getElementById("add-note-btn");
const renameClassBtn = document.getElementById("rename-class-btn");
const deleteClassBtn = document.getElementById("delete-class-btn");
const renameNoteBtn = document.getElementById("rename-note-btn");
const deleteNoteBtn = document.getElementById("delete-note-btn");
const currentClassTitle = document.getElementById("current-class-title");
const currentClassSubtitle = document.getElementById("current-class-subtitle");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const toggleThemeBtn = document.getElementById("toggle-theme");
const saveStatusEl = document.getElementById("save-status");
const clearCanvasBtn = document.getElementById("clear-canvas-btn");
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let drawingSaveTimeout = null;

let appData = loadAppData();

function loadAppData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        classes: [],
        selectedClassId: null,
        selectedNoteId: null,
        darkMode: false
      };
    }

    const parsed = JSON.parse(raw);

    return {
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      selectedClassId: parsed.selectedClassId || null,
      selectedNoteId: parsed.selectedNoteId || null,
      darkMode: Boolean(parsed.darkMode)
    };
  } catch (error) {
    console.error("Failed to load app data:", error);
    return {
      classes: [],
      selectedClassId: null,
      selectedNoteId: null,
      darkMode: false
    };
  }
}

function saveApp(message = "Saved locally on this device") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  saveStatusEl.textContent = message;
}

function generateId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function getSelectedClass() {
  return appData.classes.find((c) => c.id === appData.selectedClassId) || null;
}

function getSelectedNote() {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return null;
  return selectedClass.notes.find((n) => n.id === appData.selectedNoteId) || null;
}

function formatDate(timestamp) {
  if (!timestamp) return "Just now";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureValidSelection() {
  if (!appData.classes.length) {
    appData.selectedClassId = null;
    appData.selectedNoteId = null;
    return;
  }

  const selectedClass = getSelectedClass();

  if (!selectedClass) {
    appData.selectedClassId = appData.classes[0].id;
  }

  const currentClass = getSelectedClass();

  if (!currentClass) {
    appData.selectedNoteId = null;
    return;
  }

  if (!currentClass.notes.length) {
    appData.selectedNoteId = null;
    return;
  }

  const selectedNote = getSelectedNote();

  if (!selectedNote) {
    appData.selectedNoteId = currentClass.notes[0].id;
  }
}

function renderClasses() {
  classListEl.innerHTML = "";

  if (appData.classes.length === 0) {
    classListEl.innerHTML = `
      <li class="card-item">
        <div class="card-item-title">No classes yet</div>
        <div class="card-item-meta">Tap + Class to get started</div>
      </li>
    `;
    return;
  }

  appData.classes.forEach((cls) => {
    const li = document.createElement("li");
    li.className = "card-item";
    if (cls.id === appData.selectedClassId) li.classList.add("active");

    li.innerHTML = `
      <div class="card-item-title">${escapeHtml(cls.name)}</div>
      <div class="card-item-meta">${cls.notes.length} note${cls.notes.length === 1 ? "" : "s"}</div>
    `;

    li.addEventListener("click", () => {
      appData.selectedClassId = cls.id;
      appData.selectedNoteId = cls.notes[0]?.id || null;
      saveApp();
      render();
    });

    classListEl.appendChild(li);
  });
}

function renderNotes() {
  noteListEl.innerHTML = "";
  const selectedClass = getSelectedClass();

  const hasClass = Boolean(selectedClass);
  renameClassBtn.disabled = !hasClass;
  deleteClassBtn.disabled = !hasClass;
  addNoteBtn.disabled = !hasClass;

  if (!selectedClass) {
    currentClassTitle.textContent = "Select a class";
    currentClassSubtitle.textContent = "Choose a class to view notes";

    noteTitleInput.disabled = true;
    noteContentInput.disabled = true;
    renameNoteBtn.disabled = true;
    deleteNoteBtn.disabled = true;
    clearCanvasBtn.disabled = true;

    noteTitleInput.value = "";
    noteContentInput.value = "";
    clearCanvas();
    return;
  }

  currentClassTitle.textContent = selectedClass.name;
  currentClassSubtitle.textContent = `${selectedClass.notes.length} note${selectedClass.notes.length === 1 ? "" : "s"}`;

  if (selectedClass.notes.length === 0) {
    noteListEl.innerHTML = `
      <li class="card-item">
        <div class="card-item-title">No notes yet</div>
        <div class="card-item-meta">Tap + Note to make one</div>
      </li>
    `;
  } else {
    selectedClass.notes.forEach((note) => {
      const li = document.createElement("li");
      li.className = "card-item";
      if (note.id === appData.selectedNoteId) li.classList.add("active");

      li.innerHTML = `
        <div class="card-item-title">${escapeHtml(note.title || "Untitled Note")}</div>
        <div class="card-item-meta">Updated ${formatDate(note.updatedAt)}</div>
      `;

      li.addEventListener("click", () => {
        appData.selectedNoteId = note.id;
        saveApp();
        render();
      });

      noteListEl.appendChild(li);
    });
  }

  const selectedNote = getSelectedNote();
  const hasNote = Boolean(selectedNote);

  renameNoteBtn.disabled = !hasNote;
  deleteNoteBtn.disabled = !hasNote;
  clearCanvasBtn.disabled = !hasNote;

  if (!selectedNote) {
    noteTitleInput.disabled = true;
    noteContentInput.disabled = true;
    noteTitleInput.value = "";
    noteContentInput.value = "";
    clearCanvas();
    return;
  }

  noteTitleInput.disabled = false;
  noteContentInput.disabled = false;
  noteTitleInput.value = selectedNote.title || "";
  noteContentInput.value = selectedNote.content || "";

  resizeCanvas();
  loadDrawingForSelectedNote();
}

function renderTheme() {
  document.body.classList.toggle("dark", appData.darkMode);
  toggleThemeBtn.textContent = appData.darkMode ? "Light Mode" : "Dark Mode";
}

function render() {
  ensureValidSelection();
  renderTheme();
  renderClasses();
  renderNotes();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111827";

  clearCanvas();
}

function clearCanvas() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function autoSaveDrawing() {
  clearTimeout(drawingSaveTimeout);

  drawingSaveTimeout = setTimeout(() => {
    const selectedNote = getSelectedNote();
    if (!selectedNote) return;

    selectedNote.drawing = canvas.toDataURL("image/png");
    selectedNote.updatedAt = Date.now();

    saveApp("Drawing saved");
    renderNotes();
  }, 250);
}

function startDrawing(event) {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);

  isDrawing = true;

  const point = getCanvasPoint(event);
  lastX = point.x;
  lastY = point.y;

  saveStatusEl.textContent = "Drawing...";
}

function draw(event) {
  if (!isDrawing) return;

  event.preventDefault();

  const point = getCanvasPoint(event);

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();

  lastX = point.x;
  lastY = point.y;

  autoSaveDrawing();
}

function stopDrawing(event) {
  if (!isDrawing) return;

  if (event && typeof event.pointerId !== "undefined") {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
    }
  }

  isDrawing = false;
  autoSaveDrawing();
}

function loadDrawingForSelectedNote() {
  clearCanvas();

  const selectedNote = getSelectedNote();
  if (!selectedNote || !selectedNote.drawing) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const img = new Image();
  img.onload = () => {
    clearCanvas();
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  img.src = selectedNote.drawing;
}

addClassBtn.addEventListener("click", () => {
  const name = prompt("Enter class name:");
  if (!name || !name.trim()) return;

  const newClass = {
    id: generateId(),
    name: name.trim(),
    notes: []
  };

  appData.classes.unshift(newClass);
  appData.selectedClassId = newClass.id;
  appData.selectedNoteId = null;

  saveApp();
  render();
});

renameClassBtn.addEventListener("click", () => {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return;

  const newName = prompt("Rename class:", selectedClass.name);
  if (!newName || !newName.trim()) return;

  selectedClass.name = newName.trim();
  saveApp();
  render();
});

deleteClassBtn.addEventListener("click", () => {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return;

  const confirmed = confirm(`Delete "${selectedClass.name}" and all its notes?`);
  if (!confirmed) return;

  appData.classes = appData.classes.filter((c) => c.id !== selectedClass.id);

  saveApp();
  render();
});

addNoteBtn.addEventListener("click", () => {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return;

  const timestamp = Date.now();
  const newNote = {
    id: generateId(),
    title: "New Note",
    content: "",
    drawing: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  selectedClass.notes.unshift(newNote);
  appData.selectedNoteId = newNote.id;

  saveApp();
  render();

  noteTitleInput.focus();
  noteTitleInput.select();
});

renameNoteBtn.addEventListener("click", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  const newTitle = prompt("Rename note:", selectedNote.title || "Untitled Note");
  if (!newTitle || !newTitle.trim()) return;

  selectedNote.title = newTitle.trim();
  selectedNote.updatedAt = Date.now();

  saveApp();
  render();
});

deleteNoteBtn.addEventListener("click", () => {
  const selectedClass = getSelectedClass();
  const selectedNote = getSelectedNote();
  if (!selectedClass || !selectedNote) return;

  const confirmed = confirm(`Delete "${selectedNote.title || "Untitled Note"}"?`);
  if (!confirmed) return;

  selectedClass.notes = selectedClass.notes.filter((n) => n.id !== selectedNote.id);

  saveApp();
  render();
});

noteTitleInput.addEventListener("input", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  selectedNote.title = noteTitleInput.value.trim() || "Untitled Note";
  selectedNote.updatedAt = Date.now();

  saveApp("Saved title");
  renderNotes();
});

noteContentInput.addEventListener("input", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  selectedNote.content = noteContentInput.value;
  selectedNote.updatedAt = Date.now();

  saveApp("Saved text");
  renderNotes();
});

toggleThemeBtn.addEventListener("click", () => {
  appData.darkMode = !appData.darkMode;
  saveApp();
  renderTheme();
});

clearCanvasBtn.addEventListener("click", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  const confirmed = confirm("Clear this drawing?");
  if (!confirmed) return;

  selectedNote.drawing = null;
  selectedNote.updatedAt = Date.now();

  clearCanvas();
  saveApp("Drawing cleared");
  renderNotes();
});

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);

window.addEventListener("resize", () => {
  resizeCanvas();
  loadDrawingForSelectedNote();
});

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;

  appData = loadAppData();
  render();
  saveStatusEl.textContent = "Updated from another tab";
});

render();