const STORAGE_KEYS = { accounts: "sp_accounts", lastAccountId: "sp_lastAccountId" };

function uid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

const state = {
  accountId: null,
  name: "",
  assignments: [],
  exams: [],
  calendarDate: new Date(),
  assignmentFilter: "all",
  examFilter: "all",
  lastMainView: "home",
  editing: null, // { type: 'assignment'|'exam', id } while editing an existing item
};

// ---------- Accounts ----------

function loadAccounts() {
  return loadJSON(STORAGE_KEYS.accounts, []);
}
function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
}
function accountDataKey(accountId) {
  return `sp_data_${accountId}`;
}
function loadAccountData(accountId) {
  const raw = loadJSON(accountDataKey(accountId), { assignments: [], exams: [] });
  state.assignments = raw.assignments || [];
  state.exams = raw.exams || [];
}
function saveAccountData() {
  localStorage.setItem(
    accountDataKey(state.accountId),
    JSON.stringify({ assignments: state.assignments, exams: state.exams })
  );
}

// Requires exactly "First Last" - two non-empty parts separated by exactly one space.
function validateFullName(raw) {
  const trimmed = raw.trim();
  const parts = trimmed.split(" ");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: "Please enter your first and last name, with a single space between them." };
  }
  return { valid: true, trimmed };
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
const appShell = document.getElementById("appShell");

