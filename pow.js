// pow.js (static, client-side PoW gate)
(function () {
  // Base64-encoded resume URL; not visible in HTML source
  const DOWNLOAD_URL = atob("aHR0cHM6Ly9tYXR0aGV3amhhcm1vbi5jb20vTWF0dGhld0pIYXJtb24ucGRm");
  const targetPrefix = "00000"; // difficulty (increase to "000000" to harden)

  const button = document.getElementById("resume-button");
  const gate = document.getElementById("resume-gate");
  const closeBtn = document.getElementById("resume-gate-close");
  const statusEl = document.getElementById("resume-gate-status");
  const meter = document.getElementById("resume-gate-meter");
  const retry = document.getElementById("resume-gate-retry");

  // Simple abort controller object compatible with our loop
  function makeAbort() {
    let aborted = false;
    return {
      get aborted() { return aborted; },
      abort() { aborted = true; }
    };
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function showGate() {
    gate.hidden = false;
    document.documentElement.style.overflow = "hidden";
  }
  function hideGate() {
    gate.hidden = true;
    document.documentElement.style.overflow = "";
  }
  function resetGate() {
    statusEl.textContent = "Preparing challenge...";
    meter.style.width = "0%";
    retry.hidden = true;
  }

  async function runProofOfWork(signal) {
    const challenge = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/-/g, "");
    let nonce = 0;
    const encoder = new TextEncoder();
    const start = (performance && performance.now) ? performance.now() : Date.now();

    while (!signal.aborted) {
      const payload = encoder.encode(challenge + ":" + nonce);
      const digest = await crypto.subtle.digest("SHA-256", payload);
      const hex = toHex(digest);
      if (hex.startsWith(targetPrefix)) {
        const elapsed = (((performance && performance.now ? performance.now() : Date.now()) - start) / 1000).toFixed(2);
        return { challenge, nonce, hash: hex, elapsed };
      }
      nonce += 1;
      if (nonce % 200 === 0) {
        const progress = Math.min(100, Math.log10(nonce + 10) * 20);
        meter.style.width = progress + "%";
        statusEl.textContent = "Working... " + nonce.toLocaleString() + " attempts";
        // Yield to UI
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    throw new Error("aborted");
  }

  function startVerification() {
    resetGate();
    showGate();
    const controller = makeAbort();

    if (closeBtn) closeBtn.onclick = function () { controller.abort(); hideGate(); };
    if (retry) retry.onclick = function () { controller.abort(); hideGate(); startVerification(); };

    runProofOfWork(controller)
      .then(function (result) {
        statusEl.textContent = "Verified in " + result.elapsed + "s — starting download...";
        meter.style.width = "100%";
        setTimeout(function () {
          hideGate();
          window.location.href = DOWNLOAD_URL;
        }, 400);
      })
      .catch(function (err) {
        if (err && err.message === "aborted") return;
        statusEl.textContent = "Something went wrong. Please try again.";
        retry.hidden = false;
        meter.style.width = "0%";
      });
  }

  if (button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      startVerification();
    });
  }
})();
