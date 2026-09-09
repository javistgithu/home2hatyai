"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useGoogleMaps } from "./useGoogleMaps";
import { HATYAI_CENTER } from "@/lib/parser/gazetteer";
import { formatPricePin, isApproximate } from "@/lib/format";
import type { SearchListingRow } from "@/lib/types/database";

export interface MapBounds { south: number; west: number; north: number; east: number; }

interface MapViewProps {
  listings: SearchListingRow[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onBoundsChange?: (bounds: MapBounds, zoom: number) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  /** แสดงปุ่ม "ตำแหน่งของฉัน" */
  showLocateMe?: boolean;
}

/** รัศมีวงพื้นที่ (เมตร) สำหรับประกาศที่รู้ตำแหน่งแค่คร่าว ๆ */
const APPROX_RADIUS: Record<string, number> = { subdistrict: 900, district: 3000 };

/** สร้างไอคอนหมุดเป็น "ป้ายราคา" — อ่านง่ายกว่าหมุดเปล่าบนจอมือถือ */
function priceIcon(label: string, opts: { selected: boolean; approximate: boolean }) {
  const width = Math.max(44, label.length * 8.4 + 20);
  const height = 30;
  const fill = opts.selected ? "#06584b" : opts.approximate ? "#ffffff" : "#0d7c6b";
  const textColor = opts.selected ? "#ffffff" : opts.approximate ? "#0d7c6b" : "#ffffff";
  const stroke = opts.approximate ? "#0d7c6b" : "rgba(0,0,0,.18)";
  const dash = opts.approximate ? ' stroke-dasharray="4 3"' : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 7}" viewBox="0 0 ${width} ${height + 7}">` +
    `<rect x="1" y="1" rx="${(height - 2) / 2}" width="${width - 2}" height="${height - 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>` +
    `<path d="M${width / 2 - 5} ${height - 2} L${width / 2} ${height + 5} L${width / 2 + 5} ${height - 2} Z" fill="${fill}"/>` +
    `<text x="${width / 2}" y="${height / 2 + 4.5}" text-anchor="middle" ` +
    `font-family="IBM Plex Sans Thai, Noto Sans Thai, sans-serif" font-size="12.5" font-weight="700" fill="${textColor}">${label}</text>` +
    `</svg>`;

  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(width, height + 7),
    anchor: new google.maps.Point(width / 2, height + 7),
  };
}

export default function MapView({
  listings, selectedId, onSelect, onBoundsChange,
  center, zoom = 13, height = "100%", showLocateMe = true,
}: MapViewProps) {
  const { state, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const startCenter = useMemo(() => center ?? HATYAI_CENTER, [center]);

  // ---- สร้างแผนที่ครั้งเดียว ----
  useEffect(() => {
    if (state !== "ready" || !containerRef.current || mapRef.current) return;

    const map = new google.maps.Map(containerRef.current, {
      center: startCenter,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",       // มือถือ: เลื่อนแผนที่ด้วยนิ้วเดียวได้เลย
      styles: [
        { featureType: "poi.business", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      ],
    });
    mapRef.current = map;
    setMapReady(true);

    map.addListener("idle", () => {
      if (!onBoundsChange) return;
      if (boundsTimer.current) clearTimeout(boundsTimer.current);
      boundsTimer.current = setTimeout(() => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        onBoundsChange(
          { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() },
          map.getZoom() ?? zoom
        );
      }, 350);   // หน่วงไว้กันยิง API ถี่เกินตอนผู้ใช้ลากแผนที่
    });

    map.addListener("click", () => onSelect?.(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ---- วาดหมุดใหม่ทุกครั้งที่รายการเปลี่ยน ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    clustererRef.current?.clearMarkers();
    for (const marker of markersRef.current.values()) marker.setMap(null);
    markersRef.current.clear();
    for (const circle of circlesRef.current) circle.setMap(null);
    circlesRef.current = [];

    const markers: google.maps.Marker[] = [];

    for (const listing of listings) {
      if (listing.lat === null || listing.lng === null) continue;
      const approximate = isApproximate(listing.geo_precision);
      const position = { lat: listing.lat, lng: listing.lng };

      // ตำแหน่งคร่าว ๆ : วาดเป็นวงพื้นที่ ไม่ใช่จุดเดียว เพื่อไม่ให้เข้าใจผิดว่าเป็นพิกัดจริง
      if (approximate) {
        const radius = APPROX_RADIUS[listing.geo_precision] ?? 900;
        circlesRef.current.push(
          new google.maps.Circle({
            map, center: position, radius,
            strokeColor: "#0d7c6b", strokeOpacity: 0.35, strokeWeight: 1,
            fillColor: "#0d7c6b", fillOpacity: 0.07, clickable: false,
          })
        );
      }

      const marker = new google.maps.Marker({
        position,
        title: listing.title,
        icon: priceIcon(formatPricePin(listing.price, listing.rent_per_month), {
          selected: listing.id === selectedId,
          approximate,
        }),
        zIndex: listing.id === selectedId ? 999 : approximate ? 1 : 2,
      });
      marker.addListener("click", () => onSelect?.(listing.id));

      markersRef.current.set(listing.id, marker);
      markers.push(marker);
    }

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: [] });
    }
    clustererRef.current.addMarkers(markers);

    return () => {
      clustererRef.current?.clearMarkers();
      for (const circle of circlesRef.current) circle.setMap(null);
      circlesRef.current = [];
    };
  }, [listings, mapReady, selectedId, onSelect]);

  // ---- เลื่อนแผนที่ไปยังรายการที่ถูกเลือก ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const listing = listings.find((l) => l.id === selectedId);
    if (listing?.lat != null && listing.lng != null) {
      map.panTo({ lat: listing.lat, lng: listing.lng });
    }
  }, [selectedId, listings]);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.panTo({ lat: position.coords.latitude, lng: position.coords.longitude });
        mapRef.current?.setZoom(15);
      },
      () => alert("ไม่สามารถอ่านตำแหน่งของคุณได้ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  if (state === "no-key") {
    return (
      <div className="map-wrap" style={{ height }}>
        <div className="map-fallback">
          <div style={{ fontSize: 34 }}>🗺️</div>
          <div className="strong">ยังไม่ได้ตั้งค่าแผนที่</div>
          <p className="small muted" style={{ maxWidth: 340 }}>
            ใส่ค่า <code className="mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> ในไฟล์ .env.local
            แล้วเปิดใช้ Maps JavaScript API ในโปรเจกต์ Google Cloud
            <br />ระหว่างนี้ยังใช้มุมมองรายการได้ตามปกติ
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="map-wrap" style={{ height }}>
        <div className="map-fallback">
          <div style={{ fontSize: 34 }}>⚠️</div>
          <div className="strong">โหลดแผนที่ไม่สำเร็จ</div>
          <p className="small muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={containerRef} className="map-canvas" />
      {showLocateMe && state === "ready" ? (
        <button
          type="button"
          onClick={locateMe}
          className="btn btn-icon"
          style={{ position: "absolute", right: 12, bottom: 130, zIndex: 6, boxShadow: "var(--shadow-2)" }}
          aria-label="ไปยังตำแหน่งของฉัน"
        >
          ◎
        </button>
      ) : null}
      {state === "loading" ? (
        <div className="map-fallback" style={{ position: "absolute", inset: 0 }}>
          <div className="small muted">กำลังโหลดแผนที่…</div>
        </div>
      ) : null}
    </div>
  );
}
