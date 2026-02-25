chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sessions: [], currentSession: null, isRecording: false });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case "START_RECORDING": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = {
          id: Date.now().toString(),
          name: message.name || `Record ${sessions.length + 1}`,
          description: "",
          precondition: "",
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          actions: [],
        };
        sessions.push(session);
        chrome.storage.local.set({ sessions, currentSession: session.id, isRecording: true }, () => {
          broadcastToTabs({ type: "SET_RECORDING", isRecording: true, resetSteps: true });
          sendResponse({ session });
        });
      });
      return true;
    }

    case "STOP_RECORDING": {
      chrome.storage.local.get(["sessions", "currentSession"], (data) => {
        const sessions = data.sessions || [];
        const idx = sessions.findIndex((s) => s.id === data.currentSession);
        if (idx !== -1) sessions[idx].stoppedAt = new Date().toISOString();
        chrome.storage.local.set({ sessions, currentSession: null, isRecording: false }, () => {
          broadcastToTabs({ type: "SET_RECORDING", isRecording: false });
          sendResponse({ success: true });
        });
      });
      return true;
    }

    case "RECORD_ACTION": {
      chrome.storage.local.get(["sessions", "currentSession", "isRecording"], (data) => {
        if (!data.isRecording || !data.currentSession) return;
        const sessions = data.sessions || [];
        const idx = sessions.findIndex((s) => s.id === data.currentSession);
        if (idx === -1) return;
        sessions[idx].actions.push(message.data);
        chrome.storage.local.set({ sessions });
      });
      return false;
    }

    case "GET_SESSIONS": {
      chrome.storage.local.get(["sessions", "currentSession", "isRecording"], (data) => {
        sendResponse({
          sessions: data.sessions || [],
          currentSession: data.currentSession || null,
          isRecording: data.isRecording === true,
        });
      });
      return true;
    }

    case "GET_SESSION": {
      chrome.storage.local.get("sessions", (data) => {
        const session = (data.sessions || []).find((s) => s.id === message.sessionId);
        sendResponse({ session: session || null });
      });
      return true;
    }

    case "DELETE_SESSION": {
      chrome.storage.local.get(["sessions", "currentSession"], (data) => {
        let sessions = data.sessions || [];
        sessions = sessions.filter((s) => s.id !== message.sessionId);
        const updates = { sessions };
        if (data.currentSession === message.sessionId) {
          updates.currentSession = null;
          updates.isRecording = false;
          broadcastToTabs({ type: "SET_RECORDING", isRecording: false });
        }
        chrome.storage.local.set(updates, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "RENAME_SESSION": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) session.name = message.name;
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "UPDATE_SESSION_DESC": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) session.description = message.description;
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "UPDATE_SESSION_PRECONDITION": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) session.precondition = message.precondition;
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "UPDATE_STEP": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) {
          const stepIdx = session.actions.findIndex((a) => a.step === message.stepNumber);
          if (stepIdx !== -1) {
            if (message.field === "description") session.actions[stepIdx].description = message.value;
            if (message.field === "xpath") session.actions[stepIdx].xpath = message.value;
            if (message.field === "expectation") session.actions[stepIdx].expectation = message.value;
          }
        }
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "DELETE_STEP": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) {
          session.actions = session.actions.filter((a) => a.step !== message.stepNumber);
          // Renumber steps
          session.actions.forEach((a, i) => { a.step = i + 1; });
        }
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "INSERT_STEP": {
      chrome.storage.local.get("sessions", (data) => {
        const sessions = data.sessions || [];
        const session = sessions.find((s) => s.id === message.sessionId);
        if (session) {
          const afterStep = message.afterStep;
          const newStep = {
            ...message.step,
            // Don't set step here, will be set during renumbering
          };
          // Insert after the specified step
          session.actions.splice(afterStep, 0, newStep);
          // Renumber all steps sequentially
          session.actions.forEach((a, i) => { a.step = i + 1; });
        }
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "GET_RECORDING_STATE": {
      chrome.storage.local.get(["isRecording", "currentSession"], (data) => {
        sendResponse({ isRecording: data.isRecording === true, currentSession: data.currentSession || null });
      });
      return true;
    }

    case "SET_LANGUAGE": {
      chrome.storage.local.set({ lang: message.lang });
      broadcastToTabs({ type: "SET_LANGUAGE", lang: message.lang });
      return false;
    }
  }
});

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  });
}
