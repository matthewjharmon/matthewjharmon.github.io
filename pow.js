// pow.js (static, client-side PoW gate)
(function () {
  const DOWNLOAD_URL = atob("aHR0cHM6Ly9tYXR0aGV3amhhcm1vbi5jb20vTWF0dGhld0pIYXJtb24ucGRm");
  // Four leading zeroes keep verification under a few seconds on typical hardware.
  const TARGET_PREFIX = "0000";
  const root = typeof self !== "undefined" ? self : window;
  const trigger = document.getElementById("resume-button");
  const gate = document.getElementById("resume-gate");
  const closeBtn = document.getElementById("resume-gate-close");
  const statusEl = document.getElementById("resume-gate-status");
  const meter = document.getElementById("resume-gate-meter");
  const retryBtn = document.getElementById("resume-gate-retry");
  const note = document.getElementById("resume-note");
  const defaultNote = note ? note.textContent.trim() : "";

  const cryptoObj = root.crypto || root.msCrypto || null;
  const subtle = cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === "function" ? cryptoObj.subtle : null;
  const hasTextEncoder = typeof TextEncoder !== "undefined";
  const canRunPoW = !!(subtle && hasTextEncoder);
  const log10 = Math.log10 || function (value) { return Math.log(value) / Math.LN10; };

  if (!trigger || !gate || !statusEl || !meter) {
    return;
  }

  function setLoading(isLoading) {
    if (!trigger) {
      return;
    }
    if (isLoading) {
      trigger.classList.add("is-loading");
      trigger.setAttribute("aria-disabled", "true");
    } else {
      trigger.classList.remove("is-loading");
      trigger.removeAttribute("aria-disabled");
    }
  }

  function updateNote(message) {
    if (!note) {
      return;
    }
    if (message) {
      note.textContent = message;
    } else if (defaultNote) {
      note.textContent = defaultNote;
    }
  }

  function makeAbort() {
    let aborted = false;
    return {
      get aborted() {
        return aborted;
      },
      abort() {
        aborted = true;
      }
    };
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function getNow() {
    if (typeof performance !== "undefined" && performance && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function showGate() {
    gate.hidden = false;
    gate.removeAttribute("hidden");
    gate.style.display = "block";
    document.documentElement.style.overflow = "hidden";
  }

  function hideGate() {
    gate.hidden = true;
    gate.setAttribute("hidden", "");
    gate.style.display = "none";
    document.documentElement.style.overflow = "";
  }

  function resetGate() {
    statusEl.textContent = "Preparing challenge...";
    meter.style.width = "0%";
    if (retryBtn) {
      retryBtn.hidden = true;
    }
  }

  function unsupportedFallback() {
    showGate();
    setLoading(false);
    updateNote("Verification requires a modern browser.");
    statusEl.textContent = "This browser cannot run the required proof-of-work. Please switch to a modern browser with Web Crypto support.";
    meter.style.width = "0%";
    if (retryBtn) {
      retryBtn.hidden = true;
    }
  }

  async function runProofOfWork(signal) {
    const challengeSource = cryptoObj && typeof cryptoObj.randomUUID === "function"
      ? cryptoObj.randomUUID()
      : Math.random().toString(36).slice(2);
    const challenge = challengeSource.replace(/-/g, "");
    let nonce = 0;
    const encoder = new TextEncoder();
    const start = getNow();

    while (!signal.aborted) {
      const payload = encoder.encode(challenge + ":" + nonce);
      const digest = await subtle.digest("SHA-256", payload);
      const hex = toHex(digest);
      if (hex.startsWith(TARGET_PREFIX)) {
        const elapsed = ((getNow() - start) / 1000).toFixed(2);
        return { challenge, nonce, hash: hex, elapsed };
      }
      nonce += 1;
      if (nonce % 200 === 0) {
        const progress = Math.min(100, log10(nonce + 10) * 20);
        meter.style.width = progress + "%";
        statusEl.textContent = "Working... " + nonce.toLocaleString() + " attempts";
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
    }
    throw new Error("aborted");
  }

  function startVerification() {
    if (trigger.getAttribute("aria-disabled") === "true") {
      return;
    }

    setLoading(true);
    updateNote("Running proof-of-work…");

    if (!canRunPoW) {
      unsupportedFallback();
      return;
    }

    resetGate();
    showGate();
    const controller = makeAbort();

    if (closeBtn) {
      closeBtn.onclick = function () {
        controller.abort();
        hideGate();
        setLoading(false);
        updateNote();
      };
    }

    if (retryBtn) {
      retryBtn.onclick = function () {
        controller.abort();
        hideGate();
        setLoading(false);
        updateNote();
        startVerification();
      };
    }

    runProofOfWork(controller)
      .then(function (result) {
        statusEl.textContent = "Verified in " + result.elapsed + "s — starting download...";
        meter.style.width = "100%";
        updateNote("Verified — starting download…");
        setTimeout(function () {
          hideGate();
          setLoading(false);
          updateNote();
          window.location.href = DOWNLOAD_URL;
        }, 400);
      })
      .catch(function (err) {
        if (err && err.message === "aborted") {
          setLoading(false);
          updateNote();
          return;
        }
        if (typeof console !== "undefined" && console && typeof console.error === "function") {
          console.error("Resume gate PoW failure", err);
        }
        setLoading(false);
        updateNote("Verification failed — try again.");
        statusEl.textContent = "Something went wrong. Please try again.";
        if (retryBtn) {
          retryBtn.hidden = false;
        }
        meter.style.width = "0%";
      });
  }

  trigger.addEventListener("click", function (event) {
    event.preventDefault();
    startVerification();
  });
})();
