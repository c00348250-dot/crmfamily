"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorStandalone = Navigator & { standalone?: boolean };

export function PwaInstallButton({ mode = "sidebar" }: { mode?: "sidebar" | "login" }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorStandalone).standalone);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    setInstalled(standalone);

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setInstalled(false);
    }

    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
      setShowIOSHelp(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!promptEvent && !isIOS)) return null;

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }

    if (isIOS) setShowIOSHelp(true);
  }

  return (
    <>
      <button
        type="button"
        className={`pwa-install-button ${mode === "login" ? "pwa-install-login" : "pwa-install-sidebar"}`}
        onClick={install}
      >
        <span aria-hidden="true">⇩</span>
        <span>{mode === "login" ? "Instalar aplicativo" : "Instalar app"}</span>
      </button>

      {showIOSHelp ? (
        <div className="pwa-modal-backdrop" role="presentation" onClick={() => setShowIOSHelp(false)}>
          <section className="pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pwa-modal-close" aria-label="Fechar" onClick={() => setShowIOSHelp(false)}>×</button>
            <span className="pwa-modal-icon" aria-hidden="true">↥</span>
            <h2 id="pwa-ios-title">Instalar CRM Family</h2>
            <p>No iPhone ou iPad, a instalação é feita pelo menu do Safari.</p>
            <ol>
              <li>Toque no botão <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
              <li>Confirme em <strong>Adicionar</strong>.</li>
            </ol>
            <button type="button" className="primary" onClick={() => setShowIOSHelp(false)}>Entendi</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