const authHeading = document.getElementById("authHeading");
const authSub = document.getElementById("authSub");
const authError = document.getElementById("authError");
const authChoiceButtons = document.getElementById("authChoiceButtons");
const showCreateBtn = document.getElementById("showCreateBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const authNameWrap = document.getElementById("authNameWrap");
const authNameInput = document.getElementById("authNameInput");
const authNameContinueBtn = document.getElementById("authNameContinueBtn");
const authPinWrap = document.getElementById("authPinWrap");
const authPinDots = document.getElementById("authPinDots");
const authPinPad = document.getElementById("authPinPad");
const authSwitchLink = document.getElementById("authSwitchLink");
const authBackLink = document.getElementById("authBackLink");

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
const gradesList = document.getElementById("gradesList");
const gradesCount = document.getElementById("gradesCount");

const addFab = document.getElementById("addFab");
const addChooser = document.getElementById("addChooser");
const closeAddChooser = document.getElementById("closeAddChooser");
const chooseAssignmentBtn = document.getElementById("chooseAssignmentBtn");
const chooseExamBtn = document.getElementById("chooseExamBtn");
const backFromAssignment = document.getElementById("backFromAssignment");
const backFromExam = document.getElementById("backFromExam");
const assignmentForm = document.getElementById("assignmentForm");
const examForm = document.getElementById("examForm");
const assignmentPageTitle = document.getElementById("assignmentPageTitle");
const examPageTitle = document.getElementById("examPageTitle");
const assignmentSubmitBtn = document.getElementById("assignmentSubmitBtn");
const examSubmitBtn = document.getElementById("examSubmitBtn");

const detailModal = document.getElementById("detailModal");
const detailCard = document.getElementById("detailCard");
const dayModal = document.getElementById("dayModal");
const dayCard = document.getElementById("dayCard");

const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsDrawer = document.getElementById("settingsDrawer");
const closeSettings = document.getElementById("closeSettings");
const settingsName = document.getElementById("settingsName");
const clearDataBtn = document.getElementById("clearDataBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const openSecurityBtn = document.getElementById("openSecurityBtn");
const securityModal = document.getElementById("securityModal");
const securityCard = document.getElementById("securityCard");
const accentSwatches = document.getElementById("accentSwatches");
const logOutBtn = document.getElementById("logOutBtn");
const statAssignmentsTotal = document.getElementById("statAssignmentsTotal");
const statExamsTotal = document.getElementById("statExamsTotal");
const statCompletedTotal = document.getElementById("statCompletedTotal");

// ---------- Auth flow (account creation / login / PIN pad) ----------

welcomeScreen.style.transition = "opacity 0.2s ease";

let authFlow = null; // 'create' | 'login' | 'returning'
let authPinPurpose = null; // 'set' | 'confirm' | 'verify' | 'returning'
let authPendingName = "";
let authPendingPin = "";
let authFoundAccount = null;
let pinBuffer = "";

function setAuthTexts(heading, sub) {
  authHeading.textContent = heading;
  authSub.textContent = sub;
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

function hideAuthError() {
  authError.hidden = true;
}

function showChoiceStep() {
  authChoiceButtons.hidden = false;
  authNameWrap.hidden = true;
  authPinWrap.hidden = true;
  authSwitchLink.hidden = true;
  authBackLink.hidden = true;
  hideAuthError();
  setAuthTexts("Welcome!", "Let's get you organized for the term.");
}

function showNameStep(flow) {
  authFlow = flow;
  authChoiceButtons.hidden = true;
  authNameWrap.hidden = false;
  authPinWrap.hidden = true;
  authSwitchLink.hidden = true;
  authBackLink.hidden = false;
  hideAuthError();
  authNameInput.value = "";
  if (flow === "create") {
    setAuthTexts("Create Account", "What's your name?");
  } else {
    setAuthTexts("Log In", "Enter your account name.");
  }
  authNameInput.focus();
}

function updatePinDots() {
  authPinDots.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("span");
    dot.className = "pin-dot" + (i < pinBuffer.length ? " filled" : "");
    authPinDots.appendChild(dot);
  }
}

function showPinStep() {
  authChoiceButtons.hidden = true;
  authNameWrap.hidden = true;
  authPinWrap.hidden = false;
  authBackLink.hidden = false;
  authSwitchLink.hidden = true;
  pinBuffer = "";
  updatePinDots();
  hideAuthError();
}

function showReturningStep(account) {
  authFlow = "returning";
  authPinPurpose = "returning";
  authFoundAccount = account;
  authChoiceButtons.hidden = true;
  authNameWrap.hidden = true;
  authPinWrap.hidden = false;
  authBackLink.hidden = true;
  authSwitchLink.hidden = false;
  pinBuffer = "";
  updatePinDots();
  hideAuthError();
  setAuthTexts(`Welcome back, ${account.name}!`, "Enter your PIN to continue.");
}

function buildPinPad() {
  authPinPad.innerHTML = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    if (k === "back") {
      btn.className = "pin-key pin-key-back";
      btn.innerHTML = "&larr;";
      btn.addEventListener("click", onPinBackspace);
    } else if (k === "") {
      btn.className = "pin-key pin-key-empty";
      btn.disabled = true;
      btn.tabIndex = -1;
    } else {
      btn.className = "pin-key";
      btn.textContent = k;
      btn.addEventListener("click", () => onPinDigit(k));
    }
    authPinPad.appendChild(btn);
  });
}

function onPinDigit(d) {
  if (pinBuffer.length >= 6) return;
  pinBuffer += d;
  updatePinDots();
  hideAuthError();
  if (pinBuffer.length === 6) handlePinComplete();
}

function onPinBackspace() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
}

function handlePinComplete() {
  const entered = pinBuffer;
  if (authPinPurpose === "set") {
    authPendingPin = entered;
    pinBuffer = "";
    authPinPurpose = "confirm";
    setAuthTexts("Confirm your PIN", "Enter it again to confirm.");
    updatePinDots();
  } else if (authPinPurpose === "confirm") {
    if (entered === authPendingPin) {
      finalizeCreateAccount(authPendingName, entered);
    } else {
      showAuthError("Those PINs didn't match. Let's try again.");
      pinBuffer = "";
      authPendingPin = "";
      authPinPurpose = "set";
      setAuthTexts("Choose a 6-digit PIN", "You'll use this to log back in.");
      updatePinDots();
    }
  } else if (authPinPurpose === "verify" || authPinPurpose === "returning") {
    if (authFoundAccount && authFoundAccount.pin === entered) {
      logIn(authFoundAccount);
    } else {
      showAuthError("Incorrect PIN. Try again.");
      pinBuffer = "";
      updatePinDots();
    }
  }
}

