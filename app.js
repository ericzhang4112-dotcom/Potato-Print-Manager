const STORAGE_KEY = 'potato-print-manager-state-v3';
let userStorageKey = STORAGE_KEY;

const defaultState = {
  queue: [],
  filaments: [],
  outFilaments: [],
  history: [],
  settings: {
    retentionEnabled: false,
    retentionDays: 0,
    darkMode: true
  }
};

let state = loadState();
let draggedQueueId = null;
let pendingCompletionJobId = null;
let authMode = 'signin';
let supabaseClient = null;

const els = {
  navButtons: document.querySelectorAll('.nav-btn'),
  views: document.querySelectorAll('.view'),
  statusSummary: document.getElementById('statusSummary'),
  queueForm: document.getElementById('queueForm'),
  queueName: document.getElementById('queueName'),
  queueMaterial: document.getElementById('queueMaterial'),
  queueMaterialColor: document.getElementById('queueMaterialColor'),
  queueMaterialOther: document.getElementById('queueMaterialOther'),
  queueMaterialOtherWrapper: document.getElementById('queueMaterialOtherWrapper'),
  queueUrgency: document.getElementById('queueUrgency'),
  queuePlateCount: document.getElementById('queuePlateCount'),
  queueFilamentNeeded: document.getElementById('queueFilamentNeeded'),
  queuePlateNamesContainer: document.getElementById('queuePlateNamesContainer'),
  queueNote: document.getElementById('queueNote'),
  queueList: document.getElementById('queueList'),
  completionModal: document.getElementById('completionModal'),
  completionFilament: document.getElementById('completionFilament'),
  completionFilamentColor: document.getElementById('completionFilamentColor'),
  completionAmountUsed: document.getElementById('completionAmountUsed'),
  completionBuffer: document.getElementById('completionBuffer'),
  saveCompletionRecord: document.getElementById('saveCompletionRecord'),
  skipCompletionSave: document.getElementById('skipCompletionSave'),
  queueCountBadge: document.getElementById('queueCountBadge'),
  filamentForm: document.getElementById('filamentForm'),
  filamentName: document.getElementById('filamentName'),
  filamentPrice: document.getElementById('filamentPrice'),
  filamentColor: document.getElementById('filamentColor'),
  filamentColorPicker: document.getElementById('filamentColorPicker'),
  filamentBrand: document.getElementById('filamentBrand'),
  filamentType: document.getElementById('filamentType'),
  filamentAmount: document.getElementById('filamentAmount'),
  filamentNote: document.getElementById('filamentNote'),
  filamentList: document.getElementById('filamentList'),
  filamentCountBadge: document.getElementById('filamentCountBadge'),
  expenseForm: document.getElementById('expenseForm'),
  expenseFilament: document.getElementById('expenseFilament'),
  expenseFilamentColor: document.getElementById('expenseFilamentColor'),
  expenseAmount: document.getElementById('expenseAmount'),
  expensePrint: document.getElementById('expensePrint'),
  expensePrintOther: document.getElementById('expensePrintOther'),
  expensePrintOtherWrapper: document.getElementById('expensePrintOtherWrapper'),
  expenseNote: document.getElementById('expenseNote'),
  historyList: document.getElementById('historyList'),
  historyCountBadge: document.getElementById('historyCountBadge'),
  historySelectAll: document.getElementById('historySelectAll'),
  deleteSelectedHistory: document.getElementById('deleteSelectedHistory'),
  deleteAllHistory: document.getElementById('deleteAllHistory'),
  retentionEnabled: document.getElementById('retentionEnabled'),
  retentionPeriod: document.getElementById('retentionPeriod'),
  themeToggle: document.getElementById('themeToggle')
};

const authEls = {
  view: document.getElementById('authView'),
  app: document.getElementById('appView'),
  form: document.getElementById('authForm'),
  title: document.getElementById('authTitle'),
  message: document.getElementById('authMessage'),
  error: document.getElementById('authError'),
  email: document.getElementById('authEmail'),
  password: document.getElementById('authPassword'),
  usernameField: document.getElementById('usernameField'),
  username: document.getElementById('authUsername'),
  submit: document.getElementById('authSubmit'),
  modeToggle: document.getElementById('authModeToggle'),
  google: document.getElementById('googleSignIn'),
  signOut: document.getElementById('signOutButton')
};

const accountEls = {
  avatar: document.getElementById('accountAvatar'),
  username: document.getElementById('accountUsername'),
  email: document.getElementById('accountEmail'),
  form: document.getElementById('accountForm'),
  picture: document.getElementById('accountPicture'),
  usernameInput: document.getElementById('accountUsernameInput'),
  password: document.getElementById('accountPassword'),
  message: document.getElementById('accountMessage'),
  deleteButton: document.getElementById('deleteAccountButton')
};

