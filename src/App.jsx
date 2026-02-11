import { useEffect, useMemo, useRef, useState } from "react";
import "./index2.css";
import "leaflet/dist/leaflet.css";
  import L from "leaflet";

  import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
  import markerIcon from "leaflet/dist/images/marker-icon.png";
  import markerShadow from "leaflet/dist/images/marker-shadow.png";

  delete L.Icon.Default.prototype._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });

import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { supabase } from "./lib/supabase";

/** ✅ СМЕНИ С ТВОИТЕ PNG */
const HERO_IMG = "/images/hero.png";
const DOG_IMG = "/images/dog.png";
const CAT_IMG = "/images/cat.png";
const OTHER_IMG = "/images/other.png";

/** ✅ ТВОЯТ BUCKET */
const STORAGE_BUCKET = "photos";

const NAV = [
  { key: "home", label: "Начало" },
  { key: "active", label: "Активни" },
  { key: "in_progress", label: "В процес" },
  { key: "resolved", label: "Решени" },
  { key: "my_cases", label: "Моите случаи" },
  { key: "needs_help", label: "Нужда от помощ" },
  { key: "happy", label: "Щастливи истории" },
  { key: "feedback", label: "Контакт" },
  { key: "about", label: "За нас" },
];

const STATUS_LABELS = {
  open: "Активен",
  in_progress: "В процес",
  resolved: "Решен",
  needs_help: "Нужда от помощ",
};

const ANIMAL_LABELS = {
  dog: "куче",
  cat: "котка",
  other: "друго",
};

// ✅ helper-и, за да не дублираме логиката
const statusBg = (s) => STATUS_LABELS[s] || s || "—";
const animalBg = (a) => ANIMAL_LABELS[a] || a || "—";

// ✅ За "Последни сигнали" → отваря правилното меню според статуса
const viewFromStatus = (status) => {
  if (status === "open") return "active";
  if (status === "in_progress") return "in_progress";
  if (status === "needs_help") return "needs_help";
  if (status === "resolved") return "resolved";
  return "active";
};

function ClickToPick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function safeExt(file) {
  const name = file?.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "png";
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "png";
}

/**
 * ✅ FIX: normalize image_urls (updates) so UI always gets an array of strings
 */