showCreateBtn.addEventListener("click", () => showNameStep("create"));
showLoginBtn.addEventListener("click", () => showNameStep("login"));

authNameContinueBtn.addEventListener("click", () => {
  const check = validateFullName(authNameInput.value);
  if (!check.valid) {
    showAuthError(check.error);
    return;
  }
  const trimmed = check.trimmed;
  const nameKey = trimmed.toLowerCase();
  const accounts = loadAccounts();

  if (authFlow === "create") {
    if (accounts.some((a) => a.nameKey === nameKey)) {
      showAuthError("That name is already taken. Try logging in instead.");
      return;
    }
    authPendingName = trimmed;
    authPinPurpose = "set";
    showPinStep();
    setAuthTexts("Choose a 6-digit PIN", "You'll use this to log back in.");
  } else {
    const found = accounts.find((a) => a.nameKey === nameKey);
    if (!found) {
      showAuthError("No account found with that name.");
      return;
    }
    authFoundAccount = found;
    authPinPurpose = "verify";
    showPinStep();
    setAuthTexts(`Hi, ${found.name}!`, "Enter your PIN.");
  }
});

authNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") authNameContinueBtn.click();
});

authBackLink.addEventListener("click", () => {
  if (!authPinWrap.hidden && authFlow !== "returning") {
    showNameStep(authFlow);
  } else {
    showChoiceStep();
  }
});

authSwitchLink.addEventListener("click", showChoiceStep);

function finalizeCreateAccount(name, pin) {
  const accounts = loadAccounts();
  const account = { id: uid(), name, nameKey: name.toLowerCase(), pin, createdAt: Date.now() };
  accounts.push(account);
  saveAccounts(accounts);
  localStorage.setItem(accountDataKey(account.id), JSON.stringify({ assignments: [], exams: [] }));
  logIn(account);
}

function logIn(account) {
  localStorage.setItem(STORAGE_KEYS.lastAccountId, account.id);
  state.accountId = account.id;
  state.name = account.name;
  loadAccountData(account.id);

  welcomeScreen.style.opacity = "0";
  welcomeScreen.style.pointerEvents = "none";
  setTimeout(() => {
    welcomeScreen.hidden = true;
    appShell.hidden = false;
    renderAll();
  }, 200);
}

function showWelcomeScreen() {
  appShell.hidden = true;
  welcomeScreen.hidden = false;
  welcomeScreen.style.opacity = "1";
  welcomeScreen.style.pointerEvents = "auto";
}

function initAuth() {
  buildPinPad();
  const accounts = loadAccounts();
  const lastId = localStorage.getItem(STORAGE_KEYS.lastAccountId);
  const remembered = accounts.find((a) => a.id === lastId);
  if (remembered) {
    showReturningStep(remembered);
  } else {
    showChoiceStep();
  }
}

// ---------- Navigation ----------

const MAIN_VIEWS = ["home", "calendar", "assignments", "exams", "grades"];

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

function renderGrades() {
  const graded = [
    ...state.assignments.filter((a) => a.grade).map((a) => ({ ...a, type: "assignment", when: a.dueDate })),
    ...state.exams.filter((e) => e.grade).map((e) => ({ ...e, type: "exam", when: e.date })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  gradesCount.textContent = graded.length
    ? `${graded.length} grade${graded.length === 1 ? "" : "s"} recorded`
    : "No grades recorded yet.";

  if (graded.length === 0) {
    gradesList.innerHTML = `<div class="item-empty">Add a grade from any assignment or exam's detail page — it'll show up here.</div>`;
    return;
  }

  gradesList.innerHTML = graded
    .map(
      (item) => `
    <div class="grade-card ${item.type === "exam" ? "exam-type" : ""}" data-type="${item.type}" data-id="${item.id}">
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.teacher)} · ${formatPretty(item.when)}</div>
      </div>
      <div class="grade-value">${escapeHtml(item.grade)}</div>
    </div>
  `
    )
    .join("");

  gradesList.querySelectorAll(".grade-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.type, card.dataset.id));
  });
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
  saveAccountData();
  renderAll();
}

function deleteItem(type, id) {
  if (type === "exam") {
    state.exams = state.exams.filter((i) => i.id !== id);
  } else {
    state.assignments = state.assignments.filter((i) => i.id !== id);
  }
  saveAccountData();
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
  state.editing = null;
  assignmentForm.reset();
  assignmentPageTitle.textContent = "New Assignment";
  assignmentSubmitBtn.textContent = "Add Assignment";
  switchView("add-assignment");
});
chooseExamBtn.addEventListener("click", () => {
  addChooser.hidden = true;
  state.editing = null;
  examForm.reset();
  examPageTitle.textContent = "New Exam";
  examSubmitBtn.textContent = "Add Exam";
  switchView("add-exam");
});

