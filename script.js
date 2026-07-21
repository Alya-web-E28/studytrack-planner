const STORAGE_KEYS = { name: "sp_name", assignments: "sp_assignments", exams: "sp_exams" };

function uid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function loadJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

const state = {
  name: localStorage.getItem(STORAGE_KEYS.name) || "",
  assignments: loadJSON(STORAGE_KEYS.assignments),
  exams: loadJSON(STORAGE_KEYS.exams),
  calendarDate: new Date(),
  assignmentFilter: "all",
  examFilter: "all",
  lastMainView: "home",
};

function saveAssignments() {
  localStorage.setItem(STORAGE_KEYS.assignments, JSON.stringify(state.assignments));
}
function saveExams() {
  localStorage.setItem(STORAGE_KEYS.exams, JSON.stringify(state.exams));
}
function saveName() {
  localStorage.setItem(STORAGE_KEYS.name, state.name);
}

// ---------- Date helpers ----------

function todayKey() {
  return dateKey(new Date());
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatPretty(key) {
  const d = parseKey(key);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function daysUntil(key) {
  const target = parseKey(key);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function dueBadge(key) {
  const diff = daysUntil(key);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${diff}d left`;
}

// ---------- DOM refs ----------

const welcomeScreen = document.getElementById("welcomeScreen");
const welcomeGreeting = document.getElementById("welcomeGreeting");
const welcomeSub = document.getElementById("welcomeSub");
const nameEntry = document.getElementById("nameEntry");
const nameInput = document.getElementById("nameInput");
const welcomeContinueBtn = document.getElementById("welcomeContinueBtn");
const appShell = document.getElementById("appShell");

const homeGreeting = document.getElementById("homeGreeting");
const homeDate = document.getElementById("homeDate");
const statAssignmentsHome = document.getElementById("statAssignmentsHome");
const statExamsHome = document.getElementById("statExamsHome");
const upcomingList = document.getElementById("upcomingList");

const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");

const assignmentsList = document.getElementById("assignmentsList");
const examsList = document.getElementById("examsList");

const addFab = document.getElementById("addFab");
const addChooser = document.getElementById("addChooser");
const closeAddChooser = document.getElementById("closeAddChooser");
const chooseAssignmentBtn = document.getElementById("chooseAssignmentBtn");
const chooseExamBtn = document.getElementById("chooseExamBtn");
const backFromAssignment = document.getElementById("backFromAssignment");
const backFromExam = document.getElementById("backFromExam");
const assignmentForm = document.getElementById("assignmentForm");
const examForm = document.getElementById("examForm");

const detailModal = document.getElementById("detailModal");
const detailCard = document.getElementById("detailCard");
const dayModal = document.getElementById("dayModal");
const dayCard = document.getElementById("dayCard");

const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsDrawer = document.getElementById("settingsDrawer");
const closeSettings = document.getElementById("closeSettings");
const settingsName = document.getElementById("settingsName");
const settingsNameInput = document.getElementById("settingsNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const clearDataBtn = document.getElementById("clearDataBtn");
const statAssignmentsTotal = document.getElementById("statAssignmentsTotal");
const statExamsTotal = document.getElementById("statExamsTotal");
const statCompletedTotal = document.getElementById("statCompletedTotal");

// ---------- Welcome flow ----------

function initWelcome() {
  if (state.name) {
    welcomeGreeting.textContent = `Welcome back, ${state.name}!`;
    welcomeSub.textContent = "Ready to tackle today's work?";
    nameEntry.hidden = true;
  } else {
    welcomeGreeting.textContent = "Welcome!";
    welcomeSub.textContent = "Let's get you organized for the term.";
    nameEntry.hidden = false;
  }
}

welcomeContinueBtn.addEventListener("click", () => {
  if (!state.name) {
    const typed = nameInput.value.trim();
    state.name = typed || "Student";
    saveName();
  }
  welcomeScreen.style.opacity = "0";
  welcomeScreen.style.pointerEvents = "none";
  setTimeout(() => {
    welcomeScreen.hidden = true;
    appShell.hidden = false;
    renderAll();
  }, 200);
});

welcomeScreen.style.transition = "opacity 0.2s ease";

// ---------- Navigation ----------

const MAIN_VIEWS = ["home", "calendar", "assignments", "exams"];

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (MAIN_VIEWS.includes(name)) state.lastMainView = name;
}

// ---------- Home ----------

function renderHome() {
  homeGreeting.innerHTML = `Hi, ${escapeHtml(state.name || "Student")}! <img src="assets/wave.svg" class="inline-icon" alt="">`;
  homeDate.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const pendingAssignments = state.assignments.filter((a) => !a.completed);
  const pendingExams = state.exams.filter((e) => !e.completed);
  statAssignmentsHome.textContent = pendingAssignments.length;
  statExamsHome.textContent = pendingExams.length;

  const merged = [
    ...pendingAssignments.map((a) => ({ ...a, type: "assignment", when: a.dueDate })),
    ...pendingExams.map((e) => ({ ...e, type: "exam", when: e.date })),
  ].sort((a, b) => a.when.localeCompare(b.when)).slice(0, 6);

  if (merged.length === 0) {
    upcomingList.innerHTML = `<div class="item-empty">Nothing due — you're all caught up! 🎉</div>`;
    return;
  }

  upcomingList.innerHTML = merged.map((item) => itemCardHTML(item)).join("");
  wireItemCards(upcomingList);
}

function itemCardHTML(item) {
  const typeClass = item.type === "exam" ? "exam-type" : "";
  const completedClass = item.completed ? "completed" : "";
  return `
    <div class="item-card ${typeClass} ${completedClass}" data-type="${item.type}" data-id="${item.id}">
      <div class="item-checkbox ${item.completed ? "checked" : ""}" data-checkbox="${item.id}" data-type="${item.type}">${item.completed ? "✓" : ""}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.teacher)} · ${formatPretty(item.when)}</div>
      </div>
      <div class="item-badge">${dueBadge(item.when)}</div>
    </div>
  `;
}

function wireItemCards(container) {
  container.querySelectorAll(".item-checkbox").forEach((cb) => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleComplete(cb.dataset.type, cb.dataset.checkbox);
    });
  });
  container.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.type, card.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Assignments / Exams lists ----------

