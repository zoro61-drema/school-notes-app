import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import FullscreenDrawingModal from "./components/FullscreenDrawingModal";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const EMPTY_SAVE_STATE = {
  state: "idle",
  lastSavedAt: null,
  error: "",
};

function createId() {
  return crypto.randomUUID();
}

function formatTimestamp(value) {
  if (!value) return "Just now";

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSortOrder() {
  return Math.floor(Date.now() / 1000);
}

function sortClasses(list) {
  return [...list].sort((left, right) => {
    if (right.sort_order !== left.sort_order) {
      return right.sort_order - left.sort_order;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function sortNotes(list) {
  return [...list].sort((left, right) => {
    if (right.sort_order !== left.sort_order) {
      return right.sort_order - left.sort_order;
    }

    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

function ensureValidSelection(classes, notes, selectedClassId, selectedNoteId) {
  if (!classes.length) {
    return {
      selectedClassId: null,
      selectedNoteId: null,
    };
  }

  const nextClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classes[0].id;

  const classNotes = notes.filter((note) => note.class_id === nextClassId);
  const nextNoteId = classNotes.some((item) => item.id === selectedNoteId)
    ? selectedNoteId
    : classNotes[0]?.id || null;

  return {
    selectedClassId: nextClassId,
    selectedNoteId: nextNoteId,
  };
}

function getSaveLabel(saveState) {
  if (!saveState || saveState.state === "idle") {
    return "Saved";
  }

  if (saveState.state === "saving") {
    return "Saving...";
  }

  if (saveState.state === "error") {
    return saveState.error || "Error saving";
  }

  if (!saveState.lastSavedAt) {
    return "Saved";
  }

  return `Last saved ${new Date(saveState.lastSavedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function App() {
  const [classes, setClasses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(
    isSupabaseConfigured ? "" : "Add your Supabase URL and anon key in .env before using sync."
  );
  const [isClassBusy, setIsClassBusy] = useState(false);
  const [isNoteBusy, setIsNoteBusy] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [noteSaveStates, setNoteSaveStates] = useState({});

  const textSaveTimeoutRef = useRef(null);
  const drawingSaveTimeoutRef = useRef(null);

  const classesById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes]
  );

  const notesByClassId = useMemo(() => {
    const nextMap = new Map();

    for (const note of notes) {
      if (!nextMap.has(note.class_id)) {
        nextMap.set(note.class_id, []);
      }

      nextMap.get(note.class_id).push(note);
    }

    for (const [key, value] of nextMap.entries()) {
      nextMap.set(key, sortNotes(value));
    }

    return nextMap;
  }, [notes]);

  const selectedClass = selectedClassId ? classesById.get(selectedClassId) || null : null;
  const selectedClassNotes = selectedClassId ? notesByClassId.get(selectedClassId) || [] : [];
  const selectedNote = selectedNoteId
    ? notes.find((item) => item.id === selectedNoteId) || null
    : null;

  const selectedNoteSaveState = selectedNoteId
    ? noteSaveStates[selectedNoteId] || EMPTY_SAVE_STATE
    : EMPTY_SAVE_STATE;

  const loadData = useEffectEvent(async (options = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError("");

    const [classesResponse, notesResponse] = await Promise.all([
      supabase
        .from("classes")
        .select("*")
        .order("sort_order", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("*")
        .order("sort_order", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

    if (classesResponse.error || notesResponse.error) {
      setLoadError(classesResponse.error?.message || notesResponse.error?.message || "Unable to load data.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const nextClasses = sortClasses(classesResponse.data || []);
    const nextNotes = sortNotes(notesResponse.data || []);
    const nextSelection = ensureValidSelection(
      nextClasses,
      nextNotes,
      selectedClassId,
      selectedNoteId
    );

    setClasses(nextClasses);
    setNotes(nextNotes);
    setSelectedClassId(nextSelection.selectedClassId);
    setSelectedNoteId(nextSelection.selectedNoteId);
    setIsLoading(false);
    setIsRefreshing(false);
  });

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    loadData();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const onFocus = () => {
      loadData({ silent: true });
    };

    const refreshInterval = window.setInterval(() => {
      loadData({ silent: true });
    }, 30000);

    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", onFocus);
    };
  }, [selectedClassId, selectedNoteId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(textSaveTimeoutRef.current);
      window.clearTimeout(drawingSaveTimeoutRef.current);
    };
  }, []);

  function updateSelection(nextClasses, nextNotes, overrides = {}) {
    const nextSelection = ensureValidSelection(
      nextClasses,
      nextNotes,
      overrides.selectedClassId ?? selectedClassId,
      overrides.selectedNoteId ?? selectedNoteId
    );

    setSelectedClassId(nextSelection.selectedClassId);
    setSelectedNoteId(nextSelection.selectedNoteId);
  }

  function updateNoteLocally(noteId, patch) {
    setNotes((currentNotes) =>
      sortNotes(
        currentNotes.map((note) =>
          note.id === noteId
            ? {
                ...note,
                ...patch,
                updated_at: patch.updated_at || new Date().toISOString(),
              }
            : note
        )
      )
    );
  }

  function markNoteSaving(noteId) {
    setNoteSaveStates((current) => ({
      ...current,
      [noteId]: {
        ...(current[noteId] || EMPTY_SAVE_STATE),
        state: "saving",
        error: "",
      },
    }));
  }

  function markNoteSaved(noteId, lastSavedAt) {
    setNoteSaveStates((current) => ({
      ...current,
      [noteId]: {
        state: "saved",
        lastSavedAt,
        error: "",
      },
    }));
  }

  function markNoteError(noteId, error) {
    setNoteSaveStates((current) => ({
      ...current,
      [noteId]: {
        ...(current[noteId] || EMPTY_SAVE_STATE),
        state: "error",
        error,
      },
    }));
  }

  async function persistNotePatch(noteId, patch) {
    markNoteSaving(noteId);

    const response = await supabase
      .from("notes")
      .update(patch)
      .eq("id", noteId)
      .select("*")
      .single();

    if (response.error) {
      markNoteError(noteId, "Error saving");
      return;
    }

    setNotes((currentNotes) =>
      sortNotes(currentNotes.map((item) => (item.id === noteId ? response.data : item)))
    );
    markNoteSaved(noteId, response.data.updated_at);
  }

  function queueTextSave(noteId, nextTitle, nextContent) {
    window.clearTimeout(textSaveTimeoutRef.current);
    markNoteSaving(noteId);

    textSaveTimeoutRef.current = window.setTimeout(() => {
      persistNotePatch(noteId, {
        title: nextTitle.trim() || "Untitled Note",
        content: nextContent,
      });
    }, 1400);
  }

  function queueDrawingSave(noteId, drawingValue) {
    window.clearTimeout(drawingSaveTimeoutRef.current);
    markNoteSaving(noteId);

    drawingSaveTimeoutRef.current = window.setTimeout(() => {
      persistNotePatch(noteId, {
        drawing: drawingValue,
      });
    }, 6500);
  }

  async function addClass() {
    const name = prompt("Enter class name:");
    if (!name || !name.trim()) return;

    setIsClassBusy(true);
    const newClass = {
      id: createId(),
      name: name.trim(),
      sort_order: getSortOrder(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const optimisticClasses = sortClasses([newClass, ...classes]);
    setClasses(optimisticClasses);
    setSelectedClassId(newClass.id);
    setSelectedNoteId(null);

    const response = await supabase.from("classes").insert(newClass).select("*").single();

    if (response.error) {
      setClasses(classes);
      updateSelection(classes, notes);
      setLoadError(response.error.message);
      setIsClassBusy(false);
      return;
    }

    const remoteClasses = sortClasses(
      optimisticClasses.map((item) => (item.id === newClass.id ? response.data : item))
    );
    setClasses(remoteClasses);
    updateSelection(remoteClasses, notes, { selectedClassId: response.data.id });
    setIsClassBusy(false);
  }

  async function renameClass() {
    if (!selectedClass) return;

    const nextName = prompt("Rename class:", selectedClass.name);
    if (!nextName || !nextName.trim()) return;

    setIsClassBusy(true);
    const previousClasses = classes;
    const updatedClass = {
      ...selectedClass,
      name: nextName.trim(),
      updated_at: new Date().toISOString(),
    };

    const optimisticClasses = sortClasses(
      classes.map((item) => (item.id === selectedClass.id ? updatedClass : item))
    );
    setClasses(optimisticClasses);

    const response = await supabase
      .from("classes")
      .update({ name: nextName.trim() })
      .eq("id", selectedClass.id)
      .select("*")
      .single();

    if (response.error) {
      setClasses(previousClasses);
      setLoadError(response.error.message);
      setIsClassBusy(false);
      return;
    }

    setClasses(
      sortClasses(optimisticClasses.map((item) => (item.id === selectedClass.id ? response.data : item)))
    );
    setIsClassBusy(false);
  }

  async function deleteClass() {
    if (!selectedClass) return;

    const confirmed = confirm(`Delete "${selectedClass.name}" and all its notes?`);
    if (!confirmed) return;

    setIsClassBusy(true);
    const previousClasses = classes;
    const previousNotes = notes;

    const nextClasses = classes.filter((item) => item.id !== selectedClass.id);
    const nextNotes = notes.filter((item) => item.class_id !== selectedClass.id);
    setClasses(nextClasses);
    setNotes(nextNotes);
    updateSelection(nextClasses, nextNotes);

    const response = await supabase.from("classes").delete().eq("id", selectedClass.id);

    if (response.error) {
      setClasses(previousClasses);
      setNotes(previousNotes);
      updateSelection(previousClasses, previousNotes, {
        selectedClassId: selectedClass.id,
      });
      setLoadError(response.error.message);
      setIsClassBusy(false);
      return;
    }

    setIsClassBusy(false);
  }

  async function addNote() {
    if (!selectedClass) return;

    setIsNoteBusy(true);
    const now = new Date().toISOString();
    const newNote = {
      id: createId(),
      class_id: selectedClass.id,
      title: "New Note",
      content: "",
      drawing: null,
      sort_order: getSortOrder(),
      created_at: now,
      updated_at: now,
    };

    const optimisticNotes = sortNotes([newNote, ...notes]);
    setNotes(optimisticNotes);
    setSelectedNoteId(newNote.id);
    markNoteSaving(newNote.id);

    const response = await supabase.from("notes").insert(newNote).select("*").single();

    if (response.error) {
      setNotes(notes);
      setSelectedNoteId(selectedNoteId);
      setLoadError(response.error.message);
      setIsNoteBusy(false);
      return;
    }

    const remoteNotes = sortNotes(
      optimisticNotes.map((item) => (item.id === newNote.id ? response.data : item))
    );
    setNotes(remoteNotes);
    setSelectedNoteId(response.data.id);
    markNoteSaved(response.data.id, response.data.updated_at);
    setIsNoteBusy(false);
  }

  async function renameNote() {
    if (!selectedNote) return;

    const nextTitle = prompt("Rename note:", selectedNote.title || "Untitled Note");
    if (!nextTitle || !nextTitle.trim()) return;

    updateNoteLocally(selectedNote.id, {
      title: nextTitle.trim(),
      updated_at: new Date().toISOString(),
    });
    await persistNotePatch(selectedNote.id, {
      title: nextTitle.trim(),
    });
  }

  async function deleteNote() {
    if (!selectedNote) return;

    const confirmed = confirm(`Delete "${selectedNote.title || "Untitled Note"}"?`);
    if (!confirmed) return;

    setIsNoteBusy(true);
    const previousNotes = notes;
    const nextNotes = notes.filter((item) => item.id !== selectedNote.id);
    setNotes(nextNotes);
    updateSelection(classes, nextNotes, {
      selectedClassId,
    });

    const response = await supabase.from("notes").delete().eq("id", selectedNote.id);

    if (response.error) {
      setNotes(previousNotes);
      updateSelection(classes, previousNotes, {
        selectedClassId,
        selectedNoteId: selectedNote.id,
      });
      setLoadError(response.error.message);
      setIsNoteBusy(false);
      return;
    }

    setIsNoteBusy(false);
  }

  function updateNoteTitle(value) {
    if (!selectedNote) return;

    updateNoteLocally(selectedNote.id, {
      title: value,
      updated_at: new Date().toISOString(),
    });
    queueTextSave(selectedNote.id, value, selectedNote.content || "");
  }

  function updateNoteContent(value) {
    if (!selectedNote) return;

    updateNoteLocally(selectedNote.id, {
      content: value,
      updated_at: new Date().toISOString(),
    });
    queueTextSave(selectedNote.id, selectedNote.title || "", value);
  }

  async function clearDrawing() {
    if (!selectedNote) return;

    const confirmed = confirm("Clear this drawing?");
    if (!confirmed) return;

    updateNoteLocally(selectedNote.id, {
      drawing: null,
      updated_at: new Date().toISOString(),
    });
    window.clearTimeout(drawingSaveTimeoutRef.current);
    await persistNotePatch(selectedNote.id, { drawing: null });
  }

  function saveDrawing(nextDrawing) {
    if (!selectedNote) return;

    updateNoteLocally(selectedNote.id, {
      drawing: nextDrawing,
      updated_at: new Date().toISOString(),
    });
    queueDrawingSave(selectedNote.id, nextDrawing);
  }

  function selectClass(classId) {
    const nextNotes = notesByClassId.get(classId) || [];

    startTransition(() => {
      setSelectedClassId(classId);
      setSelectedNoteId(nextNotes[0]?.id || null);
    });
  }

  function selectNote(noteId) {
    startTransition(() => {
      setSelectedNoteId(noteId);
    });
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Student Notes</p>
            <h1>School Notes</h1>
            <p className="hero-copy">
              Your classes, notes, and sketches now stay synced across devices with a smoother edit flow.
            </p>
          </div>

          <div className="topbar-actions">
            <div className={`status-pill ${loadError ? "error" : ""}`}>
              {loadError
                ? loadError
                : isLoading
                  ? "Connecting to Supabase..."
                  : isRefreshing
                    ? "Refreshing..."
                    : "Sync online"}
            </div>
            <button onClick={() => setDarkMode((value) => !value)} className="ghost-btn">
              {darkMode ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </header>

        <main className="mobile-layout">
          <section className="panel sidebar-panel">
            <div className="panel-header">
              <div>
                <h2>Classes</h2>
                <p className="subtext">Organize every subject in one place</p>
              </div>
              <button
                onClick={addClass}
                className="primary-btn"
                disabled={!isSupabaseConfigured || isClassBusy || isLoading}
              >
                + Class
              </button>
            </div>

            <ul className="card-list">
              {isLoading ? (
                <>
                  <li className="card-item skeleton-card" />
                  <li className="card-item skeleton-card" />
                  <li className="card-item skeleton-card" />
                </>
              ) : classes.length === 0 ? (
                <li className="card-item empty-card">
                  <div className="card-item-title">No classes yet</div>
                  <div className="card-item-meta">Create your first class to start syncing notes.</div>
                </li>
              ) : (
                classes.map((item) => {
                  const noteCount = notesByClassId.get(item.id)?.length || 0;

                  return (
                    <li
                      key={item.id}
                      className={`card-item ${item.id === selectedClassId ? "active" : ""}`}
                      onClick={() => selectClass(item.id)}
                    >
                      <div className="card-item-title">{item.name}</div>
                      <div className="card-item-meta">
                        {noteCount} note{noteCount === 1 ? "" : "s"}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className="panel notes-panel">
            <div className="panel-header">
              <div>
                <h2>{selectedClass ? selectedClass.name : "Select a class"}</h2>
                <p className="subtext">
                  {selectedClass
                    ? `${selectedClassNotes.length} note${selectedClassNotes.length === 1 ? "" : "s"} ready`
                    : "Choose a class to view and edit notes"}
                </p>
              </div>

              <div className="actions-row">
                <button
                  onClick={renameClass}
                  className="ghost-btn"
                  disabled={!selectedClass || isClassBusy || isLoading}
                >
                  Rename
                </button>
                <button
                  onClick={deleteClass}
                  className="danger-btn"
                  disabled={!selectedClass || isClassBusy || isLoading}
                >
                  Delete
                </button>
                <button
                  onClick={addNote}
                  className="primary-btn"
                  disabled={!selectedClass || isNoteBusy || isLoading}
                >
                  + Note
                </button>
              </div>
            </div>

            <div className="notes-grid">
              <aside className="notes-list-card">
                <div className="notes-list-header">
                  <div>
                    <h3>Notes</h3>
                    <p className="subtext">Fast-switch between text and drawing</p>
                  </div>
                </div>

                <ul className="card-list">
                  {!selectedClass ? (
                    <li className="card-item empty-card">
                      <div className="card-item-title">No class selected</div>
                      <div className="card-item-meta">Pick a class to see its notes.</div>
                    </li>
                  ) : selectedClassNotes.length === 0 ? (
                    <li className="card-item empty-card">
                      <div className="card-item-title">No notes yet</div>
                      <div className="card-item-meta">Tap + Note to start writing.</div>
                    </li>
                  ) : (
                    selectedClassNotes.map((note) => (
                      <li
                        key={note.id}
                        className={`card-item ${note.id === selectedNoteId ? "active" : ""}`}
                        onClick={() => selectNote(note.id)}
                      >
                        <div className="card-item-title">{note.title || "Untitled Note"}</div>
                        <div className="card-item-meta">Updated {formatTimestamp(note.updated_at)}</div>
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
                      disabled={!selectedNote || isLoading}
                    >
                      Rename Note
                    </button>
                    <button
                      onClick={deleteNote}
                      className="danger-btn"
                      disabled={!selectedNote || isNoteBusy || isLoading}
                    >
                      Delete Note
                    </button>
                  </div>

                  <div className="editor-toolbar-right">
                    <div className={`save-indicator ${selectedNoteSaveState.state}`}>
                      {selectedNote ? getSaveLabel(selectedNoteSaveState) : "Select a note"}
                    </div>
                    <button
                      onClick={() => setDrawingOpen(true)}
                      className="primary-btn"
                      disabled={!selectedNote || isLoading}
                    >
                      Draw
                    </button>
                    <button
                      onClick={clearDrawing}
                      className="ghost-btn"
                      disabled={!selectedNote || isLoading}
                    >
                      Clear Drawing
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Note title"
                  disabled={!selectedNote || isLoading}
                  value={selectedNote?.title || ""}
                  onChange={(event) => updateNoteTitle(event.target.value)}
                />

                <textarea
                  id="note-content"
                  placeholder="Start typing your notes here..."
                  disabled={!selectedNote || isLoading}
                  value={selectedNote?.content || ""}
                  onChange={(event) => updateNoteContent(event.target.value)}
                />

                <section className="drawing-section">
                  <div className="drawing-section-header">
                    <div>
                      <h3>Drawing</h3>
                      <p className="subtext">Open full-screen for pencil-friendly sketching</p>
                    </div>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setDrawingOpen(true)}
                      disabled={!selectedNote || isLoading}
                    >
                      Open Studio
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`drawing-preview ${selectedNote?.drawing ? "has-drawing" : ""}`}
                    onClick={() => setDrawingOpen(true)}
                    disabled={!selectedNote || isLoading}
                  >
                    {selectedNote?.drawing ? (
                      <img src={selectedNote.drawing} alt="Drawing preview" />
                    ) : (
                      <div className="drawing-placeholder">
                        <strong>No sketch yet</strong>
                        <span>Tap to launch the full-screen canvas.</span>
                      </div>
                    )}
                  </button>
                </section>

                <div className="editor-footer">
                  <span>
                    {selectedNote
                      ? `${getSaveLabel(selectedNoteSaveState)}${selectedNoteSaveState.lastSavedAt ? ` • ${formatTimestamp(selectedNoteSaveState.lastSavedAt)}` : ""}`
                      : "Select a note to begin editing"}
                  </span>
                  <span>{selectedClass ? `${selectedClassNotes.length} note${selectedClassNotes.length === 1 ? "" : "s"}` : ""}</span>
                </div>
              </section>
            </div>
          </section>
        </main>
      </div>

      <FullscreenDrawingModal
        open={drawingOpen}
        noteTitle={selectedNote?.title}
        initialImage={selectedNote?.drawing || null}
        saveState={selectedNote ? getSaveLabel(selectedNoteSaveState) : "Saved"}
        onClose={() => setDrawingOpen(false)}
        onChange={saveDrawing}
      />
    </>
  );
}
