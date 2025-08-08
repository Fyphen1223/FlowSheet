// FlowSheet main.js
// 必要に応じて将来的に機能追加可能
// 例: 入力内容の保存や矢印描画など

// ここでは最低限の初期化のみ

document.addEventListener("DOMContentLoaded", () => {
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
  });
  btnNeg.addEventListener("click", () => {
    btnNeg.classList.add("active");
    btnAff.classList.remove("active");
    affFlow.style.display = "none";
    negFlow.style.display = "";
  });
  // フローをtxtでダウンロード
  document.getElementById("download-flow-btn").addEventListener("click", () => {
    // どちらのフローが表示中か判定
    const isAff = affFlow.style.display !== "none";
    const flowSection = isAff ? affFlow : negFlow;
    // 各カラムのタイトルと内容を取得（逆順で出力）
    const cols = Array.from(
      flowSection.querySelectorAll(".flow-col")
    ).reverse();
    let txt = "";
    cols.forEach((col) => {
      const title = col
        .querySelector(".col-title")
        .innerText.replace(/\n/g, " ");
      const content = col.querySelector(".flow-content").innerText.trim();
      txt += `【${title}】\n${content}\n\n`;
    });
    // ファイル名
    const filename = isAff ? "affirmative_flow.txt" : "negative_flow.txt";
    // ダウンロード処理
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
