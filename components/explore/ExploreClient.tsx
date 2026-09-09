"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { type MapBounds } from "@/components/map/MapView";
import ListingCard from "@/components/listing/ListingCard";
import FilterSheet, { EMPTY_FILTERS, countActiveFilters, type Filters } from "@/components/listing/FilterSheet";
import type { SearchListingRow } from "@/lib/types/database";

interface ExploreClientProps {
  initialView?: "list" | "map";
  initialItems?: SearchListingRow[];
  initialTotal?: number;
}

const PAGE_SIZE = 30;

function buildQuery(filters: Filters, bounds: MapBounds | null, offset: number, limit: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  for (const type of filters.types) params.append("type", type);
  if (filters.deal) params.set("deal", filters.deal);
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minArea) params.set("minArea", filters.minArea);
  if (filters.maxArea) params.set("maxArea", filters.maxArea);
  if (filters.bedrooms) params.set("bedrooms", filters.bedrooms);
  if (filters.district) params.set("district", filters.district);
  if (filters.subdistrict) params.set("subdistrict", filters.subdistrict);
  if (filters.sort) params.set("sort", filters.sort);
  if (bounds) {
    params.set("south", String(bounds.south));
    params.set("west", String(bounds.west));
    params.set("north", String(bounds.north));
    params.set("east", String(bounds.east));
    params.set("hasGeo", "1");
  }
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
}

export default function ExploreClient({
  initialView = "list", initialItems = [], initialTotal = 0,
}: ExploreClientProps) {
  const [view, setView] = useState<"list" | "map">(initialView);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<SearchListingRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [offset, setOffset] = useState(0);

  const requestId = useRef(0);
  const firstRender = useRef(true);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setErrorMessage(null);
      try {
        const query = buildQuery(filters, view === "map" ? bounds : null, nextOffset, view === "map" ? 120 : PAGE_SIZE);
        const response = await fetch(`/api/listings?${query}`);
        const payload = await response.json();
        if (id !== requestId.current) return;   // ทิ้งผลลัพธ์ของคำขอที่ถูกแทนที่แล้ว

        if (!response.ok) {
          setErrorMessage(payload?.error ?? "โหลดข้อมูลไม่สำเร็จ");
          return;
        }
        setItems((current) => (append ? [...current, ...payload.items] : payload.items));
        setTotal(payload.total ?? 0);
      } catch {
        if (id === requestId.current) setErrorMessage("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters, bounds, view]
  );

  // ค้นหาใหม่เมื่อเงื่อนไข/กรอบแผนที่เปลี่ยน (ข้ามรอบแรกเพราะมีข้อมูลจากเซิร์ฟเวอร์แล้ว)
  useEffect(() => {
    if (firstRender.current && initialItems.length > 0 && view === "list") {
      firstRender.current = false;
      return;
    }
    firstRender.current = false;
    setOffset(0);
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, bounds, view]);

  // หน่วงการพิมพ์ 400 มิลลิวินาที ไม่ยิงคำขอทุกตัวอักษร
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.q === searchText ? current : { ...current, q: searchText }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const loadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void load(next, true);
  };

  const selected = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const visibleOnMap = items.filter((item) => item.lat !== null);

  return (
    <>
      <div className="container" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <div className="searchbar">
          <div className="searchbox">
            <input
              className="input"
              type="search"
              inputMode="search"
              placeholder="ค้นหา เช่น บ้านพรุ, ที่ดิน, ใกล้ ม.อ."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              aria-label="ค้นหาประกาศ"
            />
          </div>
          <button
            type="button"
            className={`btn ${activeFilterCount > 0 ? "btn-soft" : ""}`}
            onClick={() => setShowFilters(true)}
          >
            ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        <div className="row-between" style={{ marginTop: 12 }}>
          <div className="small muted">
            {loading && items.length === 0
              ? "กำลังค้นหา…"
              : `พบ ${total.toLocaleString("th-TH")} ประกาศ`}
            {view === "map" && bounds ? " ในพื้นที่ที่แสดง" : ""}
          </div>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={view === "list"}
              className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
              รายการ
            </button>
            <button type="button" role="tab" aria-selected={view === "map"}
              className={view === "map" ? "active" : ""} onClick={() => setView("map")}>
              แผนที่
            </button>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="container"><div className="notice notice-danger">{errorMessage}</div></div>
      ) : null}

      {view === "map" ? (
        <div style={{ position: "relative", height: "calc(100dvh - var(--nav-h) - 190px)", minHeight: 380 }}>
          <MapView
            listings={visibleOnMap}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBoundsChange={(next) => setBounds(next)}
          />
          <div className="map-overlay-top">
            <span className="map-badge">📍 {visibleOnMap.length} หมุด</span>
            {loading ? <span className="map-badge">กำลังโหลด…</span> : null}
          </div>

          <div className="map-sheet">
            {selected ? (
              <div className="map-sheet-scroll">
                <div className="map-sheet-card"><ListingCard listing={selected} compact /></div>
              </div>
            ) : visibleOnMap.length > 0 ? (
              <div className="map-sheet-scroll">
                {visibleOnMap.slice(0, 12).map((item) => (
                  <div key={item.id} className="map-sheet-card">
                    <ListingCard listing={item} compact />
                  </div>
                ))}
              </div>
            ) : (
              <div className="map-badge text-center">ไม่มีประกาศในพื้นที่นี้ ลองเลื่อนหรือย่อแผนที่</div>
            )}
          </div>
        </div>
      ) : (
        <div className="container">
          {loading && items.length === 0 ? (
            <div className="stack">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 116 }} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏘️</div>
              <div className="strong">ไม่พบประกาศที่ตรงกับเงื่อนไข</div>
              <p className="small">ลองลดเงื่อนไขการค้นหา หรือขยายพื้นที่ดู</p>
              <button type="button" className="btn btn-soft btn-sm"
                onClick={() => { setFilters(EMPTY_FILTERS); setSearchText(""); }}>
                ล้างตัวกรอง
              </button>
            </div>
          ) : (
            <>
              <div className="stack listing-grid">
                {items.map((item) => <ListingCard key={item.id} listing={item} />)}
              </div>
              {items.length < total ? (
                <button type="button" className="btn btn-block" style={{ marginTop: 14 }}
                  onClick={loadMore} disabled={loading}>
                  {loading ? "กำลังโหลด…" : `ดูเพิ่มอีก ${Math.min(PAGE_SIZE, total - items.length)} ประกาศ`}
                </button>
              ) : null}
            </>
          )}
          <div style={{ height: 20 }} />
        </div>
      )}

      {showFilters ? (
        <FilterSheet
          value={filters}
          onClose={() => setShowFilters(false)}
          onApply={(next) => { setFilters(next); setSearchText(next.q); setShowFilters(false); }}
        />
      ) : null}
    </>
  );
}