let currentSession = null;
let remoteDataReady = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(userStorageKey));
    if (!saved) return structuredClone(defaultState);

    return {
      queue: Array.isArray(saved.queue) ? saved.queue : [],
      filaments: Array.isArray(saved.filaments)
        ? saved.filaments.map((filament) => {
          const amount = Number(filament.amount || 0) * (filament.pricePerGram ? 1 : 1000);
          return {
            ...filament,
            amount,
            colorHex: filament.colorHex || '#64748b',
            pricePerGram: Number(filament.pricePerGram || 0) || (amount > 0 ? Number(filament.price || 0) / amount : 0)
          };
        })
        : [],
      history: Array.isArray(saved.history) ? saved.history : [],
      outFilaments: Array.isArray(saved.outFilaments) ? saved.outFilaments : [],
      settings: {
        ...defaultState.settings,
        ...(saved.settings || {})
      }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

async function saveState() {
  localStorage.setItem(userStorageKey, JSON.stringify(state));
  if (!supabaseClient || !currentSession || !remoteDataReady) return;

  const { error } = await supabaseClient
    .from('user_print_manager_data')
    .upsert({ user_id: currentSession.user.id, data: state }, { onConflict: 'user_id' });
  if (error) console.error('Could not save print manager data:', error.message);
}

async function loadRemoteState() {
  if (!supabaseClient || !currentSession) return;

  const sessionId = currentSession.user.id;
  const localState = state;
  let data;
  let error;

  try {
    ({ data, error } = await supabaseClient
      .from('user_print_manager_data')
      .select('data')
      .eq('user_id', sessionId)
      .maybeSingle());
  } catch (requestError) {
    console.error('Could not load print manager data:', requestError);
    remoteDataReady = false;
    return;
  }

  if (error) {
    console.error('Could not load print manager data:', error.message);
    remoteDataReady = false;
    return;
  }

  if (!currentSession || currentSession.user.id !== sessionId) return;

  if (data?.data) {
    let remoteState = data.data;
    if (typeof remoteState === 'string') {
      try {
        remoteState = JSON.parse(remoteState);
      } catch (parseError) {
        console.error('Could not parse saved print manager data:', parseError);
        remoteDataReady = false;
        return;
      }
    }
    state = {
      ...structuredClone(defaultState),
      ...remoteState,
      settings: {
        ...defaultState.settings,
        ...(remoteState.settings || {})
      }
    };
  } else {
    state = localState;
    await supabaseClient
      .from('user_print_manager_data')
      .upsert({ user_id: sessionId, data: state }, { onConflict: 'user_id' });
  }

  if (!currentSession || currentSession.user.id !== sessionId) return;
  remoteDataReady = true;
  render();
}

function getPricePerGram(filament) {
  const amount = Number(filament?.amount || 0);
  return Number(filament?.pricePerGram || 0) || (amount > 0 ? Number(filament?.price || 0) / amount : 0);
}

function moveEmptyFilamentsOut() {
  const empty = state.filaments.filter((filament) => Number(filament.amount || 0) <= 0);
  if (!empty.length) return;

  state.filaments = state.filaments.filter((filament) => Number(filament.amount || 0) > 0);
  state.outFilaments = [...state.outFilaments, ...empty];
}

function normalizePlateCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 1;
  }
  return Math.min(Math.max(Math.round(count), 1), 12);
}

function buildPlates(plateCount, names = [], existingPlates = []) {
  const count = normalizePlateCount(plateCount);
  const safeNames = Array.isArray(names) ? names : [];

  return Array.from({ length: count }, (_, index) => {
    const existing = existingPlates[index];
    const nextName = (safeNames[index] || existing?.name || `Plate ${index + 1}`).trim();
    return {
      id: existing?.id || crypto.randomUUID(),
      name: nextName || `Plate ${index + 1}`,
      completed: Boolean(existing?.completed)
    };
  });
}

function normalizeQueueItem(job) {
  const plateCount = normalizePlateCount(job.plateCount || job.plates?.length || 1);
  const plates = Array.isArray(job.plates) && job.plates.length
    ? buildPlates(plateCount, job.plateNames || [], job.plates)
    : buildPlates(plateCount, job.plateNames || []);

  return {
    ...job,
    plateCount,
    plates,
    filamentNeeded: Number(job.filamentNeeded || 0),
    materialId: job.materialId || '',
    modelName: job.modelName || '',
    modelPreview: job.modelPreview || '',
    modelKind: job.modelKind || 'model'
  };
}

function normalizeQueueState() {
  state.queue = (state.queue || []).map(normalizeQueueItem);
}

