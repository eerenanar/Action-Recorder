const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const sessionListView = document.getElementById("sessionListView");
const sessionDetailView = document.getElementById("sessionDetailView");
const sessionList = document.getElementById("sessionList");
const backBtn = document.getElementById("backBtn");
const detailTitleInput = document.getElementById("detailTitleInput");
const detailDescInput = document.getElementById("detailDescInput");
const detailPreconditionInput = document.getElementById("detailPreconditionInput");
const detailInfo = document.getElementById("detailInfo");
const actionList = document.getElementById("actionList");
const addStepBtn = document.getElementById("addStepBtn");
const exportSelect = document.getElementById("exportSelect");
const deleteSessionBtn = document.getElementById("deleteSessionBtn");
const toast = document.getElementById("toast");
const langSelect = document.getElementById("langSelect");

let currentViewSessionId = null;
let refreshInterval = null;

// --- i18n ---

function applyLanguage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.tagName === "OPTION") {
      el.textContent = t(el.dataset.i18n);
    } else {
      el.textContent = t(el.dataset.i18n);
    }
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  langSelect.value = currentLang;
  exportSelect.value = "";
  loadSessions();
  if (currentViewSessionId) loadSessionDetail(currentViewSessionId);
}

langSelect.addEventListener("change", () => {
  currentLang = langSelect.value;
  chrome.storage.local.set({ lang: currentLang });
  chrome.runtime.sendMessage({ type: "SET_LANGUAGE", lang: currentLang });
  applyLanguage();
});

// --- Init ---
init();

function init() {
  chrome.storage.local.get("lang", (data) => {
    currentLang = data.lang || "tr";
    langSelect.value = currentLang;
    applyLanguage();
  });
  chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (resp) => {
    resp && resp.isRecording ? showRecordingState() : showIdleState();
  });
  loadSessions();
}

// --- Start / Stop ---

startBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_RECORDING" }, () => {
    showRecordingState();
    loadSessions();
  });
});

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
    showIdleState();
    loadSessions();
  });
});

function showRecordingState() {
  startBtn.style.display = "none";
  stopBtn.style.display = "inline-block";
  refreshInterval = setInterval(loadSessions, 2000);
}

function showIdleState() {
  startBtn.style.display = "inline-block";
  stopBtn.style.display = "none";
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

// --- Session List ---

function loadSessions() {
  chrome.runtime.sendMessage({ type: "GET_SESSIONS" }, (resp) => {
    const sessions = resp?.sessions || [];
    const currentSession = resp?.currentSession;

    if (sessions.length === 0) {
      sessionList.innerHTML = `<div class="empty-state">${esc(t("emptyState"))}</div>`;
      return;
    }

    const sorted = [...sessions].reverse();
    sessionList.innerHTML = sorted.map((s) => {
      const date = new Date(s.startedAt).toLocaleString();
      const isActive = s.id === currentSession;
      const stepCount = s.actions.length;
      const dur = s.stoppedAt
        ? formatDuration(new Date(s.stoppedAt) - new Date(s.startedAt))
        : formatDuration(Date.now() - new Date(s.startedAt).getTime());
      const badge = isActive
        ? `<span class="session-step-count session-recording">${esc(t("recording"))} (${stepCount})</span>`
        : `<span class="session-step-count">${stepCount} ${esc(t("steps"))}</span>`;

      return `
        <div class="session-item" data-id="${esc(s.id)}">
          <div class="session-item-left">
            <div class="session-name">${esc(s.name)}</div>
            <div class="session-meta">${esc(date)} &middot; ${esc(dur)}</div>
          </div>
          ${badge}
          <button class="session-delete-btn" data-delete-id="${esc(s.id)}" title="${esc(t("delete"))}">&times;</button>
        </div>
      `;
    }).join("");

    // Click to open detail (but not on delete button)
    sessionList.querySelectorAll(".session-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".session-delete-btn")) return;
        openSession(el.dataset.id);
      });
    });

    // Delete from list
    sessionList.querySelectorAll(".session-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        if (!confirm(t("deleteConfirm"))) return;
        chrome.runtime.sendMessage({ type: "DELETE_SESSION", sessionId: id }, () => loadSessions());
      });
    });
  });
}

// --- Session Detail ---

function openSession(sessionId) {
  currentViewSessionId = sessionId;
  sessionListView.style.display = "none";
  sessionDetailView.style.display = "block";
  loadSessionDetail(sessionId);
}

