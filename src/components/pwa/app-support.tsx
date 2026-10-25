"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, WifiOff, X } from "lucide-react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
function subscribeConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function subscribeDisplay(callback: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const subscribeBrowser = () => () => {};
const isOnline = () => navigator.onLine;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const getPlatform = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "other";

export function AppSupport() {
  const online = useSyncExternalStore(subscribeConnection, isOnline, () => true);
  const standalone = useSyncExternalStore(subscribeDisplay, isStandalone, () => false);
  const platform = useSyncExternalStore(subscribeBrowser, getPlatform, () => "other");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const afterInstall = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", afterInstall);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", afterInstall);
    };
  }, []);

  async function install() {
    if (!installEvent) { setShowHelp(value => !value); return; }
    setInstalling(true);
    setMessage("");
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } catch {
      setMessage("Tarayıcı menüsündeki Ana Ekrana Ekle veya Uygulamayı yükle seçeneğini kullanabilirsiniz.");
    } finally { setInstalling(false); }
  }

  return <>
    {!online ? <p role="status" className="flex items-center justify-center gap-2 bg-amber-950 px-4 py-3 text-sm text-amber-100"><WifiOff size={18} aria-hidden="true" />İnternet bağlantısı yok. Yükleme ve kayıt işlemleri için yeniden bağlanın.</p> : null}
    {!standalone && !installed ? <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-zinc-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs">Viva La Crema’yı telefonunuzun ana ekranına ekleyin.</p>
        <button type="button" disabled={installing} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-zinc-800 disabled:opacity-50" aria-expanded={showHelp} aria-controls="app-install-help" onClick={() => void install()}><Download size={16} aria-hidden="true" />{installing ? "Açılıyor…" : "Uygulama olarak yükle"}</button>
      </div>
      {showHelp ? <div id="app-install-help" className="relative mt-2 rounded-xl border border-zinc-700 p-4 pr-12 text-sm">
        <button type="button" aria-label="Yükleme adımlarını kapat" className="absolute right-1 top-1 p-3" onClick={() => setShowHelp(false)}><X size={18} /></button>
        <p>{platform === "ios" ? "iPhone/iPad: Safari’de Paylaş düğmesine dokunun, Ana Ekrana Ekle’yi seçin ve Ekle’ye dokunun." : "Tarayıcı menüsünden Uygulamayı yükle veya Ana Ekrana Ekle’yi seçin. Bilgisayarda adres çubuğundaki yükleme simgesini de kullanabilirsiniz."}</p>
        <p className="mt-2 text-zinc-400">Aynı hesabınızla giriş yaparsınız. Finans ve personel belgeleri çevrimdışı saklanmaz; işlemler internet bağlantısı gerektirir.</p>
      </div> : null}
      {message ? <p role="status" className="py-2 text-sm">{message}</p> : null}
    </div> : null}
  </>;
}