function applyTheme() {
  const darkMode = state.settings.darkMode !== false;
  document.body.style.filter = 'none';
  document.documentElement.style.setProperty('--bg', darkMode ? '#0b1020' : '#edf4ff');
  document.documentElement.style.setProperty('--bg-elevated', darkMode ? '#111a2b' : '#ffffff');
  document.documentElement.style.setProperty('--panel', darkMode ? '#171f31' : '#f5f8ff');
  document.documentElement.style.setProperty('--panel-strong', darkMode ? '#1f2b3d' : '#e7eefb');
  document.documentElement.style.setProperty('--panel-soft', darkMode ? '#1a2439' : '#edf3ff');
  document.documentElement.style.setProperty('--border', darkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(90, 112, 148, 0.20)');
  document.documentElement.style.setProperty('--text', darkMode ? '#e5edf9' : '#10213a');
  document.documentElement.style.setProperty('--muted', darkMode ? '#9aa9c4' : '#445b7f');
  document.documentElement.style.setProperty('--primary', darkMode ? '#7dd3fc' : '#1267c7');
  document.documentElement.style.setProperty('--primary-soft', darkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(18, 103, 199, 0.10)');
  document.documentElement.style.setProperty('--accent', darkMode ? '#c084fc' : '#7c3aed');
  document.documentElement.style.setProperty('--shadow', darkMode ? 'rgba(2, 6, 23, 0.45)' : 'rgba(132, 146, 170, 0.20)');
  if (els.themeToggle) els.themeToggle.checked = darkMode;
}

function getQueueUrgencyRank(urgency) {
  const order = { High: 3, Normal: 2, Low: 1 };
  return order[urgency] || 0;
}

function getQueueById(id) {
  return state.queue.find((job) => job.id === id);
}

function applyRetentionRules() {
  const { retentionEnabled, retentionDays } = state.settings;
  if (!retentionEnabled || Number(retentionDays) <= 0) {
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  state.history = state.history.filter((entry) => new Date(entry.date).getTime() >= cutoff);
}

function renderPlateNameInputs(currentCount = 1) {
  const count = normalizePlateCount(currentCount || els.queuePlateCount.value || 1);

  if (count <= 1) {
    els.queuePlateNamesContainer.innerHTML = '';
    return;
  }

  els.queuePlateNamesContainer.innerHTML = Array.from({ length: count }, (_, index) => `
    <label class="plate-name-field">
      <span>Plate ${index + 1}</span>
      <input type="text" class="plate-name-input" data-index="${index}" placeholder="Plate ${index + 1}" />
    </label>
  `).join('');

}

function updateMaterialOptions() {
  const current = els.queueMaterial.value || '';
  const options = [
    '<option value="">Select filament</option>',
    ...state.filaments.map((filament) => `<option value="${filament.id}">${escapeHtml(filament.name || 'Untitled filament')} - ${escapeHtml(filament.color || 'No color')}</option>`),
    '<option value="other">Other...</option>'
  ];

  els.queueMaterial.innerHTML = options.join('');

  if (state.filaments.some((filament) => filament.id === current)) {
    els.queueMaterial.value = current;
  } else if (current === 'other') {
    els.queueMaterial.value = 'other';
  } else {
    els.queueMaterial.value = '';
  }

  const shouldShowOther = els.queueMaterial.value === 'other';
  els.queueMaterialOtherWrapper.classList.toggle('hidden', !shouldShowOther);
  updateQueueMaterialColor();
}

function updateQueueMaterialColor() {
  const filament = state.filaments.find((item) => item.id === els.queueMaterial.value);
  els.queueMaterialColor.style.background = filament?.colorHex || 'transparent';
  els.queueMaterialColor.textContent = filament?.color || '';
}

function getPlatesForJob(job) {
  return Array.isArray(job.plates) && job.plates.length ? job.plates : buildPlates(job.plateCount || 1, []);
}

function getCompletedPlateCount(job) {
  const plates = getPlatesForJob(job);
  return plates.filter((plate) => plate.completed).length;
}

function renderQueue() {
  const queue = [...state.queue];

  els.queueCountBadge.textContent = String(queue.length);
  els.statusSummary.textContent = `${queue.length} queued`;

  if (!queue.length) {
    els.queueList.innerHTML = '<div class="empty-state">No queued prints yet. Add a new project to get started.</div>';
    return;
  }

  els.queueList.innerHTML = queue
    .map((job) => {
      const plates = getPlatesForJob(job);
      const completedCount = getCompletedPlateCount(job);
      const progress = plates.length ? Math.round((completedCount / plates.length) * 100) : 0;
      const urgencyClass = (job.urgency || 'Normal').toLowerCase();
      const hasMultiplePlates = plates.length > 1;

      return `
        <div class="queue-item" data-id="${job.id}" draggable="true">
          <div class="queue-top">
            <div class="queue-main">
              <div class="queue-heading-row">
                <strong>${escapeHtml(job.name || 'Untitled print')}</strong>
                <span class="urgency-pill ${urgencyClass}">${escapeHtml(job.urgency || 'Normal')}</span>
              </div>
              <span class="queue-meta">${escapeHtml(job.material || 'Material not set')}</span>
              ${job.filamentNeeded ? `<span class="queue-meta">Needed: ${job.filamentNeeded}g</span>` : ''}
              <span class="queue-meta">${escapeHtml(job.note || 'No notes')}</span>
            </div>
            <div class="queue-actions">
              <button class="icon-btn" data-action="up" data-id="${job.id}" title="Move up">↑</button>
              <button class="icon-btn" data-action="down" data-id="${job.id}" title="Move down">↓</button>
              <button class="small-btn" data-action="complete" data-id="${job.id}">Complete</button>
              <button class="small-btn delete-btn" data-action="delete" data-id="${job.id}">Delete</button>
            </div>
          </div>

          ${hasMultiplePlates ? `
            <div class="plate-block">
              <div class="plate-progress-meta">
                <span>Plates</span>
                <span>${completedCount}/${plates.length}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
              </div>
              <div class="plate-toggles">
                ${plates
                  .map(
                    (plate, index) => `
                      <label class="plate-toggle">
                        <input type="checkbox" class="plate-checkbox" data-id="${job.id}" data-plate-id="${plate.id}" ${plate.completed ? 'checked' : ''} />
                        <span>${escapeHtml(plate.name || `Plate ${index + 1}`)}</span>
                      </label>
                    `
                  )
                  .join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    })
    .join('');
}

function renderFilaments() {
  els.filamentCountBadge.textContent = String(state.filaments.length);

  if (!state.filaments.length) {
    els.filamentList.innerHTML = '<div class="empty-state">No filament stocked yet. Add a spool to track material costs.</div>';
  } else {
    els.filamentList.innerHTML = state.filaments
      .map(
        (filament) => `
          <div class="filament-card">
            <div class="filament-title-row">
              <h4>${escapeHtml(filament.name || 'Untitled filament')}</h4>
              <button type="button" class="small-btn delete-btn" data-filament-action="delete" data-filament-id="${filament.id}">Delete</button>
            </div>
            <div class="filament-title-row">
              <span class="color-swatch" style="background: ${escapeHtml(filament.colorHex || '#64748b')}" aria-label="${escapeHtml(filament.color || 'Unspecified color')}"></span>
              <div class="tag-row">
              ${filament.color ? `<span class="tag">${escapeHtml(filament.color)}</span>` : ''}
              ${filament.brand ? `<span class="tag">${escapeHtml(filament.brand)}</span>` : ''}
              ${filament.type ? `<span class="tag">${escapeHtml(filament.type)}</span>` : ''}
              </div>
            </div>
            <div class="inventory-remaining">${Number(filament.amount || 0).toFixed(0)}g ${filament.amount > 0 && filament.amount < 100 ? '<span class="low-stock-label">Low</span>' : ''}</div>
            <div class="meta-row">$${getPricePerGram(filament).toFixed(4)} / g • $${Number(filament.price || 0).toFixed(2)} spool</div>
            <div class="muted">${escapeHtml(filament.note || 'No note added')}</div>
          </div>
        `
      )
      .join('');
  }
  els.filamentList.parentElement.querySelector('.out-section')?.remove();
  els.filamentList.insertAdjacentHTML('afterend', `
    <details class="out-section">
      <summary>Out (${state.outFilaments.length})</summary>
      <div class="out-list">
        ${state.outFilaments.length ? state.outFilaments.map((filament) => `
          <div class="filament-card out-card">
            <div class="filament-title-row">
              <h4>${escapeHtml(filament.name || 'Untitled filament')}</h4>
              <button type="button" class="small-btn delete-btn" data-filament-action="delete-out" data-filament-id="${filament.id}">Delete</button>
            </div>
            <div class="filament-title-row"><span class="color-swatch" style="background: ${escapeHtml(filament.colorHex || '#64748b')}" aria-label="${escapeHtml(filament.color || 'Unspecified color')}"></span><div class="meta-row">${escapeHtml(filament.color || 'No color')} • ${escapeHtml(filament.brand || 'No brand')} • ${escapeHtml(filament.type || 'Unspecified')}</div></div>
            <div class="muted">Empty spool • $${Number(filament.price || 0).toFixed(2)}</div>
          </div>
        `).join('') : '<div class="muted">No empty spools.</div>'}
      </div>
    </details>
  `);
}

function renderHistory() {
  els.historyCountBadge.textContent = String(state.history.length);

  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="empty-state">No print history yet. Completed jobs and recorded costs will appear here.</div>';
    return;
  }

  els.historyList.innerHTML = [...state.history]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(
      (entry) => `
        <div class="history-entry">
          <div class="entry-main">
            <div class="history-entry-heading">
              <strong>${escapeHtml(entry.printName || 'Completed print')}</strong>
              <button type="button" class="small-btn delete-btn" data-history-action="delete" data-history-id="${entry.id}">Delete</button>
            </div>
            <div class="meta-row"><input type="checkbox" class="history-checkbox" data-history-id="${entry.id}" /> ${escapeHtml(entry.filamentName || 'Unknown filament')} • ${escapeHtml(entry.color || 'No color')} • ${escapeHtml(entry.type || 'Unspecified')}</div>
            <div class="muted">${entry.gramsUsed ? `${Number(entry.gramsUsed).toFixed(0)}g used • ` : ''}${escapeHtml(entry.note || 'No usage note')} • ${formatDate(entry.date)}</div>
          </div>
          <div class="entry-cost">
            <strong class="history-grams">${Number(entry.gramsUsed || 0).toFixed(0)}g</strong>
            <strong>$${Number(entry.cost || 0).toFixed(2)}</strong>
          </div>
        </div>
      `
    )
    .join('');
}

function populateExpenseInputs() {
  const filamentOptions = state.filaments.map(
    (filament) => `<option value="${filament.id}">${escapeHtml(filament.name || 'Untitled filament')} - ${escapeHtml(filament.color || 'No color')}</option>`
  );

  const queueOptions = state.queue.map(
    (job) => `<option value="${job.id}">${escapeHtml(job.name || 'Untitled job')}</option>`
  );

  els.expenseFilament.innerHTML = filamentOptions.length
    ? filamentOptions.join('')
    : '<option value="">No filament available</option>';
  const selectedFilament = state.filaments.find((filament) => filament.id === els.expenseFilament.value);
  els.expenseFilamentColor.style.background = selectedFilament?.colorHex || 'transparent';
  els.expenseFilamentColor.textContent = selectedFilament?.color || '';

  els.expensePrint.innerHTML = `
    <option value="">Manual expense</option>
    ${queueOptions.join('')}
    <option value="other">Other...</option>
  `;

  const completionFilamentOptions = state.filaments.map(
    (filament) => `<option value="${filament.id}">${escapeHtml(filament.name || 'Untitled filament')} - ${escapeHtml(filament.color || 'No color')}</option>`
  );

  els.completionFilament.innerHTML = completionFilamentOptions.length
    ? completionFilamentOptions.join('')
    : '<option value="">No filament available</option>';
  updateCompletionFilamentColor();
}

function setActiveView(viewName) {
  els.navButtons.forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle('active', isActive);
  });

  els.views.forEach((section) => {
    section.classList.toggle('active', section.id === `${viewName}View`);
  });
}

function scheduleFinishQueueItem(jobId) {
  const queueItem = els.queueList.querySelector(`.queue-item[data-id="${jobId}"]`);

  if (queueItem) {
    queueItem.classList.add('is-removing');
    setTimeout(() => {
      const currentJob = getQueueById(jobId);
      if (currentJob) {
        state.queue = state.queue.filter((item) => item.id !== jobId);
        saveState();
        render();
      }
    }, 300);
    return;
  }

  state.queue = state.queue.filter((item) => item.id !== jobId);
  saveState();
  render();
}

function finishQueueItem(jobId, options = {}) {
  const job = getQueueById(jobId);
  if (!job) return;

  const { filamentId = '', amountUsed = 0, buffer = 0, useHistory = true } = options;
  const selectedFilament = state.filaments.find((item) => item.id === filamentId) || null;
  const totalUsed = Math.max(0, Number(amountUsed || 0)) + Math.max(0, Number(buffer || 0));

  if (useHistory) {
    const entry = {
      id: crypto.randomUUID(),
      printName: job.name || 'Completed print',
      filamentName: selectedFilament?.name || job.material || 'Unknown filament',
      color: selectedFilament?.color || 'Unknown color',
      brand: selectedFilament?.brand || 'Unknown brand',
      type: selectedFilament?.type || 'Unknown type',
      cost: totalUsed * getPricePerGram(selectedFilament),
      note: `Used ${Number(amountUsed || 0)}g${buffer ? ` + ${Number(buffer)}g buffer` : ''}`,
      date: new Date().toISOString(),
      printId: job.id,
      material: job.material || selectedFilament?.name || 'Unknown material',
      gramsUsed: totalUsed,
      bufferGrams: Number(buffer || 0)
    };

    state.history.push(entry);
  }

  if (selectedFilament) {
    selectedFilament.amount = Math.max(0, Number(selectedFilament.amount || 0) - totalUsed);
  }
  moveEmptyFilamentsOut();

  state.queue = state.queue.filter((item) => item.id !== jobId);
  saveState();
  render();
}

function openCompletionModal(jobId) {
  const job = getQueueById(jobId);
  if (!job) return;

  pendingCompletionJobId = jobId;
  els.completionFilament.value = job.materialId || state.filaments.find((filament) => filament.name === job.material)?.id || '';
  updateCompletionFilamentColor();
  els.completionAmountUsed.value = job.filamentNeeded || '';
  els.completionBuffer.value = '';
  els.completionModal.classList.remove('hidden');
  els.completionModal.setAttribute('aria-hidden', 'false');
}

function closeCompletionModal() {
  pendingCompletionJobId = null;
  els.completionModal.classList.add('hidden');
  els.completionModal.setAttribute('aria-hidden', 'true');
  els.completionAmountUsed.value = '';
  els.completionBuffer.value = '';
}

function updateCompletionFilamentColor() {
  const filament = state.filaments.find((item) => item.id === els.completionFilament.value);
  els.completionFilamentColor.style.background = filament?.colorHex || 'transparent';
  els.completionFilamentColor.textContent = filament?.color || '';
}

function saveCompletionRecord() {
  if (!pendingCompletionJobId) return;

  if (!getQueueById(pendingCompletionJobId)) {
    closeCompletionModal();
    return;
  }

  const selectedFilamentId = els.completionFilament.value;
  const amountUsed = Number(els.completionAmountUsed.value || 0);
  const buffer = Number(els.completionBuffer.value || 0);

  finishQueueItem(pendingCompletionJobId, {
    filamentId: selectedFilamentId,
    amountUsed,
    buffer,
    useHistory: true
  });
  closeCompletionModal();
}

function skipCompletionRecord() {
  if (!pendingCompletionJobId) {
    closeCompletionModal();
    return;
  }

  finishQueueItem(pendingCompletionJobId, { useHistory: false });
  closeCompletionModal();
}

function addQueueItem(event) {
  event.preventDefault();

  const name = els.queueName.value.trim();
  const materialInput = els.queueMaterial.value;
  const selectedFilament = state.filaments.find((filament) => filament.id === materialInput);
  const material = materialInput === 'other'
    ? els.queueMaterialOther.value.trim()
    : selectedFilament?.name || '';
  const materialId = selectedFilament?.id || '';
  const urgency = els.queueUrgency.value;
  const note = els.queueNote.value.trim();
  const plateCount = normalizePlateCount(els.queuePlateCount.value || 1);
  const plateNames = Array.from(document.querySelectorAll('.plate-name-input')).map((input) => input.value.trim());
  const filamentNeeded = Number(els.queueFilamentNeeded.value || 0);

  if (!name && !material && !note && !plateNames.some(Boolean)) {
    return;
  }

  const effectivePlateCount = Math.max(1, plateCount);
  const normalizedPlates = buildPlates(effectivePlateCount, plateNames.length ? plateNames : []);

  state.queue.push({
    id: crypto.randomUUID(),
    name,
    material,
    materialId,
    urgency,
    note,
    createdAt: new Date().toISOString(),
    plateCount: effectivePlateCount,
    plateNames,
    filamentNeeded,
    plates: normalizedPlates,
    modelName: '',
    modelPreview: '',
    modelKind: 'none'
  });

  els.queueForm.reset();
  els.queueUrgency.value = 'Normal';
  els.queuePlateCount.value = '1';
  updateMaterialOptions();
  renderPlateNameInputs(1);
  saveState();
  render();
}

function addFilament(event) {
  event.preventDefault();

  const name = els.filamentName.value.trim();
  const price = parseFloat(els.filamentPrice.value) || 0;
  const color = els.filamentColor.value.trim();
  const colorHex = els.filamentColorPicker.value;
  const brand = els.filamentBrand.value.trim();
  const type = els.filamentType.value.trim();
  const amount = parseFloat(els.filamentAmount.value) || 0;
  const note = els.filamentNote.value.trim();

  if (!name && !color && !brand && !type && !price && !amount && !note) {
    return;
  }

  state.filaments.push({
    id: crypto.randomUUID(),
    name,
    color,
    brand,
    type,
    price,
    amount,
    colorHex,
    pricePerGram: amount > 0 ? price / amount : 0,
    note
  });

  els.filamentForm.reset();
  els.filamentColorPicker.value = '#7dd3fc';
  saveState();
  render();
}

function addExpense(event) {
  event.preventDefault();

  const filamentId = els.expenseFilament.value;
  const filament = state.filaments.find((item) => item.id === filamentId);
  const printId = els.expensePrint.value;
  const printName = printId === 'other'
    ? els.expensePrintOther.value.trim() || 'Other use'
    : printId ? getQueueById(printId)?.name || 'Completed print' : 'Manual usage';
  const amount = Number(els.expenseAmount.value || 0);
  const note = els.expenseNote.value.trim();

  if (!filament && !amount && !note && !printId) {
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    printName,
    filamentName: filament?.name || 'Unknown filament',
    color: filament?.color || 'Unknown color',
    brand: filament?.brand || 'Unknown brand',
    type: filament?.type || 'Unknown type',
    cost: amount * getPricePerGram(filament),
    note: note || 'No additional note',
    date: new Date().toISOString(),
    gramsUsed: amount
  };

  state.history.push(entry);
  if (filament) {
    filament.amount = Math.max(0, Number(filament.amount || 0) - amount);
  }
  moveEmptyFilamentsOut();

  els.expenseForm.reset();
  els.expensePrintOtherWrapper.classList.add('hidden');
  saveState();
  render();
}

function updateExpenseFilamentColor() {
  const filament = state.filaments.find((item) => item.id === els.expenseFilament.value);
  els.expenseFilamentColor.style.background = filament?.colorHex || 'transparent';
  els.expenseFilamentColor.textContent = filament?.color || '';
}

function deleteHistoryEntries(ids) {
  state.history = state.history.filter((entry) => !ids.includes(entry.id));
  saveState();
  render();
}

function animateRemoval(element, callback) {
  if (!element) {
    callback();
    return;
  }
  element.classList.add('is-removing');
  window.setTimeout(callback, 280);
}

function moveQueueItem(id, direction) {
  const index = state.queue.findIndex((job) => job.id === id);
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= state.queue.length) return;

  const [item] = state.queue.splice(index, 1);
  state.queue.splice(targetIndex, 0, item);
  saveState();
  const previousPositions = captureQueuePositions();
  render();
  animateQueueReorder(previousPositions);
}

