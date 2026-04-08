import {
  startTransition,
  useDeferredValue,
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

function formatRelativeTime(value) {
  if (!value) return "just now";

  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const minutes = Math.max(1, Math.round(diff / minute));
    return `${minutes}m ago`;
  }

  if (diff < day) {
    const hours = Math.round(diff / hour);
    return `${hours}h ago`;
  }

  const days = Math.round(diff / day);
  return `${days}d ago`;
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

function getNoteWordCount(content) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

function getNoteSnippet(note) {
  const source = (note.content || "").trim();
  if (!source) {
    return note.drawing ? "Sketch saved in this note." : "No content yet. Start typing or sketching.";
  }

  return source.length > 100 ? `${source.slice(0, 100)}...` : source;
}

function getClassAccent(name) {
  const seed = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  const hue = seed % 360;
  return `hsl(${hue} 82% 56%)`;
}

function noteMatchesQuery(note, className, query) {
  if (!query) return true;

  const haystack = `${className} ${note.title || ""} ${note.content || ""}`.toLowerCase();
  return haystack.includes(query);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [noteFilter, setNoteFilter] = useState("all");

  const textSaveTimeoutRef = useRef(null);
  const drawingSaveTimeoutRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

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
  const selectedClassNotes = useMemo(
    () => (selectedClassId ? notesByClassId.get(selectedClassId) || [] : []),
    [notesByClassId, selectedClassId]
  );
  const selectedNote = selectedNoteId
    ? notes.find((item) => item.id === selectedNoteId) || null
    : null;

  const selectedNoteSaveState = selectedNoteId
    ? noteSaveStates[selectedNoteId] || EMPTY_SAVE_STATE
    : EMPTY_SAVE_STATE;

  const filteredClasses = useMemo(() => {
    if (!deferredSearchQuery) return classes;

    return classes.filter((item) => {
      const classNotes = notesByClassId.get(item.id) || [];
      return (
        item.name.toLowerCase().includes(deferredSearchQuery) ||
        classNotes.some((note) => noteMatchesQuery(note, item.name, deferredSearchQuery))
      );
    });
  }, [classes, deferredSearchQuery, notesByClassId]);

  const filteredSelectedClassNotes = useMemo(() => {
    return selectedClassNotes.filter((note) => {
      const matchesQuery = noteMatchesQuery(note, selectedClass?.name || "", deferredSearchQuery);
      const matchesFilter =
        noteFilter === "all" ||
        (noteFilter === "drawing" && Boolean(note.drawing)) ||
        (noteFilter === "writing" && getNoteWordCount(note.content || "") > 0);

      return matchesQuery && matchesFilter;
    });
  }, [deferredSearchQuery, noteFilter, selectedClass?.name, selectedClassNotes]);

  const recentNotes = useMemo(() => {
    return sortNotes(notes)
      .filter((note) =>
        noteMatchesQuery(note, classesById.get(note.class_id)?.name || "", deferredSearchQuery)
      )
      .slice(0, 5);
  }, [classesById, deferredSearchQuery, notes]);

  const totalWords = useMemo(
    () => notes.reduce((total, note) => total + getNoteWordCount(note.content || ""), 0),
    [notes]
  );

  const totalDrawings = useMemo(
    () => notes.filter((note) => Boolean(note.drawing)).length,
    [notes]
  );

  const selectedNoteWordCount = getNoteWordCount(selectedNote?.content || "");
  const selectedNoteSnippet = selectedNote ? getNoteSnippet(selectedNote) : "";
  const selectedClassAccent = getClassAccent(selectedClass?.name || "School Notes");

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

  function openRecent(note) {
    startTransition(() => {
      setSelectedClassId(note.class_id);
      setSelectedNoteId(note.id);
    });
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Student Notes</p>
            <h1>School Notes</h1>
            <p className="hero-copy">
              Inspired by the clarity of modern note apps: faster search, stronger context,
              better recent-note recall, and a workspace that stays calm while you study.
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
            <button
              onClick={() => setDarkMode((value) => !value)}
              className="ghost-btn"
            >
              {darkMode ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </header>

        <section className="dashboard-strip">
          <article className="dashboard-card hero-dashboard">
            <span className="dashboard-label">Workspace</span>
            <strong>{classes.length || 0} classes connected</strong>
            <p>
              {notes.length || 0} notes synced across your devices with text and drawing autosave.
            </p>
          </article>
          <article className="dashboard-card">
            <span className="dashboard-label">Written</span>
            <strong>{totalWords.toLocaleString()} words</strong>
            <p>Lecture notes, review sheets, and quick capture drafts all in one place.</p>
          </article>
          <article className="dashboard-card">
            <span className="dashboard-label">Sketches</span>
            <strong>{totalDrawings} drawing{totalDrawings === 1 ? "" : "s"}</strong>
            <p>Handwritten diagrams stay attached to the note they belong to.</p>
          </article>
        </section>

        <main className="mobile-layout">
          <section className="panel sidebar-panel">
            <div className="search-panel">
              <label htmlFor="library-search" className="search-label">
                Search across classes and notes
              </label>
              <div className="search-input-wrap">
                <span className="search-icon">/</span>
                <input
                  id="library-search"
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search titles, content, or classes"
                />
              </div>
            </div>

            <div className="panel-header">
              <div>
                <h2>Classes</h2>
                <p className="subtext">Organize every subject with a cleaner library view</p>
              </div>
              <button
                onClick={addClass}
                className="primary-btn"
                disabled={!isSupabaseConfigured || isClassBusy || isLoading}
              >
                + Class
              </button>
            </div>

            <div className="focus-card" style={{ "--focus-accent": selectedClassAccent }}>
              <span className="dashboard-label">Focus</span>
              <strong>{selectedClass?.name || "Choose a class"}</strong>
              <p>
                {selectedClass
                  ? `${selectedClassNotes.length} notes, ${selectedClassNotes.filter((note) => note.drawing).length} with sketches`
                  : "Select a class to view notes, recents, and editor details."}
              </p>
            </div>

            <ul className="card-list">
              {isLoading ? (
                <>
                  <li className="card-item skeleton-card" />
                  <li className="card-item skeleton-card" />
                  <li className="card-item skeleton-card" />
                </>
              ) : filteredClasses.length === 0 ? (
                <li className="card-item empty-card">
                  <div className="card-item-title">
                    {searchQuery ? "No classes match" : "No classes yet"}
                  </div>
                  <div className="card-item-meta">
                    {searchQuery
                      ? "Try another search term or create a new class."
                      : "Create your first class to start syncing notes."}
                  </div>
                </li>
              ) : (
                filteredClasses.map((item) => {
                  const noteCount = notesByClassId.get(item.id)?.length || 0;
                  const drawingCount =
                    notesByClassId.get(item.id)?.filter((note) => Boolean(note.drawing)).length || 0;

                  return (
                    <li
                      key={item.id}
                      className={`card-item class-card ${item.id === selectedClassId ? "active" : ""}`}
                      style={{ "--class-accent": getClassAccent(item.name) }}
                      onClick={() => selectClass(item.id)}
                    >
                      <div className="class-card-top">
                        <span className="class-dot" />
                        <div className="card-item-title">{item.name}</div>
                      </div>
                      <div className="class-stats">
                        <span>{noteCount} note{noteCount === 1 ? "" : "s"}</span>
                        <span>{drawingCount} sketch{drawingCount === 1 ? "" : "es"}</span>
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
                    ? `${filteredSelectedClassNotes.length} visible note${filteredSelectedClassNotes.length === 1 ? "" : "s"} in this class`
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

            <section className="recent-strip">
              <div className="recent-strip-header">
                <div>
                  <h3>Recently active</h3>
                  <p className="subtext">Modern note apps surface what you touched last. Ours does too.</p>
                </div>
              </div>

              <div className="recent-note-row">
                {recentNotes.length === 0 ? (
                  <div className="recent-note-card empty-recent-card">
                    Recent notes will appear here once you start editing.
                  </div>
                ) : (
                  recentNotes.map((note) => {
                    const className = classesById.get(note.class_id)?.name || "Unknown class";

                    return (
                      <button
                        key={note.id}
                        type="button"
                        className={`recent-note-card ${note.id === selectedNoteId ? "active" : ""}`}
                        onClick={() => openRecent(note)}
                      >
                        <span className="recent-class-name">{className}</span>
                        <strong>{note.title || "Untitled Note"}</strong>
                        <p>{getNoteSnippet(note)}</p>
                        <span className="recent-meta">{formatRelativeTime(note.updated_at)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <div className="notes-grid">
              <aside className="notes-list-card">
                <div className="notes-list-header">
                  <div>
                    <h3>Notes</h3>
                    <p className="subtext">Fast-switch between text-heavy notes and sketches</p>
                  </div>
                </div>

                <div className="filter-row">
                  {[
                    ["all", "All"],
                    ["writing", "Writing"],
                    ["drawing", "Drawing"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`filter-chip ${noteFilter === value ? "active" : ""}`}
                      onClick={() => setNoteFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <ul className="card-list">
                  {!selectedClass ? (
                    <li className="card-item empty-card">
                      <div className="card-item-title">No class selected</div>
                      <div className="card-item-meta">Pick a class to see its notes.</div>
                    </li>
                  ) : filteredSelectedClassNotes.length === 0 ? (
                    <li className="card-item empty-card">
                      <div className="card-item-title">
                        {searchQuery || noteFilter !== "all" ? "No notes match" : "No notes yet"}
                      </div>
                      <div className="card-item-meta">
                        {searchQuery || noteFilter !== "all"
                          ? "Adjust your search or filter to widen the results."
                          : "Tap + Note to start writing."}
                      </div>
                    </li>
                  ) : (
                    filteredSelectedClassNotes.map((note) => (
                      <li
                        key={note.id}
                        className={`card-item note-card ${note.id === selectedNoteId ? "active" : ""}`}
                        onClick={() => selectNote(note.id)}
                      >
                        <div className="note-card-header">
                          <div className="card-item-title">{note.title || "Untitled Note"}</div>
                          {note.drawing ? <span className="note-badge">Sketch</span> : null}
                        </div>
                        <p className="note-snippet">{getNoteSnippet(note)}</p>
                        <div className="note-meta-row">
                          <span>{getNoteWordCount(note.content || "")} words</span>
                          <span>{formatRelativeTime(note.updated_at)}</span>
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

                {selectedNote ? (
                  <div className="editor-hero" style={{ "--editor-accent": selectedClassAccent }}>
                    <div className="editor-hero-copy">
                      <span className="dashboard-label">{selectedClass?.name || "Class"}</span>
                      <strong>{selectedNote.title || "Untitled Note"}</strong>
                      <p>{selectedNoteSnippet}</p>
                    </div>
                    <div className="editor-meta-pills">
                      <span className="meta-pill">{selectedNoteWordCount} words</span>
                      <span className="meta-pill">
                        {selectedNote.drawing ? "Sketch attached" : "No sketch yet"}
                      </span>
                      <span className="meta-pill">Updated {formatTimestamp(selectedNote.updated_at)}</span>
                    </div>
                  </div>
                ) : null}

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
                      <p className="subtext">Open the full-screen studio for diagrams, mind maps, and quick annotations</p>
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
                        <span>Tap to launch the full-screen canvas and capture diagrams without leaving the note.</span>
                      </div>
                    )}
                  </button>
                </section>

                <div className="editor-footer">
                  <span>
                    {selectedNote
                      ? `${getSaveLabel(selectedNoteSaveState)}${selectedNoteSaveState.lastSavedAt ? ` | ${formatTimestamp(selectedNoteSaveState.lastSavedAt)}` : ""}`
                      : "Select a note to begin editing"}
                  </span>
                  <span>
                    {selectedClass
                      ? `${selectedClassNotes.length} total note${selectedClassNotes.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
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