function closeSession() {
  currentViewSessionId = null;
  sessionDetailView.style.display = "none";
  sessionListView.style.display = "block";
  loadSessions();
}

backBtn.addEventListener("click", closeSession);

// Add step at the end
addStepBtn.addEventListener("click", () => {
  if (!currentViewSessionId) return;
  chrome.runtime.sendMessage({ type: "GET_SESSION", sessionId: currentViewSessionId }, (resp) => {
    const session = resp?.session;
    if (!session) return;
    const lastStep = session.actions.length > 0 ? session.actions[session.actions.length - 1].step : 0;
    showManualStepForm(currentViewSessionId, lastStep);
  });
});

// Rename session on title blur
detailTitleInput.addEventListener("blur", () => {
  if (!currentViewSessionId) return;
  const newName = detailTitleInput.value.trim();
  if (!newName) return;
  chrome.runtime.sendMessage({ type: "RENAME_SESSION", sessionId: currentViewSessionId, name: newName });
});
detailTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") detailTitleInput.blur();
});

// Update session description
detailDescInput.addEventListener("blur", () => {
  if (!currentViewSessionId) return;
  const newDesc = detailDescInput.value.trim();
  chrome.runtime.sendMessage({ type: "UPDATE_SESSION_DESC", sessionId: currentViewSessionId, description: newDesc });
});
detailDescInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) detailDescInput.blur();
});

// Update session precondition
detailPreconditionInput.addEventListener("blur", () => {
  if (!currentViewSessionId) return;
  const newPrecondition = detailPreconditionInput.value.trim();
  chrome.runtime.sendMessage({ type: "UPDATE_SESSION_PRECONDITION", sessionId: currentViewSessionId, precondition: newPrecondition });
});
detailPreconditionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) detailPreconditionInput.blur();
});

function loadSessionDetail(sessionId) {
  chrome.runtime.sendMessage({ type: "GET_SESSION", sessionId }, (resp) => {
    const session = resp?.session;
    if (!session) { closeSession(); return; }

    detailTitleInput.value = session.name;
    detailDescInput.value = session.description || "";
    detailPreconditionInput.value = session.precondition || "";

    const started = new Date(session.startedAt).toLocaleString();
    const stopped = session.stoppedAt ? new Date(session.stoppedAt).toLocaleString() : t("recording");
    const duration = session.stoppedAt
      ? formatDuration(new Date(session.stoppedAt) - new Date(session.startedAt))
      : formatDuration(Date.now() - new Date(session.startedAt).getTime());
    detailInfo.textContent = `${t("started")}: ${started}  |  ${t("stopped")}: ${stopped}  |  ${t("duration")}: ${duration}  |  ${session.actions.length} ${t("steps")}`;

    if (session.actions.length === 0) {
      actionList.innerHTML = `<div class="empty-state">${esc(t("noActions"))}</div>`;
      return;
    }

    // Debug: Log step numbers
    console.log("Rendering actions:", session.actions.map(a => ({ step: a.step, desc: a.description })));

    actionList.innerHTML = session.actions.map((action, index) => {
      const time = new Date(action.timestamp).toLocaleTimeString();
      const badgeClass = `badge-${action.action}`;
      const expectation = action.expectation || "";
      const expectationHtml = expectation
        ? `<div class="action-expectation" data-expectation-step="${action.step}"><span class="action-expectation-label">${esc(t("expectation"))}:</span>${esc(expectation)}</div>`
        : `<div class="action-expectation action-expectation-empty" data-expectation-step="${action.step}">${esc(t("addExpectation"))}</div>`;

      return `
        <div class="action-item" data-step="${action.step}">
          <div class="action-header">
            <span class="step-number">${action.step}</span>
            <span class="action-badge ${badgeClass}">${esc(action.action)}</span>
            <span class="action-time">${esc(time)}</span>
            <div class="step-actions">
              <button class="btn-icon-sm highlight-step" data-highlight-step="${action.step}" data-highlight-xpath="${escAttr(action.xpath)}" title="${esc(t("highlight"))}">&#128065;</button>
              <button class="btn-icon-sm edit-step" data-edit-step="${action.step}" title="${esc(t("edit"))}">&#9998;</button>
              <button class="btn-icon-sm delete-step" data-del-step="${action.step}" title="${esc(t("delete"))}">&times;</button>
            </div>
          </div>
          <div class="action-desc" data-desc-step="${action.step}">${esc(action.description)}</div>
          ${expectationHtml}
          <span class="action-xpath" data-xpath="${escAttr(action.xpath)}" data-xpath-step="${action.step}"><span class="xpath-label">${esc(t("xpathLabel"))}</span>${esc(action.xpath)}</span>
        </div>
        <div class="add-step-divider" data-after-step="${action.step}">
          <div class="add-step-divider-line"></div>
          <button class="add-step-divider-btn" data-insert-after="${action.step}">${esc(t("insertStep"))}</button>
          <div class="add-step-divider-line"></div>
        </div>
      `;
    }).join("");

    // XPath click to copy
    actionList.querySelectorAll(".action-xpath").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        navigator.clipboard.writeText(el.dataset.xpath).then(() => showToast(t("xpathCopied")));
      });
    });

    // Delete step
    actionList.querySelectorAll(".delete-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = parseInt(btn.dataset.delStep);
        chrome.runtime.sendMessage({ type: "DELETE_STEP", sessionId, stepNumber: step }, () => {
          loadSessionDetail(sessionId);
        });
      });
    });

    // Edit step
    actionList.querySelectorAll(".edit-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = parseInt(btn.dataset.editStep);
        startEditingStep(sessionId, step);
      });
    });

    // Insert step after
    actionList.querySelectorAll(".add-step-divider-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const afterStep = parseInt(btn.dataset.insertAfter);
        showManualStepForm(sessionId, afterStep);
      });
    });

    // Highlight element on page
    actionList.querySelectorAll(".highlight-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const xpath = btn.dataset.highlightXpath;
        highlightElementOnPage(xpath);
      });
    });

    // Edit expectation
    actionList.querySelectorAll(".action-expectation").forEach((el) => {
      el.addEventListener("click", () => {
        const step = parseInt(el.dataset.expectationStep);
        startEditingExpectation(sessionId, step);
      });
    });
  });
}