function reorderQueue(sourceId, targetId) {
  const sourceIndex = state.queue.findIndex((job) => job.id === sourceId);
  const targetIndex = state.queue.findIndex((job) => job.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

  const [item] = state.queue.splice(sourceIndex, 1);
  state.queue.splice(targetIndex, 0, item);
  saveState();
  const previousPositions = captureQueuePositions();
  render();
  animateQueueReorder(previousPositions);
}

function captureQueuePositions() {
  return new Map(
    Array.from(els.queueList.querySelectorAll('.queue-item')).map((item) => [item.dataset.id, item.getBoundingClientRect()])
  );
}

function animateQueueReorder(previousPositions) {
  els.queueList.querySelectorAll('.queue-item').forEach((item) => {
    const previous = previousPositions.get(item.dataset.id);
    if (!previous) return;

    const current = item.getBoundingClientRect();
    const offsetY = previous.top - current.top;
    if (!offsetY) return;

    item.animate(
      [{ transform: `translateY(${offsetY}px)` }, { transform: 'translateY(0)' }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  });
}

function togglePlateCompleted(jobId, plateId) {
  const job = getQueueById(jobId);
  if (!job) return;

  const plates = getPlatesForJob(job).map((plate) => {
    if (plate.id !== plateId) return plate;
    return { ...plate, completed: !plate.completed };
  });

  job.plates = plates;
  job.plateCount = plates.length;

  const allCompleted = plates.length > 0 && plates.every((plate) => plate.completed);
  if (allCompleted) {
    openCompletionModal(jobId);
    saveState();
    render();
    return;
  }

  saveState();
  render();
}

function completeQueueItem(id) {
  const job = getQueueById(id);
  if (!job) return;

  openCompletionModal(id);
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveView(button.dataset.view));
  });

  els.queueForm.addEventListener('submit', addQueueItem);
  els.filamentForm.addEventListener('submit', addFilament);
  els.expenseForm.addEventListener('submit', addExpense);
  els.expenseFilament.addEventListener('change', updateExpenseFilamentColor);
  els.completionFilament.addEventListener('change', updateCompletionFilamentColor);

  if (els.historySelectAll) {
    els.historySelectAll.addEventListener('change', () => {
      els.historyList.querySelectorAll('.history-checkbox').forEach((checkbox) => {
        checkbox.checked = els.historySelectAll.checked;
      });
    });
  }

  if (els.deleteSelectedHistory) {
    els.deleteSelectedHistory.addEventListener('click', () => {
      const selectedIds = Array.from(els.historyList.querySelectorAll('.history-checkbox:checked'))
        .map((checkbox) => checkbox.dataset.historyId);
      if (selectedIds.length) deleteHistoryEntries(selectedIds);
    });
  }

  if (els.deleteAllHistory) {
    els.deleteAllHistory.addEventListener('click', () => {
      if (state.history.length) deleteHistoryEntries(state.history.map((entry) => entry.id));
    });
  }

  if (els.historyList) {
    els.historyList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-history-action="delete"]');
      if (target) deleteHistoryEntries([target.dataset.historyId]);
    });
  }

  els.queuePlateCount.addEventListener('input', () => {
    renderPlateNameInputs(els.queuePlateCount.value || 1);
  });

  els.queueMaterial.addEventListener('change', () => {
    const shouldShowOther = els.queueMaterial.value === 'other';
    els.queueMaterialOtherWrapper.classList.toggle('hidden', !shouldShowOther);
    if (!shouldShowOther) {
      els.queueMaterialOther.value = '';
    }
    updateQueueMaterialColor();
  });

  els.expensePrint.addEventListener('change', () => {
    els.expensePrintOtherWrapper.classList.toggle('hidden', els.expensePrint.value !== 'other');
    if (els.expensePrint.value !== 'other') els.expensePrintOther.value = '';
  });

  els.queueList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const { action, id } = target.dataset;
    if (action === 'up') moveQueueItem(id, 'up');
    if (action === 'down') moveQueueItem(id, 'down');
    if (action === 'complete') completeQueueItem(id);
    if (action === 'delete') {
      animateRemoval(target.closest('.queue-item'), () => {
        state.queue = state.queue.filter((job) => job.id !== id);
        saveState();
        render();
      });
    }
  });

  els.filamentList.parentElement.addEventListener('click', (event) => {
    const target = event.target.closest('[data-filament-action]');
    if (!target) return;

    const filamentId = target.dataset.filamentId;
    if (target.dataset.filamentAction === 'delete') {
      animateRemoval(target.closest('.filament-card'), () => {
        state.filaments = state.filaments.filter((filament) => filament.id !== filamentId);
        saveState();
        render();
      });
      return;
    } else if (target.dataset.filamentAction === 'delete-out') {
      animateRemoval(target.closest('.filament-card'), () => {
        state.outFilaments = state.outFilaments.filter((filament) => filament.id !== filamentId);
        saveState();
        render();
      });
      return;
    }
  });

  els.queueList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.plate-checkbox');
    if (!checkbox) return;

    const job = getQueueById(checkbox.dataset.id);
    if (!job || job.plateCount <= 1) return;

    togglePlateCompleted(checkbox.dataset.id, checkbox.dataset.plateId);
  });

  els.queueList.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.queue-item');
    if (!item) return;
    draggedQueueId = item.dataset.id;
    item.classList.add('dragging');
  });

  els.queueList.addEventListener('dragend', (event) => {
    const item = event.target.closest('.queue-item');
    if (item) item.classList.remove('dragging');
    draggedQueueId = null;
    document.querySelectorAll('.queue-item.drop-target').forEach((node) => node.classList.remove('drop-target'));
  });

  els.queueList.addEventListener('dragover', (event) => {
    event.preventDefault();
    const item = event.target.closest('.queue-item');
    document.querySelectorAll('.queue-item.drop-target').forEach((node) => node.classList.remove('drop-target'));
    if (item) item.classList.add('drop-target');
  });

  els.queueList.addEventListener('drop', (event) => {
    event.preventDefault();
    const targetItem = event.target.closest('.queue-item');
    if (!targetItem || !draggedQueueId) return;

    reorderQueue(draggedQueueId, targetItem.dataset.id);
    document.querySelectorAll('.queue-item.drop-target').forEach((node) => node.classList.remove('drop-target'));
  });

  els.saveCompletionRecord.addEventListener('click', saveCompletionRecord);
  els.skipCompletionSave.addEventListener('click', skipCompletionRecord);

  els.completionModal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-modal="true"]')) {
      closeCompletionModal();
    }
  });

  els.retentionEnabled.addEventListener('change', () => {
    state.settings.retentionEnabled = els.retentionEnabled.checked;
    if (!state.settings.retentionEnabled) {
      state.settings.retentionDays = 0;
      els.retentionPeriod.value = '0';
    }
    saveState();
    render();
  });

  els.retentionPeriod.addEventListener('change', () => {
    state.settings.retentionDays = Number(els.retentionPeriod.value);
    saveState();
    render();
  });

}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function renderSettings() {
  els.retentionEnabled.checked = Boolean(state.settings.retentionEnabled);
  els.retentionPeriod.value = String(state.settings.retentionDays || 0);
  els.retentionPeriod.disabled = !state.settings.retentionEnabled;
}

