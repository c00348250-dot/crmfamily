"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    async function register() {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await registration.update();
      } catch (error) {
        console.error("Não foi possível registrar o PWA:", error);
      }
    }

    function refreshWorker() {
      registration?.update().catch(() => undefined);
    }

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    document.addEventListener("visibilitychange", refreshWorker);
    window.addEventListener("online", refreshWorker);

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", refreshWorker);
      window.removeEventListener("online", refreshWorker);
    };
  }, []);

  return null;
}