function highlightElementOnPage(xpath) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "HIGHLIGHT_ELEMENT", xpath }, (response) => {
        if (chrome.runtime.lastError) {
          showToast(t("elementNotFound"));
        } else if (response?.found) {
          showToast(t("elementHighlighted"));
        } else {
          showToast(t("elementNotFound"));
        }
      });
    }
  });
}

function startEditingExpectation(sessionId, stepNumber) {
  const expectEl = actionList.querySelector(`[data-expectation-step="${stepNumber}"]`);
  if (!expectEl) return;

  const currentExpect = expectEl.classList.contains("action-expectation-empty") ? "" : expectEl.textContent.replace(`${t("expectation")}:`, "").trim();

  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-edit-input";
  input.value = currentExpect;
  input.placeholder = t("addExpectation");
  input.style.marginLeft = "28px";
  expectEl.replaceWith(input);

  input.focus();
  input.select();

  function saveExpectation() {
    const newExpect = input.value.trim();
    chrome.runtime.sendMessage({
      type: "UPDATE_STEP",
      sessionId,
      stepNumber,
      field: "expectation",
      value: newExpect,
    }, () => {
      loadSessionDetail(sessionId);
    });
  }

  input.addEventListener("blur", () => saveExpectation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveExpectation();
    if (e.key === "Escape") loadSessionDetail(sessionId);
  });
}