function filterItems(items, filter) {
  if (filter === "pending") return items.filter((i) => !i.completed);
  if (filter === "completed") return items.filter((i) => i.completed);
  return items;
}

function renderAssignments() {
  const items = filterItems(state.assignments, state.assignmentFilter)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (items.length === 0) {
    assignmentsList.innerHTML = `<div class="item-empty">No assignments here yet.</div>`;
    return;
  }
  assignmentsList.innerHTML = items
    .map((a) => itemCardHTML({ ...a, type: "assignment", when: a.dueDate }))
    .join("");
  wireItemCards(assignmentsList);
}

function renderExams() {
  const items = filterItems(state.exams, state.examFilter)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) {
    examsList.innerHTML = `<div class="item-empty">No exams here yet.</div>`;
    return;
  }
  examsList.innerHTML = items.map((e) => itemCardHTML({ ...e, type: "exam", when: e.date })).join("");
  wireItemCards(examsList);
}

document.getElementById("assignmentFilters").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  state.assignmentFilter = btn.dataset.filter;
  document.querySelectorAll("#assignmentFilters .filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderAssignments();
});

document.getElementById("examFilters").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  state.examFilter = btn.dataset.filter;
  document.querySelectorAll("#examFilters .filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderExams();
});

function toggleComplete(type, id) {
  const list = type === "exam" ? state.exams : state.assignments;
  const item = list.find((i) => i.id === id);
  if (!item) return;
  item.completed = !item.completed;
  type === "exam" ? saveExams() : saveAssignments();
  renderAll();
}

function deleteItem(type, id) {
  if (type === "exam") {
    state.exams = state.exams.filter((i) => i.id !== id);
    saveExams();
  } else {
    state.assignments = state.assignments.filter((i) => i.id !== id);
    saveAssignments();
  }
  renderAll();
}

// ---------- Calendar ----------

