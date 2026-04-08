import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "schoolNotesApp";

function generateId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function loadAppData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        classes: [],
        selectedClassId: null,
        selectedNoteId: null,
        darkMode: false,
      };
    }

    const parsed = JSON.parse(raw);

    return {
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      selectedClassId: parsed.selectedClassId || null,
      selectedNoteId: parsed.selectedNoteId || null,
      darkMode: Boolean(parsed.darkMode),
    };
  } catch {
    return {
      classes: [],
      selectedClassId: null,
      selectedNoteId: null,
      darkMode: false,
    };
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "Just now";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ensureValidSelection(data) {
  const next = structuredClone(data);

  if (!next.classes.length) {
    next.selectedClassId = null;
    next.selectedNoteId = null;
    return next;
  }

  let selectedClass =
    next.classes.find((c) => c.id === next.selectedClassId) || null;

  if (!selectedClass) {
    next.selectedClassId = next.classes[0].id;
    selectedClass = next.classes[0];
  }

  if (!selectedClass.notes.length) {
    next.selectedNoteId = null;
    return next;
  }

  const selectedNote =
    selectedClass.notes.find((n) => n.id === next.selectedNoteId) || null;

  if (!selectedNote) {
    next.selectedNoteId = selectedClass.notes[0].id;
  }

  return next;
}

export default function App() {
  const [appData, setAppData] = useState(() =>
    ensureValidSelection(loadAppData())
  );
  const [saveStatus, setSaveStatus] = useState("Saved locally on this device");

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const drawingSaveTimeoutRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  }, [appData]);

  useEffect(() => {
    document.body.classList.toggle("dark", appData.darkMode);
  }, [appData.darkMode]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      setAppData(ensureValidSelection(loadAppData()));
      setSaveStatus("Updated from another tab");
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selectedClass = useMemo(
    () => appData.classes.find((c) => c.id === appData.selectedClassId) || null,
    [appData]
  );

  const selectedNote = useMemo(() => {
    if (!selectedClass) return null;
    return (
      selectedClass.notes.find((n) => n.id === appData.selectedNoteId) || null
    );
  }, [selectedClass, appData.selectedNoteId]);

  useEffect(() => {
    resizeCanvas();
    loadDrawingForSelectedNote();
  }, [selectedNote]);

  useEffect(() => {
    const onResize = () => {
      resizeCanvas();
      loadDrawingForSelectedNote();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  function saveMessage(message) {
    setSaveStatus(message);
  }

  function updateApp(updater, message = "Saved locally on this device") {
    setAppData((prev) => ensureValidSelection(updater(prev)));
    setSaveStatus(message);
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  function loadDrawingForSelectedNote() {
    clearCanvas();

    if (!selectedNote || !selectedNote.drawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const img = new Image();
    img.onload = () => {
      clearCanvas();
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = selectedNote.drawing;
  }

  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function autoSaveDrawing() {
    clearTimeout(drawingSaveTimeoutRef.current);

    drawingSaveTimeoutRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas || !selectedNote) return;

      const drawing = canvas.toDataURL("image/png");

      updateApp((prev) => {
        const next = structuredClone(prev);
        const cls = next.classes.find((c) => c.id === next.selectedClassId);
        if (!cls) return next;

        const note = cls.notes.find((n) => n.id === next.selectedNoteId);
        if (!note) return next;

        note.drawing = drawing;
        note.updatedAt = Date.now();
        return next;
      }, "Drawing saved");
    }, 250);
  }

  function handlePointerDown(event) {
    if (!selectedNote) return;

    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);

    drawingRef.current = true;
    const point = getCanvasPoint(event);
    lastPointRef.current = point;
    saveMessage("Drawing...");
  }

  function handlePointerMove(event) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
    autoSaveDrawing();
  }

  function handlePointerUp(event) {
    if (!drawingRef.current) return;

    try {
      canvasRef.current.releasePointerCapture(event.pointerId);
    } catch {
    }

    drawingRef.current = false;
    autoSaveDrawing();
  }

  function addClass() {
    const name = prompt("Enter class name:");
    if (!name || !name.trim()) return;

    updateApp((prev) => {
      const next = structuredClone(prev);
      const newClass = {
        id: generateId(),
        name: name.trim(),
        notes: [],
      };

      next.classes.unshift(newClass);
      next.selectedClassId = newClass.id;
      next.selectedNoteId = null;
      return next;
    });
  }

  function renameClass() {
    if (!selectedClass) return;

    const newName = prompt("Rename class:", selectedClass.name);
    if (!newName || !newName.trim()) return;

    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      if (cls) cls.name = newName.trim();
      return next;
    });
  }

  function deleteClass() {
    if (!selectedClass) return;

    const confirmed = confirm(`Delete "${selectedClass.name}" and all its notes?`);
    if (!confirmed) return;

    updateApp((prev) => {
      const next = structuredClone(prev);
      next.classes = next.classes.filter((c) => c.id !== next.selectedClassId);
      return next;
    });
  }

  function addNote() {
    if (!selectedClass) return;

    const timestamp = Date.now();

    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      if (!cls) return next;

      const newNote = {
        id: generateId(),
        title: "New Note",
        content: "",
        drawing: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      cls.notes.unshift(newNote);
      next.selectedNoteId = newNote.id;
      return next;
    });
  }

  function renameNote() {
    if (!selectedNote) return;

    const newTitle = prompt("Rename note:", selectedNote.title || "Untitled Note");
    if (!newTitle || !newTitle.trim()) return;

    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      const note = cls?.notes.find((n) => n.id === next.selectedNoteId);
      if (note) {
        note.title = newTitle.trim();
        note.updatedAt = Date.now();
      }
      return next;
    });
  }

  function deleteNote() {
    if (!selectedClass || !selectedNote) return;

    const confirmed = confirm(
      `Delete "${selectedNote.title || "Untitled Note"}"?`
    );
    if (!confirmed) return;

    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      if (!cls) return next;

      cls.notes = cls.notes.filter((n) => n.id !== next.selectedNoteId);
      return next;
    });
  }

  function updateNoteTitle(value) {
    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      const note = cls?.notes.find((n) => n.id === next.selectedNoteId);
      if (note) {
        note.title = value.trim() || "Untitled Note";
        note.updatedAt = Date.now();
      }
      return next;
    }, "Saved title");
  }

  function updateNoteContent(value) {
    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      const note = cls?.notes.find((n) => n.id === next.selectedNoteId);
      if (note) {
        note.content = value;
        note.updatedAt = Date.now();
      }
      return next;
    }, "Saved text");
  }

  function clearDrawing() {
    if (!selectedNote) return;

    const confirmed = confirm("Clear this drawing?");
    if (!confirmed) return;

    clearCanvas();

    updateApp((prev) => {
      const next = structuredClone(prev);
      const cls = next.classes.find((c) => c.id === next.selectedClassId);
      const note = cls?.notes.find((n) => n.id === next.selectedNoteId);
      if (note) {
        note.drawing = null;
        note.updatedAt = Date.now();
      }
      return next;
    }, "Drawing cleared");
  }

  function toggleTheme() {
    updateApp((prev) => ({
      ...prev,
      darkMode: !prev.darkMode,
    }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Student Notes</p>
          <h1>School Notes</h1>
        </div>
        <button onClick={toggleTheme} className="ghost-btn">
          {appData.darkMode ? "Light Mode" : "Dark Mode"}
        </button>
      </header>

      <main className="mobile-layout">
        <section className="panel sidebar-panel">
          <div className="panel-header">
            <h2>Classes</h2>
            <button onClick={addClass} className="primary-btn">+ Class</button>
          </div>

          <ul className="card-list">
            {appData.classes.length === 0 ? (
              <li className="card-item">
                <div className="card-item-title">No classes yet</div>
                <div className="card-item-meta">Tap + Class to get started</div>
              </li>
            ) : (
              appData.classes.map((cls) => (
                <li
                  key={cls.id}
                  className={`card-item ${cls.id === appData.selectedClassId ? "active" : ""}`}
                  onClick={() =>
                    setAppData((prev) =>
                      ensureValidSelection({
                        ...prev,
                        selectedClassId: cls.id,
                        selectedNoteId: cls.notes[0]?.id || null,
                      })
                    )
                  }
                >
                  <div className="card-item-title">{cls.name}</div>
                  <div className="card-item-meta">
                    {cls.notes.length} note{cls.notes.length === 1 ? "" : "s"}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel notes-panel">
          <div className="panel-header">
            <div>
              <h2>{selectedClass ? selectedClass.name : "Select a class"}</h2>
              <p className="subtext">
                {selectedClass
                  ? `${selectedClass.notes.length} note${selectedClass.notes.length === 1 ? "" : "s"}`
                  : "Choose a class to view notes"}
              </p>
            </div>

            <div className="actions-row">
              <button
                onClick={renameClass}
                className="ghost-btn"
                disabled={!selectedClass}
              >
                Rename
              </button>
              <button
                onClick={deleteClass}
                className="danger-btn"
                disabled={!selectedClass}
              >
                Delete
              </button>
              <button
                onClick={addNote}
                className="primary-btn"
                disabled={!selectedClass}
              >
                + Note
              </button>
            </div>
          </div>

          <div className="notes-grid">
            <aside className="notes-list-card">
              <div className="notes-list-header">
                <h3>Notes</h3>
              </div>

              <ul className="card-list">
                {!selectedClass ? (
                  <li className="card-item">
                    <div className="card-item-title">No class selected</div>
                    <div className="card-item-meta">Pick a class first</div>
                  </li>
                ) : selectedClass.notes.length === 0 ? (
                  <li className="card-item">
                    <div className="card-item-title">No notes yet</div>
                    <div className="card-item-meta">Tap + Note to make one</div>
                  </li>
                ) : (
                  selectedClass.notes.map((note) => (
                    <li
                      key={note.id}
                      className={`card-item ${note.id === appData.selectedNoteId ? "active" : ""}`}
                      onClick={() =>
                        setAppData((prev) => ({
                          ...prev,
                          selectedNoteId: note.id,
                        }))
                      }
                    >
                      <div className="card-item-title">
                        {note.title || "Untitled Note"}
                      </div>
                      <div className="card-item-meta">
                        Updated {formatDate(note.updatedAt)}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </aside>

            <section className="editor-card">
              <div className="editor-toolbar">
                <div className="editor-toolbar-left">
                  <button
                    onClick={renameNote}
                    className="ghost-btn"
                    disabled={!selectedNote}
                  >
                    Rename Note
                  </button>
                  <button
                    onClick={deleteNote}
                    className="danger-btn"
                    disabled={!selectedNote}
                  >
                    Delete Note
                  </button>
                </div>

                <button
                  onClick={clearDrawing}
                  className="ghost-btn"
                  disabled={!selectedNote}
                >
                  Clear Drawing
                </button>
              </div>

              <input
                type="text"
                placeholder="Note title"
                disabled={!selectedNote}
                value={selectedNote?.title || ""}
                onChange={(e) => updateNoteTitle(e.target.value)}
              />

              <textarea
                id="note-content"
                placeholder="Start typing your notes here..."
                disabled={!selectedNote}
                value={selectedNote?.content || ""}
                onChange={(e) => updateNoteContent(e.target.value)}
              />

              <section className="drawing-section">
                <div className="drawing-section-header">
                  <h3>Drawing</h3>
                  <span className="subtext">Draw in the same note</span>
                </div>

                <div className="canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    id="drawing-canvas"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />
                </div>
              </section>

              <div className="editor-footer">
                <span>{saveStatus}</span>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}