backFromAssignment.addEventListener("click", () => {
  state.editing = null;
  switchView(state.lastMainView);
});
backFromExam.addEventListener("click", () => {
  state.editing = null;
  switchView(state.lastMainView);
});

function openEditForm(type, id) {
  const list = type === "exam" ? state.exams : state.assignments;
  const item = list.find((i) => i.id === id);
  if (!item) return;
  state.editing = { type, id };

  if (type === "assignment") {
    document.getElementById("aName").value = item.name;
    document.getElementById("aDetails").value = item.details;
    document.getElementById("aDueDate").value = item.dueDate;
    document.getElementById("aTeacher").value = item.teacher;
    assignmentPageTitle.textContent = "Edit Assignment";
    assignmentSubmitBtn.textContent = "Save Changes";
    switchView("add-assignment");
  } else {
    document.getElementById("eName").value = item.name;
    document.getElementById("eDetails").value = item.details;
    document.getElementById("eDate").value = item.date;
    document.getElementById("eTeacher").value = item.teacher;
    examPageTitle.textContent = "Edit Exam";
    examSubmitBtn.textContent = "Save Changes";
    switchView("add-exam");
  }
}

assignmentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const values = {
    name: document.getElementById("aName").value.trim(),
    details: document.getElementById("aDetails").value.trim(),
    dueDate: document.getElementById("aDueDate").value,
    teacher: document.getElementById("aTeacher").value.trim(),
  };

  if (state.editing && state.editing.type === "assignment") {
    const item = state.assignments.find((i) => i.id === state.editing.id);
    Object.assign(item, values);
  } else {
    state.assignments.push({ id: uid(), ...values, completed: false, grade: "" });
  }

  state.editing = null;
  saveAccountData();
  assignmentForm.reset();
  renderAll();
  switchView("assignments");
});

examForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const values = {
    name: document.getElementById("eName").value.trim(),
    details: document.getElementById("eDetails").value.trim(),
    date: document.getElementById("eDate").value,
    teacher: document.getElementById("eTeacher").value.trim(),
  };

  if (state.editing && state.editing.type === "exam") {
    const item = state.exams.find((i) => i.id === state.editing.id);
    Object.assign(item, values);
  } else {
    state.exams.push({ id: uid(), ...values, completed: false, grade: "" });
  }

  state.editing = null;
  saveAccountData();
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
    <div class="detail-grade">
      <label for="detailGradeInput">Grade <span class="optional-tag">(optional)</span></label>
      <div class="grade-input-row">
        <input id="detailGradeInput" placeholder="e.g. A, 92%, 18/20" value="${escapeHtml(item.grade || "")}" />
        <button id="detailGradeSaveBtn" class="primary-btn small secondary-style">Save</button>
      </div>
    </div>
    <div class="detail-actions">
      <button id="detailEditBtn" class="primary-btn small secondary-style">Edit ${typeLabel}</button>
      <button id="detailCompleteBtn" class="${item.completed ? "primary-btn small" : "success-btn"}">
        ${item.completed ? "Mark Incomplete" : "Mark Complete"}
      </button>
      <button id="detailDeleteBtn" class="danger-btn">Delete ${typeLabel}</button>
      <div id="detailConfirmSlot"></div>
    </div>
  `;

  document.getElementById("detailEditBtn").addEventListener("click", () => {
    detailModal.hidden = true;
    openEditForm(type, item.id);
  });

  document.getElementById("detailGradeSaveBtn").addEventListener("click", () => {
    item.grade = document.getElementById("detailGradeInput").value.trim();
    saveAccountData();
    renderAll();
    const btn = document.getElementById("detailGradeSaveBtn");
    const original = btn.textContent;
    btn.textContent = "Saved!";
    setTimeout(() => {
      if (document.body.contains(btn)) btn.textContent = original;
    }, 1200);
  });

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
    saveAccountData();
    row.remove();
    renderAll();
    settingsBtn.click();
  });
  document.getElementById("clearNo").addEventListener("click", () => row.remove());
});

logOutBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEYS.lastAccountId);
  closeSettingsDrawer();
  showWelcomeScreen();
  initAuth();
});

// ---------- Reusable PIN pad (used by the security modal) ----------

function createPinPadEl(onDigit, onBackspace) {
  const pad = document.createElement("div");
  pad.className = "pinpad";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    if (k === "back") {
      btn.className = "pin-key pin-key-back";
      btn.innerHTML = "&larr;";
      btn.addEventListener("click", onBackspace);
    } else if (k === "") {
      btn.className = "pin-key pin-key-empty";
      btn.disabled = true;
      btn.tabIndex = -1;
    } else {
      btn.className = "pin-key";
      btn.textContent = k;
      btn.addEventListener("click", () => onDigit(k));
    }
    pad.appendChild(btn);
  });
  return pad;
}

function createPinDotsEl() {
  const dots = document.createElement("div");
  dots.className = "pin-dots";
  renderPinDotsInto(dots, 0);
  return dots;
}

function renderPinDotsInto(dotsEl, count) {
  dotsEl.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const d = document.createElement("span");
    d.className = "pin-dot" + (i < count ? " filled" : "");
    dotsEl.appendChild(d);
  }
}

// ---------- Security modal: verify PIN, then change name/PIN or delete account ----------

let securityBuffer = "";
let securityNewPinBuffer = "";
let securityPendingNewPin = "";
let securityNewPinPurpose = null;

function currentAccount() {
  return loadAccounts().find((a) => a.id === state.accountId);
}

function openSecurityModal(purpose) {
  securityBuffer = "";
  renderSecurityVerifyStep(purpose);
  securityModal.hidden = false;
}

function closeSecurityModal() {
  securityModal.hidden = true;
}

function renderSecurityVerifyStep(purpose) {
  securityCard.innerHTML = `
    <div class="detail-header">
      <h3 class="detail-title">Enter Current PIN</h3>
      <button class="icon-btn small" id="closeSecurityModal">&times;</button>
    </div>
    <p class="auth-sub">Confirm it's really you before making changes.</p>
    <div id="securityError" class="auth-error" hidden></div>
    <div id="securityPinDotsWrap"></div>
    <div id="securityPinPadWrap"></div>
  `;
  document.getElementById("closeSecurityModal").addEventListener("click", closeSecurityModal);

  const dots = createPinDotsEl();
  document.getElementById("securityPinDotsWrap").appendChild(dots);

  const pad = createPinPadEl(
    (d) => {
      if (securityBuffer.length >= 6) return;
      securityBuffer += d;
      renderPinDotsInto(dots, securityBuffer.length);
      document.getElementById("securityError").hidden = true;
      if (securityBuffer.length === 6) {
        const account = currentAccount();
        if (account && account.pin === securityBuffer) {
          if (purpose === "changeInfo") renderSecurityChangeInfoStep();
          else renderSecurityDeleteStep();
        } else {
          const errEl = document.getElementById("securityError");
          errEl.textContent = "Incorrect PIN. Try again.";
          errEl.hidden = false;
          securityBuffer = "";
          renderPinDotsInto(dots, 0);
        }
      }
    },
    () => {
      securityBuffer = securityBuffer.slice(0, -1);
      renderPinDotsInto(dots, securityBuffer.length);
    }
  );
  document.getElementById("securityPinPadWrap").appendChild(pad);
}

function renderSecurityChangeInfoStep() {
  securityCard.innerHTML = `
    <div class="detail-header">
      <h3 class="detail-title">Change Name / PIN</h3>
      <button class="icon-btn small" id="closeSecurityModal">&times;</button>
    </div>
    <div id="securityError" class="auth-error" hidden></div>
    <label class="settings-field">Name
      <input id="securityNameInput" value="${escapeHtml(state.name)}" />
    </label>
    <button id="securitySaveNameBtn" class="primary-btn small">Save Name</button>
    <div class="security-divider"></div>
    <div id="securityPinChangeArea">
      <button id="startChangePinBtn" class="primary-btn small secondary-style">Change PIN</button>
    </div>
  `;
  document.getElementById("closeSecurityModal").addEventListener("click", closeSecurityModal);

  document.getElementById("securitySaveNameBtn").addEventListener("click", () => {
    const errEl = document.getElementById("securityError");
    const check = validateFullName(document.getElementById("securityNameInput").value);
    if (!check.valid) {
      errEl.className = "auth-error";
      errEl.textContent = check.error;
      errEl.hidden = false;
      return;
    }
    const nameKey = check.trimmed.toLowerCase();
    const accounts = loadAccounts();
    const taken = accounts.some((a) => a.id !== state.accountId && a.nameKey === nameKey);
    if (taken) {
      errEl.className = "auth-error";
      errEl.textContent = "That name is already taken by another account.";
      errEl.hidden = false;
      return;
    }
    const acc = accounts.find((a) => a.id === state.accountId);
    acc.name = check.trimmed;
    acc.nameKey = nameKey;
    saveAccounts(accounts);
    state.name = check.trimmed;
    renderHome();
    settingsName.textContent = state.name;

    errEl.className = "auth-success";
    errEl.textContent = "Name updated!";
    errEl.hidden = false;
  });

  document.getElementById("startChangePinBtn").addEventListener("click", renderSecurityChangePinArea);
}

function renderSecurityChangePinArea() {
  securityNewPinBuffer = "";
  securityPendingNewPin = "";
  securityNewPinPurpose = "set";
  const area = document.getElementById("securityPinChangeArea");
  area.innerHTML = `
    <p class="auth-sub" id="securityPinPrompt">Choose a new 6-digit PIN</p>
    <div id="securityNewPinDotsWrap"></div>
    <div id="securityNewPinPadWrap"></div>
  `;
  const dots = createPinDotsEl();
  document.getElementById("securityNewPinDotsWrap").appendChild(dots);

  const pad = createPinPadEl(
    (d) => {
      if (securityNewPinBuffer.length >= 6) return;
      securityNewPinBuffer += d;
      renderPinDotsInto(dots, securityNewPinBuffer.length);
      if (securityNewPinBuffer.length === 6) {
        if (securityNewPinPurpose === "set") {
          securityPendingNewPin = securityNewPinBuffer;
          securityNewPinBuffer = "";
          securityNewPinPurpose = "confirm";
          document.getElementById("securityPinPrompt").textContent = "Confirm your new PIN";
          renderPinDotsInto(dots, 0);
        } else {
          if (securityNewPinBuffer === securityPendingNewPin) {
            const accounts = loadAccounts();
            const acc = accounts.find((a) => a.id === state.accountId);
            acc.pin = securityNewPinBuffer;
            saveAccounts(accounts);
            area.innerHTML = `<p class="auth-success">PIN updated!</p>`;
          } else {
            document.getElementById("securityPinPrompt").textContent =
              "Those didn't match. Choose a new 6-digit PIN";
            securityNewPinPurpose = "set";
            securityPendingNewPin = "";
            securityNewPinBuffer = "";
            renderPinDotsInto(dots, 0);
          }
        }
      }
    },
    () => {
      securityNewPinBuffer = securityNewPinBuffer.slice(0, -1);
      renderPinDotsInto(dots, securityNewPinBuffer.length);
    }
  );
  document.getElementById("securityNewPinPadWrap").appendChild(pad);
}

function renderSecurityDeleteStep() {
  securityCard.innerHTML = `
    <div class="detail-header">
      <h3 class="detail-title">Delete Account</h3>
      <button class="icon-btn small" id="closeSecurityModal">&times;</button>
    </div>
    <p class="auth-sub">This permanently deletes your account, including all assignments, exams, and grades. This can't be undone.</p>
    <button id="confirmDeleteAccountBtn" class="danger-btn">Delete Forever</button>
    <div id="securityConfirmSlot"></div>
  `;
  document.getElementById("closeSecurityModal").addEventListener("click", closeSecurityModal);

  document.getElementById("confirmDeleteAccountBtn").addEventListener("click", () => {
    const slot = document.getElementById("securityConfirmSlot");
    slot.innerHTML = `
      <div class="confirm-row" style="margin-top:12px;">
        <span>Are you absolutely sure?</span>
        <button class="confirm-yes" id="finalDeleteYes">Yes, delete</button>
        <button class="confirm-no" id="finalDeleteNo">No</button>
      </div>
    `;
    document.getElementById("finalDeleteYes").addEventListener("click", () => {
      const accounts = loadAccounts().filter((a) => a.id !== state.accountId);
      saveAccounts(accounts);
      localStorage.removeItem(accountDataKey(state.accountId));
      localStorage.removeItem(STORAGE_KEYS.lastAccountId);
      closeSecurityModal();
      closeSettingsDrawer();
      showWelcomeScreen();
      initAuth();
    });
    document.getElementById("finalDeleteNo").addEventListener("click", () => (slot.innerHTML = ""));
  });
}

openSecurityBtn.addEventListener("click", () => openSecurityModal("changeInfo"));
deleteAccountBtn.addEventListener("click", () => openSecurityModal("deleteAccount"));
securityModal.addEventListener("click", (e) => {
  if (e.target === securityModal) closeSecurityModal();
});

// ---------- Accent color ----------

const ACCENT_PALETTE = {
  red: { light: ["#e0393f", "#c22a30"], dark: ["#ff6b6b", "#e35353"] },
  pink: { light: ["#ec4899", "#d6336c"], dark: ["#f472b6", "#ec4899"] },
  purple: { light: ["#8b5cf6", "#7c3aed"], dark: ["#a78bfa", "#8b5cf6"] },
  indigo: { light: ["#6366f1", "#4f46e5"], dark: ["#818cf8", "#6366f1"] },
  teal: { light: ["#0d9488", "#0f766e"], dark: ["#2dd4bf", "#14b8a6"] },
  gold: { light: ["#ca8a04", "#a16207"], dark: ["#facc15", "#eab308"] },
};
const ACCENT_STORAGE_KEY = "sp_accentColor";

function applyAccentColor(colorId) {
  const palette = ACCENT_PALETTE[colorId] || ACCENT_PALETTE.red;
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [main, pressed] = isDark ? palette.dark : palette.light;
  document.documentElement.style.setProperty("--primary", main);
  document.documentElement.style.setProperty("--primary-dark", pressed);
}

function loadAccentColor() {
  return localStorage.getItem(ACCENT_STORAGE_KEY) || "red";
}

function saveAccentColorChoice(colorId) {
  localStorage.setItem(ACCENT_STORAGE_KEY, colorId);
}

function renderAccentSwatches() {
  const current = loadAccentColor();
  accentSwatches.innerHTML = "";
  Object.keys(ACCENT_PALETTE).forEach((colorId) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (colorId === current ? " selected" : "");
    btn.style.background = ACCENT_PALETTE[colorId].light[0];
    btn.setAttribute("aria-label", colorId);
    btn.addEventListener("click", () => {
      saveAccentColorChoice(colorId);
      applyAccentColor(colorId);
      accentSwatches.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
      btn.classList.add("selected");
    });
    accentSwatches.appendChild(btn);
  });
}

applyAccentColor(loadAccentColor());
renderAccentSwatches();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyAccentColor(loadAccentColor()));

// ---------- Init ----------

function renderAll() {
  renderHome();
  renderCalendar();
  renderAssignments();
  renderExams();
  renderGrades();
}

initAuth();