function renderCalendar() {
  const cal = state.calendarDate;
  const year = cal.getFullYear();
  const month = cal.getMonth();
  calendarMonthLabel.textContent = cal.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayKey();

  const itemsByDay = {};
  state.assignments.forEach((a) => {
    (itemsByDay[a.dueDate] ||= []).push({ ...a, type: "assignment" });
  });
  state.exams.forEach((e) => {
    (itemsByDay[e.date] ||= []).push({ ...e, type: "exam" });
  });

  let html = "";
  for (let i = 0; i < startWeekday; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const dayItems = itemsByDay[key] || [];
    const dots = dayItems
      .slice(0, 4)
      .map((it) => `<span class="dot ${it.type === "exam" ? "exam-dot" : "assignment-dot"}"></span>`)
      .join("");
    html += `
      <div class="cal-day ${key === today ? "today" : ""}" data-date="${key}">
        <span>${day}</span>
        <div class="cal-dots">${dots}</div>
      </div>
    `;
  }

  calendarGrid.innerHTML = html;
  calendarGrid.querySelectorAll(".cal-day:not(.empty)").forEach((el) => {
    el.addEventListener("click", () => openDayModal(el.dataset.date, itemsByDay[el.dataset.date] || []));
  });
}

prevMonthBtn.addEventListener("click", () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
  renderCalendar();
});
nextMonthBtn.addEventListener("click", () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
  renderCalendar();
});

function openDayModal(key, items) {
  const listHtml = items.length
    ? items
        .map(
          (it) => `
        <div class="day-list-item" data-type="${it.type}" data-id="${it.id}">
          <span class="dot ${it.type === "exam" ? "exam-dot" : "assignment-dot"}"></span>
          <div class="item-info">
            <div class="item-name">${escapeHtml(it.name)}</div>
            <div class="item-meta">${escapeHtml(it.teacher)}</div>
          </div>
        </div>
      `
        )
        .join("")
    : `<div class="item-empty">Nothing due this day.</div>`;

  dayCard.innerHTML = `
    <div class="detail-header">
      <h3 class="detail-title">${formatPretty(key)}</h3>
      <button class="icon-btn small" id="closeDayModal">&times;</button>
    </div>
    ${listHtml}
  `;
  dayCard.querySelectorAll(".day-list-item").forEach((el) => {
    el.addEventListener("click", () => {
      dayModal.hidden = true;
      openDetail(el.dataset.type, el.dataset.id);
    });
  });
  document.getElementById("closeDayModal").addEventListener("click", () => (dayModal.hidden = true));
  dayModal.hidden = false;
}

// ---------- Add chooser + dedicated add pages ----------

addFab.addEventListener("click", () => {
  addChooser.hidden = false;
});
closeAddChooser.addEventListener("click", () => (addChooser.hidden = true));
addChooser.addEventListener("click", (e) => {
  if (e.target === addChooser) addChooser.hidden = true;
});

chooseAssignmentBtn.addEventListener("click", () => {
  addChooser.hidden = true;
  switchView("add-assignment");
});
chooseExamBtn.addEventListener("click", () => {
  addChooser.hidden = true;
  switchView("add-exam");
});

backFromAssignment.addEventListener("click", () => switchView(state.lastMainView));
backFromExam.addEventListener("click", () => switchView(state.lastMainView));

assignmentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.assignments.push({
    id: uid(),
    name: document.getElementById("aName").value.trim(),
    details: document.getElementById("aDetails").value.trim(),
    dueDate: document.getElementById("aDueDate").value,
    teacher: document.getElementById("aTeacher").value.trim(),
    completed: false,
  });
  saveAssignments();
  assignmentForm.reset();
  renderAll();
  switchView("assignments");
});

examForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.exams.push({
    id: uid(),
    name: document.getElementById("eName").value.trim(),
    details: document.getElementById("eDetails").value.trim(),
    date: document.getElementById("eDate").value,
    teacher: document.getElementById("eTeacher").value.trim(),
    completed: false,
  });
  saveExams();
  examForm.reset();
  renderAll();
  switchView("exams");
});

// ---------- Detail modal ----------

function openDetail(type, id) {
  const list = type === "exam" ? state.exams : state.assignments;
  const item = list.find((i) => i.id === id);
  if (!item) return;
  const when = type === "exam" ? item.date : item.dueDate;
  const typeLabel = type === "exam" ? "Exam" : "Assignment";

  renderDetailCard(type, item, when, typeLabel);
  detailModal.hidden = false;
}

