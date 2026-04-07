const classListEl = document.getElementById("class-list");
const noteListEl = document.getElementById("note-list");
const addClassBtn = document.getElementById("add-class-btn");
const addNoteBtn = document.getElementById("add-note-btn");
const currentClassTitle = document.getElementById("current-class-title");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const toggleThemeBtn = document.getElementById("toggle-theme");

let appData = JSON.parse(localStorage.getItem("schoolNotesApp")) || {
  classes: [],
  selectedClassId: null,
  selectedNoteId: null,
  darkMode: false
};

function saveApp() {
  localStorage.setItem("schoolNotesApp", JSON.stringify(appData));
}

function generateId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function getSelectedClass() {
  return appData.classes.find(c => c.id === appData.selectedClassId) || null;
}

function getSelectedNote() {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return null;
  return selectedClass.notes.find(n => n.id === appData.selectedNoteId) || null;
}

function renderClasses() {
  classListEl.innerHTML = "";

  appData.classes.forEach(cls => {
    const li = document.createElement("li");
    li.textContent = cls.name;
    if (cls.id === appData.selectedClassId) li.classList.add("active");

    li.addEventListener("click", () => {
      appData.selectedClassId = cls.id;
      appData.selectedNoteId = null;
      saveApp();
      render();
    });

    classListEl.appendChild(li);
  });
}

function renderNotes() {
  noteListEl.innerHTML = "";
  const selectedClass = getSelectedClass();

  if (!selectedClass) {
    currentClassTitle.textContent = "Select a class";
    addNoteBtn.disabled = true;
    noteTitleInput.disabled = true;
    noteContentInput.disabled = true;
    noteTitleInput.value = "";
    noteContentInput.value = "";
    return;
  }

  currentClassTitle.textContent = selectedClass.name;
  addNoteBtn.disabled = false;

  selectedClass.notes.forEach(note => {
    const li = document.createElement("li");
    li.textContent = note.title || "Untitled Note";
    if (note.id === appData.selectedNoteId) li.classList.add("active");

    li.addEventListener("click", () => {
      appData.selectedNoteId = note.id;
      saveApp();
      render();
    });

    noteListEl.appendChild(li);
  });

  const selectedNote = getSelectedNote();

  if (!selectedNote) {
    noteTitleInput.disabled = true;
    noteContentInput.disabled = true;
    noteTitleInput.value = "";
    noteContentInput.value = "";
    return;
  }

  noteTitleInput.disabled = false;
  noteContentInput.disabled = false;
  noteTitleInput.value = selectedNote.title;
  noteContentInput.value = selectedNote.content;
}

function renderTheme() {
  document.body.classList.toggle("dark", appData.darkMode);
}

function render() {
  renderTheme();
  renderClasses();
  renderNotes();
}

addClassBtn.addEventListener("click", () => {
  const name = prompt("Enter class name:");
  if (!name) return;

  appData.classes.push({
    id: generateId(),
    name,
    notes: []
  });

  saveApp();
  render();
});

addNoteBtn.addEventListener("click", () => {
  const selectedClass = getSelectedClass();
  if (!selectedClass) return;

  const newNote = {
    id: generateId(),
    title: "New Note",
    content: ""
  };

  selectedClass.notes.unshift(newNote);
  appData.selectedNoteId = newNote.id;

  saveApp();
  render();
});

noteTitleInput.addEventListener("input", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  selectedNote.title = noteTitleInput.value;
  saveApp();
  renderNotes();
});

noteContentInput.addEventListener("input", () => {
  const selectedNote = getSelectedNote();
  if (!selectedNote) return;

  selectedNote.content = noteContentInput.value;
  saveApp();
});

toggleThemeBtn.addEventListener("click", () => {
  appData.darkMode = !appData.darkMode;
  saveApp();
  renderTheme();
});

render();