import { Game } from "./game.js";

function showFatal(error) {
  const message = document.createElement("div");
  message.style.cssText = `
    position:fixed;inset:0;z-index:100;display:grid;place-items:center;
    padding:32px;background:#040606;color:#d7ddd6;font-family:monospace;
    text-align:center;line-height:1.7;`;
  message.innerHTML = `
    <div>
      <p style="letter-spacing:.3em;color:#88928a">NO WAY OUT</p>
      <h1 style="font-size:22px;font-weight:400">Die Spielansicht konnte nicht gestartet werden.</h1>
      <p style="max-width:560px;color:#79837b;font-size:12px">
        ${String(error?.message || error).replace(/[<>&]/g, "")}
      </p>
      <p style="color:#59635e;font-size:11px">Bitte einen aktuellen Browser mit WebGL-Unterstützung verwenden.</p>
    </div>`;
  document.body.append(message);
}

async function main() {
  const canvas = document.getElementById("viewport");
  try {
    const game = new Game(canvas);
    await game.init();
  } catch (error) {
    console.error(error);
    showFatal(error);
  }
}

main();