function showManualStepForm(sessionId, afterStep) {
  // Remove any existing form
  const existingForm = actionList.querySelector(".manual-step-form");
  if (existingForm) existingForm.remove();

  const form = document.createElement("div");
  form.className = "manual-step-form";
  form.innerHTML = `
    <div class="manual-step-form-title">${esc(t("addStep"))} (${esc(t("step"))} ${afterStep + 1})</div>
    <div class="manual-step-form-row">
      <select class="manual-step-type">
        <option value="click">click</option>
        <option value="dblclick">dblclick</option>
        <option value="input">input</option>
        <option value="change">change</option>
        <option value="submit">submit</option>
        <option value="keydown">keydown</option>
        <option value="contextmenu">contextmenu</option>
        <option value="custom">custom</option>
      </select>
    </div>
    <div class="manual-step-form-row">
      <input type="text" class="manual-step-desc" placeholder="${esc(t("stepDescription"))}" />
    </div>
    <div class="manual-step-form-row">
      <input type="text" class="manual-step-xpath" placeholder="${esc(t("stepXpath"))}" />
    </div>
    <div class="manual-step-form-actions">
      <button class="btn-cancel">${esc(t("cancel"))}</button>
      <button class="btn-save">${esc(t("save"))}</button>
    </div>
  `;

  // Find where to insert
  if (afterStep === 0) {
    actionList.insertBefore(form, actionList.firstChild);
  } else {
    const divider = actionList.querySelector(`[data-after-step="${afterStep}"]`);
    if (divider) {
      divider.insertAdjacentElement("afterend", form);
    } else {
      actionList.appendChild(form);
    }
  }

  const typeSelect = form.querySelector(".manual-step-type");
  const descInput = form.querySelector(".manual-step-desc");
  const xpathInput = form.querySelector(".manual-step-xpath");
  const cancelBtn = form.querySelector(".btn-cancel");
  const saveBtn = form.querySelector(".btn-save");

  descInput.focus();

  cancelBtn.addEventListener("click", () => form.remove());

  saveBtn.addEventListener("click", () => {
    const actionType = typeSelect.value;
    const description = descInput.value.trim();
    const xpath = xpathInput.value.trim();

    if (!description) {
      descInput.focus();
      return;
    }

    chrome.runtime.sendMessage({
      type: "INSERT_STEP",
      sessionId,
      afterStep,
      step: {
        action: actionType,
        description,
        xpath: xpath || "//manual",
        timestamp: new Date().toISOString(),
        url: "manual",
        expectation: "", // Add empty expectation for manual steps
      },
    }, () => {
      form.remove();
      loadSessionDetail(sessionId);
    });
  });
}

function startEditingStep(sessionId, stepNumber) {
  const descEl = actionList.querySelector(`[data-desc-step="${stepNumber}"]`);
  const xpathEl = actionList.querySelector(`[data-xpath-step="${stepNumber}"]`);
  if (!descEl || !xpathEl) return;

  const currentDesc = descEl.textContent.trim();
  const currentXpath = xpathEl.dataset.xpath;

  // Replace desc with input
  const descInput = document.createElement("input");
  descInput.type = "text";
  descInput.className = "inline-edit-input";
  descInput.value = currentDesc;
  descEl.replaceWith(descInput);

  // Replace xpath with input
  const xpathInput = document.createElement("input");
  xpathInput.type = "text";
  xpathInput.className = "inline-edit-input inline-edit-xpath";
  xpathInput.value = currentXpath;
  xpathEl.replaceWith(xpathInput);

  descInput.focus();
  descInput.select();

  function saveEdits() {
    const newDesc = descInput.value.trim() || currentDesc;
    const newXpath = xpathInput.value.trim() || currentXpath;

    let pending = 2;
    function done() {
      pending--;
      if (pending === 0) loadSessionDetail(sessionId);
    }

    if (newDesc !== currentDesc) {
      chrome.runtime.sendMessage({ type: "UPDATE_STEP", sessionId, stepNumber, field: "description", value: newDesc }, done);
    } else { done(); }

    if (newXpath !== currentXpath) {
      chrome.runtime.sendMessage({ type: "UPDATE_STEP", sessionId, stepNumber, field: "xpath", value: newXpath }, done);
    } else { done(); }
  }

  let saved = false;
  function handleBlur() {
    // Save when both inputs lose focus (small delay to check if other input got focus)
    setTimeout(() => {
      if (document.activeElement === descInput || document.activeElement === xpathInput) return;
      if (!saved) { saved = true; saveEdits(); }
    }, 100);
  }

  descInput.addEventListener("blur", handleBlur);
  xpathInput.addEventListener("blur", handleBlur);
  descInput.addEventListener("keydown", (e) => { if (e.key === "Enter") xpathInput.focus(); if (e.key === "Escape") { saved = true; loadSessionDetail(sessionId); } });
  xpathInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { if (e.key === "Escape") { saved = true; loadSessionDetail(sessionId); } else { xpathInput.blur(); descInput.blur(); } } });
}

// --- Export Dropdown Handler ---

exportSelect.addEventListener("change", () => {
  const format = exportSelect.value;
  if (!format) return;

  switch (format) {
    case "json":
      exportJson();
      break;
    case "text":
      exportText();
      break;
    case "browserstack":
      exportBrowserStack();
      break;
  }

  // Reset dropdown
  exportSelect.value = "";
});

// --- Export JSON (with XPath) ---