function render() {
  normalizeQueueState();
  applyRetentionRules();
  moveEmptyFilamentsOut();
  updateMaterialOptions();
  renderQueue();
  renderFilaments();
  renderHistory();
  renderSettings();
  populateExpenseInputs();
  applyTheme();
  saveState();
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignUp = mode === 'signup';
  authEls.title.textContent = isSignUp ? 'Create your account' : 'Welcome back';
  authEls.message.textContent = isSignUp ? 'Create an account to start managing your printers.' : 'Sign in to manage your print queue and filament library.';
  authEls.usernameField.classList.toggle('hidden', !isSignUp);
  authEls.username.required = isSignUp;
  authEls.password.autocomplete = isSignUp ? 'new-password' : 'current-password';
  authEls.submit.textContent = isSignUp ? 'Create account' : 'Sign in';
  authEls.modeToggle.textContent = isSignUp ? 'Already have an account? Sign in' : 'Create an account';
  authEls.error.textContent = '';
}

function showAuthError(message) {
  authEls.error.textContent = message;
}

async function submitAuth(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showAuthError('Add your Supabase URL and anon key in supabase-config.js first.');
    return;
  }

  authEls.submit.disabled = true;
  authEls.error.textContent = '';
  const email = authEls.email.value.trim();
  const password = authEls.password.value;
  const result = authMode === 'signup'
    ? await supabaseClient.auth.signUp({ email, password, options: { data: { username: authEls.username.value.trim() } } })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  authEls.submit.disabled = false;
  if (result.error) {
    showAuthError(result.error.message);
  } else if (authMode === 'signup' && !result.data.session) {
    showAuthError('Account created. Check your email to confirm it, then sign in.');
  }
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    showAuthError('Add your Supabase URL and anon key in supabase-config.js first.');
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showAuthError(error.message);
}

