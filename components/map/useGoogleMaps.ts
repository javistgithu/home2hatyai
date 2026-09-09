"use client";

import { useEffect, useState } from "react";
import { GOOGLE_MAPS_BROWSER_KEY } from "@/lib/env";

type LoadState = "idle" | "loading" | "ready" | "error" | "no-key";

const SCRIPT_ID = "google-maps-js";
let loadPromise: Promise<void> | null = null;

/**
 * โหลด Google Maps JavaScript API เพียงครั้งเดียวต่อหนึ่งหน้าเว็บ
 * (คอมโพเนนต์แผนที่หลายตัวใช้ promise เดียวกัน ไม่โหลดสคริปต์ซ้ำ)
 */
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("โหลด Google Maps ไม่สำเร็จ")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_BROWSER_KEY)}` +
      `&language=th&region=TH&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Google Maps ไม่สำเร็จ"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps(): { state: LoadState; error: string | null } {
  const [state, setState] = useState<LoadState>(() =>
    GOOGLE_MAPS_BROWSER_KEY ? "idle" : "no-key"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_BROWSER_KEY) {
      setState("no-key");
      return;
    }
    if ((window as any).google?.maps) {
      setState("ready");
      return;
    }

    let cancelled = false;
    setState("loading");
    loadGoogleMaps()
      .then(() => { if (!cancelled) setState("ready"); })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setState("error");
      });

    return () => { cancelled = true; };
  }, []);

  return { state, error };
}
