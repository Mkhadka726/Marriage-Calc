"use strict";

(() => {
  const status = document.getElementById("pwa-status");
  const install = document.getElementById("install-app-button");
  const update = document.getElementById("update-app-button");
  let installPrompt = null;
  let registration = null;
  let updateRequested = false;

  function report(message) {
    status.textContent = message;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });

  install.addEventListener("click", async () => {
    if (!installPrompt) {
      report("Use your browser's Add to Home Screen or Install app menu.");
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    install.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      report(choice.outcome === "accepted"
        ? "Installation accepted. Your browser will complete the installation."
        : "Installation dismissed. You can still use the website.");
    } catch (error) {
      report(`Installation could not start: ${error.message}. Use the browser's install menu.`);
    }
  });

  window.addEventListener("appinstalled", () => {
    install.hidden = true;
    report("Installed. Export regular session backups.");
  });

  if (!["https:", "http:"].includes(location.protocol)) {
    report("Installation and offline mode need the live HTTPS website. They are unavailable from this local file.");
    return;
  }
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    report("Offline installation is not supported here. Use a supported browser and the HTTPS link.");
    return;
  }

  function offerUpdate() {
    if (!registration?.waiting) return;
    update.hidden = false;
    report("An update is available. Finish your action, close other app tabs and save before updating.");
  }

  update.addEventListener("click", () => {
    if (!registration?.waiting) {
      update.hidden = true;
      report("No waiting update. Reopen the app to check again.");
      return;
    }
    if (typeof saveActiveSession !== "function" || !saveActiveSession()) {
      report("The game could not be saved. Export a backup before closing or updating.");
      return;
    }
    updateRequested = true;
    update.disabled = true;
    report("Saving complete. Waiting for the update to activate...");
    registration.waiting.postMessage({ type: "REQUEST_UPDATE" });
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "UPDATE_BLOCKED") {
      updateRequested = false;
      update.disabled = false;
      report("Close other Marriage Table tabs or app windows, then try the update again.");
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested) location.reload();
  });

  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then((value) => {
      registration = value;
      offerUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") offerUpdate();
          if (worker.state === "redundant" && !registration.active) {
            report("Offline setup failed. Stay online and reopen the app to retry.");
          }
        });
      });
      return navigator.serviceWorker.ready;
    })
    .then(() => {
      if (!registration.waiting) {
        report("Ready for offline use on this browser. Keep session backups; device storage can be cleared.");
      }
    })
    .catch((error) => {
      report(`Offline setup failed: ${error.message}. The app still needs an internet connection.`);
    });
})();
