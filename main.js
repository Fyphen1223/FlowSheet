// FlowSheet main.js
// 必要に応じて将来的に機能追加可能
// 例: 入力内容の保存や矢印描画など

// ここでは最低限の初期化のみ

document.addEventListener("DOMContentLoaded", () => {
  // localStorage keys
  const STORAGE_KEY = "flowsheet-autosave-v1";
  const SETTINGS_KEY = "flowsheet-settings-v1";
  // 共通: flow-blockテンプレ生成
  function createDragButton() {
    const btn = document.createElement("button");
    btn.className = "drag-connect-btn";
    btn.title = "他ブロックと接続";
    btn.setAttribute("draggable", "true");
    btn.setAttribute("tabindex", "-1");
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <circle cx="5" cy="5" r="2" fill="#888"/>
        <circle cx="13" cy="5" r="2" fill="#888"/>
        <circle cx="5" cy="13" r="2" fill="#888"/>
        <circle cx="13" cy="13" r="2" fill="#888"/>
      </svg>`;
    return btn;
  }
  function createFlowBlock(contentHtml = "") {
    const b = document.createElement("div");
    b.className = "flow-block";
    // 永続ID（接続識別用）
    if (!b.dataset.blockId)
      b.dataset.blockId = `b_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    const text = document.createElement("div");
    text.className = "flow-block-text";
    text.contentEditable = "true";
    text.innerHTML = contentHtml;
    const btn = createDragButton();
    btn.addEventListener("mousedown", onConnectHandleDown);
    b.appendChild(text);
    b.appendChild(btn);
    // 既存の設定を適用
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") {
        if (s.fontSize === "xlarge") text.style.fontSize = "18px";
        else if (s.fontSize === "large") text.style.fontSize = "16px";
        else text.style.fontSize = "";
        if (s.lineHeight === "loose") text.style.lineHeight = "1.8";
        else if (s.lineHeight === "relaxed") text.style.lineHeight = "1.6";
        else text.style.lineHeight = "";
      }
    } catch {}
    return b;
  }
  function upgradeExistingBlocks() {
    document.querySelectorAll(".flow-block").forEach((b) => {
      if (!b.querySelector(".flow-block-text")) {
        const html = b.innerHTML;
        b.innerHTML = "";
        b.removeAttribute("contenteditable");
        if (!b.dataset.blockId)
          b.dataset.blockId = `b_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        const text = document.createElement("div");
        text.className = "flow-block-text";
        text.contentEditable = "true";
        text.innerHTML = html;
        const btn = createDragButton();
        btn.addEventListener("mousedown", onConnectHandleDown);
        b.appendChild(text);
        b.appendChild(btn);
      }
    });
  }
  // フロー全削除ボタン
  // 保存
  function saveAll() {
    const data = {
      topic: document.querySelector(".sheet-topic")?.value || "",
      date: document.querySelector(".sheet-date")?.value || "",
      tournament: document.querySelector(".sheet-tournament")?.value || "",
      place: document.querySelector(".sheet-place")?.value || "",
      teamAff: document.querySelector(".sheet-team-affirmative")?.value || "",
      teamNeg: document.querySelector(".sheet-team-negative")?.value || "",
      parts: [],
      scores: [],
      // judge fields removed
    };
    document.querySelectorAll(".flow-col").forEach((col) => {
      const blocksWrap = col.querySelector(".flow-blocks");
      const arr = [];
      if (blocksWrap) {
        blocksWrap.querySelectorAll(".flow-block").forEach((b) => {
          const t = b.querySelector(".flow-block-text");
          arr.push(t ? t.innerHTML : "");
        });
      }
      data.parts.push(
        arr.map((html, index) => ({
          id:
            blocksWrap.querySelectorAll(".flow-block")[index].dataset.blockId ||
            null,
          html: html,
        }))
      );
    });
    document
      .querySelectorAll(".score-table td[contenteditable]")
      .forEach((td) => data.scores.push(td.innerHTML));
    // 既存の接続情報を保持
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (existing && existing.connections)
      data.connections = existing.connections;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  // 全消去
  document.getElementById("clear-flow-btn").addEventListener("click", () => {
    if (!confirm("本当に全ての内容を削除しますか？")) return;
    [
      ".sheet-topic",
      ".sheet-date",
      ".sheet-tournament",
      ".sheet-place",
      ".sheet-team-affirmative",
      ".sheet-team-negative",
      // judge fields removed
    ].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = "";
    });
    document.querySelectorAll(".flow-col").forEach((col) => {
      const blocksWrap = col.querySelector(".flow-blocks");
      if (blocksWrap) {
        blocksWrap.innerHTML = "";
        blocksWrap.appendChild(createFlowBlock(""));
      }
    });
    document
      .querySelectorAll(".score-table td[contenteditable]")
      .forEach((td) => (td.innerHTML = ""));
    // 矢印（接続）もクリア
    document.querySelectorAll(".arrow-svg-layer").forEach((layer) => {
      layer.innerHTML = "";
    });
    // 保存中の接続も空に
    try {
      const data =
        JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
      data.connections = { affirmative: [], negative: [] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    saveAll();
    // 設定スタイル再適用
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") {
        document.querySelectorAll(".flow-block-text").forEach((el) => {
          el.style.fontSize =
            s.fontSize === "xlarge"
              ? "18px"
              : s.fontSize === "large"
              ? "16px"
              : "";
          el.style.lineHeight =
            s.lineHeight === "loose"
              ? "1.8"
              : s.lineHeight === "relaxed"
              ? "1.6"
              : "";
        });
      }
    } catch {}
  });
  function loadAll() {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!data) return;
    const elTopic = document.querySelector(".sheet-topic");
    if (elTopic) elTopic.value = data.topic || "";
    const elDate = document.querySelector(".sheet-date");
    if (elDate) elDate.value = data.date || "";
    const elTour = document.querySelector(".sheet-tournament");
    if (elTour) elTour.value = data.tournament || "";
    const elPlace = document.querySelector(".sheet-place");
    if (elPlace) elPlace.value = data.place || "";
    const elAff = document.querySelector(".sheet-team-affirmative");
    if (elAff) elAff.value = data.teamAff || "";
    const elNeg = document.querySelector(".sheet-team-negative");
    if (elNeg) elNeg.value = data.teamNeg || "";
    // 各パート
    if (Array.isArray(data.parts)) {
      document.querySelectorAll(".flow-col").forEach((col, i) => {
        const blocks = data.parts[i] || [];
        const blocksWrap = col.querySelector(".flow-blocks");
        if (blocksWrap) {
          blocksWrap.innerHTML = "";
          blocks.forEach((item) => {
            let b;
            if (item && typeof item === "object") {
              b = createFlowBlock(item.html || "");
              if (item.id) b.dataset.blockId = item.id;
            } else {
              // 旧形式（文字列のみ）
              b = createFlowBlock(item || "");
            }
            blocksWrap.appendChild(b);
          });
          if (blocks.length === 0) {
            blocksWrap.appendChild(createFlowBlock(""));
          }
        }
      });
    }
    // スコア欄
    if (Array.isArray(data.scores)) {
      const tds = document.querySelectorAll(".score-table td[contenteditable]");
      tds.forEach((td, i) => {
        td.innerHTML = data.scores[i] || "";
      });
    }
    // 審判名・日付・時間
    // judge fields removed
    // 接続の復元
    if (data.connections && typeof data.connections === "object") {
      setTimeout(() => {
        restoreConnections(data.connections);
      }, 0);
    }
  }
  // 入力イベントで保存
  document.body.addEventListener("input", saveAll);
  document.body.addEventListener("blur", saveAll, true);
  // 初期化時に復元
  loadAll();
  // 古いDOMを新テンプレへ
  upgradeExistingBlocks();
  // 設定の適用
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (s && typeof s === "object") {
      document.querySelectorAll(".flow-block-text").forEach((el) => {
        if (s.fontSize === "xlarge") el.style.fontSize = "18px";
        else if (s.fontSize === "large") el.style.fontSize = "16px";
        else el.style.fontSize = "";
        if (s.lineHeight === "loose") el.style.lineHeight = "1.8";
        else if (s.lineHeight === "relaxed") el.style.lineHeight = "1.6";
        else el.style.lineHeight = "";
      });
    }
  } catch {}

  // --- 設定モーダル ---
  const overlay = document.getElementById("settings-overlay");
  const openBtn = document.getElementById("open-settings-btn");
  const closeBtn = document.getElementById("close-settings-btn");
  const saveBtn = document.getElementById("save-settings-btn");
  const selFont = document.getElementById("setting-font-size");
  const selLine = document.getElementById("setting-line-height");

  function openSettings() {
    overlay.classList.add("active");
    overlay.removeAttribute("aria-hidden");
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") {
        selFont.value = s.fontSize || "default";
        selLine.value = s.lineHeight || "default";
      } else {
        selFont.value = "default";
        selLine.value = "default";
      }
    } catch {
      selFont.value = "default";
      selLine.value = "default";
    }
  }
  function closeSettings() {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }
  function applySettings() {
    const fontChoice = selFont.value;
    const lineChoice = selLine.value;
    document.querySelectorAll(".flow-block-text").forEach((el) => {
      if (fontChoice === "xlarge") el.style.fontSize = "18px";
      else if (fontChoice === "large") el.style.fontSize = "16px";
      else el.style.fontSize = "";
      if (lineChoice === "loose") el.style.lineHeight = "1.8";
      else if (lineChoice === "relaxed") el.style.lineHeight = "1.6";
      else el.style.lineHeight = "";
    });
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ fontSize: fontChoice, lineHeight: lineChoice })
    );
  }
  openBtn && openBtn.addEventListener("click", openSettings);
  closeBtn && closeBtn.addEventListener("click", closeSettings);
  overlay &&
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeSettings();
    });
  saveBtn &&
    saveBtn.addEventListener("click", () => {
      applySettings();
      closeSettings();
      saveAll();
    });
  // body全体でフォーカスが外れているときのundo/redo
  document.addEventListener("keydown", function (e) {
    const active = document.activeElement;
    const isInput =
      active &&
      (active.isContentEditable ||
        ["INPUT", "TEXTAREA"].includes(active.tagName));
    if (!isInput) {
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        document.execCommand("undo");
      } else if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        document.execCommand("redo");
      }
    }
  });
  // flow-blockで矢印キー移動
  function onFlowBlockArrow(e) {
    if (!e.target.classList.contains("flow-block-text")) return;
    // Altが押されていない通常の矢印はテキスト内移動に任せる
    if (!e.altKey) return;
    const block = e.target.parentNode;
    const parentBlocks = block.parentNode;
    const allBlocks = Array.from(parentBlocks.children);
    const idx = allBlocks.indexOf(block);
    // 上下キー: 同じパート内
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      allBlocks[idx - 1].querySelector(".flow-block-text")?.focus();
    } else if (e.key === "ArrowDown" && idx < allBlocks.length - 1) {
      e.preventDefault();
      allBlocks[idx + 1].querySelector(".flow-block-text")?.focus();
    }
    // 左右キー: 隣のパート
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // .flow-colを取得
      const flowCol = block.closest(".flow-col");
      const flowCols = Array.from(flowCol.parentNode.children);
      const colIdx = flowCols.indexOf(flowCol);
      let targetCol = null;
      if (e.key === "ArrowLeft" && colIdx < flowCols.length - 1) {
        targetCol = flowCols[colIdx + 1];
      } else if (e.key === "ArrowRight" && colIdx > 0) {
        targetCol = flowCols[colIdx - 1];
      }
      if (targetCol) {
        const targetBlocks = targetCol.querySelector(".flow-blocks");
        if (targetBlocks) {
          const targetBlock =
            targetBlocks.children[idx] || targetBlocks.lastElementChild;
          if (targetBlock)
            targetBlock.querySelector(".flow-block-text")?.focus();
        }
      }
    }
  }
  document.querySelectorAll(".flow-blocks").forEach((blocks) => {
    blocks.addEventListener("keydown", onFlowBlockArrow);
  });
  // flow-blockが空欄でDelete/Backspace時に削除
  function onFlowBlockDelete(e) {
    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      e.target.classList.contains("flow-block-text") &&
      e.target.innerText.trim() === ""
    ) {
      const block = e.target.parentNode;
      const parent = block.parentNode;
      if (parent.children.length > 1) {
        e.preventDefault();
        const prev = block.previousElementSibling;
        const next = block.nextElementSibling;
        block.remove();
        if (prev) prev.querySelector(".flow-block-text")?.focus();
        else if (next) next.querySelector(".flow-block-text")?.focus();
      }
    }
  }
  document.querySelectorAll(".flow-blocks").forEach((blocks) => {
    blocks.addEventListener("keydown", onFlowBlockDelete);
  });
  // flow-blockでCtrl+Enterで新ブロック追加＆フォーカス
  function onFlowBlockKeydown(e) {
    if (
      e.ctrlKey &&
      e.key === "Enter" &&
      e.target.classList.contains("flow-block-text")
    ) {
      e.preventDefault();
      const currentText = e.target;
      const currentBlock = currentText.parentNode;
      const parent = currentBlock.parentNode;
      const newBlock = createFlowBlock("");
      if (currentBlock.nextSibling) {
        parent.insertBefore(newBlock, currentBlock.nextSibling);
      } else {
        parent.appendChild(newBlock);
      }
      setTimeout(() => newBlock.querySelector(".flow-block-text")?.focus(), 0);
      // 新規追加したので保存し、接続再計算
      saveAll();
      persistConnections();
    }
  }
  document.querySelectorAll(".flow-blocks").forEach((blocks) => {
    blocks.addEventListener("keydown", onFlowBlockKeydown);
  });
  // 論点ブロック追加・削除
  function addBlock(btn) {
    const blocks = btn.previousElementSibling;
    const newBlock = createFlowBlock("");
    blocks.appendChild(newBlock);
    saveAll();
    persistConnections();
  }
  // クリック削除は無効化（空欄＋Backspace/Deleteのみ削除を許可）
  function removeBlock(e) {
    return;
  }
  document.querySelectorAll(".add-block-btn").forEach((btn) => {
    btn.addEventListener("click", () => addBlock(btn));
  });
  // クリックによる削除リスナーは登録しない
  // 矢印描画用
  let arrowStart = null;
  let currentArrow = null;
  let currentSvgLayer = null;

  function getHandleCenter(handle) {
    const rect = handle.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + rect.height / 2 + window.scrollY,
    };
  }

  function getSvgLayer(flowSection) {
    return flowSection.querySelector(".arrow-svg-layer");
  }

  function createSvgArrow(x1, y1, x2, y2) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    svg.setAttribute("width", window.innerWidth);
    svg.setAttribute("height", window.innerHeight);
    const arrow = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    arrow.setAttribute("x1", x1);
    arrow.setAttribute("y1", y1);
    arrow.setAttribute("x2", x2);
    arrow.setAttribute("y2", y2);
    arrow.setAttribute("stroke", "#3b5998");
    arrow.setAttribute("stroke-width", "3");
    arrow.setAttribute("marker-end", "url(#arrowhead)");
    // marker
    let marker = svg.querySelector("marker#arrowhead");
    if (!marker) {
      marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", "arrowhead");
      marker.setAttribute("markerWidth", "10");
      marker.setAttribute("markerHeight", "7");
      marker.setAttribute("refX", "10");
      marker.setAttribute("refY", "3.5");
      marker.setAttribute("orient", "auto");
      marker.innerHTML = '<polygon points="0 0, 10 3.5, 0 7" fill="#3b5998" />';
      const defs = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs"
      );
      defs.appendChild(marker);
      svg.appendChild(defs);
    }
    svg.appendChild(arrow);
    return svg;
  }

  function clearTempArrow() {
    if (currentArrow && currentSvgLayer) {
      currentSvgLayer.removeChild(currentArrow);
      currentArrow = null;
    }
  }

  function onHandleMouseDown(e) {
    e.preventDefault();
    arrowStart = e.target;
    // flow-sectionを特定
    let flowSection = e.target.closest(".flow-section");
    currentSvgLayer = getSvgLayer(flowSection);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (!arrowStart || !currentSvgLayer) return;
    clearTempArrow();
    const start = getHandleCenter(arrowStart);
    const x1 = start.x;
    const y1 = start.y;
    const x2 = e.pageX;
    const y2 = e.pageY;
    currentArrow = createSvgArrow(x1, y1, x2, y2);
    currentArrow.classList.add("temp-arrow");
    currentSvgLayer.appendChild(currentArrow);
  }

  function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    if (!arrowStart || !currentSvgLayer) return clearTempArrow();
    // 終点がハンドルか判定
    const endHandle = document.elementFromPoint(e.clientX, e.clientY);
    if (endHandle && endHandle.classList.contains("arrow-handle")) {
      const start = getHandleCenter(arrowStart);
      const end = getHandleCenter(endHandle);
      clearTempArrow();
      const svg = createSvgArrow(start.x, start.y, end.x, end.y);
      currentSvgLayer.appendChild(svg);
    } else {
      clearTempArrow();
    }
    arrowStart = null;
    currentSvgLayer = null;
  }

  // すべてのハンドルにイベント付与
  document.querySelectorAll(".arrow-handle").forEach((handle) => {
    handle.addEventListener("mousedown", onHandleMouseDown);
  });

  // ===== 接続（ドラッグで矢印）機能 =====
  let connectDrag = {
    active: false,
    startBlock: null,
    guideSvg: null,
    layer: null,
    hoverBlock: null,
  };

  function ensureLayer(section) {
    let layer = section.querySelector(".arrow-svg-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "arrow-svg-layer";
      section.prepend(layer);
    }
    return layer;
  }

  function makeLineInLayer(layer, x1, y1, x2, y2) {
    const section = layer.closest && layer.closest(".flow-section");
    const isNeg = section && section.id === "negative-flow";
    const color = isNeg ? "#c0392b" : "#3b5998";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "marker"
    );
    const markerId = `arrowhead-${isNeg ? "neg" : "aff"}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    marker.setAttribute("id", markerId);
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    marker.innerHTML = `<polygon points="0 0, 10 3.5, 0 7" fill="${color}" />`;
    defs.appendChild(marker);
    svg.appendChild(defs);
    // 当たり判定用（広い・透明）
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", x1);
    hit.setAttribute("y1", y1);
    hit.setAttribute("x2", x2);
    hit.setAttribute("y2", y2);
    hit.setAttribute("stroke", "rgba(0,0,0,0)");
    hit.setAttribute("stroke-width", "14");
    hit.setAttribute("stroke-linecap", "round");
    hit.classList.add("hit");
    // 表示用（細い・可視）
    const vis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    vis.setAttribute("x1", x1);
    vis.setAttribute("y1", y1);
    vis.setAttribute("x2", x2);
    vis.setAttribute("y2", y2);
    vis.setAttribute("stroke", color);
    vis.setAttribute("stroke-width", "2");
    vis.setAttribute("marker-end", `url(#${markerId})`);
    vis.setAttribute("stroke-linecap", "round");
    vis.classList.add("vis");
    svg.appendChild(hit);
    svg.appendChild(vis);
    // SVG自体はイベント無効、可視線も無効、当たり判定線のみ有効
    svg.style.pointerEvents = "none";
    vis.style.pointerEvents = "none";
    hit.style.pointerEvents = "stroke";
    // 右クリックで削除（ヒット線のみ反応）
    hit.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const s = hit.ownerSVGElement || hit.closest("svg");
      const container = s && s.parentElement;
      if (container && s) container.removeChild(s);
      persistConnections();
    });
    return svg;
  }

  function getBlockAnchorCenterInLayer(block, layer) {
    const btn = block.querySelector(".drag-connect-btn");
    const rect = (btn || block).getBoundingClientRect();
    const lrect = layer.getBoundingClientRect();
    return {
      x: rect.left - lrect.left + rect.width / 2,
      y: rect.top - lrect.top + rect.height / 2,
    };
  }
  function getBlockEdgeAnchorInLayer(block, layer, towardsClientX) {
    const br = block.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    const centerX = br.left + br.width / 2;
    const useRight = towardsClientX >= centerX;
    const x = (useRight ? br.right : br.left) - lr.left;
    const y = br.top - lr.top + br.height / 2;
    return { x, y };
  }
  function toLayerXY(layer, clientX, clientY) {
    const lrect = layer.getBoundingClientRect();
    return { x: clientX - lrect.left, y: clientY - lrect.top };
  }

  function onConnectHandleDown(e) {
    e.preventDefault();
    const block = e.currentTarget.closest(".flow-block");
    const section = block.closest(".flow-section");
    connectDrag.active = true;
    connectDrag.startBlock = block;
    connectDrag.layer = ensureLayer(section);
    const s = getBlockAnchorCenterInLayer(block, connectDrag.layer);
    connectDrag.guideSvg = makeLineInLayer(
      connectDrag.layer,
      s.x,
      s.y,
      s.x,
      s.y
    );
    connectDrag.guideSvg.classList.add("temp-arrow");
    // ガイドはイベントを拾わない
    connectDrag.guideSvg.style.pointerEvents = "none";
    const gLine = connectDrag.guideSvg.querySelector("line");
    if (gLine) gLine.style.pointerEvents = "none";
    connectDrag.layer.appendChild(connectDrag.guideSvg);
    document.addEventListener("mousemove", onConnectMouseMove);
    document.addEventListener("mouseup", onConnectMouseUp);
  }

  function onConnectMouseMove(e) {
    if (!connectDrag.active) return;
    const s = getBlockEdgeAnchorInLayer(
      connectDrag.startBlock,
      connectDrag.layer,
      e.clientX
    );
    const g = connectDrag.guideSvg;
    if (!g) return;
    const p = toLayerXY(connectDrag.layer, e.clientX, e.clientY);
    g.querySelectorAll("line").forEach((line) => {
      line.setAttribute("x1", s.x);
      line.setAttribute("y1", s.y);
      line.setAttribute("x2", p.x);
      line.setAttribute("y2", p.y);
    });
    // ハイライト対象を更新
    const els = document.elementsFromPoint(e.clientX, e.clientY) || [];
    let candidate = null;
    for (const el of els) {
      const b = el.closest && el.closest(".flow-block");
      if (b) {
        candidate = b;
        break;
      }
    }
    if (candidate !== connectDrag.hoverBlock) {
      if (connectDrag.hoverBlock)
        connectDrag.hoverBlock.classList.remove("connect-target");
      connectDrag.hoverBlock = candidate;
      if (connectDrag.hoverBlock)
        connectDrag.hoverBlock.classList.add("connect-target");
    }
  }

  function onConnectMouseUp(e) {
    if (!connectDrag.active) return cleanupConnectDrag();
    document.removeEventListener("mousemove", onConnectMouseMove);
    document.removeEventListener("mouseup", onConnectMouseUp);
    const start = connectDrag.startBlock;
    const layer = connectDrag.layer;
    if (!start || !layer) return cleanupConnectDrag();
    // ドロップ位置のブロックを特定（SVGをスキップして下の要素を拾う）
    let endBlock = null;
    const els = document.elementsFromPoint(e.clientX, e.clientY) || [];
    for (const el of els) {
      const b = el.closest && el.closest(".flow-block");
      if (b) {
        endBlock = b;
        break;
      }
    }
    // ブロックが見つからない場合は、同一セクション内のカラムを探して新規ブロックを作成
    if (!endBlock) {
      let targetCol = null;
      for (const el of els) {
        const c = el.closest && el.closest(".flow-col");
        if (
          c &&
          c.closest(".flow-section") === start.closest(".flow-section")
        ) {
          targetCol = c;
          break;
        }
      }
      if (targetCol) {
        const wrap = targetCol.querySelector(".flow-blocks");
        if (wrap) {
          // ドロップ位置に近い場所へ挿入
          const wr = wrap.getBoundingClientRect();
          const dropY = e.clientY - wr.top;
          const children = Array.from(wrap.querySelectorAll(".flow-block"));
          let insertBeforeEl = null;
          for (const child of children) {
            const cr = child.getBoundingClientRect();
            const mid = cr.top - wr.top + cr.height / 2;
            if (dropY < mid) {
              insertBeforeEl = child;
              break;
            }
          }
          const nb = createFlowBlock("");
          if (insertBeforeEl) wrap.insertBefore(nb, insertBeforeEl);
          else wrap.appendChild(nb);
          endBlock = nb;
        }
      }
    }
    // 同じセクション内のみ許可
    if (
      endBlock &&
      endBlock !== start &&
      endBlock.closest(".flow-section") === start.closest(".flow-section")
    ) {
      // 確定矢印追加
      // 互いの位置関係に応じて左右縁にアンカー
      const endCenterClientX =
        endBlock.getBoundingClientRect().left +
        endBlock.getBoundingClientRect().width / 2;
      const startCenterClientX =
        start.getBoundingClientRect().left +
        start.getBoundingClientRect().width / 2;
      const sC = getBlockEdgeAnchorInLayer(start, layer, endCenterClientX);
      const eC = getBlockEdgeAnchorInLayer(endBlock, layer, startCenterClientX);
      // 重複チェック
      const fromId = start.dataset.blockId;
      const toId = endBlock.dataset.blockId;
      const exists = layer.querySelector(
        `svg[data-from="${fromId}"][data-to="${toId}"]`
      );
      if (!exists) {
        const svg = makeLineInLayer(layer, sC.x, sC.y, eC.x, eC.y);
        svg.dataset.from = fromId;
        svg.dataset.to = toId;
        layer.appendChild(svg);
        saveAll();
        persistConnections();
      }
    }
    cleanupConnectDrag();
  }

  function cleanupConnectDrag() {
    if (connectDrag.guideSvg && connectDrag.layer) {
      connectDrag.layer.removeChild(connectDrag.guideSvg);
    }
    if (connectDrag.hoverBlock) {
      connectDrag.hoverBlock.classList.remove("connect-target");
    }
    connectDrag.active = false;
    connectDrag.startBlock = null;
    connectDrag.guideSvg = null;
    connectDrag.layer = null;
    connectDrag.hoverBlock = null;
  }

  function persistConnections() {
    // セクションごとに、可視状態のものだけ最新を反映し、不可視は既存を保持
    const sections = [
      document.getElementById("affirmative-flow"),
      document.getElementById("negative-flow"),
    ];
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
    const existing = data.connections || { affirmative: [], negative: [] };
    const connections = {
      affirmative: existing.affirmative || [],
      negative: existing.negative || [],
    };
    sections.forEach((sec, i) => {
      const key = i === 0 ? "affirmative" : "negative";
      if (!sec) return;
      const style = window.getComputedStyle(sec);
      const layer = sec.querySelector(".arrow-svg-layer");
      // 非表示やレイヤなしの場合は上書きしない
      if (
        !layer ||
        style.display === "none" ||
        sec.offsetWidth === 0 ||
        sec.offsetHeight === 0
      )
        return;
      const list = [];
      layer.querySelectorAll("svg[data-from][data-to]").forEach((svg) => {
        list.push({ from: svg.dataset.from, to: svg.dataset.to });
      });
      connections[key] = list;
    });
    data.connections = connections;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function restoreConnections(connections) {
    const sections = {
      affirmative: document.getElementById("affirmative-flow"),
      negative: document.getElementById("negative-flow"),
    };
    ["affirmative", "negative"].forEach((key) => {
      const sec = sections[key];
      if (!sec) return;
      // 非表示時は描画をスキップ（表示時に再描画）
      const style = window.getComputedStyle(sec);
      if (
        style.display === "none" ||
        sec.offsetWidth === 0 ||
        sec.offsetHeight === 0
      )
        return;
      const layer = ensureLayer(sec);
      // 既存の矢印を消す
      layer.querySelectorAll("svg").forEach((s) => s.remove());
      const list = connections[key] || [];
      list.forEach((conn) => {
        const from = sec.querySelector(
          `.flow-block[data-block-id="${conn.from}"]`
        );
        const to = sec.querySelector(`.flow-block[data-block-id="${conn.to}"]`);
        if (!from || !to) return;
        const toCenterClientX =
          to.getBoundingClientRect().left +
          to.getBoundingClientRect().width / 2;
        const fromCenterClientX =
          from.getBoundingClientRect().left +
          from.getBoundingClientRect().width / 2;
        const sC = getBlockEdgeAnchorInLayer(from, layer, toCenterClientX);
        const eC = getBlockEdgeAnchorInLayer(to, layer, fromCenterClientX);
        const svg = makeLineInLayer(layer, sC.x, sC.y, eC.x, eC.y);
        svg.dataset.from = conn.from;
        svg.dataset.to = conn.to;
        layer.appendChild(svg);
      });
    });
  }

  // リサイズ/スクロール時に再描画（座標再計算）
  const scheduleRepaint = (() => {
    let rafId = null;
    return () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (data && data.connections) restoreConnections(data.connections);
      });
    };
  })();
  window.addEventListener("resize", scheduleRepaint, { passive: true });
  window.addEventListener("scroll", scheduleRepaint, { passive: true });
  document.body.addEventListener("input", scheduleRepaint, { passive: true });
  // フロー欄クリック時のハイライト
  document.querySelectorAll(".flow-content").forEach((el) => {
    el.addEventListener("focus", () => {
      el.classList.add("active");
    });
    el.addEventListener("blur", () => {
      el.classList.remove("active");
    });
  });

  // スイッチボタンで肯定側・否定側フロー切り替え
  const btnAff = document.getElementById("switch-to-affirmative");
  const btnNeg = document.getElementById("switch-to-negative");
  const affFlow = document.getElementById("affirmative-flow");
  const negFlow = document.getElementById("negative-flow");

  btnAff.addEventListener("click", () => {
    btnAff.classList.add("active");
    btnNeg.classList.remove("active");
    affFlow.style.display = "";
    negFlow.style.display = "none";
    // 表示変更後に再描画
    setTimeout(() => {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && data.connections) restoreConnections(data.connections);
    }, 0);
  });
  btnNeg.addEventListener("click", () => {
    btnNeg.classList.add("active");
    btnAff.classList.remove("active");
    affFlow.style.display = "none";
    negFlow.style.display = "";
    // 表示変更後に再描画
    setTimeout(() => {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && data.connections) restoreConnections(data.connections);
    }, 0);
  });
  // ===== スコア: 数値入力制限と自動合計 =====
  (function setupScores() {
    const table = document.querySelector(".score-table");
    if (!table) return;
    const rows = Array.from(table.tBodies[0]?.rows || []);
    if (rows.length === 0) return;
    function findRow(label) {
      return (
        rows.find((r) => (r.cells[0]?.innerText || "").trim() === label) || null
      );
    }
    const rowTotal = findRow("合計");
    if (rowTotal) {
      // 合計セルは編集不可に
      for (let i = 1; i < rowTotal.cells.length; i++) {
        rowTotal.cells[i].setAttribute("contenteditable", "false");
        rowTotal.cells[i].classList.add("score-total");
      }
    }
    function sanitize(el) {
      const before = el.innerText;
      const after = before.replace(/\D+/g, "");
      if (after !== before) {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        el.innerText = after;
        // キャレットを末尾へ（簡易）
        if (range) {
          sel.removeAllRanges();
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          sel.addRange(r);
        }
      }
    }
    function recalc() {
      if (!rowTotal) return;
      const idxAff = 1,
        idxNeg = 2;
      let sumAff = 0,
        sumNeg = 0;
      const exclude = new Set(["合計", "判定", "勝敗"]);
      const deduct = new Set(["マナー", "態度・技術"]);
      for (const r of rows) {
        const label = (r.cells[0]?.innerText || "").trim();
        if (exclude.has(label)) continue;
        const vAff = parseInt(
          (r.cells[idxAff]?.innerText || "").replace(/\D+/g, ""),
          10
        );
        const vNeg = parseInt(
          (r.cells[idxNeg]?.innerText || "").replace(/\D+/g, ""),
          10
        );
        const sign = deduct.has(label) ? -1 : 1;
        if (!isNaN(vAff)) sumAff += sign * vAff;
        if (!isNaN(vNeg)) sumNeg += sign * vNeg;
      }
      rowTotal.cells[idxAff].textContent = String(sumAff);
      rowTotal.cells[idxNeg].textContent = String(sumNeg);
    }
    function allowNumberKeys(e) {
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      // 許可: 数字、制御キー、編集キー、ナビゲーション
      const allowed =
        /[0-9]/.test(k) ||
        k === "Backspace" ||
        k === "Delete" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "Home" ||
        k === "End" ||
        k === "Tab" ||
        k === "Enter" ||
        (ctrl &&
          (k === "a" ||
            k === "c" ||
            k === "v" ||
            k === "x" ||
            k === "z" ||
            k === "y" ||
            k === "A" ||
            k === "C" ||
            k === "V" ||
            k === "X" ||
            k === "Z" ||
            k === "Y"));
      if (!allowed) {
        e.preventDefault();
      }
    }
    // 対象セルへリスナーを付与
    rows.forEach((r) => {
      const label = (r.cells[0]?.innerText || "").trim();
      if (label === "合計" || label === "判定" || label === "勝敗") return;
      for (let i = 1; i < r.cells.length; i++) {
        const td = r.cells[i];
        if (!td.hasAttribute("contenteditable")) continue;
        td.addEventListener("keydown", allowNumberKeys);
        td.addEventListener("input", () => {
          sanitize(td);
          recalc();
          saveAll();
        });
      }
    });
    // 初期合計
    recalc();
  })();
  // ===== タイマー =====
  (function setupTimer() {
    const elDisp = document.getElementById("timer-display");
    const btnStart = document.getElementById("timer-start");
    const btnReset = document.getElementById("timer-reset");
    const selPreset = document.getElementById("timer-preset");
    const chkDown = document.getElementById("timer-countdown");
    if (!elDisp || !btnStart || !btnReset || !selPreset || !chkDown) return;

    let running = false;
    let startTs = 0; // performance.now()
    let acc = 0; // 累積ミリ秒
    let raf = 0;
    let target = parseInt(selPreset.value, 10) || 300000;

    function fmt(ms) {
      ms = Math.max(0, Math.floor(ms));
      const total = Math.floor(ms / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    function render() {
      const now = performance.now();
      const elapsed = running ? acc + (now - startTs) : acc;
      const displayMs = chkDown.checked ? target - elapsed : elapsed;
      elDisp.textContent = fmt(displayMs);
      if (running) {
        if (chkDown.checked && displayMs <= 0) {
          // タイムアップ
          running = false;
          acc = target; // ちょうどに揃える
          btnStart.textContent = "▶";
          // 簡易通知
          try {
            new AudioContext();
          } catch {}
          return; // 止める
        }
        raf = requestAnimationFrame(render);
      }
    }
    function startStop() {
      if (!running) {
        running = true;
        startTs = performance.now();
        btnStart.textContent = "⏸";
        raf = requestAnimationFrame(render);
      } else {
        running = false;
        acc = acc + (performance.now() - startTs);
        btnStart.textContent = "▶";
      }
    }
    function reset() {
      running = false;
      acc = 0;
      startTs = 0;
      btnStart.textContent = "▶";
      render();
    }
    btnStart.addEventListener("click", startStop);
    btnReset.addEventListener("click", reset);
    selPreset.addEventListener("change", () => {
      target = parseInt(selPreset.value, 10) || 300000;
      if (chkDown.checked && !running) render();
    });
    chkDown.addEventListener("change", () => {
      // 表示ロジックだけ切替（内部accは共通）
      render();
    });
    // 初期表示
    render();
  })();
  // ===== DFSF エクスポート/インポート =====
  function collectSnapshot() {
    // saveAllがlocalStorageに保存するが、ここでは直接オブジェクトを構築
    const snapshot = {
      version: 1,
      meta: { exportedAt: new Date().toISOString() },
      sheet: {
        topic: document.querySelector(".sheet-topic")?.value || "",
        date: document.querySelector(".sheet-date")?.value || "",
        tournament: document.querySelector(".sheet-tournament")?.value || "",
        place: document.querySelector(".sheet-place")?.value || "",
        teamAff: document.querySelector(".sheet-team-affirmative")?.value || "",
        teamNeg: document.querySelector(".sheet-team-negative")?.value || "",
        judge: document.querySelector(".judge-name")?.value || "",
        judgeDate: document.querySelector(".judge-info .date")?.value || "",
        judgeTime: document.querySelector(".judge-info .time")?.value || "",
      },
      parts: [],
      scores: [],
      connections: { affirmative: [], negative: [] },
      settings: JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {},
    };
    // カラム毎のブロック（HTMLを保持）
    document.querySelectorAll(".flow-col").forEach((col) => {
      const wrap = col.querySelector(".flow-blocks");
      const arr = [];
      if (wrap) {
        wrap.querySelectorAll(".flow-block").forEach((b) => {
          const t = b.querySelector(".flow-block-text");
          arr.push({
            id: b.dataset.blockId || null,
            html: t ? t.innerHTML : "",
          });
        });
      }
      snapshot.parts.push(arr);
    });
    // スコア
    document
      .querySelectorAll(".score-table td[contenteditable]")
      .forEach((td) => snapshot.scores.push(td.innerHTML));
    // 接続（既にlocalStorageにあるものを使用）
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && data.connections) snapshot.connections = data.connections;
    } catch {}
    return snapshot;
  }

  function applySnapshot(snap) {
    if (!snap || typeof snap !== "object") throw new Error("Invalid snapshot");
    // フィールド
    const s = snap.sheet || {};
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (el) el.value = v || "";
    };
    set(".sheet-topic", s.topic);
    set(".sheet-date", s.date);
    set(".sheet-tournament", s.tournament);
    set(".sheet-place", s.place);
    set(".sheet-team-affirmative", s.teamAff);
    set(".sheet-team-negative", s.teamNeg);
    // judge fields removed
    // カラム
    if (Array.isArray(snap.parts)) {
      document.querySelectorAll(".flow-col").forEach((col, i) => {
        const items = snap.parts[i] || [];
        const wrap = col.querySelector(".flow-blocks");
        if (!wrap) return;
        wrap.innerHTML = "";
        items.forEach((it) => {
          const b = createFlowBlock(it && it.html ? it.html : "");
          if (it && it.id) b.dataset.blockId = it.id; // ID復元
          wrap.appendChild(b);
        });
        if (items.length === 0) wrap.appendChild(createFlowBlock(""));
      });
    }
    // スコア
    if (Array.isArray(snap.scores)) {
      const tds = document.querySelectorAll(".score-table td[contenteditable]");
      tds.forEach((td, i) => (td.innerHTML = snap.scores[i] || ""));
    }
    // 設定を反映
    if (snap.settings && typeof snap.settings === "object") {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(snap.settings));
      document.querySelectorAll(".flow-block-text").forEach((el) => {
        const st = snap.settings;
        el.style.fontSize =
          st.fontSize === "xlarge"
            ? "18px"
            : st.fontSize === "large"
            ? "16px"
            : "";
        el.style.lineHeight =
          st.lineHeight === "loose"
            ? "1.8"
            : st.lineHeight === "relaxed"
            ? "1.6"
            : "";
      });
    }
    // 接続
    const conns = snap.connections || { affirmative: [], negative: [] };
    // localStorageへも保存してから復元
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
    store.connections = conns;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    // 少し後で描画（DOM反映後）
    setTimeout(() => restoreConnections(conns), 0);
    // 最後に全体保存
    saveAll();
  }

  // エクスポート
  const exportBtn = document.getElementById("export-dfsf-btn");
  exportBtn &&
    exportBtn.addEventListener("click", () => {
      const snap = collectSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flowsheet_${new Date().toISOString().slice(0, 10)}.dfsf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 100);
    });

  // インポート
  const importBtn = document.getElementById("import-dfsf-btn");
  const importInput = document.getElementById("import-dfsf-input");
  importBtn &&
    importBtn.addEventListener("click", () => {
      importInput && importInput.click();
    });
  importInput &&
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        applySnapshot(json);
      } catch (err) {
        alert("読み込みに失敗しました。ファイル形式をご確認ください。");
        console.error(err);
      } finally {
        e.target.value = "";
      }
    });
  // フローをtxtでダウンロード（Aff/Neg両方をまとめて）
  document.getElementById("download-flow-btn").addEventListener("click", () => {
    function buildFlowText(sectionEl, sectionLabel) {
      const cols = Array.from(
        sectionEl.querySelectorAll(".flow-col")
      ).reverse();
      let out = `=== ${sectionLabel} ===\n`;
      cols.forEach((col) => {
        const title = (
          col.querySelector(".col-title")?.innerText || ""
        ).replace(/\n/g, " ");
        const blocks = Array.from(
          col.querySelectorAll(".flow-block .flow-block-text")
        );
        const lines = blocks
          .map((b) => b.innerText.trim())
          .filter((t) => t.length > 0);
        out += `【${title}】\n${lines.join("\n")}\n\n`;
      });
      return out;
    }
    let txt = "";
    txt += buildFlowText(affFlow, "肯定側");
    txt += buildFlowText(negFlow, "否定側");
    const filename = "flows.txt";
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 100);
  });
});