function exportJson() {
  if (!currentViewSessionId) return;
  chrome.runtime.sendMessage({ type: "GET_SESSION", sessionId: currentViewSessionId }, (resp) => {
    const session = resp?.session;
    if (!session || session.actions.length === 0) return;

    const exportData = {
      name: session.name,
      description: session.description || "",
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      totalSteps: session.actions.length,
      actions: session.actions.map((a) => ({
        step: a.step,
        description: a.description,
        expectation: a.expectation || "",
        xpath: a.xpath,
        action: a.action,
        url: a.url,
        timestamp: a.timestamp,
        ...(a.value !== undefined ? { value: a.value } : {}),
        ...(a.key ? { key: a.key } : {}),
        ...(a.selectedText ? { selectedText: a.selectedText } : {}),
      })),
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      `${safeName(session.name)}_full_${today()}.json`,
      "application/json"
    );
    showToast(t("jsonExported"));
  });
}

// --- Export Text (steps only, no XPath) ---

function exportText() {
  if (!currentViewSessionId) return;
  chrome.runtime.sendMessage({ type: "GET_SESSION", sessionId: currentViewSessionId }, (resp) => {
    const session = resp?.session;
    if (!session || session.actions.length === 0) return;

    let text = `${t("testSteps")}: ${session.name}\n`;
    if (session.description) {
      text += `${t("testCaseDescription")}: ${session.description}\n`;
    }
    text += `${t("date")}: ${new Date(session.startedAt).toLocaleString()}\n`;
    text += `${"=".repeat(50)}\n\n`;

    session.actions.forEach((a) => {
      text += `${t("step")} ${a.step}: ${a.description}\n`;
      if (a.expectation) {
        text += `  ${t("expectation")}: ${a.expectation}\n`;
      }
    });

    text += `\n${"=".repeat(50)}\n`;
    text += `${t("totalSteps")}: ${session.actions.length}\n`;

    downloadFile(
      text,
      `${safeName(session.name)}_steps_${today()}.txt`,
      "text/plain"
    );
    showToast(t("textExported"));
  });
}

// --- Export BrowserStack CSV Format ---

function exportBrowserStack() {
  if (!currentViewSessionId) return;
  chrome.runtime.sendMessage({ type: "GET_SESSION", sessionId: currentViewSessionId }, (resp) => {
    const session = resp?.session;
    if (!session || session.actions.length === 0) return;

    // CSV Header
    const headers = [
      "Test Case ID",
      "Title",
      "Description",
      "Preconditions",
      "Folder",
      "State",
      "Tags",
      "Steps",
      "Results",
      "Type of Test Case",
      "Priority",
      "Estimate",
      "Duration",
      "Owner",
      "Jira Issues",
      "Automation Status"
    ];

    // Create one row per action (step)
    const rows = session.actions.map((action, idx) => {
      const stepDescription = action.description;
      const expectedResult = action.expectation || `Step ${idx + 1} executed successfully`;

      return [
        "", // Test Case ID (empty - BrowserStack will auto-generate)
        escapeCSV(session.name), // Title (record name)
        escapeCSV(session.description || ""), // Description (record description)
        escapeCSV(session.precondition || ""), // Preconditions
        "Automation", // Folder
        session.stoppedAt ? "Active" : "Draft", // State
        "automation", // Tags
        escapeCSV(stepDescription), // Steps (this action's description)
        escapeCSV(expectedResult), // Results (this action's expectation)
        "Automated", // Type of Test Case
        "Medium", // Priority
        "1m", // Estimate
        "1m", // Duration
        "Test User", // Owner
        "", // Jira Issues
        "Automated" // Automation Status
      ].join(",");
    });

    // Build CSV content
    let csvContent = headers.join(",") + "\n";
    csvContent += rows.join("\n") + "\n";

    downloadFile(
      csvContent,
      `${safeName(session.name)}_browserstack_${today()}.csv`,
      "text/csv"
    );
    showToast("BrowserStack CSV exported!");
  });
}

function escapeCSV(str) {
  if (!str) return '""';
  str = str.toString();
  // If string contains comma, newline, or quotes, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function getElementTypeFromAction(action) {
  const typeMap = {
    click: "button",
    dblclick: "element",
    input: "input",
    change: "select",
    submit: "form",
    keydown: "input",
    contextmenu: "element",
  };
  return typeMap[action] || "element";
}

// --- Delete session from detail ---

deleteSessionBtn.addEventListener("click", () => {
  if (!currentViewSessionId) return;
  if (!confirm(t("deleteConfirm"))) return;
  chrome.runtime.sendMessage({ type: "DELETE_SESSION", sessionId: currentViewSessionId }, () => closeSession());
});

// --- Helpers ---

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escAttr(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(text) {
  toast.textContent = text || t("copied");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(name) {
  return (name || "record").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}