async function showAuthenticatedApp(session) {
  currentSession = session;
  if (currentSession.user.user_metadata?.avatar_data && supabaseClient) {
    const cleanedMetadata = { ...currentSession.user.user_metadata };
    delete cleanedMetadata.avatar_data;
    const { data: cleanedUser } = await supabaseClient.auth.updateUser({ data: cleanedMetadata });
    if (cleanedUser?.user) currentSession.user = cleanedUser.user;
  }
  userStorageKey = `${STORAGE_KEY}-${session.user.id}`;
  state = loadState();
  renderAccount(session.user);
  authEls.view.classList.add('hidden');
  authEls.app.classList.remove('hidden');
  remoteDataReady = false;
  await loadRemoteState();
}

function showSignedOutApp() {
  currentSession = null;
  remoteDataReady = false;
  authEls.app.classList.add('hidden');
  authEls.view.classList.remove('hidden');
}

function renderAccount(user) {
  const metadata = user.user_metadata || {};
  const username = metadata.username || metadata.full_name || user.email?.split('@')[0] || 'Account';
  const picture = metadata.avatar_url || '';
  accountEls.username.textContent = username;
  accountEls.email.textContent = user.email || '';
  accountEls.usernameInput.value = username;
  accountEls.avatar.textContent = picture ? '' : username.charAt(0).toUpperCase();
  accountEls.avatar.style.backgroundImage = picture ? `url("${picture}")` : '';
  accountEls.avatar.classList.toggle('has-image', Boolean(picture));
}

