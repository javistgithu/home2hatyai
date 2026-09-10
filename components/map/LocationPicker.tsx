"use client";

import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "./useGoogleMaps";
import { HATYAI_CENTER, isInServiceArea } from "@/lib/parser/gazetteer";

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (position: { lat: number; lng: number } | null) => void;
  height?: number;
}

/** แผนที่ให้ผู้ขายลากหมุดไปยังตำแหน่งจริงของทรัพย์ */
export default function LocationPicker({ lat, lng, onChange, height = 260 }: LocationPickerProps) {
  const { state } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [outOfArea, setOutOfArea] = useState(false);

  useEffect(() => {
    if (state !== "ready" || !containerRef.current || mapRef.current) return;

    const start = lat !== null && lng !== null ? { lat, lng } : HATYAI_CENTER;
    const map = new google.maps.Map(containerRef.current, {
      center: start,
      zoom: lat !== null ? 16 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
      clickableIcons: false,
    });
    mapRef.current = map;

    const marker = new google.maps.Marker({
      map,
      position: start,
      draggable: true,
      visible: lat !== null,
    });
    markerRef.current = marker;

    const commit = (position: google.maps.LatLng | null | undefined) => {
      if (!position) return;
      const next = { lat: position.lat(), lng: position.lng() };
      const inside = isInServiceArea(next.lat, next.lng);
      setOutOfArea(!inside);
      marker.setVisible(true);
      marker.setPosition(next);
      onChange(next);
    };

    map.addListener("click", (event: google.maps.MapMouseEvent) => commit(event.latLng));
    marker.addListener("dragend", () => commit(marker.getPosition()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ซิงก์เมื่อค่าถูกเปลี่ยนจากภายนอก (เช่น กดปุ่มเติมข้อมูลจากข้อความโพสต์)
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    if (lat === null || lng === null) {
      markerRef.current.setVisible(false);
      return;
    }
    markerRef.current.setVisible(true);
    markerRef.current.setPosition({ lat, lng });
    mapRef.current.panTo({ lat, lng });
  }, [lat, lng]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setOutOfArea(!isInServiceArea(next.lat, next.lng));
        onChange(next);
        mapRef.current?.setZoom(17);
      },
      () => alert("อ่านตำแหน่งไม่ได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง หรือแตะบนแผนที่เพื่อปักหมุดเอง"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (state === "no-key") {
    return (
      <div className="stack">
        <div className="notice notice-warn small">
          ยังไม่ได้ตั้งค่า Google Maps API key จึงปักหมุดบนแผนที่ไม่ได้ — กรอกพิกัดเป็นตัวเลขแทนได้
        </div>
        <div className="grid-2">
          <input className="input" type="number" step="0.000001" placeholder="ละติจูด เช่น 7.0086"
            value={lat ?? ""} onChange={(e) => onChange(e.target.value ? { lat: Number(e.target.value), lng: lng ?? 0 } : null)} />
          <input className="input" type="number" step="0.000001" placeholder="ลองจิจูด เช่น 100.4747"
            value={lng ?? ""} onChange={(e) => onChange(e.target.value ? { lat: lat ?? 0, lng: Number(e.target.value) } : null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="card" style={{ overflow: "hidden" }}>
        <div ref={containerRef} style={{ height }} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={useMyLocation}>◎ ใช้ตำแหน่งปัจจุบัน</button>
        {lat !== null ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>ล้างหมุด</button>
        ) : null}
      </div>
      <div className="tiny muted">
        {lat !== null
          ? `พิกัดที่เลือก: ${lat.toFixed(6)}, ${lng?.toFixed(6)}`
          : "แตะบนแผนที่เพื่อปักหมุดตำแหน่งทรัพย์ (ยิ่งแม่นยิ่งมีคนติดต่อมากขึ้น)"}
      </div>
      {outOfArea ? (
        <div className="notice notice-warn tiny">ตำแหน่งนี้อยู่นอกพื้นที่ จ.สงขลา — ตรวจสอบอีกครั้งว่าปักถูกจุดหรือไม่</div>
      ) : null}
    </div>
  );
}