function renderDetailCard(type, item, when, typeLabel) {
  detailCard.innerHTML = `
    <div class="detail-header">
      <h3 class="detail-title">${escapeHtml(item.name)}</h3>
      <span class="detail-badge ${type === "exam" ? "exam-type" : ""} ${item.completed ? "completed-type" : ""}">
        ${item.completed ? "Completed" : typeLabel}
      </span>
    </div>
    <div class="detail-meta">👩‍🏫 ${escapeHtml(item.teacher) || "—"}</div>
    <div class="detail-meta">📅 ${formatPretty(when)} · ${dueBadge(when)}</div>
    <div class="detail-details">${escapeHtml(item.details) || "No additional details."}</div>
    <div class="detail-actions">
      <button id="detailCompleteBtn" class="${item.completed ? "primary-btn small" : "success-btn"}">
        ${item.completed ? "Mark Incomplete" : "Mark Complete"}
      </button>
      <button id="detailDeleteBtn" class="danger-btn">Delete ${typeLabel}</button>
      <div id="detailConfirmSlot"></div>
    </div>
  `;

  document.getElementById("detailCompleteBtn").addEventListener("click", () => {
    toggleComplete(type, item.id);
    detailModal.hidden = true;
  });

  document.getElementById("detailDeleteBtn").addEventListener("click", () => {
    const slot = document.getElementById("detailConfirmSlot");
    slot.innerHTML = `
      <div class="confirm-row">
        <span>Delete this ${typeLabel.toLowerCase()} for good?</span>
        <button class="confirm-yes" id="confirmDeleteYes">Yes</button>
        <button class="confirm-no" id="confirmDeleteNo">No</button>
      </div>
    `;
    document.getElementById("confirmDeleteYes").addEventListener("click", () => {
      deleteItem(type, item.id);
      detailModal.hidden = true;
    });
    document.getElementById("confirmDeleteNo").addEventListener("click", () => {
      slot.innerHTML = "";
    });
  });
}

detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) detailModal.hidden = true;
});
dayModal.addEventListener("click", (e) => {
  if (e.target === dayModal) dayModal.hidden = true;
});

// ---------- Settings drawer ----------

settingsBtn.addEventListener("click", () => {
  settingsName.textContent = state.name || "Student";
  settingsNameInput.value = state.name || "";
  statAssignmentsTotal.textContent = state.assignments.length;
  statExamsTotal.textContent = state.exams.length;
  statCompletedTotal.textContent =
    state.assignments.filter((a) => a.completed).length + state.exams.filter((e) => e.completed).length;

  settingsOverlay.hidden = false;
  settingsDrawer.hidden = false;
  requestAnimationFrame(() => settingsDrawer.classList.add("open"));
});

function closeSettingsDrawer() {
  settingsDrawer.classList.remove("open");
  setTimeout(() => {
    settingsDrawer.hidden = true;
    settingsOverlay.hidden = true;
  }, 280);
}

closeSettings.addEventListener("click", closeSettingsDrawer);
settingsOverlay.addEventListener("click", closeSettingsDrawer);

saveNameBtn.addEventListener("click", () => {
  const val = settingsNameInput.value.trim();
  if (val) {
    state.name = val;
    saveName();
    renderHome();
    settingsName.textContent = state.name;
  }
});

clearDataBtn.addEventListener("click", () => {
  const existing = document.getElementById("clearConfirmRow");
  if (existing) return;
  const row = document.createElement("div");
  row.id = "clearConfirmRow";
  row.className = "confirm-row";
  row.style.marginTop = "10px";
  row.innerHTML = `
    <span>Erase all assignments &amp; exams?</span>
    <button class="confirm-yes" id="clearYes">Yes</button>
    <button class="confirm-no" id="clearNo">No</button>
  `;
  clearDataBtn.insertAdjacentElement("afterend", row);
  document.getElementById("clearYes").addEventListener("click", () => {
    state.assignments = [];
    state.exams = [];
    saveAssignments();
    saveExams();
    row.remove();
    renderAll();
    settingsBtn.click();
  });
  document.getElementById("clearNo").addEventListener("click", () => row.remove());
});

// ---------- Init ----------

function renderAll() {
  renderHome();
  renderCalendar();
  renderAssignments();
  renderExams();
}

initWelcome();