function resizeProfilePicture(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const size = 256;
      const scale = Math.min(size / image.width, size / image.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (blob) resolve(blob);
        else reject(new Error('Could not process profile picture.'));
      }, 'image/webp', 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read profile picture.'));
    };
    image.src = objectUrl;
  });
}

async function saveAccountChanges(event) {
  event.preventDefault();
  if (!supabaseClient || !currentSession) return;

  accountEls.message.textContent = 'Saving...';
  const metadata = { ...(currentSession.user.user_metadata || {}), username: accountEls.usernameInput.value.trim() || 'Account' };
  const picture = accountEls.picture.files[0];
  delete metadata.avatar_data;

  if (picture) {
    try {
      const imageBlob = await resizeProfilePicture(picture);
      const path = `${currentSession.user.id}/avatar.webp`;
      const { error: uploadError } = await supabaseClient.storage
        .from('profile-pictures')
        .upload(path, imageBlob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabaseClient.storage.from('profile-pictures').getPublicUrl(path);
      metadata.avatar_url = `${publicData.publicUrl}?v=${Date.now()}`;
    } catch (error) {
      accountEls.message.textContent = `Profile picture could not be saved: ${error.message}`;
      return;
    }
  }

  const updates = { data: metadata };
  if (accountEls.password.value) updates.password = accountEls.password.value;
  const { data, error } = await supabaseClient.auth.updateUser(updates);
  if (error) {
    accountEls.message.textContent = error.message;
    return;
  }

  currentSession.user = data.user;
  renderAccount(data.user);
  accountEls.password.value = '';
  accountEls.picture.value = '';
  accountEls.message.textContent = 'Account updated.';
}

async function deleteAccount() {
  if (!supabaseClient || !currentSession) return;
  const confirmed = window.confirm('Delete your account and sign out? This cannot be undone.');
  if (!confirmed) return;

  accountEls.message.textContent = 'Deleting account...';
  const { error } = await supabaseClient.functions.invoke('delete-account');
  if (error) {
    accountEls.message.textContent = 'Account deletion requires the Supabase delete-account Edge Function.';
    return;
  }
  await supabaseClient.auth.signOut();
}

async function initializeAuth() {
  if (!window.supabase || !window.POTATO_SUPABASE_URL || !window.POTATO_SUPABASE_ANON_KEY || window.POTATO_SUPABASE_URL.includes('YOUR_') || window.POTATO_SUPABASE_ANON_KEY.includes('YOUR_')) {
    showSignedOutApp();
    return;
  }

  if (window.POTATO_SUPABASE_ANON_KEY.startsWith('sb_secret_')) {
    showAuthError('This is a secret Supabase key. Replace it with the project publishable or anon key; never use a secret key in browser code.');
    showSignedOutApp();
    return;
  }

  supabaseClient = window.supabase.createClient(window.POTATO_SUPABASE_URL, window.POTATO_SUPABASE_ANON_KEY);
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) void showAuthenticatedApp(session);
    else showSignedOutApp();
  });

  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
    if (error) {
      showAuthError(error.message);
      showSignedOutApp();
      return;
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showAuthError(error.message);
    showSignedOutApp();
    return;
  }
  if (data.session) showAuthenticatedApp(data.session);
  else showSignedOutApp();
}

bindEvents();
render();
renderPlateNameInputs(1);
setActiveView('queue');

authEls.form.addEventListener('submit', submitAuth);
authEls.google.addEventListener('click', signInWithGoogle);
authEls.modeToggle.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
authEls.signOut.addEventListener('click', async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
});
accountEls.form.addEventListener('submit', saveAccountChanges);
accountEls.deleteButton.addEventListener('click', deleteAccount);
initializeAuth();