function normalizeImageUrls(value) {
  if (!value) return [];

  if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
    return value.filter(Boolean);
  }

  if (Array.isArray(value) && value.some((x) => x && typeof x === "object")) {
    return value
      .map((x) =>
        typeof x?.url === "string"
          ? x.url
          : typeof x?.publicUrl === "string"
          ? x.publicUrl
          : null
      )
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const s = value.trim();

    if (
      (s.startsWith("[") && s.endsWith("]")) ||
      (s.startsWith("\"[") && s.endsWith("]\""))
    ) {
      try {
        const parsed = JSON.parse(s.startsWith("\"") ? JSON.parse(s) : s);
        if (Array.isArray(parsed)) return normalizeImageUrls(parsed);
      } catch {
        // fall through
      }
    }

    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

async function uploadImages(pathPrefix, files) {
  if (!files || files.length === 0) return [];

  const urls = [];
  for (const file of files) {
    const ext = safeExt(file);
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

/** ✅ Lightbox */
function Lightbox({ urls, index, onClose, onPrev, onNext, onJump }) {
  const current = urls?.[index] ?? null;

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  if (!current) return null;

  return (
    <div className="lbOverlay" onClick={onClose}>
      <div className="lb" onClick={(e) => e.stopPropagation()}>
        <button className="lbClose" onClick={onClose}>✕</button>

        {urls.length > 1 && (
          <>
            <button className="lbNav lbPrev" onClick={onPrev} aria-label="Предишна">‹</button>
            <button className="lbNav lbNext" onClick={onNext} aria-label="Следваща">›</button>
          </>
        )}

        <div className="lbImgWrap">
          <img className="lbImg" src={current} alt="Снимка" />
        </div>

        {urls.length > 1 && (
          <div className="lbDots">
            {urls.map((_, i) => (
              <button
                key={i}
                className={`lbDot ${i === index ? "lbDotOn" : ""}`}
                onClick={() => onJump(i)}
                aria-label={`Снимка ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ✅ Като се смени selected → фокусира карта и отваря popup */
function MapFocus({ selected, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;
    const ref = markerRefs.current?.[selected.id];
    if (!ref) return;

    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });

    setTimeout(() => {
      try { ref.openPopup(); } catch {}
    }, 150);
  }, [selected, map, markerRefs]);

  return null;
}

/** ✅ Modal: Add info */
function AddInfoModal({ report, onClose, onSaved, onOpenLightbox }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef(null);

  async function submit() {
    if (!report?.id) return;
    if (!text.trim() && files.length === 0) return;

    setSaving(true);

    try {
      // 1) upload на снимките
      let urls = [];
      if (files.length > 0) {
        urls = await uploadImages(`updates/${report.id}`, files);
      }

      // 2) insert update + снимки
      const localToken = localStorage.getItem(`claimed_${report.id}`) || "";

      const { error } = await supabase.rpc("add_update_maybe_claimer", {
        p_report_id: report.id,
        p_type: "info",
        p_text: text.trim(),
        p_image_urls: urls,
        p_claimer_token: localToken,
      });

      if (error) throw error;

      onSaved?.();
      onClose();
    } catch (e) {
      console.error("ADD UPDATE ERROR:", e);
      alert("Грешка при запис на update. Виж конзолата.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Добави информация</div>
          <button className="btnGhost" onClick={onClose}>✕</button>
        </div>

        <div className="modalBody">
          <div className="modalStep">
            <div className="hint">
              Добави нова информация/наблюдение по случая. Работи и за <b>Активни</b>, и за <b>В процес</b>.
            </div>

            <label className="field">
              <div className="label">Какво видя/знаеш?</div>
              <textarea
                className="textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Пр: Видях го преди 10 мин на входа. Има син нашийник…"
              />
            </label>

            <div className="field">
              <div className="label">Снимки (по желание, до 3)</div>
              <input
                ref={fileRef}
                className="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))}
              />
              {files.length > 0 && <div className="fileHint">Избрани: {files.map((f) => f.name).join(", ")}</div>}
            </div>

            <div className="actions">
              <button className="btnGhost" onClick={onClose}>Отказ</button>
              <button className="btnPrimary" onClick={submit} disabled={saving || (!text.trim() && files.length === 0)}>
                {saving ? "Записвам..." : "Запиши"}
              </button>
            </div>

            {Array.isArray(report?.image_urls) && report.image_urls.length > 0 && (
              <div className="hint">
                Снимки към сигнала:
                <div className="imgGrid">
                  {report.image_urls.map((url, idx) => (
                    <button
                      key={url}
                      className="imgTileBtn"
                      type="button"
                      onClick={() => onOpenLightbox?.(report.image_urls, idx)}
                      title="Отвори"
                    >
                      <img src={url} alt={`Снимка ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [pageModal, setPageModal] = useState(null); // "privacy" | "terms" | null

  const [latest, setLatest] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);

  const [animalType, setAnimalType] = useState("dog");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState(null);

  const [imageFiles, setImageFiles] = useState([]);
  const fileInputRef = useRef(null);

  const [isSaving, setIsSaving] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);

  // Lightbox state
  const [lbOpen, setLbOpen] = useState(false);
  const [lbUrls, setLbUrls] = useState([]);
  const [lbIndex, setLbIndex] = useState(0);

  // Updates state
  const [updates, setUpdates] = useState([]);
  const [addInfoOpen, setAddInfoOpen] = useState(false);

  const selected = useMemo(() => {
    return latest.find((r) => r.id === selectedId) || items.find((r) => r.id === selectedId) || null;
  }, [latest, items, selectedId]);

  function openNewReport() {
    setIsModalOpen(true);
    setStep(1);
    setAnimalType("dog");
    setTitle("");
    setDescription("");
    setPicked(null);
    setImageFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function loadLatest() {
    const { data, error } = await supabase
      .from("reports")
      .select(`
        id,
        title,
        description,
        lat,
        lng,
        status,
        animal_type,
        created_at,
        image_urls,
        closure_note,
        needs_help,
        help_note,
        claimer_token
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) console.error(error);
    else setLatest(data ?? []);
  }

  function getClaimedIdsFromLocalStorage() {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith("claimed_"))
        .map((k) => k.replace("claimed_", ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async function loadViewData(v) {
    if (v === "home" || v === "happy" || v === "feedback" || v === "about") {
      setItems([]);
      return;
    }

    // ✅ Моите случаи
    if (v === "my_cases") {
      const ids = getClaimedIdsFromLocalStorage();
      if (ids.length === 0) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from("reports")
        .select(`
          id,
          title,
          description,
          lat,
          lng,
          status,
          animal_type,
          created_at,
          image_urls,
          closure_note,
          needs_help,
          help_note,
          claimer_token
        `)
        .in("id", ids)
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) console.error(error);
      else setItems(data ?? []);
      return;
    }

    let q = supabase
      .from("reports")
      .select(`
        id,
        title,
        description,
        lat,
        lng,
        status,
        animal_type,
        created_at,
        image_urls,
        closure_note,
        needs_help,
        help_note,
        claimer_token
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (v === "active") q = q.eq("status", "open");
    if (v === "in_progress") q = q.eq("status", "in_progress");
    if (v === "resolved") q = q.eq("status", "resolved");
    if (v === "needs_help") q = q.eq("status", "needs_help");

    const { data, error } = await q;
    if (error) console.error(error);
    else setItems(data ?? []);
  }

  async function loadUpdates(reportId) {
    if (!reportId) {
      setUpdates([]);
      return;
    }

    const { data, error } = await supabase
      .from("updates")
      .select("id,report_id,type,text,image_urls,created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      return;
    }

    const normalized = (data ?? []).map((u) => ({
      ...u,
      image_urls: normalizeImageUrls(u.image_urls),
    }));

    setUpdates(normalized);
  }

  useEffect(() => {
    loadLatest();
    loadViewData(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadViewData(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    loadUpdates(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function openLightbox(urls, startIndex = 0) {
    setLbUrls(Array.isArray(urls) ? urls : []);
    setLbIndex(Math.max(0, Math.min(startIndex, (urls?.length ?? 1) - 1)));
    setLbOpen(true);
  }

  async function submitReport() {
    if (!title.trim() || !picked) return;

    setIsSaving(true);

    try {
      const reporterToken = "rpt_" + crypto.getRandomValues(new Uint32Array(4)).join("_");

      const { data: inserted, error: insErr } = await supabase
        .from("reports")
        .insert({
          status: "open",
          animal_type: animalType,
          title: title.trim(),
          description: (description ?? "").trim(),
          lat: picked.lat,
          lng: picked.lng,
          reporter_token: reporterToken,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      const reportId = inserted.id;

      let urls = [];
      if (imageFiles.length > 0) {
        urls = await uploadImages(`reports/${reportId}`, imageFiles);
      }

      if (urls.length > 0) {
        const { error: upErr } = await supabase.from("reports").update({ image_urls: urls }).eq("id", reportId);
        if (upErr) throw upErr;
      }

      setIsModalOpen(false);
      await loadLatest();
      await loadViewData(view);

      alert("Публикувано ✅");
    } catch (e) {
      console.error(e);
      alert("Грешка при запис/качване. Виж конзолата (F12).");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={`app ${view === "home" ? "" : "noSidebar"}`}>

      {view === "home" && (
        <aside className="sidebar">
          <div className="sidebarHeader">
            <div className="sidebarTitle">Последни сигнали</div>
            <button className="btnPrimary" onClick={openNewReport}>Подай сигнал</button>
          </div>

          <div className="cardList">
            {latest.map((r) => {
              const thumbUrl = Array.isArray(r.image_urls) && r.image_urls.length > 0 ? r.image_urls[0] : null;

              return (
                <button
                  key={r.id}
                  className={`card cardFixed ${selectedId === r.id ? "cardActive" : ""}`}
                  onClick={() => {
                    setSelectedId(r.id);
                    setView(viewFromStatus(r.status));
                  }}
                >
                  <div className="cardRow">
                    <div className="thumb">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="thumb" />
                      ) : (
                        <div className="thumbBadge">{(r.animal_type || "—").toUpperCase()}</div>
                      )}
                    </div>

                    <div className="cardBody">
                      <div className="cardTitle">{r.title}</div>
                      <div className="cardDesc">
                        {r.description ? (r.description.length > 90 ? r.description.slice(0, 90) + "…" : r.description) : "—"}
                      </div>
                      <div className="cardMeta">
                        {statusBg(r.status)} • {animalBg(r.animal_type)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sidebarHint">
            Контактите са по избор. Без регистрация. Не е спешна услуга.
          </div>
        </aside>
      )}

      <main className="main">
        <header className="topbar">
          <div className="brand">
            <div className="brandDot" />
            <div className="brandText">StrayMap</div>
          </div>

          <nav className="nav">
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`navBtn ${view === n.key ? "navBtnActive" : ""}`}
                onClick={() => {
                  setView(n.key);
                  setSelectedId(null);
                }}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="content">
          {view === "home" && <HomeHero onReport={openNewReport} />}

          {(view === "active" || view === "in_progress" || view === "resolved" || view === "my_cases" || view === "needs_help") && (
            <ReportsView
              view={view}
              title={NAV.find((x) => x.key === view)?.label}
              list={items}
              selected={selected}
              onSelect={setSelectedId}
              showMap={view !== "resolved"}
              onOpenLightbox={openLightbox}
              updates={updates}
              onAddInfo={() => setAddInfoOpen(true)}
              onCloseCase={() => setCloseOpen(true)}
            />
          )}

          {/* ✅ Контакт (меню) остава contact */}
          {view === "feedback" && <ContactPage defaultKind="contact" />}

          {/* ✅ Щастливи истории (меню) показва само happy_story */}
          {view === "happy" && <ContactPage defaultKind="happy_story" hideKindPicker />}

          {/* ✅ За нас си е страница в менюто */}
          {view === "about" && <AboutPage /> }
        </section>

        <footer className="footer">
          <button type="button" className="footerLink" onClick={() => setPageModal("privacy")}>
            Поверителност
          </button>
          <button type="button" className="footerLink" onClick={() => setPageModal("terms")}>
            Условия
          </button>
          <button type="button" className="footerLink" onClick={() => setView("feedback")}>
            Контакт
          </button>
          <span className="footerNote">При спешен случай звъни на 112.</span>
        </footer>
      </main>

      {lbOpen && (
        <Lightbox
          urls={lbUrls}
          index={lbIndex}
          onClose={() => setLbOpen(false)}
          onPrev={() => setLbIndex((i) => (i - 1 + lbUrls.length) % lbUrls.length)}
          onNext={() => setLbIndex((i) => (i + 1) % lbUrls.length)}
          onJump={(i) => setLbIndex(i)}
        />
      )}

      {addInfoOpen && selected && (
        <AddInfoModal
          report={selected}
          onClose={() => setAddInfoOpen(false)}
          onSaved={() => loadUpdates(selected.id)}
          onOpenLightbox={openLightbox}
        />
      )}

      {closeOpen && selected && (
        <CloseCaseModal
          report={selected}
          onClose={() => setCloseOpen(false)}
          onDone={async () => {
            setCloseOpen(false);
            await loadLatest();
            await loadViewData(view);
            setSelectedId(null);
          }}
        />
      )}

      {pageModal && (
        <PageModal
          title={pageModal === "privacy" ? "Политика за поверителност" : "Условия за ползване"}
          onClose={() => setPageModal(null)}
        >
          {pageModal === "privacy" && <PrivacyContent />}
          {pageModal === "terms" && <TermsContent />}
        </PageModal>
      )}

      {isModalOpen && (
        <div className="modalOverlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">Подай сигнал</div>
              <button className="btnGhost" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <div className="modalBody">
              {step === 1 && (
                <div className="modalStep">
                  <div className="stepper">
                    <span className="stepActive">1) Описание</span>
                    <span className="stepSep">→</span>
                    <span>2) Място</span>
                  </div>

                  <div className="notice">
                    <b>Преди да подадеш сигнал:</b> провери в <b>Активни</b> и <b>В процес</b> дали вече няма такъв.
                    Ако има, отвори него и ползвай <b>Добави информация</b>, вместо да правиш дубликат.
                  </div>

                  <div className="animalRow">
                    <button className={`animalCard ${animalType === "dog" ? "animalCardActive" : ""}`} onClick={() => setAnimalType("dog")} type="button">
                      <div className="animalThumb">
                        <img src={DOG_IMG} alt="Куче" />
                      </div>
                      <div className="animalCardLabel">Куче</div>
                    </button>

                    <button className={`animalCard ${animalType === "cat" ? "animalCardActive" : ""}`} onClick={() => setAnimalType("cat")} type="button">
                      <div className="animalThumb">
                        <img src={CAT_IMG} alt="Котка" />
                      </div>
                      <div className="animalCardLabel">Котка</div>
                    </button>

                    <button className={`animalCard ${animalType === "other" ? "animalCardActive" : ""}`} onClick={() => setAnimalType("other")} type="button">
                      <div className="animalThumb">
                        <img src={OTHER_IMG} alt="Друго" />
                      </div>
                      <div className="animalCardLabel">Друго</div>
                    </button>
                  </div>

                  <label className="field">
                    <div className="label">Заглавие *</div>
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Пр: Куче до НДК" />
                  </label>

                  <label className="field">
                    <div className="label">Описание (по желание)</div>
                    <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Как изглежда, има ли нашийник, агресивно ли е…" />
                  </label>

                  <div className="field">
                    <div className="label">Снимки (PNG/JPG/WebP, до 3)</div>
                    <input
                      ref={fileInputRef}
                      className="file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      onChange={(e) => setImageFiles(Array.from(e.target.files || []).slice(0, 3))}
                    />
                    {imageFiles.length > 0 && <div className="fileHint">Избрани: {imageFiles.map((f) => f.name).join(", ")}</div>}
                  </div>

                  <div className="actions">
                    <button className="btnGhost" onClick={() => setIsModalOpen(false)}>Отказ</button>
                    <button className="btnPrimary" onClick={() => setStep(2)} disabled={!title.trim()}>Напред към карта</button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="modalStep modalMapStep">
                  <div className="stepper">
                    <span>1) Описание</span>
                    <span className="stepSep">→</span>
                    <span className="stepActive">2) Място</span>
                  </div>

                  <div className="hint">Цъкни на картата за пин. {picked ? "✅ Избрано място" : "❗ Още няма избрано място"}</div>

                  <div className="mapBox">
                    <MapContainer center={[42.6977, 23.3219]} zoom={13} style={{ height: "100%", width: "100%" }}>
                      <TileLayer attribution="Map data © OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <ClickToPick onPick={setPicked} />
                      {picked && <Marker position={[picked.lat, picked.lng]} />}
                    </MapContainer>
                  </div>

                  <div className="actions">
                    <button className="btnGhost" onClick={() => setStep(1)}>Назад</button>
                    <button className="btnPrimary" onClick={submitReport} disabled={!picked || isSaving}>
                      {isSaving ? "Публикувам..." : "Публикувай"}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function HomeHero({ onReport }) {
  return (
    <div className="hero">
      <div className="heroCard">
        <div className="heroImgWrap">
          <img className="heroImg" src={HERO_IMG} alt="Животни" />
        </div>

        <div className="heroText">
          <h1>Сигнали за намерени и изоставени животни</h1>
          <p>
            Подай сигнал, закачи пин на карта и помогни някой да намери животното по-бързо.
            Без регистрация. Контактите са по избор.
          </p>

          <div className="heroHow">
            <div className="howItem"><b>1.</b> Заглавие + описание + снимки (по желание)</div>
            <div className="howItem"><b>2.</b> Пин на карта</div>
            <div className="howItem"><b>3.</b> Някой поема случая</div>
          </div>

          <div className="heroActions">
            <button className="btnPrimary" onClick={onReport}>Подай сигнал</button>
            <span className="heroNote">Не е спешна услуга.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsView({ view, title, list, selected, onSelect, showMap, onOpenLightbox, updates, onAddInfo, onCloseCase }) {
  const markerRefs = useRef({});

  return (
    <div className="reports">
      <div className="reportsHeader">
        <h2>{title}</h2>
        <div className="reportsSub">Избери сигнал от списъка, за да видиш детайли.</div>
      </div>

      <div className={`reportsGrid ${showMap ? "" : "reportsGridNoMap"}`}>
        <div className="reportsList scrollList">
          {list.length === 0 ? (
            <div className="empty">
              {view === "my_cases" ? "Още нямаш поети случаи." : "Няма записи за този филтър."}
            </div>
          ) : (
            list.map((r) => {
              const thumbUrl = Array.isArray(r.image_urls) && r.image_urls.length > 0 ? r.image_urls[0] : null;

              return (
                <button
                  key={r.id}
                  className={`card cardFixed ${selected?.id === r.id ? "cardActive" : ""}`}
                  onClick={() => onSelect(r.id)}
                >
                  <div className="cardRow">
                    <div className="thumb">
                      {thumbUrl ? <img src={thumbUrl} alt="thumb" /> : <div className="thumbBadge">{(r.animal_type || "—").toUpperCase()}</div>}
                    </div>

                    <div className="cardBody">
                      <div className="cardTitle">{r.title}</div>
                      <div className="cardDesc">{r.description ? (r.description.length > 100 ? r.description.slice(0, 100) + "…" : r.description) : "—"}</div>

                      <div className="cardMeta">
                        {statusBg(r.status)} • {animalBg(r.animal_type)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="reportsDetails">
          <div className="detailsCard">
            <div className="detailsTop">
              <div className="detailsTitle">Детайли</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btnGhost btnSmall" disabled={!selected} onClick={onAddInfo}>
                  Добави информация
                </button>

                {/* ✅ Поеми сигнал се показва само в "Активни" */}
                {view === "active" && selected?.status === "open" && (
                  <button
                    className="btnPrimary btnSmall"
                    onClick={async () => {
                      if (!selected) return;

                      const token = crypto.randomUUID();

                      const ok = window.confirm(
                        "Като поемеш случая: ако НЕ добавиш ъпдейт до 48 часа, сигналът автоматично се връща в 'Активни'.\n\nЪпдейти от други хора НЕ удължават срока.\n\nПродължаваме ли?"
                      );
                      if (!ok) return;

                      const { data, error } = await supabase
                        .from("reports")
                        .update({
                          status: "in_progress",
                          claimer_token: token,
                          claimed_at: new Date().toISOString(),
                          last_claimer_activity_at: new Date().toISOString(),
                        })
                        .eq("id", selected.id)
                        .is("claimer_token", null)
                        .select("id,claimer_token")
                        .single();

                      if (error || !data) {
                        alert("Някой вече е поел сигнала.");
                        return;
                      }

                      localStorage.setItem(`claimed_${selected.id}`, token);
                      window.location.reload();
                    }}
                  >
                    Поеми сигнал
                  </button>
                )}

                {/* ✅ Затвори / Приключи: само owner */}
                {(selected?.status === "in_progress" || selected?.status === "needs_help") && (() => {
                  const localToken = selected ? localStorage.getItem(`claimed_${selected.id}`) : null;
                  const isOwner = !!localToken && localToken === selected?.claimer_token;

                  if (!isOwner) {
                    return (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>
                        Само човекът, който е поел случая, може да го приключи.
                      </div>
                    );
                  }

                  return (
                    <button
                      className="btnPrimary btnSmall"
                      style={{ background: "#22c55e" }}
                      onClick={onCloseCase}
                    >
                      {selected.status === "needs_help" ? "Приключи случая" : "Затвори сигнала"}
                    </button>
                  );
                })()}
              </div>
            </div>

            {!selected ? (
              <div className="detailsEmpty">Няма избран сигнал.</div>
            ) : (
              <>
                <div className="detailsH">{selected.title}</div>
                <div className="detailsP">{selected.description || "—"}</div>
                <div className="detailsMeta">
                  {statusBg(selected.status)} • {animalBg(selected.animal_type)}
                </div>

                {selected.status === "needs_help" && (
                  <div className="needsHelpBox">
                    {selected.help_note && (
                      <div className="needsHelpText">
                        {selected.help_note}
                      </div>
                    )}
                  </div>
                )}

                {selected.closure_note && (
                  <div className="closureNote">
                    <br />
                    <b>Бележка:</b> {selected.closure_note}
                  </div>
                )}

                {Array.isArray(selected.image_urls) && selected.image_urls.length > 0 && (
                  <div className="imgGrid">
                    {selected.image_urls.map((url, idx) => (
                      <button
                        key={url}
                        className="imgTileBtn"
                        type="button"
                        onClick={() => onOpenLightbox(selected.image_urls, idx)}
                        title="Отвори"
                      >
                        <img src={url} alt={`Снимка ${idx + 1}`} />
                      </button>
                    ))}
                  </div>
                )}

                <div className="updates">
                  <div className="updatesTitle">Ъпдейти</div>
                  {(!updates || updates.length === 0) ? (
                    <div className="updatesEmpty">Още няма добавена информация.</div>
                  ) : (
                    <div className="updatesList">
                      {updates.map((u) => {
                        const imgs = normalizeImageUrls(u.image_urls);

                        return (
                          <div key={u.id} className="updateCard">
                            <div className="updateMeta">
                              <span className="updateTime">
                                {new Date(u.created_at).toLocaleString()}
                              </span>
                            </div>

                            <div className="updateText">{u.text || "—"}</div>

                            {imgs.length > 0 && (
                              <div className="imgGrid">
                                {imgs.map((url, idx) => (
                                  <button
                                    key={`${u.id}:${url}:${idx}`}
                                    className="imgTileBtn"
                                    type="button"
                                    onClick={() => onOpenLightbox(imgs, idx)}
                                    title="Отвори"
                                  >
                                    <img src={url} alt={`Снимка ${idx + 1}`} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {showMap && (
            <div className="detailsMap">
              <MapContainer
                center={selected ? [selected.lat, selected.lng] : [42.6977, 23.3219]}
                zoom={selected ? 15 : 12}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer attribution="Map data © OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <MapFocus selected={selected} markerRefs={markerRefs} />

                {list.map((r) => (
                  <Marker
                    key={r.id}
                    position={[r.lat, r.lng]}
                    ref={(ref) => {
                      if (ref) markerRefs.current[r.id] = ref;
                    }}
                    eventHandlers={{
                      click: () => onSelect(r.id),
                    }}
                  >
                    <Popup>
                      <b>{r.title}</b><br />{r.description || ""}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactPage({ defaultKind = "contact", hideKindPicker = false }) {
  const [kind, setKind] = useState(defaultKind); // "contact" | "happy_story"

  // contact fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // happy story extras
  const [storyTitle, setStoryTitle] = useState("");
  const [storyFiles, setStoryFiles] = useState([]);
  const storyFileRef = useRef(null);

  // honeypot (скрито поле)
  const [website, setWebsite] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind]);

  function tooSoon() {
    const key = "contact_last_sent_at";
    const last = Number(localStorage.getItem(key) || "0");
    const now = Date.now();
    if (now - last < 45_000) return true;
    localStorage.setItem(key, String(now));
    return false;
  }

  async function submit(e) {
    e.preventDefault();
    setSent(false);

    if (!message.trim()) {
      alert("Моля, напиши съобщение.");
      return;
    }

    if (kind === "happy_story" && !storyTitle.trim()) {
      alert("Моля, добави заглавие на щастливата история.");
      return;
    }

    if (website.trim()) {
      alert("Нещо се обърка. Опитай пак.");
      return;
    }

    if (tooSoon()) {
      alert("Моля, изчакай малко преди да изпратиш ново съобщение.");
      return;
    }

    let urls = [];
    let finalCategory = kind;
    let finalSubject =
      kind === "happy_story"
        ? `[Happy] ${storyTitle.trim()}`
        : (subject.trim() || "(no subject)");

    // пазим копия, за да не ни влияят setState-овете
    const nameToSend = name.trim() || "";
    const emailToSend = email.trim() || "";
    const messageToSend = message.trim();

    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    setSending(true);
    try {
      let urls = [];
      if (kind === "happy_story" && storyFiles.length > 0) {
        urls = await uploadImages(`happy_inbox/${crypto.randomUUID()}`, storyFiles);
      }

      const basePayload = {
        name: name.trim() || null,
        email: email.trim() || null,
        subject:
          kind === "happy_story"
            ? `[Happy] ${storyTitle.trim()}`
            : (subject.trim() || null),
        message: message.trim(),
        honeypot: website.trim() || null,
      };

      const extendedPayload = {
        ...basePayload,
        category: kind,
        image_urls: urls,
      };

      // 1) опит с новите колони
      let { error } = await supabase.from("messages").insert(extendedPayload);

      // 2) fallback ако колоните липсват
      if (error) {
        const msg = String(error.message || "");
        const missingCols =
          msg.includes('column "category"') ||
          msg.includes('column "image_urls"') ||
          (msg.includes("category") && msg.includes("does not exist")) ||
          (msg.includes("image_urls") && msg.includes("does not exist"));

        if (missingCols) {
          const fallbackMessage =
            kind === "happy_story" && urls.length > 0
              ? `${basePayload.message}\n\nСнимки:\n${urls.join("\n")}`
              : basePayload.message;

          ({ error } = await supabase.from("messages").insert({
            ...basePayload,
            message: fallbackMessage,
          }));
        }
      }

      if (error) throw error;

      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setWebsite("");
      setStoryTitle("");
      setStoryFiles([]);
      if (storyFileRef.current) storyFileRef.current.value = "";
    } catch (err) {
      console.error("CONTACT SEND ERROR:", err?.message || err, err);
      alert("Грешка при изпращане. Опитай пак след малко.");
    } finally {
      setSending(false);
    }

    try {
      await fetch("https://soanxjzmqtjfbldbdhnf.supabase.co/functions/v1/clever-responder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          category: finalCategory,
          subject: finalSubject,
          name: (name || "").trim(),
          email: (email || "").trim(),
          message: (message || "").trim(),
          image_urls: urls,
          created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.warn("Email notify failed (non-blocking):", e);
    }
  }

  return (
    <div className="simplePage" style={{ maxWidth: 720 }}>
      <h2>{kind === "happy_story" ? "Щастливи истории" : "Контакт"}</h2>

      <p style={{ opacity: 0.8 }}>
        {kind === "happy_story"
          ? "Разкажи ни накратко какво се случи. Ще прегледаме историята и ако е подходяща, ще я публикуваме."
          : "Ако имаш въпрос, идея или проблем в StrayMap, пиши ни тук. Отговорът не е гарантиран веднага (доброволчески проект)."}
      </p>

      <form onSubmit={submit} className="card" style={{ padding: 16, marginTop: 12, position: "relative" }}>
        {!hideKindPicker && (
          <label className="field">
            <div className="label">Тип</div>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="contact">Контакт</option>
              <option value="happy_story">Щастлива история</option>
            </select>
          </label>
        )}

        {kind === "happy_story" && (
          <>
            <label className="field">
              <div className="label">Заглавие *</div>
              <input
                className="input"
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="Пр: Рони си намери дом"
              />
            </label>

            <div className="field">
              <div className="label">Снимки (по желание, до 3)</div>
              <input
                ref={storyFileRef}
                className="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => setStoryFiles(Array.from(e.target.files || []).slice(0, 3))}
              />
              {storyFiles.length > 0 && (
                <div className="fileHint">Избрани: {storyFiles.map((f) => f.name).join(", ")}</div>
              )}
            </div>
          </>
        )}

        <label className="field">
          <div className="label">Име (по желание)</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <div className="label">Имейл (по желание, но препоръчително)</div>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" />
        </label>

        {kind === "contact" && (
          <label className="field">
            <div className="label">Тема (по желание)</div>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Пр: Бъг / Предложение / Партньорство" />
          </label>
        )}

        <label className="field">
          <div className="label">{kind === "happy_story" ? "История *" : "Съобщение *"}</div>
          <textarea className="textarea" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>

        {/* honeypot - скрито */}
        <div style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          <label>
            Website
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="actions">
          <button className="btnPrimary" type="submit" disabled={sending}>
            {sending ? "Изпращам..." : "Изпрати"}
          </button>
          {sent && <span style={{ marginLeft: 10, opacity: 0.9 }}>Изпратено ✅</span>}
        </div>
      </form>
    </div>
  );
}

function PageModal({ title, children, onClose }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="btnGhost" onClick={onClose}>✕</button>
        </div>

        <div className="modalBody">
          <div className="modalStep" style={{ lineHeight: 1.55 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <p><b>Последна актуализация:</b> 2026 г.</p>

      <p>
        StrayMap е доброволческа онлайн платформа за по-лесно споделяне на сигнали за намерени,
        изгубени или нуждаещи се от помощ животни.
      </p>

      <p>
        Ние се стремим да събираме <b>минимално количество информация</b>, необходимо единствено
        за функционирането на платформата.
      </p>

      <h3>1. Каква информация се събира</h3>
      <p>StrayMap <b>не изисква регистрация</b> и не събира чувствителни лични данни.</p>
      <p>Потребителите могат доброволно да предоставят:</p>
      <ul>
        <li>текстово съдържание в сигнал или съобщение</li>
        <li>местоположение чрез карта (поставяне на пин)</li>
        <li>снимки, качени от потребителя</li>
        <li>контактна информация, само ако потребителят избере да я остави</li>
      </ul>

      <h3>2. Цел на използване</h3>
      <ul>
        <li>публикуване и визуализация на сигнали</li>
        <li>координация между доброволци</li>
        <li>поддръжка и подобрение на платформата</li>
        <li>отговор на изпратени съобщения</li>
      </ul>

      <p>Информацията <b>не се продава</b> и не се използва за маркетинг.</p>

      <h3>3. Съхранение на данни</h3>
      <p>
        Данните се съхраняват в облачна инфраструктура (Supabase) за целите на работата на StrayMap.
        StrayMap може да премахва съдържание при злоупотреба, техническа необходимост или правно изискване.
      </p>

      <h3>4. Важно</h3>
      <p>
        StrayMap е доброволческа платформа и <b>не е спешна услуга</b>. Не гарантираме реакция по сигнал
        в определен срок. При спешност се обърнете към компетентни органи.
      </p>

      <h3>5. Контакт</h3>
      <p><b>info@straymap.org</b></p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p><b>Последна актуализация:</b> 2026 г.</p>

      <h3>1. Описание на услугата</h3>
      <p>
        StrayMap е доброволческа платформа за публикуване на сигнали за животни и споделяне на информация
        между хора, които искат да помогнат.
      </p>

      <h3>2. Липса на гаранция за помощ</h3>
      <p>
        StrayMap <b>не гарантира</b> реакция по сигнал, не предоставя спасителни екипи и не замества
        институции или ветеринарна помощ.
      </p>

      <h3>3. Отговорност на потребителите</h3>
      <ul>
        <li>Публикувайте информация добросъвестно и без подвеждане.</li>
        <li>Не публикувайте незаконно, обидно или опасно съдържание.</li>
        <li>Не злоупотребявайте със системата (спам/фалшиви сигнали).</li>
      </ul>

      <p>StrayMap си запазва правото да премахва съдържание при злоупотреба.</p>

      <h3>4. Ограничаване на отговорността</h3>
      <p>
        StrayMap не носи отговорност за действията на потребителите, за точността на публикуваната информация,
        както и за вреди, произтичащи от използването на платформата.
      </p>

      <h3>5. Промени</h3>
      <p>
        Условията могат да бъдат актуализирани. Продължаването на използването на StrayMap означава,
        че приемате актуалната версия.
      </p>

      <h3>6. Контакт</h3>
      <p><b>info@straymap.org</b></p>
    </>
  );
}

function AboutPage() {
  return (
    <div className="simplePage" style={{ maxWidth: 840 }}>
      <h2>За нас</h2>
      <p>
        StrayMap е доброволчески проект, създаден с една проста цел:
        <b> по-лесно и по-бързо намиране на помощ за животни в нужда.</b>
      </p>

      <ul>
        <li>Подаване на сигнал без регистрация</li>
        <li>Пин на карта</li>
        <li>Поемане на случай от доброволец</li>
        <li>Добавяне на актуална информация и снимки</li>
      </ul>

      <p>
        StrayMap <b>не е спешна услуга</b> и не гарантира реакция в определен срок.
        При спешност се обърнете към компетентни органи.
      </p>

      <p>
        Проектът се развива доброволно и ще се подобрява с обратна връзка от общността.
      </p>
    </div>
  );
}

function CloseCaseModal({ report, onClose, onDone }) {
  const [result, setResult] = useState("resolved"); // "resolved" | "reopen" | "fake"
  const [note, setNote] = useState("");
  const [needsHelp, setNeedsHelp] = useState(false);
  const [helpNote, setHelpNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function deleteAsFake() {
    if (!report?.id) return;

    const localToken = localStorage.getItem(`claimed_${report.id}`);
    if (!localToken) {
      alert("Нямаш право да изтриеш този сигнал.");
      return;
    }

    const ok = window.confirm(
      "Сигурна ли си?\n\nТова ще маркира сигнала като фалшив и ще го изтрие завинаги."
    );
    if (!ok) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("reports")
        .delete()
        .eq("id", report.id)
        .eq("claimer_token", localToken)
        .select("id");

      if (error) {
        console.error("DELETE ERROR:", error);
        alert(`Грешка при изтриване: ${error.message}\n${error.details || ""}`);
        return;
      }
      if (!data || data.length === 0) {
        alert("Не се изтри ред (възможно е token mismatch / RLS).");
        return;
      }

      localStorage.removeItem(`claimed_${report.id}`);
      onDone?.();
    } catch (e) {
      console.error("DELETE FAKE ERROR:", e);
      alert("Грешка при изтриване. Виж конзолата.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!report?.id) return;

    const localToken = localStorage.getItem(`claimed_${report.id}`);
    if (!localToken) {
      alert("Нямаш право да затвориш този сигнал.");
      return;
    }

    if (result === "fake") {
      await deleteAsFake();
      return;
    }

    setSaving(true);
    try {
      let nextStatus = "open";
      if (result === "resolved") {
        nextStatus = needsHelp ? "needs_help" : "resolved";
      } else if (result === "reopen") {
        nextStatus = "open";
      }

      const patch = {
        status: nextStatus,
        closure_result: result,
        closure_note: note.trim() || null,
        needs_help: result === "resolved" ? needsHelp : false,
        help_note: result === "resolved" && needsHelp ? (helpNote.trim() || null) : null,
        closed_at: nextStatus === "resolved" ? new Date().toISOString() : null,
      };

      if (result === "reopen") {
        patch.claimer_token = null;
        patch.claimed_at = null;
        patch.last_claimer_activity_at = null;
      }

      const { data, error } = await supabase
        .from("reports")
        .update(patch)
        .eq("id", report.id)
        .eq("claimer_token", localToken)
        .select("id")
        .single();

      if (error) {
        console.error("UPDATE ERROR:", error);
        alert(`Грешка: ${error.message}\n${error.details || ""}`);
        return;
      }
      if (!data) {
        alert("Не се обнови ред (възможно е token mismatch / RLS).");
        return;
      }

      if (nextStatus !== "needs_help") {
        localStorage.removeItem(`claimed_${report.id}`);
      }

      onDone?.();
    } catch (e) {
      console.error("CLOSE CASE ERROR:", e);
      alert("Грешка при затваряне. Виж конзолата.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Затвори сигнал</div>
          <button className="btnGhost" onClick={onClose}>✕</button>
        </div>

        <div className="modalBody">
          <div className="modalStep">
            <label className="field">
              <div className="label">Как завърши случаят?</div>
              <select className="input" value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="resolved">Решен</option>
                <option value="reopen">Върни към Активни</option>
                <option value="fake">Фалшив сигнал</option>
              </select>
            </label>

            {result === "resolved" && (
              <>
                <label className="field checkboxRow">
                  <input
                    type="checkbox"
                    checked={needsHelp}
                    onChange={(e) => setNeedsHelp(e.target.checked)}
                  />
                  <span>Животното има нужда от помощ</span>
                </label>

                {needsHelp && (
                  <label className="field">
                    <div className="label">Каква помощ е нужна?</div>
                    <textarea
                      className="textarea"
                      value={helpNote}
                      onChange={(e) => setHelpNote(e.target.value)}
                      rows={3}
                      placeholder="Пр: транспорт до клиника, храна за 2 седмици, приемен дом…"
                    />
                  </label>
                )}
              </>
            )}

            <label className="field">
              <div className="label">Бележка</div>
              <textarea
                className="textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Какво се случи, как хората да Ви контактират?"
              />
            </label>

            <div className="actions">
              <button className="btnGhost" onClick={onClose}>Отказ</button>

              {result === "fake" ? (
                <button
                  className="btnPrimary"
                  onClick={deleteAsFake}
                  disabled={saving}
                  style={{ background: "#ef4444", borderColor: "rgba(239,68,68,0.35)" }}
                >
                  {saving ? "Трия..." : "Изтрий сигнала"}
                </button>
              ) : (
                <button className="btnPrimary" onClick={submit} disabled={saving}>
                  {saving ? "Записвам..." : "Запази"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
