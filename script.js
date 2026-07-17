(function () {
  const STORAGE_KEY = "eagleNestState:v1";
  const STORAGE_VERSION = 2;
  const LIVE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
  const DRAG_ID_TYPE = "text/plain";
  const DEFAULT_STATE = {
    version: STORAGE_VERSION,
    streams: [],
    gridSize: 2,
    allMuted: false,
    panelCollapsed: false,
    autoSync: true
  };
  let autoSyncTimer = null;
  let draggedStreamId = null;
  let dragFrame = null;

  const state = loadState();
  const appShell = document.querySelector("#appShell");
  const controlPanel = document.querySelector("#controlPanel");
  const controlDetails = document.querySelector("#controlDetails");
  const panelBody = document.querySelector("#panelBody");
  const watchSummary = document.querySelector("#watchSummary");
  const streamForm = document.querySelector("#streamForm");
  const titleInput = document.querySelector("#streamTitle");
  const urlInput = document.querySelector("#streamUrl");
  const formHint = document.querySelector("#formHint");
  const grid = document.querySelector("#streamGrid");
  const emptyState = document.querySelector("#emptyState");
  const template = document.querySelector("#streamCardTemplate");
  const gridButtons = document.querySelectorAll("[data-grid]");
  const syncLiveBtn = document.querySelector("#syncLiveBtn");
  const autoSyncBtn = document.querySelector("#autoSyncBtn");
  const muteAllBtn = document.querySelector("#muteAllBtn");
  const clearAllBtn = document.querySelector("#clearAllBtn");
  const importBtn = document.querySelector("#importBtn");
  const bulkInput = document.querySelector("#bulkInput");
  const panelStreamList = document.querySelector("#panelStreamList");
  const streamCountBadge = document.querySelector("#streamCountBadge");
  const toast = document.querySelector("#toast");
  const focusOverlay = document.querySelector("#focusOverlay");
  const focusTitle = document.querySelector("#focusTitle");
  const focusPlayer = document.querySelector("#focusPlayer");
  const closeFocusBtn = document.querySelector("#closeFocusBtn");
  let toastTimer = null;

  streamForm.addEventListener("submit", handleAddStream);
  controlDetails.addEventListener("toggle", handlePanelToggle);
  importBtn.addEventListener("click", handleBulkImport);
  syncLiveBtn.addEventListener("click", function () {
    syncAllStreams(true, true);
  });
  autoSyncBtn.addEventListener("click", toggleAutoSync);
  muteAllBtn.addEventListener("click", toggleMuteAll);
  clearAllBtn.addEventListener("click", clearStreams);
  grid.addEventListener("dragover", handleGridDragOver);
  grid.addEventListener("drop", handleGridDrop);
  closeFocusBtn.addEventListener("click", closeFocus);
  focusOverlay.addEventListener("click", function (event) {
    if (event.target === focusOverlay) closeFocus();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !focusOverlay.hidden) closeFocus();
  });

  gridButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      state.gridSize = Number(button.dataset.grid);
      saveState();
      render();
    });
  });

  render();
  scheduleAutoSync();

  function handleAddStream(event) {
    event.preventDefault();
    addStream(titleInput.value, urlInput.value);
    titleInput.value = "";
    urlInput.value = "";
    titleInput.focus();
  }

  function handlePanelToggle() {
    state.panelCollapsed = !controlDetails.open;
    saveState();
    updateControls();
  }

  function handleBulkImport() {
    const lines = bulkInput.value
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    let imported = 0;
    let rejected = 0;

    lines.forEach(function (line) {
      const parsed = parseBulkLine(line);
      if (addStream(parsed.title, parsed.url, true)) {
        imported += 1;
      } else {
        rejected += 1;
      }
    });

    saveState();
    render();
    bulkInput.value = "";
    setHint(
      rejected
        ? "已匯入 " + imported + " 筆，略過 " + rejected + " 筆無法辨識的網址。"
        : "已匯入 " + imported + " 筆直播。",
      rejected > 0
    );

    if (imported > 0 && state.streams.length >= 9) {
      showToast("目前已加入 " + state.streams.length + " 路直播，長時間監看可能受裝置效能影響。");
    }
  }

  function parseBulkLine(line) {
    const separator = line.includes("|") ? "|" : ",";
    if (!line.includes(separator)) {
      return { title: "", url: line };
    }

    const parts = line.split(separator);
    const possibleUrl = parts.pop().trim();
    return {
      title: parts.join(separator).trim(),
      url: possibleUrl
    };
  }

  function addStream(title, url, skipRender) {
    const normalizedUrl = url.trim();
    const videoId = extractYouTubeVideoId(normalizedUrl);

    if (!videoId) {
      setHint("請輸入可辨識的 YouTube 影片或直播網址。", true);
      return false;
    }

    const stream = {
      id: createId(),
      title: title.trim() || "YouTube Live " + (state.streams.length + 1),
      defaultTitle: "YouTube Live " + (state.streams.length + 1),
      url: normalizedUrl,
      videoId: videoId,
      status: ""
    };

    state.streams.push(stream);

    if (!skipRender) {
      saveState();
      render();
      setHint("已新增「" + stream.title + "」。", false);
      if (state.streams.length >= 9) {
        showToast("目前已加入 " + state.streams.length + " 路直播，長時間監看可能受裝置效能影響。");
      }
    }

    return true;
  }

  function render() {
    grid.className = "stream-grid grid-" + state.gridSize;
    emptyState.hidden = state.streams.length > 0;
    grid.innerHTML = "";
    updateControls();

    state.streams.forEach(function (stream) {
      const card = template.content.firstElementChild.cloneNode(true);
      const dragHandle = card.querySelector(".drag-handle");
      const titleField = card.querySelector(".card-title-input");
      const titleDisplay = card.querySelector(".card-title-display");
      const playerFrame = card.querySelector(".player-frame");
      const statusText = card.querySelector(".card-status");
      const urlField = card.querySelector(".card-url-input");
      const updateUrlBtn = card.querySelector(".update-url-btn");
      const editBtn = card.querySelector(".edit-btn");
      const expandBtn = card.querySelector(".expand-btn");
      const removeBtn = card.querySelector(".remove-btn");

      card.dataset.streamId = stream.id;
      titleField.value = stream.title;
      titleDisplay.textContent = stream.title;
      urlField.value = stream.url;
      updateCardStatus(statusText, stream.status || "", "neutral");
      playerFrame.appendChild(createIframe(stream, { autoplay: false }));

      titleField.addEventListener("input", function () {
        const nextTitle = titleField.value.trim();
        stream.title = nextTitle || stream.defaultTitle || "未命名直播";
        titleDisplay.textContent = stream.title;
        saveState();
        renderPanelStreamList();
      });

      titleField.addEventListener("blur", function () {
        if (titleField.value.trim()) return;

        titleField.value = stream.defaultTitle || "未命名直播";
        stream.title = titleField.value;
        titleDisplay.textContent = stream.title;
        saveState();
        renderPanelStreamList();
      });

      urlField.addEventListener("input", function () {
        urlField.classList.remove("is-error");
      });

      urlField.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          updateStreamUrl(stream, urlField, playerFrame, statusText);
          urlField.blur();
        }
      });

      updateUrlBtn.addEventListener("click", function () {
        updateStreamUrl(stream, urlField, playerFrame, statusText);
      });

      editBtn.addEventListener("click", function () {
        toggleCardEditing(card, editBtn, titleField);
      });

      expandBtn.addEventListener("click", function () {
        openFocus(stream);
      });

      dragHandle.addEventListener("dragstart", function (event) {
        handleDragStart(event, stream.id, card);
      });

      card.addEventListener("dragend", finishDragSort);

      removeBtn.addEventListener("click", function () {
        state.streams = state.streams.filter(function (item) {
          return item.id !== stream.id;
        });
        saveState();
        render();
      });

      grid.appendChild(card);
    });

    renderPanelStreamList();

    if (state.allMuted) {
      setTimeout(function () {
        sendCommandToAll("mute");
      }, 600);
    }

    scheduleAutoSync();
  }

  function openFocus(stream) {
    focusTitle.textContent = stream.title;
    focusPlayer.innerHTML = "";
    focusPlayer.appendChild(createIframe(stream, { autoplay: true }));
    focusOverlay.hidden = false;
    document.body.style.overflow = "hidden";

    if (state.allMuted) {
      setTimeout(function () {
        sendCommand(focusPlayer.querySelector("iframe"), "mute");
      }, 600);
    }
  }

  function handleDragStart(event, streamId, card) {
    draggedStreamId = streamId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_ID_TYPE, streamId);
    card.classList.add("is-dragging");
  }

  function toggleCardEditing(card, editBtn, titleField, forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !card.classList.contains("is-editing");
    const editPanel = card.querySelector(".card-edit-panel");
    card.classList.toggle("is-editing", shouldOpen);
    if (editPanel) editPanel.hidden = !shouldOpen;
    editBtn.setAttribute("aria-expanded", String(shouldOpen));
    editBtn.textContent = shouldOpen ? "完成" : "編輯";

    if (shouldOpen) {
      setTimeout(function () {
        titleField.focus();
        titleField.select();
      }, 0);
    }
  }

  function handleGridDragOver(event) {
    if (!draggedStreamId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragFrame) return;

    const clientX = event.clientX;
    const clientY = event.clientY;
    dragFrame = requestAnimationFrame(function () {
      dragFrame = null;
      updateDragPosition(clientX, clientY);
    });
  }

  function updateDragPosition(clientX, clientY) {
    const draggedCard = getDraggedCard();
    const targetCard = getNearestCard(clientX, clientY);
    if (!draggedCard) return;

    clearDropTargets();

    if (!targetCard) {
      grid.appendChild(draggedCard);
      return;
    }

    const insertAfter = shouldInsertAfter(clientX, clientY, targetCard);
    targetCard.classList.add("is-drop-target");
    targetCard.classList.add(insertAfter ? "insert-after" : "insert-before");
    grid.insertBefore(draggedCard, insertAfter ? targetCard.nextElementSibling : targetCard);
  }

  function shouldInsertAfter(clientX, clientY, card) {
    const rect = card.getBoundingClientRect();
    const lowerHalf = clientY > rect.top + rect.height / 2;
    const rightHalf = clientX > rect.left + rect.width / 2;
    return lowerHalf || rightHalf;
  }

  function getNearestCard(clientX, clientY) {
    const cards = Array.from(grid.querySelectorAll(".stream-card:not(.is-dragging)"));
    if (!cards.length) return null;

    return cards.reduce(function (closest, card) {
      const rect = card.getBoundingClientRect();
      const offsetX = clientX - (rect.left + rect.width / 2);
      const offsetY = clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(offsetX, offsetY);

      if (!closest || distance < closest.distance) {
        return { card: card, distance: distance };
      }

      return closest;
    }, null).card;
  }

  function handleGridDrop(event) {
    if (!draggedStreamId) return;
    event.preventDefault();
    finishDragSort();
  }

  function finishDragSort() {
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = null;
    }
    persistStreamOrderFromDom();
    draggedStreamId = null;
    clearDragState();
  }

  function persistStreamOrderFromDom() {
    const order = Array.from(grid.querySelectorAll(".stream-card"))
      .map(function (card) {
        return card.dataset.streamId;
      })
      .filter(Boolean);

    if (!order.length) return;

    const streamsById = new Map(
      state.streams.map(function (stream) {
        return [stream.id, stream];
      })
    );
    state.streams = order
      .map(function (streamId) {
        return streamsById.get(streamId);
      })
      .filter(Boolean);
    saveState();
    renderPanelStreamList();
    updateControls();
  }

  function clearDragState() {
    clearDropTargets();
    grid.querySelectorAll(".is-dragging, .is-drop-target, .insert-before, .insert-after").forEach(function (card) {
      card.classList.remove("is-dragging", "is-drop-target", "insert-before", "insert-after");
    });
  }

  function clearDropTargets() {
    grid.querySelectorAll(".is-drop-target, .insert-before, .insert-after").forEach(function (card) {
      card.classList.remove("is-drop-target", "insert-before", "insert-after");
    });
  }

  function getDraggedCard() {
    return grid.querySelector(".stream-card.is-dragging");
  }

  function closeFocus() {
    focusOverlay.hidden = true;
    focusPlayer.innerHTML = "";
    document.body.style.overflow = "";
  }

  function clearStreams() {
    state.streams = [];
    closeFocus();
    saveState();
    render();
    scheduleAutoSync();
    setHint("清單已清空。", false);
    showToast("清單已清空");
  }

  function toggleMuteAll() {
    state.allMuted = !state.allMuted;
    saveState();
    updateControls();
    setTimeout(function () {
      sendCommandToAll(state.allMuted ? "mute" : "unMute");
    }, 200);
  }

  function toggleAutoSync() {
    state.autoSync = !state.autoSync;
    saveState();
    updateControls();
    scheduleAutoSync();
    setHint(state.autoSync ? "自動同步已開啟，每 5 分鐘校正一次。" : "自動同步已關閉。", false);
    showToast(state.autoSync ? "自動同步已開啟" : "自動同步已關閉");
  }

  function scheduleAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }

    if (!state.autoSync || !state.streams.length) return;

    autoSyncTimer = setInterval(function () {
      syncAllStreams(false, false);
    }, LIVE_SYNC_INTERVAL_MS);
  }

  function syncAllStreams(showMessage, hardReload) {
    const iframes = document.querySelectorAll("iframe[src*='youtube.com/embed']");

    if (!iframes.length) {
      if (showMessage) setHint("目前沒有可同步的直播。", false);
      return;
    }

    iframes.forEach(function (iframe) {
      syncIframeToLiveEdge(iframe, hardReload);
    });

    updateAllCardStatuses(
      hardReload ? "正在強制同步到最新..." : "自動 " + formatTime(new Date()),
      hardReload ? "working" : "neutral"
    );

    if (hardReload) {
      setTimeout(function () {
        updateAllCardStatuses("同步 " + formatTime(new Date()), "neutral");
      }, 1200);
    }

    if (showMessage) {
      const message = "已同步 " + iframes.length + " 路直播";
      setHint("已嘗試將所有播放器同步到直播最新位置。", false);
      showToast(message);
    }
  }

  function syncIframeToLiveEdge(iframe, hardReload) {
    sendCommand(iframe, "seekTo", [999999999, true]);
    setTimeout(function () {
      sendCommand(iframe, "playVideo");
      if (state.allMuted) sendCommand(iframe, "mute");
    }, 150);

    if (hardReload) {
      setTimeout(function () {
        reloadIframeAtLiveEdge(iframe);
      }, 350);
    }
  }

  function reloadIframeAtLiveEdge(iframe) {
    if (!iframe || !iframe.src) return;

    const url = new URL(iframe.src);
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("live_sync", String(Date.now()));

    if (state.allMuted) {
      url.searchParams.set("mute", "1");
    } else {
      url.searchParams.delete("mute");
    }

    iframe.src = url.toString();
  }

  function createIframe(stream, options) {
    const iframeOptions = options || {};
    const iframe = document.createElement("iframe");
    const params = new URLSearchParams({
      enablejsapi: "1",
      playsinline: "1",
      rel: "0",
      modestbranding: "1"
    });

    if (location.origin && location.origin !== "null") params.set("origin", location.origin);
    if (iframeOptions.autoplay) params.set("autoplay", "1");
    if (state.allMuted) params.set("mute", "1");

    iframe.src = "https://www.youtube.com/embed/" + stream.videoId + "?" + params.toString();
    iframe.title = stream.title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    return iframe;
  }

  function sendCommandToAll(command) {
    document.querySelectorAll("iframe[src*='youtube.com/embed']").forEach(function (iframe) {
      sendCommand(iframe, command);
    });
  }

  function sendCommand(iframe, command, args) {
    if (!iframe || !iframe.contentWindow) return;

    iframe.contentWindow.postMessage(
      JSON.stringify({
        event: "command",
        func: command,
        args: args || []
      }),
      "https://www.youtube.com"
    );
  }

  function extractYouTubeVideoId(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        return sanitizeVideoId(url.pathname.split("/").filter(Boolean)[0]);
      }

      if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) {
        return null;
      }

      if (url.searchParams.has("v")) {
        return sanitizeVideoId(url.searchParams.get("v"));
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const knownPrefixes = ["embed", "live", "shorts"];
      const prefix = parts[0];

      if (knownPrefixes.includes(prefix) && parts[1]) {
        return sanitizeVideoId(parts[1]);
      }

      return null;
    } catch (error) {
      return sanitizeVideoId(rawUrl);
    }
  }

  function sanitizeVideoId(value) {
    if (!value) return null;
    const match = String(value).match(/^[a-zA-Z0-9_-]{6,}$/);
    return match ? match[0] : null;
  }

  function setHint(message, isError) {
    formHint.textContent = message;
    formHint.classList.toggle("is-error", Boolean(isError));
  }

  function updateStreamUrl(stream, urlField, playerFrame, statusText) {
    const nextUrl = urlField.value.trim();
    const nextVideoId = extractYouTubeVideoId(nextUrl);

    if (!nextVideoId) {
      urlField.classList.add("is-error");
      updateCardStatus(statusText, "網址無法辨識，播放器未更新", "error");
      setHint("這個 YouTube 網址無法辨識，播放器尚未更新。", true);
      return;
    }

    urlField.classList.remove("is-error");
    updateCardStatus(statusText, "正在更新播放器...", "working");
    stream.url = nextUrl;
    stream.videoId = nextVideoId;
    maybeRefreshDefaultTitle(stream);
    saveState();

    playerFrame.innerHTML = "";
    playerFrame.appendChild(createIframe(stream, { autoplay: true }));

    if (state.allMuted) {
      setTimeout(function () {
        sendCommand(playerFrame.querySelector("iframe"), "mute");
      }, 600);
    }

    stream.status = "網址已更新 " + formatTime(new Date());
    updateCardStatus(statusText, stream.status, "neutral");
    setHint("已更新「" + stream.title + "」的直播網址。", false);
    renderPanelStreamList();
    showToast("已更新直播網址");
  }

  function updateCardStatus(statusText, message, tone) {
    if (!statusText) return;
    statusText.textContent = message;
    statusText.hidden = !message;
    statusText.classList.toggle("is-error", tone === "error");
    statusText.classList.toggle("is-working", tone === "working");
  }

  function updateAllCardStatuses(message, tone) {
    grid.querySelectorAll(".stream-card").forEach(function (card) {
      const stream = findStream(card.dataset.streamId);
      if (stream) stream.status = message;
      updateCardStatus(card.querySelector(".card-status"), message, tone);
    });
    saveState();
  }

  function findStream(streamId) {
    return state.streams.find(function (stream) {
      return stream.id === streamId;
    });
  }

  function formatTime(date) {
    return date.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function maybeRefreshDefaultTitle(stream) {
    if (!stream.defaultTitle || stream.title !== stream.defaultTitle) return;

    stream.defaultTitle = "YouTube Live " + (state.streams.indexOf(stream) + 1);
    stream.title = stream.defaultTitle;
  }

  function updateControls() {
    gridButtons.forEach(function (button) {
      const isActive = Number(button.dataset.grid) === state.gridSize;
      button.classList.toggle("is-active", isActive);
    });

    muteAllBtn.setAttribute("aria-pressed", String(state.allMuted));
    muteAllBtn.querySelector("span:last-child").textContent = state.allMuted ? "取消靜音" : "靜音全部";
    autoSyncBtn.setAttribute("aria-pressed", String(state.autoSync));
    autoSyncBtn.textContent = state.autoSync ? "自動同步：開" : "自動同步：關";
    watchSummary.textContent =
      state.streams.length +
      " 路直播 · " +
      state.gridSize +
      "x" +
      state.gridSize +
      " · 自動同步" +
      (state.autoSync ? "開啟" : "關閉");
    streamCountBadge.textContent = String(state.streams.length);

    appShell.classList.toggle("is-panel-collapsed", state.panelCollapsed);
    controlPanel.classList.toggle("is-collapsed", state.panelCollapsed);
    if (controlDetails.open === state.panelCollapsed) {
      controlDetails.open = !state.panelCollapsed;
    }
    panelBody.setAttribute("aria-hidden", String(state.panelCollapsed));
    controlDetails.querySelector(".collapse-text").textContent = state.panelCollapsed ? "展開" : "收合";
  }

  function renderPanelStreamList() {
    panelStreamList.innerHTML = "";

    if (!state.streams.length) {
      const empty = document.createElement("p");
      empty.className = "stream-list-empty";
      empty.textContent = "尚未加入直播。";
      panelStreamList.appendChild(empty);
      return;
    }

    state.streams.forEach(function (stream) {
      const item = document.createElement("div");
      const text = document.createElement("div");
      const title = document.createElement("strong");
      const url = document.createElement("span");
      const edit = document.createElement("button");

      item.className = "panel-stream-item";
      title.textContent = stream.title;
      url.textContent = stream.url;
      edit.className = "small-button";
      edit.type = "button";
      edit.textContent = "編輯";
      edit.addEventListener("click", function () {
        openCardEditor(stream.id);
      });

      text.appendChild(title);
      text.appendChild(url);
      item.appendChild(text);
      item.appendChild(edit);
      panelStreamList.appendChild(item);
    });
  }

  function openCardEditor(streamId) {
    const card = grid.querySelector("[data-stream-id='" + streamId + "']");
    if (!card) return;

    const editBtn = card.querySelector(".edit-btn");
    const titleField = card.querySelector(".card-title-input");
    toggleCardEditing(card, editBtn, titleField, true);
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showToast(message) {
    if (!toast) return;

    toast.textContent = message;
    toast.hidden = false;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.hidden = true;
      toastTimer = null;
    }, 2600);
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return String(Date.now() + Math.random());
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.streams)) return { ...DEFAULT_STATE };

      return {
        version: STORAGE_VERSION,
        streams: saved.streams
          .map(function (stream, index) {
            const videoId = stream.videoId || extractYouTubeVideoId(stream.url || "");
            const fallbackTitle = stream.title || "未命名直播";
            const fallbackDefaultTitle = /^YouTube Live \d+$/.test(fallbackTitle)
              ? fallbackTitle
              : "YouTube Live " + (index + 1);
            return videoId
              ? {
                  id: stream.id || createId(),
                  title: fallbackTitle,
                  defaultTitle: stream.defaultTitle || fallbackDefaultTitle,
                  url: stream.url,
                  videoId: videoId,
                  status: stream.status || ""
                }
              : null;
          })
          .filter(Boolean),
        gridSize: saved.gridSize === 3 ? 3 : 2,
        allMuted: Boolean(saved.allMuted),
        panelCollapsed: Boolean(saved.panelCollapsed),
        autoSync: saved.autoSync !== false
      };
    } catch (error) {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    state.version = STORAGE_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
})();
