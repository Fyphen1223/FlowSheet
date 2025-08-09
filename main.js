// FlowSheet main.js
// 必要に応じて将来的に機能追加可能
// 例: 入力内容の保存や矢印描画など

// ここでは最低限の初期化のみ

document.addEventListener("DOMContentLoaded", () => {
  // PWA: Service Worker registration
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
  // localStorage keys
  const STORAGE_KEY = "flowsheet-autosave-v1";
  const SETTINGS_KEY = "flowsheet-settings-v1";
  const THEME_KEY = SETTINGS_KEY; // 同一オブジェクトで管理（fontSize, lineHeight, theme）
  const BACKUP_KEY = "flowsheet-last-backup-v1";
  const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5MB 上限

  // --- 共有リンク用ユーティリティ（URL-safe Base64, 圧縮は任意） ---
  function b64UrlEncode(u8) {
    let str = "";
    for (let i = 0; i < u8.length; i++) str += String.fromCharCode(u8[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64UrlDecodeToU8(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
    const bin = atob(s + pad);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  async function compressToU8(text) {
    // CompressionStreamがあればdeflate、無ければnull
    try {
      if (window.CompressionStream) {
        const cs = new CompressionStream("deflate-raw");
        const writer = cs.writable.getWriter();
        await writer.write(new TextEncoder().encode(text));
        await writer.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(buf);
      }
    } catch {}
    return null;
  }
  async function decompressToText(u8) {
    try {
      if (window.DecompressionStream) {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        await writer.write(u8);
        await writer.close();
        const buf = await new Response(ds.readable).arrayBuffer();
        return new TextDecoder().decode(buf);
      }
    } catch {}
    return null;
  }
  function jsonToBase64(json) {
    const text = JSON.stringify(json);
    const u8 = new TextEncoder().encode(text);
    return b64UrlEncode(u8);
  }
  function base64ToJson(b64) {
    const u8 = b64UrlDecodeToU8(b64);
    const text = new TextDecoder().decode(u8);
    return JSON.parse(text);
  }
  // 共通: flow-blockテンプレ生成
  function createReorderButton() {
    const btn = document.createElement("button");
    btn.className = "drag-reorder-btn";
    btn.title = "順序を入れ替え";
    btn.setAttribute("tabindex", "-1");
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="10" height="2" rx="1" fill="#888"/>
        <rect x="3" y="9" width="10" height="2" rx="1" fill="#888"/>
        <rect x="3" y="14" width="10" height="2" rx="1" fill="#888"/>
      </svg>`;
    return btn;
  }
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
    const reorderBtn = createReorderButton();
    reorderBtn.addEventListener("mousedown", onReorderHandleDown);
    const btn = createDragButton();
    btn.addEventListener("mousedown", onConnectHandleDown);
    b.appendChild(reorderBtn);
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
        const reorderBtn = createReorderButton();
        reorderBtn.addEventListener("mousedown", onReorderHandleDown);
        const btn = createDragButton();
        btn.addEventListener("mousedown", onConnectHandleDown);
        b.appendChild(reorderBtn);
        b.appendChild(text);
        b.appendChild(btn);
      }
      // 既存に並べ替えボタンが無い場合は付与
      if (!b.querySelector(".drag-reorder-btn")) {
        const reorderBtn = createReorderButton();
        reorderBtn.addEventListener("mousedown", onReorderHandleDown);
        const first = b.firstChild;
        b.insertBefore(reorderBtn, first);
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
  function applyTheme(theme) {
    const root = document.documentElement;
    const preferDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mode =
      theme && theme !== "system" ? theme : preferDark ? "dark" : "light";
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }
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
      applyTheme(s.theme || "system");
      // 初期ハイライト適用
      applyKeywordHighlights();
    } else {
      applyTheme("system");
    }
  } catch {
    applyTheme("system");
  }

  // --- 設定モーダル ---
  const overlay = document.getElementById("settings-overlay");
  const openBtn = document.getElementById("open-settings-btn");
  const closeBtn = document.getElementById("close-settings-btn");
  const saveBtn = document.getElementById("save-settings-btn");
  const selFont = document.getElementById("setting-font-size");
  const selLine = document.getElementById("setting-line-height");
  const selTheme = document.getElementById("setting-theme");
  const chkSnapOrth = document.getElementById("setting-snap-orth");
  const inpHl = document.getElementById("setting-highlight-keywords");
  const chkHlCase = document.getElementById("setting-highlight-case-sensitive");

  // キーワードハイライト適用
  function applyKeywordHighlights(options) {
    const skipFocused = !!(options && options.skipFocused);
    const onlyEl = options && options.onlyEl ? options.onlyEl : null;
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
      const raw = (s.highlightKeywords || "").trim();
      const cs = !!s.highlightCaseSensitive;
      const focused =
        document.activeElement &&
        document.activeElement.classList &&
        document.activeElement.classList.contains("flow-block-text")
          ? document.activeElement
          : null;
      // 対象コンテナを決定
      let containers = [];
      if (onlyEl) containers = [onlyEl];
      else
        containers = Array.from(
          document.querySelectorAll(".flow-block-text")
        ).filter((el) => !(skipFocused && focused === el));
      // 既存ハイライトをクリア（対象のみ）
      containers.forEach((container) => {
        container.querySelectorAll(".kw-mark").forEach((n) => {
          const parent = n.parentNode;
          if (!parent) return;
          parent.replaceChild(document.createTextNode(n.textContent || ""), n);
          parent.normalize && parent.normalize();
        });
      });
      if (!raw) return;
      const keywords = raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (!keywords.length) return;
      const flags = cs ? "g" : "gi";
      // エスケープ
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(" + keywords.map(esc).join("|") + ")", flags);
      containers.forEach((el) => {
        // テキストノードを走査して置換
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null
        );
        const texts = [];
        while (walker.nextNode()) texts.push(walker.currentNode);
        texts.forEach((tn) => {
          const val = tn.nodeValue;
          if (!val) return;
          if (!re.test(val)) return;
          const frag = document.createDocumentFragment();
          let lastIdx = 0;
          val.replace(re, (m, g1, idx) => {
            if (idx > lastIdx)
              frag.appendChild(
                document.createTextNode(val.slice(lastIdx, idx))
              );
            const mark = document.createElement("span");
            mark.className = "kw-mark";
            mark.textContent = val.substr(idx, g1.length);
            frag.appendChild(mark);
            lastIdx = idx + g1.length;
            return m;
          });
          if (lastIdx < val.length)
            frag.appendChild(document.createTextNode(val.slice(lastIdx)));
          tn.parentNode && tn.parentNode.replaceChild(frag, tn);
        });
      });
    } catch {}
  }

  function openSettings() {
    overlay.classList.add("active");
    overlay.removeAttribute("aria-hidden");
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") {
        selFont.value = s.fontSize || "default";
        selLine.value = s.lineHeight || "default";
        if (selTheme) selTheme.value = s.theme || "system";
        if (chkSnapOrth) chkSnapOrth.checked = s.snapOrth !== false; // default true
        if (inpHl) inpHl.value = s.highlightKeywords || "";
        if (chkHlCase) chkHlCase.checked = !!s.highlightCaseSensitive;
      } else {
        selFont.value = "default";
        selLine.value = "default";
        if (selTheme) selTheme.value = "system";
        if (chkSnapOrth) chkSnapOrth.checked = true;
        if (inpHl) inpHl.value = "";
        if (chkHlCase) chkHlCase.checked = false;
      }
    } catch {
      selFont.value = "default";
      selLine.value = "default";
      if (selTheme) selTheme.value = "system";
      if (chkSnapOrth) chkSnapOrth.checked = true;
      if (inpHl) inpHl.value = "";
      if (chkHlCase) chkHlCase.checked = false;
    }
  }
  function closeSettings() {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }
  function applySettings() {
    const fontChoice = selFont.value;
    const lineChoice = selLine.value;
    const themeChoice = selTheme ? selTheme.value : "system";
    const snapOrth = chkSnapOrth ? !!chkSnapOrth.checked : true;
    const hlKeywords = inpHl ? (inpHl.value || "").trim() : "";
    const hlCase = chkHlCase ? !!chkHlCase.checked : false;
    document.querySelectorAll(".flow-block-text").forEach((el) => {
      if (fontChoice === "xlarge") el.style.fontSize = "18px";
      else if (fontChoice === "large") el.style.fontSize = "16px";
      else el.style.fontSize = "";
      if (lineChoice === "loose") el.style.lineHeight = "1.8";
      else if (lineChoice === "relaxed") el.style.lineHeight = "1.6";
      else el.style.lineHeight = "";
    });
    const current =
      JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
    const next = {
      ...current,
      fontSize: fontChoice,
      lineHeight: lineChoice,
      theme: themeChoice,
      snapOrth,
      highlightKeywords: hlKeywords,
      highlightCaseSensitive: hlCase,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    applyTheme(themeChoice);
    applyKeywordHighlights();
    // 矢印再描画（描画方式が変わるため）
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && data.connections) restoreConnections(data.connections);
    } catch {}
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
  // --- ガイドモーダル ---
  (function setupGuide() {
    const gOverlay = document.getElementById("guide-overlay");
    const gOpen = document.getElementById("open-guide-btn");
    const gClose = document.getElementById("close-guide-btn");
    const gCloseFooter = document.getElementById("close-guide-btn-footer");
    function open() {
      gOverlay?.classList.add("active");
      gOverlay?.removeAttribute("aria-hidden");
    }
    function close() {
      gOverlay?.classList.remove("active");
      gOverlay?.setAttribute("aria-hidden", "true");
    }
    gOpen && gOpen.addEventListener("click", open);
    gClose && gClose.addEventListener("click", close);
    gCloseFooter && gCloseFooter.addEventListener("click", close);
    gOverlay &&
      gOverlay.addEventListener("click", (e) => {
        if (e.target === gOverlay) close();
      });
  })();
  // テーマトグルボタン
  (function setupThemeToggle() {
    const btn = document.getElementById("toggle-theme-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
      const current = s.theme || "system";
      // system -> dark -> light -> system の順で切替
      const order = ["system", "dark", "light"];
      const idx = order.indexOf(current);
      const next = order[(idx + 1) % order.length];
      s.theme = next;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      applyTheme(next);
      // 設定モーダルが開いていたら表示更新
      if (selTheme) selTheme.value = next;
    });
    // OS設定の変化に追従（system選択時）
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", () => {
        const s =
          JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
        if (!s.theme || s.theme === "system") applyTheme("system");
      });
    }
  })();
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
  // 入力変更でハイライトを更新（軽負荷のためdebounce）
  (function setupHighlightAutoRefresh() {
    let t = null;
    let composing = false;
    function clearMarks(el) {
      try {
        el.querySelectorAll(".kw-mark").forEach((n) => {
          const p = n.parentNode;
          if (!p) return;
          p.replaceChild(document.createTextNode(n.textContent || ""), n);
        });
        el.normalize && el.normalize();
      } catch {}
    }
    document.addEventListener("compositionstart", (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("flow-block-text")
      )
        composing = true;
    });
    document.addEventListener("compositionend", (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("flow-block-text")
      ) {
        composing = false;
        // IME確定後に再適用（編集中スキップ）
        try {
          applyKeywordHighlights({ skipFocused: true });
        } catch {}
      }
    });
    document.addEventListener("input", (e) => {
      if (
        !(
          e.target &&
          e.target.classList &&
          e.target.classList.contains("flow-block-text")
        )
      )
        return;
      if (composing) return; // IME中は適用しない
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try {
          applyKeywordHighlights({ skipFocused: true });
        } catch {}
      }, 180);
    });
    // フォーカス時はそのブロックのマークを一旦除去（編集しやすく）
    document.addEventListener("focusin", (e) => {
      if (
        !(
          e.target &&
          e.target.classList &&
          e.target.classList.contains("flow-block-text")
        )
      )
        return;
      clearMarks(e.target);
    });
    // 編集終了時（focusoutはバブリングする）にそのブロックのみ再適用
    document.addEventListener("focusout", (e) => {
      if (
        !(
          e.target &&
          e.target.classList &&
          e.target.classList.contains("flow-block-text")
        )
      )
        return;
      const el = e.target;
      setTimeout(() => {
        try {
          applyKeywordHighlights({ onlyEl: el });
        } catch {}
      }, 0);
    });
  })();
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
        // 削除前に接続も消す
        const section = block.closest(".flow-section");
        const layer = ensureLayer(section);
        const bid = block.dataset.blockId;
        if (bid && layer) {
          layer
            .querySelectorAll(`svg[data-from="${bid}"], svg[data-to="${bid}"]`)
            .forEach((s) => s.remove());
        }
        block.remove();
        if (prev) prev.querySelector(".flow-block-text")?.focus();
        else if (next) next.querySelector(".flow-block-text")?.focus();
        // 保存と接続の永続化
        saveAll();
        persistConnections();
        // レイアウト変化に伴う矢印再描画
        try {
          scheduleRepaint();
        } catch {}
      }
    }
  }
  document.querySelectorAll(".flow-blocks").forEach((blocks) => {
    blocks.addEventListener("keydown", onFlowBlockDelete);
  });
  // flow-blockでCtrl+Enterで新ブロック追加＆フォーカス
  function onFlowBlockKeydown(e) {
    const isFlowText = e.target.classList.contains("flow-block-text");
    // Ctrl+Enter で同列に新規ブロック
    if (e.ctrlKey && e.key === "Enter" && isFlowText) {
      e.preventDefault();
      const currentText = e.target;
      const currentBlock = currentText.parentNode;
      const parent = currentBlock.parentNode;
      const newBlock = createFlowBlock("");
      if (currentBlock.nextSibling)
        parent.insertBefore(newBlock, currentBlock.nextSibling);
      else parent.appendChild(newBlock);
      setTimeout(() => newBlock.querySelector(".flow-block-text")?.focus(), 0);
      saveAll();
      persistConnections();
      try {
        scheduleRepaint();
      } catch {}
      return;
    }
    // Alt+Enter で右のロールに新規ブロック＋接続
    if (e.altKey && e.key === "Enter" && isFlowText) {
      e.preventDefault();
      const currentBlock = e.target.closest(".flow-block");
      const flowCol = currentBlock.closest(".flow-col");
      const columns = Array.from(flowCol.parentNode.children);
      const colIdx = columns.indexOf(flowCol);
      // row-reverseのため、視覚上の右は DOM 上の index-1
      if (colIdx <= 0) return; // 右がなければ何もしない
      const rightCol = columns[colIdx - 1];
      const rightWrap = rightCol.querySelector(".flow-blocks");
      if (!rightWrap) return;
      // 位置を合わせて挿入（同じ行インデックスに挿入、なければ末尾）
      const siblings = Array.from(currentBlock.parentNode.children);
      const rowIdx = siblings.indexOf(currentBlock);
      const newBlock = createFlowBlock("");
      const before = rightWrap.children[rowIdx]
        ? rightWrap.children[rowIdx]
        : null;
      if (before) rightWrap.insertBefore(newBlock, before);
      else rightWrap.appendChild(newBlock);
      // 矢印を生成
      const section = rightCol.closest(".flow-section");
      const layer = ensureLayer(section);
      const toCenterX =
        newBlock.getBoundingClientRect().left +
        newBlock.getBoundingClientRect().width / 2;
      const fromCenterX =
        currentBlock.getBoundingClientRect().left +
        currentBlock.getBoundingClientRect().width / 2;
      const sC = getBlockEdgeAnchorInLayer(currentBlock, layer, toCenterX);
      const eC = getBlockEdgeAnchorInLayer(newBlock, layer, fromCenterX);
      const svg = makeLineInLayer(layer, sC.x, sC.y, eC.x, eC.y);
      svg.dataset.from = currentBlock.dataset.blockId;
      svg.dataset.to = newBlock.dataset.blockId;
      layer.appendChild(svg);
      // フォーカスと保存
      setTimeout(() => newBlock.querySelector(".flow-block-text")?.focus(), 0);
      saveAll();
      persistConnections();
      try {
        scheduleRepaint();
      } catch {}
      return;
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
    try {
      scheduleRepaint();
    } catch {}
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
    const settings =
      JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
    const snapOrth = settings.snapOrth !== false; // default true
    const section = layer.closest && layer.closest(".flow-section");
    const isNeg = section && section.id === "negative-flow";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.classList.add(isNeg ? "neg" : "aff");
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
    marker.innerHTML = `<polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />`;
    defs.appendChild(marker);
    svg.appendChild(defs);
    // 当たり判定用/表示用
    let hit, vis;
    if (snapOrth) {
      // 直角（エルボー）: M x1 y1 -> H -> V -> H ... のようなパス
      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
      hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", d);
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "rgba(0,0,0,0)");
      hit.setAttribute("stroke-width", "14");
      hit.setAttribute("stroke-linecap", "round");
      hit.setAttribute("stroke-linejoin", "round");
      hit.classList.add("hit");
      vis = document.createElementNS("http://www.w3.org/2000/svg", "path");
      vis.setAttribute("d", d);
      vis.setAttribute("fill", "none");
      vis.style.stroke = "currentColor";
      vis.setAttribute("stroke-width", "2");
      vis.setAttribute("stroke-linecap", "round");
      vis.setAttribute("stroke-linejoin", "round");
      vis.setAttribute("marker-end", `url(#${markerId})`);
      vis.classList.add("vis");
    } else {
      hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hit.setAttribute("x1", x1);
      hit.setAttribute("y1", y1);
      hit.setAttribute("x2", x2);
      hit.setAttribute("y2", y2);
      hit.setAttribute("stroke", "rgba(0,0,0,0)");
      hit.setAttribute("stroke-width", "14");
      hit.setAttribute("stroke-linecap", "round");
      hit.classList.add("hit");
      vis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      vis.setAttribute("x1", x1);
      vis.setAttribute("y1", y1);
      vis.setAttribute("x2", x2);
      vis.setAttribute("y2", y2);
      vis.style.stroke = "currentColor";
      vis.setAttribute("stroke-width", "2");
      vis.setAttribute("marker-end", `url(#${markerId})`);
      vis.setAttribute("stroke-linecap", "round");
      vis.classList.add("vis");
    }
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
    const settings =
      JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
    const snapOrth = settings.snapOrth !== false; // default true
    const marker = g.querySelector("marker");
    const markerId = marker ? marker.getAttribute("id") : "";
    // 既存の可視/ヒット要素をクリアして描き直す
    g.querySelectorAll("line, path").forEach((el) => el.remove());
    if (snapOrth) {
      const midX = (s.x + p.x) / 2;
      const d = `M ${s.x} ${s.y} H ${midX} V ${p.y} H ${p.x}`;
      const hit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      hit.setAttribute("d", d);
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "rgba(0,0,0,0)");
      hit.setAttribute("stroke-width", "14");
      hit.setAttribute("stroke-linecap", "round");
      hit.setAttribute("stroke-linejoin", "round");
      hit.classList.add("hit");
      const vis = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      vis.setAttribute("d", d);
      vis.setAttribute("fill", "none");
      vis.style.stroke = "currentColor";
      vis.setAttribute("stroke-width", "2");
      vis.setAttribute("stroke-linecap", "round");
      vis.setAttribute("stroke-linejoin", "round");
      if (markerId) vis.setAttribute("marker-end", `url(#${markerId})`);
      vis.classList.add("vis");
      g.appendChild(hit);
      g.appendChild(vis);
    } else {
      const hit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      hit.setAttribute("x1", s.x);
      hit.setAttribute("y1", s.y);
      hit.setAttribute("x2", p.x);
      hit.setAttribute("y2", p.y);
      hit.setAttribute("stroke", "rgba(0,0,0,0)");
      hit.setAttribute("stroke-width", "14");
      hit.setAttribute("stroke-linecap", "round");
      hit.classList.add("hit");
      const vis = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      vis.setAttribute("x1", s.x);
      vis.setAttribute("y1", s.y);
      vis.setAttribute("x2", p.x);
      vis.setAttribute("y2", p.y);
      vis.style.stroke = "currentColor";
      vis.setAttribute("stroke-width", "2");
      vis.setAttribute("stroke-linecap", "round");
      if (markerId) vis.setAttribute("marker-end", `url(#${markerId})`);
      vis.classList.add("vis");
      g.appendChild(hit);
      g.appendChild(vis);
    }
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

  // ===== 並べ替え（左ハンドルでドラッグ） =====
  const reorderDrag = {
    active: false,
    block: null,
    wrap: null,
    targetWrap: null,
    placeholder: null,
    startY: 0,
  };
  function makePlaceholder(h) {
    const ph = document.createElement("div");
    ph.className = "flow-block placeholder";
    ph.style.height = h + "px";
    ph.style.minHeight = h + "px";
    ph.style.boxSizing = "border-box";
    return ph;
  }
  function onReorderHandleDown(e) {
    e.preventDefault();
    const block = e.currentTarget.closest(".flow-block");
    const wrap = block && block.parentElement;
    if (!block || !wrap || !wrap.classList.contains("flow-blocks")) return;
    reorderDrag.active = true;
    reorderDrag.block = block;
    reorderDrag.wrap = wrap;
    reorderDrag.targetWrap = wrap;
    reorderDrag.startY = e.clientY;
    reorderDrag.placeholder = makePlaceholder(block.offsetHeight);
    block.classList.add("dragging");
    // 挿入位置は最初は元の直後
    if (block.nextSibling)
      wrap.insertBefore(reorderDrag.placeholder, block.nextSibling);
    else wrap.appendChild(reorderDrag.placeholder);
    document.body.classList.add("no-select");
    document.addEventListener("mousemove", onReorderMouseMove);
    document.addEventListener("mouseup", onReorderMouseUp);
  }
  function onReorderMouseMove(e) {
    if (!reorderDrag.active) return;
    const y = e.clientY;
    const x = e.clientX;
    // 現在のセクション内でホバーしているカラム(.flow-blocks)を特定
    const section = reorderDrag.block.closest(".flow-section");
    let hoveredWrap = null;
    const els = document.elementsFromPoint(x, y) || [];
    for (const el of els) {
      const w = el.closest && el.closest(".flow-blocks");
      if (w && w.closest(".flow-section") === section) {
        hoveredWrap = w;
        break;
      }
    }
    if (!hoveredWrap) hoveredWrap = reorderDrag.targetWrap || reorderDrag.wrap;
    reorderDrag.targetWrap = hoveredWrap;
    // 対象wrap内の挿入位置を決定（ドラッグ中ブロックとプレースホルダーは除外）
    const children = Array.from(hoveredWrap.children).filter(
      (el) => el !== reorderDrag.block && el !== reorderDrag.placeholder
    );
    let inserted = false;
    for (const child of children) {
      const r = child.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (y < mid) {
        if (reorderDrag.placeholder !== child)
          hoveredWrap.insertBefore(reorderDrag.placeholder, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      // 一番下へ
      if (hoveredWrap.lastElementChild !== reorderDrag.placeholder)
        hoveredWrap.appendChild(reorderDrag.placeholder);
    }
  }
  function onReorderMouseUp() {
    if (!reorderDrag.active) return;
    const { block, placeholder } = reorderDrag;
    document.removeEventListener("mousemove", onReorderMouseMove);
    document.removeEventListener("mouseup", onReorderMouseUp);
    document.body.classList.remove("no-select");
    const destWrap = placeholder && placeholder.parentElement;
    if (block && placeholder && destWrap)
      destWrap.insertBefore(block, placeholder);
    if (placeholder && placeholder.parentElement)
      placeholder.parentElement.removeChild(placeholder);
    if (block) block.classList.remove("dragging");
    reorderDrag.active = false;
    reorderDrag.block = null;
    reorderDrag.wrap = null;
    reorderDrag.targetWrap = null;
    reorderDrag.placeholder = null;
    // 保存と再描画
    try {
      saveAll();
    } catch {}
    try {
      persistConnections();
    } catch {}
    try {
      scheduleRepaint();
    } catch {}
  }

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
  // DFSF 安全化: 最低限のHTMLサニタイズとスキーマ検証
  function sanitizeHtml(html) {
    try {
      if (typeof html !== "string") return "";
      const template = document.createElement("template");
      template.innerHTML = html;
      const allowed = new Set([
        "B",
        "I",
        "U",
        "STRONG",
        "EM",
        "S",
        "MARK",
        "SUP",
        "SUB",
        "BR",
        "A",
        "UL",
        "OL",
        "LI",
        "P",
        "DIV",
        "SPAN",
      ]);
      Array.from(template.content.querySelectorAll("*")).forEach((el) => {
        if (!allowed.has(el.tagName)) {
          const text = document.createTextNode(el.textContent || "");
          el.replaceWith(text);
          return;
        }
        // 危険な属性やスキームを除去
        for (const name of el.getAttributeNames()) {
          const lower = name.toLowerCase();
          if (
            lower.startsWith("on") ||
            lower === "style" ||
            lower === "srcdoc"
          ) {
            el.removeAttribute(name);
            continue;
          }
          if (el.tagName === "A" && lower === "href") {
            const href = el.getAttribute(name) || "";
            const ok = /^(https?:|mailto:|tel:|#|\/)/i.test(href);
            if (!ok || /^\s*javascript:/i.test(href)) el.removeAttribute(name);
            continue;
          }
          if (
            el.tagName !== "A" &&
            (lower === "href" || lower === "target" || lower === "rel")
          ) {
            el.removeAttribute(name);
          }
        }
        if (el.tagName === "A") {
          // 常に安全なrelを付与
          el.setAttribute("rel", "noopener noreferrer nofollow");
        }
      });
      return template.innerHTML;
    } catch {
      return String(html || "");
    }
  }

  function validateDfsfSnapshot(raw) {
    if (!raw || typeof raw !== "object")
      throw new Error("DFSFの形式が不正です");
    const out = {
      version: 1,
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
      sheet: {},
      parts: [],
      scores: Array.isArray(raw.scores)
        ? raw.scores.map((v) => (typeof v === "string" ? v : ""))
        : [],
      connections: { affirmative: [], negative: [] },
      settings: {},
    };
    // version（将来互換のため未指定や異なる場合も許容）
    if (typeof raw.version === "number") out.version = raw.version;
    // sheet
    const s = raw.sheet && typeof raw.sheet === "object" ? raw.sheet : {};
    const sheetKeys = [
      "topic",
      "date",
      "tournament",
      "place",
      "teamAff",
      "teamNeg",
    ];
    sheetKeys.forEach((k) => {
      out.sheet[k] = typeof s[k] === "string" ? s[k] : "";
    });
    // parts
    if (!Array.isArray(raw.parts)) throw new Error("DFSFのpartsが不正です");
    const idRegex = /^[A-Za-z0-9_-]{1,64}$/;
    const idSet = new Set();
    out.parts = raw.parts.map((col) => {
      if (!Array.isArray(col)) return [];
      return col.map((item) => {
        let html = "";
        let id = null;
        if (item && typeof item === "object") {
          if (typeof item.html === "string") html = item.html;
          if (typeof item.id === "string" && idRegex.test(item.id)) {
            id = item.id;
            if (idSet.has(id))
              id = null; // 重複IDは無効化（再採番はcreateFlowBlockに任せる）
            else idSet.add(id);
          }
        } else if (typeof item === "string") {
          html = item;
        }
        return { id, html: sanitizeHtml(html) };
      });
    });
    // connections（参照が存在するもののみ）
    const rawCon =
      raw.connections && typeof raw.connections === "object"
        ? raw.connections
        : {};
    ["affirmative", "negative"].forEach((key) => {
      const arr = Array.isArray(rawCon[key]) ? rawCon[key] : [];
      out.connections[key] = arr
        .filter(
          (c) =>
            c &&
            typeof c === "object" &&
            typeof c.from === "string" &&
            typeof c.to === "string" &&
            idRegex.test(c.from) &&
            idRegex.test(c.to) &&
            idSet.has(c.from) &&
            idSet.has(c.to)
        )
        .map((c) => ({ from: c.from, to: c.to }));
    });
    // settings（既知キーのみ）
    const rawSettings =
      raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    const fontSizes = new Set(["", "large", "xlarge"]);
    const lineHeights = new Set(["", "relaxed", "loose"]);
    const themes = new Set(["system", "light", "dark"]);
    out.settings = {
      fontSize: fontSizes.has(rawSettings.fontSize) ? rawSettings.fontSize : "",
      lineHeight: lineHeights.has(rawSettings.lineHeight)
        ? rawSettings.lineHeight
        : "",
      theme: themes.has(rawSettings.theme)
        ? rawSettings.theme
        : rawSettings.theme
        ? "system"
        : "system",
    };
    return out;
  }

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

  // 直前バックアップ保存/復元
  function backupCurrentSnapshot() {
    try {
      const snap = collectSnapshot();
      const entry = { ts: Date.now(), snapshot: snap };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(entry));
      updateRestoreBtnDisabled();
    } catch {}
  }
  function getLastBackup() {
    try {
      const raw = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null");
      if (raw && raw.snapshot) return raw;
    } catch {}
    return null;
  }
  function restoreLastBackup() {
    const b = getLastBackup();
    if (!b) {
      alert("復元できるバックアップがありません。");
      return;
    }
    if (
      !confirm(
        "直前のバックアップに復元します。現在の内容は失われます。よろしいですか？"
      )
    )
      return;
    try {
      applySnapshot(validateDfsfSnapshot(b.snapshot));
      alert("直前のバックアップを復元しました。");
    } catch (e) {
      console.error(e);
      alert("復元に失敗しました。");
    }
  }
  function ensureRestoreButton() {
    const importBtn = document.getElementById("import-dfsf-btn");
    if (!importBtn) return;
    const parent = importBtn.parentElement || document.body;
    if (document.getElementById("restore-last-backup-btn")) return;
    const btn = document.createElement("button");
    btn.id = "restore-last-backup-btn";
    btn.className = "download-btn";
    btn.textContent = "直前に戻す";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", restoreLastBackup);
    parent.insertBefore(btn, importBtn.nextSibling);
    updateRestoreBtnDisabled();
  }
  function updateRestoreBtnDisabled() {
    const btn = document.getElementById("restore-last-backup-btn");
    if (!btn) return;
    const has = !!getLastBackup();
    btn.disabled = !has;
    btn.style.opacity = has ? "" : "0.6";
    btn.title = has
      ? "直前のバックアップに復元"
      : "復元できるバックアップがありません";
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
          const b = createFlowBlock(sanitizeHtml(it && it.html ? it.html : ""));
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
      applyTheme(snap.settings.theme || "system");
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
    // キーワードハイライト再適用
    try {
      applyKeywordHighlights();
    } catch {}
  }

  // エクスポート
  const exportBtn = document.getElementById("export-dfsf-btn");
  exportBtn &&
    exportBtn.addEventListener("click", () => {
      const snap = collectSnapshot();
      const bom = "\uFEFF"; // UTF-8 BOM
      const blob = new Blob([bom, JSON.stringify(snap, null, 2)], {
        type: "application/json;charset=utf-8",
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
  // 復元ボタンをUIに追加
  ensureRestoreButton();
  importInput &&
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // サイズ/拡張子チェック
      const lowerName = (file.name || "").toLowerCase();
      if (!(lowerName.endsWith(".dfsf") || lowerName.endsWith(".json"))) {
        alert(".dfsf または .json ファイルを選択してください。");
        e.target.value = "";
        return;
      }
      if (file.size > MAX_IMPORT_SIZE) {
        alert("ファイルが大きすぎます。5MB以下のファイルを選択してください。");
        e.target.value = "";
        return;
      }
      try {
        const text = await file.text();
        const cleaned = text.replace(/^\uFEFF/, ""); // 先頭BOMを除去
        const json = JSON.parse(cleaned);
        const validated = validateDfsfSnapshot(json);
        // インポート概要
        const rawConnCount =
          ((json.connections && json.connections.affirmative?.length) || 0) +
          ((json.connections && json.connections.negative?.length) || 0);
        const valConnCount =
          validated.connections.affirmative.length +
          validated.connections.negative.length;
        const partsCount = Array.isArray(validated.parts)
          ? validated.parts.length
          : 0;
        const blocksCount = Array.isArray(validated.parts)
          ? validated.parts.reduce(
              (n, col) => n + (Array.isArray(col) ? col.length : 0),
              0
            )
          : 0;
        const ignored = Math.max(0, rawConnCount - valConnCount);
        const ok = confirm(
          `読み込む内容の概要:\n- 列: ${partsCount}\n- ブロック: ${blocksCount}\n- 接続: ${valConnCount}${
            ignored ? ` (無視: ${ignored})` : ""
          }\n\n現在の内容は上書きされます。続行しますか？`
        );
        if (!ok) return;
        // 現在の状態をバックアップ
        backupCurrentSnapshot();
        applySnapshot(validated);
        alert("読み込みが完了しました。");
      } catch (err) {
        const msg =
          err && err.message
            ? `読み込みに失敗しました: ${err.message}`
            : "読み込みに失敗しました。ファイル形式をご確認ください。";
        alert(msg);
        console.error(err);
      } finally {
        e.target.value = "";
      }
    });

  // --- 共有リンク生成/読込 ---
  (function setupShareLink() {
    const btn = document.getElementById("share-link-btn");
    async function buildUrlFromCurrent() {
      const snap = collectSnapshot();
      const text = JSON.stringify(snap);
      // 圧縮優先、失敗時は通常Base64
      const comp = await compressToU8(text);
      let hash = "";
      if (comp && comp.length) {
        hash = "fsz=" + b64UrlEncode(comp);
      } else {
        hash = "fs=" + jsonToBase64(snap);
      }
      const base = location.href.replace(/#.*/, "");
      const url = base + "#" + hash;
      return url;
    }
    async function copyShareLink() {
      try {
        const url = await buildUrlFromCurrent();
        const btnEl = document.getElementById("share-link-btn");
        let copied = false;
        if (
          window.isSecureContext &&
          navigator.clipboard &&
          navigator.clipboard.writeText
        ) {
          try {
            await navigator.clipboard.writeText(url);
            copied = true;
          } catch {}
        }
        if (!copied) {
          // レガシーコピー
          try {
            const ta = document.createElement("textarea");
            ta.value = url;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "-1000px";
            document.body.appendChild(ta);
            ta.select();
            copied = document.execCommand("copy");
            document.body.removeChild(ta);
          } catch {}
        }
        if (!copied) {
          // 最後の手段: ユーザーに手動コピーしてもらう
          prompt("以下のURLをコピーしてください:", url);
        }
        // フィードバック
        if (btnEl) {
          const prev = btnEl.textContent;
          btnEl.textContent = copied ? "コピーしました" : "URLを表示しました";
          btnEl.disabled = true;
          setTimeout(() => {
            btnEl.textContent = prev;
            btnEl.disabled = false;
          }, 1600);
        } else {
          alert(
            copied ? "共有リンクをコピーしました" : "共有リンクを表示しました"
          );
        }
      } catch (e) {
        console.error(e);
        alert("共有リンクの作成に失敗しました");
      }
    }
    btn && btn.addEventListener("click", copyShareLink);

    // ページ読み込み時にハッシュがあれば読込
    (async function importFromHash() {
      const h = location.hash.replace(/^#/, "");
      if (!h) return;
      try {
        let json = null;
        if (h.startsWith("fsz=")) {
          const b64 = h.slice(4);
          const u8 = b64UrlDecodeToU8(b64);
          const text = await decompressToText(u8);
          if (text) json = JSON.parse(text);
        } else if (h.startsWith("fs=")) {
          const b64 = h.slice(3);
          json = base64ToJson(b64);
        }
        if (json) {
          const validated = validateDfsfSnapshot(json);
          const ok = confirm(
            "共有リンクの内容を読み込みます。現在の内容は上書きされます。続行しますか？"
          );
          if (!ok) return;
          backupCurrentSnapshot();
          applySnapshot(validated);
          // 読み込んだらハッシュをクリーンアップ（履歴は残さない）
          history.replaceState(null, "", location.pathname + location.search);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  })();
  // フローをtxtでダウンロード（Aff/Neg両方をまとめて）
  function buildFlowText(sectionEl, sectionLabel) {
    const cols = Array.from(sectionEl.querySelectorAll(".flow-col")).reverse();
    let out = `=== ${sectionLabel} ===\n`;
    cols.forEach((col) => {
      const title = (col.querySelector(".col-title")?.innerText || "").replace(
        /\n/g,
        " "
      );
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
  const oldTxtBtn = document.getElementById("download-flow-btn");
  if (oldTxtBtn) {
    oldTxtBtn.addEventListener("click", () => {
      let txt = "";
      txt += buildFlowText(affFlow, "肯定側");
      txt += buildFlowText(negFlow, "否定側");
      const filename = "flows.txt";
      const bom = "\uFEFF"; // UTF-8 BOM
      const blob = new Blob([bom, txt], { type: "text/plain;charset=utf-8" });
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
  }

  // 追加出力: Markdown / Scores CSV / Print
  (function setupExtraExports() {
    // ヘルパーを外出しし、複数メニューから再利用
    function gatherFlowsAsMarkdown() {
      function sectionToMd(sectionEl, sectionLabel) {
        const cols = Array.from(
          sectionEl.querySelectorAll(".flow-col")
        ).reverse();
        let out = `# ${sectionLabel}\n`;
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
          out += `\n## ${title}\n`;
          lines.forEach((l) => {
            out += `- ${l}\n`;
          });
        });
        return out;
      }
      const meta = {
        topic: document.querySelector(".sheet-topic")?.value || "",
        date: document.querySelector(".sheet-date")?.value || "",
        tournament: document.querySelector(".sheet-tournament")?.value || "",
        place: document.querySelector(".sheet-place")?.value || "",
        teamAff: document.querySelector(".sheet-team-affirmative")?.value || "",
        teamNeg: document.querySelector(".sheet-team-negative")?.value || "",
      };
      let md = `# ディベート・フローシート レポート\n\n`;
      md += `- 論題: ${meta.topic}\n`;
      md += `- 日付: ${meta.date}\n`;
      md += `- 大会: ${meta.tournament}\n`;
      md += `- 会場: ${meta.place}\n`;
      md += `- 肯定側: ${meta.teamAff}\n`;
      md += `- 否定側: ${meta.teamNeg}\n`;
      md += `\n---\n\n`;
      md += sectionToMd(document.getElementById("affirmative-flow"), "肯定側");
      md += `\n---\n\n`;
      md += sectionToMd(document.getElementById("negative-flow"), "否定側");
      // スコア
      const table = document.querySelector(".score-table");
      if (table) {
        md += `\n---\n\n# スコア\n\n`;
        const rows = Array.from(table.tBodies[0]?.rows || []);
        md += `| 役割 | 肯定側 | 否定側 |\n|---|---:|---:|\n`;
        rows.forEach((r) => {
          const label = (r.cells[0]?.innerText || "").trim();
          const aff = (r.cells[1]?.innerText || "").trim();
          const neg = (r.cells[2]?.innerText || "").trim();
          md += `| ${label} | ${aff} | ${neg} |\n`;
        });
      }
      return md;
    }

    function gatherScoresCsv() {
      const table = document.querySelector(".score-table");
      let csv = "役割,肯定側,否定側\r\n";
      if (table) {
        const rows = Array.from(table.tBodies[0]?.rows || []);
        rows.forEach((r) => {
          const label = (r.cells[0]?.innerText || "")
            .trim()
            .replaceAll('"', '""');
          const aff = (r.cells[1]?.innerText || "")
            .trim()
            .replaceAll('"', '""');
          const neg = (r.cells[2]?.innerText || "")
            .trim()
            .replaceAll('"', '""');
          csv += `"${label}","${aff}","${neg}"\r\n`;
        });
      }
      return csv;
    }

    function downloadBlob(text, filename, mime) {
      const bom = "\uFEFF";
      const blob = new Blob([bom, text], { type: `${mime};charset=utf-8` });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 100);
    }

    // 旧個別ボタンが存在した場合はそのまま動作
    const btnMd = document.getElementById("export-md-btn");
    const btnCsv = document.getElementById("export-scores-csv-btn");
    const btnPrint = document.getElementById("print-report-btn");
    if (btnMd)
      btnMd.addEventListener("click", () => {
        const md = gatherFlowsAsMarkdown();
        const name = `flowsheet_${new Date().toISOString().slice(0, 10)}.md`;
        downloadBlob(md, name, "text/markdown");
      });
    if (btnCsv)
      btnCsv.addEventListener("click", () => {
        const csv = gatherScoresCsv();
        const name = `scores_${new Date().toISOString().slice(0, 10)}.csv`;
        downloadBlob(csv, name, "text/csv");
      });
    if (btnPrint)
      btnPrint.addEventListener("click", () => {
        window.print();
      });

    // 新しい統合メニューボタン
    const btnFlowMenu = document.getElementById("export-flow-menu-btn");
    const btnScoreMenu = document.getElementById("export-score-menu-btn");

    function showMenu(buttonEl, items) {
      // 既存メニューを閉じる
      document.querySelectorAll(".popup-menu").forEach((m) => m.remove());
      const menu = document.createElement("div");
      menu.className = "popup-menu";
      menu.style.position = "absolute";
      menu.style.zIndex = "1000";
      const r = buttonEl.getBoundingClientRect();
      menu.style.left = `${r.left + window.scrollX}px`;
      menu.style.top = `${r.bottom + window.scrollY + 6}px`;
      menu.style.background =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--panel")
          .trim() || "#fff";
      const muted =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--muted")
          .trim() || "#ccc";
      menu.style.border = `1px solid ${muted}`;
      menu.style.boxShadow = "0 4px 12px var(--shadow)";
      menu.style.borderRadius = "6px";
      menu.style.minWidth = "220px";
      menu.style.fontSize = "14px";
      items.forEach((it) => {
        const a = document.createElement("button");
        a.type = "button";
        a.textContent = it.label;
        a.style.display = "block";
        a.style.width = "100%";
        a.style.padding = "10px 12px";
        a.style.textAlign = "left";
        a.style.background = "transparent";
        a.style.border = "none";
        a.style.cursor = "pointer";
        a.addEventListener("click", () => {
          it.onClick();
          menu.remove();
        });
        a.addEventListener(
          "mouseenter",
          () =>
            (a.style.background =
              "color-mix(in oklab, var(--text) 8%, transparent)")
        );
        a.addEventListener(
          "mouseleave",
          () => (a.style.background = "transparent")
        );
        menu.appendChild(a);
      });
      document.body.appendChild(menu);
      const onDoc = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== buttonEl) {
          menu.remove();
          document.removeEventListener("mousedown", onDoc);
          window.removeEventListener("resize", onDoc);
          window.removeEventListener("scroll", onDoc, true);
        }
      };
      setTimeout(() => {
        document.addEventListener("mousedown", onDoc);
        window.addEventListener("resize", onDoc);
        window.addEventListener("scroll", onDoc, true);
      }, 0);
    }

    btnFlowMenu &&
      btnFlowMenu.addEventListener("click", (e) => {
        const target = e.currentTarget;
        showMenu(target, [
          {
            label: "フローをテキストでダウンロード (.txt)",
            onClick: () => {
              let txt = "";
              txt += buildFlowText(affFlow, "肯定側");
              txt += buildFlowText(negFlow, "否定側");
              const bom = "\uFEFF";
              const blob = new Blob([bom, txt], {
                type: "text/plain;charset=utf-8",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `flows.txt`;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
              }, 100);
            },
          },
          {
            label: "レポートをMarkdownで保存 (.md)",
            onClick: () => {
              const md = gatherFlowsAsMarkdown();
              const name = `flowsheet_${new Date()
                .toISOString()
                .slice(0, 10)}.md`;
              downloadBlob(md, name, "text/markdown");
            },
          },
        ]);
      });

    btnScoreMenu &&
      btnScoreMenu.addEventListener("click", (e) => {
        const target = e.currentTarget;
        showMenu(target, [
          {
            label: "スコアをCSVで保存 (.csv)",
            onClick: () => {
              const csv = gatherScoresCsv();
              const name = `scores_${new Date()
                .toISOString()
                .slice(0, 10)}.csv`;
              downloadBlob(csv, name, "text/csv");
            },
          },
          {
            label: "印刷 / PDF 保存",
            onClick: () => {
              window.print();
            },
          },
        ]);
      });
  })();
  // 文字起こし（Chrome Web Speech API）
  (function setupTranscribe() {
    const area = document.getElementById("transcribe-text");
    const btnStart = document.getElementById("transcribe-start");
    const btnStop = document.getElementById("transcribe-stop");
    const btnClear = document.getElementById("transcribe-clear");
    const selLang = document.getElementById("transcribe-lang");
    const status = document.getElementById("transcribe-status");
    const autoScroll = document.getElementById("transcribe-autoscroll");
    if (!area || !btnStart || !btnStop || !btnClear || !selLang || !status)
      return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      status.textContent =
        "このブラウザでは文字起こしが利用できません（Chrome推奨）";
      btnStart.disabled = true;
      btnStop.disabled = true;
      return;
    }
    let recog = null;
    let running = false;
    function setStatus(t) {
      status.textContent = t || "";
    }
    function appendText(txt) {
      if (!txt) return;
      const wasEmpty = area.innerText.trim().length === 0;
      area.innerText = wasEmpty ? txt : area.innerText + "\n" + txt;
      if (autoScroll && autoScroll.checked) area.scrollTop = area.scrollHeight;
      // 保存
      try {
        saveAll();
      } catch {}
    }
    function start() {
      if (running) return;
      recog = new SpeechRecognition();
      recog.lang = selLang.value || "ja-JP";
      recog.interimResults = true;
      recog.continuous = true;
      let interim = "";
      recog.onstart = () => {
        running = true;
        setStatus("文字起こし中…");
      };
      recog.onerror = (e) => {
        setStatus("エラー: " + (e.error || "unknown"));
      };
      recog.onend = () => {
        running = false;
        setStatus("停止");
      };
      recog.onresult = (e) => {
        let finalText = "";
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = res[0] && res[0].transcript ? res[0].transcript.trim() : "";
          if (!t) continue;
          if (res.isFinal) finalText += (finalText ? " " : "") + t;
          else interim += (interim ? " " : "") + t;
        }
        if (finalText) appendText(finalText);
        if (interim) setStatus("文字起こし中… " + interim);
        else if (running) setStatus("文字起こし中…");
      };
      try {
        recog.start();
      } catch {}
    }
    function stop() {
      try {
        recog && recog.stop();
      } catch {}
    }
    function clear() {
      area.innerText = "";
      try {
        saveAll();
      } catch {}
    }
    btnStart.addEventListener("click", start);
    btnStop.addEventListener("click", stop);
    btnClear.addEventListener("click", clear);
  })();
  // フッター年号設定
  (function setCopyright() {
    const y = document.getElementById("copyright-year");
    if (y) y.textContent = String(new Date().getFullYear());
  })();

  // ===== 検索 =====
  (function setupSearch() {
    const inp = document.getElementById("search-query");
    const btnPrev = document.getElementById("search-prev");
    const btnNext = document.getElementById("search-next");
    const btnClear = document.getElementById("search-clear");
    const status = document.getElementById("search-status");
    if (!inp || !btnPrev || !btnNext || !btnClear || !status) return;

    let hits = [];
    let idx = -1;

    function clearMarks() {
      document.querySelectorAll(".mark-hit").forEach((el) => {
        el.classList.remove("mark-hit", "current");
      });
    }

    function updateStatus() {
      status.textContent = hits.length ? `${idx + 1}/${hits.length}` : "0/0";
    }

    function collectHits(q) {
      clearMarks();
      hits = [];
      idx = -1;
      if (!q) {
        updateStatus();
        return;
      }
      const needle = q.toLowerCase();
      const blocks = document.querySelectorAll(".flow-block .flow-block-text");
      blocks.forEach((b) => {
        const text = (b.innerText || "").toLowerCase();
        if (!text.includes(needle)) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        // 粗いマーク: 単にブロック全体にクラスを付ける（パフォーマンスと簡潔さ優先）
        b.classList.add("mark-hit");
        hits.push(b);
      });
      if (hits.length) {
        idx = 0;
        hits[0].classList.add("current");
        scrollIntoView(hits[0]);
      }
      updateStatus();
    }

    function scrollIntoView(el) {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY - 80; // ヘッダー分オフセット
      window.scrollTo({ top, behavior: "smooth" });
    }

    function move(delta) {
      if (!hits.length) return;
      hits[idx]?.classList.remove("current");
      idx = (idx + delta + hits.length) % hits.length;
      const el = hits[idx];
      el.classList.add("current");
      scrollIntoView(el);
      updateStatus();
    }

    function clearAll() {
      inp.value = "";
      clearMarks();
      hits = [];
      idx = -1;
      updateStatus();
      inp.focus();
    }

    inp.addEventListener("input", () => collectHits(inp.value.trim()));
    btnNext.addEventListener("click", () => move(1));
    btnPrev.addEventListener("click", () => move(-1));
    btnClear.addEventListener("click", clearAll);

    // Enter/Shift+Enterで移動
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) move(-1);
        else move(1);
      }
    });
    // Alt+Fで検索フォーカス
    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        inp.focus();
        inp.select();
      }
    });
  })();
});
