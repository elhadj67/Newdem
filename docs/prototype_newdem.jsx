import React, { useState, useEffect, useRef } from "react";
import {
  Car, Bike, MapPin, Navigation, Star, Wallet, Phone, Shield,
  Check, X, Clock, ChevronRight, Plus, Search
} from "lucide-react";

/* ============================ Données ============================ */
const PRICING = {
  car:  { label: "Voiture", base: 500, perKm: 300, perMin: 25, min: 1000, seats: 4, eta: "4 min" },
  moto: { label: "Moto",    base: 250, perKm: 150, perMin: 15, min: 500,  seats: 1, eta: "2 min" },
};
const COMMISSION = 0.18;

const PICKUP = { name: "Position actuelle", detail: "Sacré-Cœur 3", x: 46, y: 52 };

const PLACES = [
  { name: "Place de l'Indépendance", zone: "Plateau",      km: 6.2, min: 22, x: 20, y: 80 },
  { name: "Les Almadies",            zone: "Ngor",          km: 9.4, min: 28, x: 74, y: 20 },
  { name: "Marché de Médina",        zone: "Médina",        km: 4.1, min: 16, x: 33, y: 64 },
  { name: "Point E",                 zone: "Fann",          km: 3.3, min: 12, x: 42, y: 66 },
  { name: "Mosquée de la Divinité",  zone: "Ouakam",        km: 5.0, min: 18, x: 64, y: 34 },
  { name: "Aéroport LSS / Yoff",     zone: "Yoff",          km: 11.2, min: 32, x: 80, y: 14 },
  { name: "Parcelles Assainies",     zone: "Unité 15",      km: 8.0, min: 25, x: 58, y: 28 },
  { name: "Marché Sandaga",          zone: "Plateau",       km: 5.5, min: 20, x: 24, y: 76 },
];

const IDLE_DRIVERS = [
  { id: 1, type: "car",  x: 38, y: 44 }, { id: 2, type: "moto", x: 55, y: 58 },
  { id: 3, type: "car",  x: 60, y: 46 }, { id: 4, type: "moto", x: 44, y: 64 },
  { id: 5, type: "car",  x: 30, y: 56 }, { id: 6, type: "moto", x: 52, y: 40 },
];

const DRIVERS = {
  car:  { name: "Ousmane D.", rating: 4.9, vehicle: "Toyota Corolla · gris", plate: "DK-4821-A", start: { x: 34, y: 40 } },
  moto: { name: "Modou F.",   rating: 4.8, vehicle: "Yamaha · rouge",        plate: "DK-9137-M", start: { x: 58, y: 62 } },
};

const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
const roundFare = (n) => Math.round(n / 100) * 100;
function computeFare(type, km, min) {
  const p = PRICING[type];
  return roundFare(Math.max(p.min, p.base + km * p.perKm + min * p.perMin));
}

/* ============================ Styles ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
.newdem {
  --teal:#0B6E6E; --teal-d:#084F4F; --teal-ink:#0A2E2E; --accent:#E4572E;
  --wave:#12BFE3; --om:#FF7900; --cash:#12B886;
  --bg:#EAF1F0; --card:#FFFFFF; --line:#E2ECEA; --muted:#6B7A78; --ink:#0E1B1B;
  --sand:#F4F8F7;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink);
  min-height:100%; width:100%;
  background:
    radial-gradient(1200px 500px at 80% -10%, rgba(11,110,110,.10), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, rgba(228,87,46,.08), transparent 60%),
    var(--bg);
  display:flex; align-items:center; justify-content:center;
  padding:28px 16px;
}
.newdem .wrap { width:100%; max-width:920px; display:flex; gap:40px; align-items:center; justify-content:center; flex-wrap:wrap; }
.newdem .pitch { flex:1 1 240px; max-width:340px; min-width:240px; }
.newdem .pitch .logo { font-family:'Sora'; font-weight:800; font-size:40px; letter-spacing:-1px; color:var(--teal); line-height:1; }
.newdem .pitch .tag { color:var(--accent); font-style:italic; font-weight:600; margin-top:6px; }
.newdem .pitch p { color:var(--muted); font-size:14px; line-height:1.6; margin-top:16px; }
.newdem .pitch .note { margin-top:18px; font-size:12px; color:var(--muted); border-top:1px solid var(--line); padding-top:14px; }

/* phone */
.newdem .phone {
  width:376px; max-width:100%; height:760px; background:#0A2E2E;
  border-radius:44px; padding:11px; position:relative;
  box-shadow:0 30px 70px -20px rgba(8,46,46,.55), 0 0 0 1px rgba(255,255,255,.04) inset;
  flex:0 0 auto;
}
.newdem .screen { position:relative; width:100%; height:100%; background:var(--sand);
  border-radius:34px; overflow:hidden; display:flex; flex-direction:column; }
.newdem .notch { position:absolute; top:14px; left:50%; transform:translateX(-50%);
  width:120px; height:26px; background:#0A2E2E; border-radius:0 0 16px 16px; z-index:40; }

/* statusbar + appbar */
.newdem .statusbar { display:flex; justify-content:space-between; align-items:center;
  padding:14px 22px 6px; font-size:12px; font-weight:600; color:var(--teal-ink); z-index:30; }
.newdem .appbar { display:flex; align-items:center; justify-content:space-between;
  padding:2px 16px 12px; z-index:30; }
.newdem .brand { font-family:'Sora'; font-weight:800; font-size:20px; color:var(--teal); letter-spacing:-.5px; }
.newdem .modeswitch { display:flex; background:#DDE9E7; border-radius:999px; padding:3px; }
.newdem .modeswitch button { border:0; background:transparent; font:inherit; font-size:11px; font-weight:600;
  color:var(--muted); padding:5px 11px; border-radius:999px; cursor:pointer; }
.newdem .modeswitch button.on { background:#fff; color:var(--teal); box-shadow:0 1px 3px rgba(0,0,0,.08); }

/* map */
.newdem .map { position:relative; flex:1 1 auto; overflow:hidden; background:#DCE9E4; }
.newdem .map svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.newdem .lm { position:absolute; transform:translate(-50%,-50%); font-size:8.5px; color:#5E6E6A;
  font-weight:600; white-space:nowrap; pointer-events:none; }
.newdem .lm i { display:block; width:5px; height:5px; border-radius:50%; background:#9BB0AB; margin:0 auto 2px; }
.newdem .mk { position:absolute; transform:translate(-50%,-50%); z-index:10;
  width:26px; height:26px; border-radius:50%; display:grid; place-items:center;
  box-shadow:0 3px 8px rgba(0,0,0,.22); animation:bob 3.4s ease-in-out infinite; }
.newdem .mk.car  { background:var(--teal); color:#fff; }
.newdem .mk.moto { background:var(--accent); color:#fff; width:22px; height:22px; }
.newdem .driver { position:absolute; transform:translate(-50%,-50%); z-index:20; width:34px; height:34px;
  border-radius:50%; background:#0E1B1B; color:#fff; display:grid; place-items:center;
  box-shadow:0 6px 14px rgba(0,0,0,.35); border:2px solid #fff; }
.newdem .pin { position:absolute; transform:translate(-50%,-100%); z-index:15; display:flex; flex-direction:column; align-items:center; }
.newdem .pin .head { width:16px; height:16px; border-radius:50% 50% 50% 0; transform:rotate(45deg);
  box-shadow:0 3px 7px rgba(0,0,0,.3); }
.newdem .pin.dest .head { background:var(--accent); }
.newdem .pickup { position:absolute; transform:translate(-50%,-50%); z-index:15; }
.newdem .pickup .dot { width:14px; height:14px; border-radius:50%; background:var(--teal); border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.3); }
.newdem .pickup .ring { position:absolute; inset:-8px; border-radius:50%; border:2px solid var(--teal); opacity:.5; animation:ping 2.2s ease-out infinite; }
.newdem .radar { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); z-index:14; }
.newdem .radar span { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); border-radius:50%;
  border:2px solid var(--teal); opacity:0; animation:radar 2.4s ease-out infinite; }
@keyframes radar { 0%{width:20px;height:20px;opacity:.7} 100%{width:220px;height:220px;opacity:0} }
@keyframes ping { 0%{transform:scale(.7);opacity:.6} 100%{transform:scale(1.8);opacity:0} }
@keyframes bob { 0%,100%{margin-top:0} 50%{margin-top:-3px} }

/* bottom sheet */
.newdem .sheet { background:var(--card); border-radius:24px 24px 0 0; margin-top:-22px; z-index:25;
  box-shadow:0 -12px 30px -18px rgba(10,46,46,.35); padding:14px 18px 20px;
  position:relative; max-height:66%; overflow-y:auto; }
.newdem .handle { width:38px; height:4px; border-radius:99px; background:#D5E1DE; margin:0 auto 12px; }
.newdem .h1 { font-family:'Sora'; font-weight:700; font-size:17px; letter-spacing:-.3px; }
.newdem .sub { color:var(--muted); font-size:12.5px; margin-top:2px; }

/* fields / places */
.newdem .field { display:flex; align-items:center; gap:10px; background:var(--sand); border:1px solid var(--line);
  border-radius:14px; padding:12px 14px; margin-top:12px; cursor:pointer; }
.newdem .field .t { font-weight:600; font-size:14px; }
.newdem .field .m { color:var(--muted); font-size:12px; }
.newdem .place { display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid var(--line); cursor:pointer; }
.newdem .place:last-child { border-bottom:0; }
.newdem .place .ic { width:34px; height:34px; border-radius:10px; background:var(--sand); display:grid; place-items:center; color:var(--teal); flex:0 0 auto; }
.newdem .place .n { font-weight:600; font-size:13.5px; }
.newdem .place .z { color:var(--muted); font-size:11.5px; }

/* ride cards */
.newdem .rides { display:flex; flex-direction:column; gap:10px; margin-top:14px; }
.newdem .ride { display:flex; align-items:center; gap:12px; border:1.5px solid var(--line); border-radius:16px;
  padding:12px 14px; cursor:pointer; background:#fff; transition:border-color .15s, background .15s; }
.newdem .ride.on { border-color:var(--teal); background:#F2FaF9; }
.newdem .ride .ic { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; color:#fff; flex:0 0 auto; }
.newdem .ride .nm { font-family:'Sora'; font-weight:600; font-size:15px; }
.newdem .ride .dt { color:var(--muted); font-size:11.5px; margin-top:1px; }
.newdem .ride .pr { margin-left:auto; text-align:right; font-family:'Sora'; font-weight:700; font-size:15px; }
.newdem .ride .pr small { display:block; font-family:'Inter'; font-weight:500; color:var(--muted); font-size:10px; }

/* buttons */
.newdem .btn { width:100%; border:0; border-radius:14px; padding:14px; font:inherit; font-weight:700; font-size:15px;
  cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:14px; }
.newdem .btn.primary { background:var(--teal); color:#fff; box-shadow:0 8px 18px -8px rgba(11,110,110,.6); }
.newdem .btn.primary:active { transform:translateY(1px); }
.newdem .btn.dark { background:#0E1B1B; color:#fff; }
.newdem .btn.ghost { background:var(--sand); color:var(--teal); }
.newdem .btn.accent { background:var(--accent); color:#fff; }
.newdem .btn:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }

/* driver assigned card */
.newdem .dcard { display:flex; align-items:center; gap:12px; margin-top:14px; }
.newdem .dcard .av { width:52px; height:52px; border-radius:50%; background:var(--teal); color:#fff;
  display:grid; place-items:center; font-family:'Sora'; font-weight:700; font-size:18px; flex:0 0 auto; }
.newdem .dcard .nm { font-family:'Sora'; font-weight:700; font-size:15px; }
.newdem .dcard .ve { color:var(--muted); font-size:12px; margin-top:1px; }
.newdem .star { color:#F2A93B; display:inline-flex; align-items:center; gap:3px; font-weight:600; font-size:12px; }
.newdem .acts { display:flex; gap:10px; margin-left:auto; }
.newdem .acts button { width:40px; height:40px; border-radius:50%; border:1px solid var(--line);
  background:#fff; display:grid; place-items:center; cursor:pointer; color:var(--teal); }
.newdem .eta { display:flex; align-items:center; gap:8px; background:var(--sand); border-radius:12px;
  padding:11px 14px; margin-top:12px; font-size:13px; font-weight:600; color:var(--teal-ink); }
.newdem .eta b { font-family:'Sora'; }

/* trip progress */
.newdem .prog { height:5px; border-radius:99px; background:var(--line); margin:14px 0 4px; overflow:hidden; }
.newdem .prog i { display:block; height:100%; background:var(--teal); border-radius:99px; transition:width .4s linear; }

/* payment */
.newdem .pay { display:flex; flex-direction:column; gap:10px; margin-top:14px; }
.newdem .po { display:flex; align-items:center; gap:12px; border:1.5px solid var(--line); border-radius:14px; padding:12px 14px; cursor:pointer; }
.newdem .po.on { border-color:var(--teal); background:#F2FaF9; }
.newdem .po .ic { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; color:#fff; font-weight:800; font-size:12px; font-family:'Sora'; flex:0 0 auto; }
.newdem .po .n { font-weight:600; font-size:13.5px; }
.newdem .po .d { color:var(--muted); font-size:11.5px; }
.newdem .po .ck { margin-left:auto; width:20px; height:20px; border-radius:50%; border:2px solid var(--line); display:grid; place-items:center; }
.newdem .po.on .ck { border-color:var(--teal); background:var(--teal); color:#fff; }

.newdem .breakdown { background:var(--sand); border-radius:14px; padding:12px 14px; margin-top:14px; font-size:12.5px; }
.newdem .breakdown .r { display:flex; justify-content:space-between; padding:3px 0; color:var(--muted); }
.newdem .breakdown .r.tot { color:var(--ink); font-weight:700; font-family:'Sora'; font-size:15px; border-top:1px solid var(--line); margin-top:6px; padding-top:9px; }

/* rating */
.newdem .rate { display:flex; justify-content:center; gap:8px; margin:16px 0 4px; }
.newdem .rate button { border:0; background:transparent; cursor:pointer; color:#E0E7E5; }
.newdem .rate button.on { color:#F2A93B; }
.newdem .tips { display:flex; gap:8px; margin-top:12px; }
.newdem .tips button { flex:1; border:1.5px solid var(--line); background:#fff; border-radius:12px; padding:10px; font:inherit;
  font-weight:600; font-size:13px; cursor:pointer; color:var(--teal-ink); }
.newdem .tips button.on { border-color:var(--teal); background:#F2FaF9; color:var(--teal); }

/* toast overlay */
.newdem .overlay { position:absolute; inset:0; z-index:60; background:rgba(10,46,46,.55);
  display:flex; align-items:center; justify-content:center; padding:24px; backdrop-filter:blur(2px); }
.newdem .modal { background:#fff; border-radius:22px; padding:24px; text-align:center; width:100%; }
.newdem .modal .big { width:60px; height:60px; border-radius:50%; display:grid; place-items:center; margin:0 auto 14px; color:#fff; }
.newdem .spin { width:44px; height:44px; border-radius:50%; border:4px solid var(--line); border-top-color:var(--teal); margin:0 auto 16px; animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

/* driver mode */
.newdem .dpanel { flex:1 1 auto; overflow-y:auto; padding:4px 18px 20px; }
.newdem .online { display:flex; align-items:center; justify-content:space-between; background:#fff; border:1px solid var(--line);
  border-radius:16px; padding:14px 16px; margin-top:8px; }
.newdem .toggle { width:52px; height:30px; border-radius:99px; background:#CBD8D5; position:relative; cursor:pointer; transition:background .2s; flex:0 0 auto; }
.newdem .toggle.on { background:var(--cash); }
.newdem .toggle i { position:absolute; top:3px; left:3px; width:24px; height:24px; border-radius:50%; background:#fff; transition:left .2s; box-shadow:0 1px 3px rgba(0,0,0,.2); }
.newdem .toggle.on i { left:25px; }
.newdem .wallet { background:linear-gradient(135deg,var(--teal),var(--teal-d)); color:#fff; border-radius:18px; padding:18px; margin-top:14px; }
.newdem .wallet .lab { font-size:11.5px; opacity:.8; letter-spacing:.3px; text-transform:uppercase; }
.newdem .wallet .bal { font-family:'Sora'; font-weight:800; font-size:30px; margin-top:4px; letter-spacing:-.5px; }
.newdem .wallet .cap { font-size:11px; opacity:.75; margin-top:8px; }
.newdem .req { border:1.5px solid var(--teal); border-radius:16px; padding:14px; margin-top:14px; background:#F2FaF9; }
.newdem .req .leg { display:flex; gap:10px; align-items:flex-start; padding:6px 0; }
.newdem .req .leg .d { width:9px; height:9px; border-radius:50%; margin-top:4px; flex:0 0 auto; }
.newdem .req .leg .n { font-weight:600; font-size:13px; }
.newdem .req .leg .z { color:var(--muted); font-size:11px; }
.newdem .ledger { margin-top:14px; }
.newdem .ledger .li { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line); font-size:13px; }
.newdem .ledger .li .n { font-weight:600; }
.newdem .ledger .li .s { color:var(--muted); font-size:11px; }
.newdem .amt.pos { color:var(--cash); font-weight:700; font-family:'Sora'; }
.newdem .amt.neg { color:var(--accent); font-weight:700; font-family:'Sora'; }
.newdem .muted { color:var(--muted); }
.newdem .center { text-align:center; }

@media (prefers-reduced-motion: reduce) {
  .newdem .mk, .newdem .radar span, .newdem .pickup .ring, .newdem .spin { animation:none !important; }
}
@media (max-width:560px){ .newdem .pitch { display:none; } .newdem { padding:14px; } .newdem .phone{ height:720px; } }
`;

/* ============================ Composant ============================ */
export default function NewdemApp() {
  const [mode, setMode] = useState("rider");
  return (
    <div className="newdem">
      <style>{CSS}</style>
      <div className="wrap">
        <aside className="pitch">
          <div className="logo">Newdem</div>
          <div className="tag">Allons-y !</div>
          <p>Prototype cliquable du parcours passager : commande d'une voiture ou d'une moto,
             estimation transparente, suivi en direct et paiement Espèces, Wave ou Orange Money.
             Passez en <b>Mode Chauffeur</b> pour voir le portefeuille et le prélèvement de commission.</p>
          <div className="note">Maquette de démonstration — carte de Dakar stylisée, données simulées,
             aucun paiement réel. VTC voitures &amp; motos pour le Sénégal.</div>
        </aside>

        <div className="phone">
          <div className="notch" />
          <div className="screen">
            <div className="statusbar">
              <span>9:41</span>
              <span>Dakar · 4G</span>
            </div>
            <div className="appbar">
              <div className="brand">Newdem</div>
              <div className="modeswitch">
                <button className={mode === "rider" ? "on" : ""} onClick={() => setMode("rider")}>Passager</button>
                <button className={mode === "driver" ? "on" : ""} onClick={() => setMode("driver")}>Chauffeur</button>
              </div>
            </div>
            {mode === "rider" ? <Rider /> : <Driver />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ Passager ============================ */
function Rider() {
  const [screen, setScreen] = useState("home");     // home|select|match|enroute|trip|pay|done
  const [dest, setDest] = useState(null);
  const [type, setType] = useState("car");
  const [pay, setPay] = useState("cash");
  const [driverPos, setDriverPos] = useState(null); // {x,y,dur}
  const [eta, setEta] = useState(4);
  const [prog, setProg] = useState(0);
  const [overlay, setOverlay] = useState(null);      // 'pay' spinner
  const [stars, setStars] = useState(5);
  const [tip, setTip] = useState(0);
  const timers = useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const T = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
  useEffect(() => () => clearTimers(), []);

  const fare = dest ? computeFare(type, dest.km, dest.min) : 0;
  const driver = DRIVERS[type];

  const reset = () => {
    clearTimers();
    setScreen("home"); setDest(null); setType("car"); setPay("cash");
    setDriverPos(null); setProg(0); setStars(5); setTip(0); setOverlay(null);
  };

  const order = () => {
    setScreen("match");
    T(() => {
      // chauffeur trouvé -> en approche
      setDriverPos({ ...driver.start, dur: 0 });
      setScreen("enroute");
      const arr = type === "moto" ? 2 : 4; setEta(arr);
      T(() => setDriverPos({ x: PICKUP.x, y: PICKUP.y, dur: 5.4 }), 60);
      // décompte ETA
      let e = arr;
      const tick = () => { e -= 1; setEta(Math.max(1, e)); if (e > 1) T(tick, 5400 / arr); };
      T(tick, 5400 / arr);
      // à bord -> trajet
      T(() => {
        setScreen("trip"); setProg(0);
        setDriverPos({ x: dest.x, y: dest.y, dur: 6.2 });
        let p = 0; const step = () => { p += 4; setProg(Math.min(100, p)); if (p < 100) T(step, 250); };
        T(step, 250);
        T(() => setScreen("pay"), 6400);
      }, 5600);
    }, 2300);
  };

  const confirmPay = () => {
    if (pay === "cash") { setScreen("done"); return; }
    setOverlay("pay");
    T(() => { setOverlay(null); setScreen("done"); }, 1500);
  };

  return (
    <>
      <div className="map">
        <MapSVG />
        {PLACES.slice(0, 6).map((p) => (
          <div key={p.name} className="lm" style={{ left: p.x + "%", top: p.y + "%" }}>
            <i /> {p.zone}
          </div>
        ))}
        {/* chauffeurs au repos (accueil / sélection) */}
        {(screen === "home" || screen === "select") && IDLE_DRIVERS.map((d) => (
          <div key={d.id} className={"mk " + d.type} style={{ left: d.x + "%", top: d.y + "%" }}>
            {d.type === "car" ? <Car size={14} /> : <Bike size={12} />}
          </div>
        ))}
        {/* point de départ */}
        {screen !== "trip" && (
          <div className="pickup" style={{ left: PICKUP.x + "%", top: PICKUP.y + "%" }}>
            <div className="ring" /><div className="dot" />
          </div>
        )}
        {/* destination */}
        {dest && screen !== "match" && (
          <div className="pin dest" style={{ left: dest.x + "%", top: dest.y + "%" }}>
            <div className="head" />
          </div>
        )}
        {/* recherche */}
        {screen === "match" && (
          <div className="radar"><span /><span style={{ animationDelay: ".8s" }} /><span style={{ animationDelay: "1.6s" }} /></div>
        )}
        {/* chauffeur assigné */}
        {driverPos && ["enroute", "trip"].includes(screen) && (
          <div className="driver" style={{
            left: driverPos.x + "%", top: driverPos.y + "%",
            transition: `left ${driverPos.dur}s linear, top ${driverPos.dur}s linear`,
          }}>
            {type === "car" ? <Car size={17} /> : <Bike size={15} />}
          </div>
        )}
      </div>

      <div className="sheet">
        <div className="handle" />

        {screen === "home" && (
          <>
            <div className="h1">Où allez-vous ?</div>
            <div className="sub">Depuis {PICKUP.detail} · {PICKUP.name.toLowerCase()}</div>
            <div className="field" onClick={() => setScreen("select")}>
              <Search size={17} color="#0B6E6E" />
              <div><div className="t">Choisir une destination</div><div className="m">Dakar et environs</div></div>
              <ChevronRight size={18} color="#9BB0AB" style={{ marginLeft: "auto" }} />
            </div>
            <div style={{ marginTop: 16 }} className="sub">Suggestions</div>
            {PLACES.slice(0, 3).map((p) => (
              <div key={p.name} className="place" onClick={() => { setDest(p); setScreen("select"); }}>
                <div className="ic"><MapPin size={16} /></div>
                <div><div className="n">{p.name}</div><div className="z">{p.zone} · {p.km} km</div></div>
                <ChevronRight size={16} color="#C4D2CF" style={{ marginLeft: "auto" }} />
              </div>
            ))}
          </>
        )}

        {screen === "select" && (
          <>
            {!dest ? (
              <>
                <div className="h1">Destination</div>
                <div className="sub">Sélectionnez un point d'arrivée</div>
                <div style={{ marginTop: 10 }}>
                  {PLACES.map((p) => (
                    <div key={p.name} className="place" onClick={() => setDest(p)}>
                      <div className="ic"><MapPin size={16} /></div>
                      <div><div className="n">{p.name}</div><div className="z">{p.zone} · {p.km} km · ~{p.min} min</div></div>
                      <ChevronRight size={16} color="#C4D2CF" style={{ marginLeft: "auto" }} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="h1">Choisissez votre course</div>
                <div className="sub">Vers {dest.name} · {dest.km} km</div>
                <div className="rides">
                  {["car", "moto"].map((tk) => {
                    const p = PRICING[tk];
                    return (
                      <div key={tk} className={"ride " + (type === tk ? "on" : "")} onClick={() => setType(tk)}>
                        <div className="ic" style={{ background: tk === "car" ? "#0B6E6E" : "#E4572E" }}>
                          {tk === "car" ? <Car size={22} /> : <Bike size={20} />}
                        </div>
                        <div>
                          <div className="nm">{p.label}</div>
                          <div className="dt">{p.seats} {p.seats > 1 ? "places" : "place"} · arrivée ~{p.eta}</div>
                        </div>
                        <div className="pr">{fmt(computeFare(tk, dest.km, dest.min))}<small>FCFA</small></div>
                      </div>
                    );
                  })}
                </div>
                <button className="btn primary" onClick={order}>
                  Commander · {fmt(fare)} FCFA
                </button>
                <button className="btn ghost" onClick={() => setDest(null)}>Changer de destination</button>
              </>
            )}
          </>
        )}

        {screen === "match" && (
          <div className="center" style={{ padding: "10px 0" }}>
            <div className="spin" />
            <div className="h1">Recherche d'un chauffeur…</div>
            <div className="sub">{PRICING[type].label} disponible vers {dest.name}</div>
          </div>
        )}

        {screen === "enroute" && (
          <>
            <div className="eta"><Clock size={16} /> Votre chauffeur arrive dans <b>{eta} min</b></div>
            <div className="dcard">
              <div className="av">{driver.name.charAt(0)}</div>
              <div>
                <div className="nm">{driver.name}</div>
                <div className="ve">{driver.vehicle} · {driver.plate}</div>
                <div className="star"><Star size={12} fill="#F2A93B" /> {driver.rating}</div>
              </div>
              <div className="acts">
                <button><Phone size={16} /></button>
                <button><Shield size={16} /></button>
              </div>
            </div>
            <button className="btn ghost" onClick={reset}>Annuler la course</button>
          </>
        )}

        {screen === "trip" && (
          <>
            <div className="h1">Course en cours</div>
            <div className="sub">{PICKUP.name} → {dest.name}</div>
            <div className="prog"><i style={{ width: prog + "%" }} /></div>
            <div className="sub center">{prog < 100 ? `Trajet · ${Math.round((100 - prog) / 100 * dest.min)} min restantes` : "Arrivée imminente"}</div>
            <div className="dcard">
              <div className="av">{driver.name.charAt(0)}</div>
              <div><div className="nm">{driver.name}</div><div className="ve">{driver.vehicle}</div></div>
              <div className="pr" style={{ marginLeft: "auto", fontFamily: "Sora", fontWeight: 700 }}>{fmt(fare)}<small style={{ display: "block", fontSize: 10, color: "#6B7A78" }}>FCFA</small></div>
            </div>
          </>
        )}

        {screen === "pay" && (
          <>
            <div className="h1">Comment payez-vous ?</div>
            <div className="sub">Course terminée · {dest.name}</div>
            <div className="pay">
              <PayOpt id="cash" cur={pay} set={setPay} color="#12B886" abbr="₣" name="Espèces" desc="Payer le chauffeur en liquide" />
              <PayOpt id="wave" cur={pay} set={setPay} color="#12BFE3" abbr="W" name="Wave" desc="Paiement mobile · 1% de frais" />
              <PayOpt id="om" cur={pay} set={setPay} color="#FF7900" abbr="OM" name="Orange Money" desc="Paiement mobile Orange" />
            </div>
            <div className="breakdown">
              <div className="r"><span>Prise en charge</span><span>{fmt(PRICING[type].base)} F</span></div>
              <div className="r"><span>Distance · {dest.km} km</span><span>{fmt(dest.km * PRICING[type].perKm)} F</span></div>
              <div className="r"><span>Durée · {dest.min} min</span><span>{fmt(dest.min * PRICING[type].perMin)} F</span></div>
              <div className="r tot"><span>Total</span><span>{fmt(fare)} FCFA</span></div>
            </div>
            <button className="btn primary" onClick={confirmPay}>
              {pay === "cash" ? "Confirmer le paiement en espèces" : `Payer ${fmt(fare)} F avec ${pay === "wave" ? "Wave" : "Orange Money"}`}
            </button>
          </>
        )}

        {screen === "done" && (
          <div className="center">
            <div className="h1" style={{ marginTop: 6 }}>Course terminée</div>
            <div className="sub">Notez {driver.name}</div>
            <div className="rate">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={n <= stars ? "on" : ""} onClick={() => setStars(n)}>
                  <Star size={30} fill={n <= stars ? "#F2A93B" : "none"} />
                </button>
              ))}
            </div>
            <div className="sub">Ajouter un pourboire ?</div>
            <div className="tips">
              {[0, 200, 500, 1000].map((v) => (
                <button key={v} className={tip === v ? "on" : ""} onClick={() => setTip(v)}>
                  {v === 0 ? "Aucun" : fmt(v) + " F"}
                </button>
              ))}
            </div>
            <button className="btn primary" onClick={reset}>Nouvelle course</button>
          </div>
        )}
      </div>

      {overlay === "pay" && (
        <div className="overlay">
          <div className="modal">
            <div className="spin" />
            <div className="h1">Confirmation {pay === "wave" ? "Wave" : "Orange Money"}</div>
            <div className="sub">Validez le paiement dans votre application {pay === "wave" ? "Wave" : "Orange Money"}…</div>
          </div>
        </div>
      )}
    </>
  );
}

function PayOpt({ id, cur, set, color, abbr, name, desc }) {
  const on = cur === id;
  return (
    <div className={"po " + (on ? "on" : "")} onClick={() => set(id)}>
      <div className="ic" style={{ background: color }}>{abbr}</div>
      <div><div className="n">{name}</div><div className="d">{desc}</div></div>
      <div className="ck">{on && <Check size={13} />}</div>
    </div>
  );
}

/* ============================ Chauffeur ============================ */
function Driver() {
  const [online, setOnline] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle|request|onTrip|settled
  const [balance, setBalance] = useState(3200);
  const [ledger, setLedger] = useState([
    { n: "Recharge Wave", s: "Hier · 15:20", amt: 5000, pos: true },
    { n: "Commission — course Plateau", s: "Hier · 14:05", amt: -540, pos: false },
  ]);
  const timers = useRef([]);
  const T = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const RIDE = { from: "Sacré-Cœur 3", to: "Place de l'Indépendance", km: 6.2, fare: 3400, method: "Espèces" };
  const commission = Math.round(RIDE.fare * COMMISSION);

  const goOnline = (v) => {
    setOnline(v);
    if (v && phase === "idle") T(() => setPhase("request"), 1600);
    if (!v) setPhase("idle");
  };
  const accept = () => setPhase("onTrip");
  const decline = () => { setPhase("idle"); T(() => online && setPhase("request"), 3000); };
  const finish = () => {
    // course cash : le chauffeur garde le cash, commission prélevée du wallet
    setBalance((b) => b - commission);
    setLedger((l) => [{ n: "Commission — course Plateau", s: "À l'instant", amt: -commission, pos: false }, ...l]);
    setPhase("settled");
  };
  const recharge = () => {
    setBalance((b) => b + 5000);
    setLedger((l) => [{ n: "Recharge Wave", s: "À l'instant", amt: 5000, pos: true }, ...l]);
  };

  return (
    <div className="dpanel">
      <div className="online">
        <div>
          <div className="h1" style={{ fontSize: 15 }}>{online ? "Vous êtes en ligne" : "Hors ligne"}</div>
          <div className="sub">{online ? "Vous recevez des courses" : "Activez pour recevoir des courses"}</div>
        </div>
        <div className={"toggle " + (online ? "on" : "")} onClick={() => goOnline(!online)}><i /></div>
      </div>

      <div className="wallet">
        <div className="lab">Portefeuille conducteur</div>
        <div className="bal">{fmt(balance)} <span style={{ fontSize: 15 }}>FCFA</span></div>
        <div className="cap">La commission Newdem est prélevée ici, même sur les courses payées en espèces.
          Solde minimum autorisé : −2 000 F.</div>
        <button className="btn" style={{ background: "rgba(255,255,255,.16)", color: "#fff", marginTop: 12 }} onClick={recharge}>
          <Plus size={16} /> Recharger via Wave / Orange Money
        </button>
      </div>

      {phase === "request" && (
        <div className="req">
          <div className="center" style={{ fontWeight: 700, fontFamily: "Sora", marginBottom: 4 }}>
            Nouvelle course · {RIDE.km} km
          </div>
          <div className="leg"><div className="d" style={{ background: "#0B6E6E" }} />
            <div><div className="n">{RIDE.from}</div><div className="z">Prise en charge</div></div></div>
          <div className="leg"><div className="d" style={{ background: "#E4572E" }} />
            <div><div className="n">{RIDE.to}</div><div className="z">Destination</div></div></div>
          <div className="breakdown" style={{ marginTop: 8 }}>
            <div className="r"><span>Montant course ({RIDE.method})</span><span>{fmt(RIDE.fare)} F</span></div>
            <div className="r"><span>Commission Newdem (18%)</span><span style={{ color: "#E4572E" }}>−{fmt(commission)} F</span></div>
            <div className="r tot"><span>Vous encaissez (cash)</span><span>{fmt(RIDE.fare)} F</span></div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={decline}><X size={16} /> Refuser</button>
            <button className="btn primary" style={{ flex: 2 }} onClick={accept}><Check size={16} /> Accepter</button>
          </div>
        </div>
      )}

      {phase === "onTrip" && (
        <div className="req">
          <div className="center" style={{ fontWeight: 700, fontFamily: "Sora", marginBottom: 6 }}>Course en cours</div>
          <div className="sub center">{RIDE.from} → {RIDE.to}</div>
          <button className="btn dark" onClick={finish}><Navigation size={16} /> Terminer la course</button>
        </div>
      )}

      {phase === "settled" && (
        <div className="req" style={{ background: "#F1FBF6", borderColor: "#12B886" }}>
          <div className="center" style={{ color: "#12B886", marginBottom: 6 }}><Check size={26} /></div>
          <div className="center" style={{ fontWeight: 700, fontFamily: "Sora" }}>Course réglée</div>
          <div className="sub center">Vous avez encaissé {fmt(RIDE.fare)} F en espèces.
            Commission de {fmt(commission)} F prélevée du portefeuille.</div>
          <button className="btn primary" onClick={() => setPhase(online ? "request" : "idle")} style={{ marginTop: 12 }}>
            Course suivante
          </button>
        </div>
      )}

      <div className="ledger">
        <div className="sub" style={{ fontWeight: 700, color: "#0E1B1B", marginTop: 4 }}>Derniers mouvements</div>
        {ledger.map((e, i) => (
          <div key={i} className="li">
            <div><div className="n">{e.n}</div><div className="s">{e.s}</div></div>
            <div className={"amt " + (e.pos ? "pos" : "neg")}>{e.pos ? "+" : ""}{fmt(e.amt)} F</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ Carte stylisée (Dakar) ============================ */
function MapSVG() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E4EFE9" /><stop offset="1" stopColor="#D6E7DF" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#land)" />
      {/* océan (péninsule) */}
      <path d="M0,0 L26,0 Q8,20 0,44 Z" fill="#BFE0E6" opacity="0.9" />
      <path d="M100,84 Q70,96 30,100 L100,100 Z" fill="#BFE0E6" opacity="0.9" />
      <path d="M0,72 Q10,86 0,100 L0,72 Z" fill="#BFE0E6" opacity="0.85" />
      {/* routes */}
      <g stroke="#F4F8F7" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M14,86 L40,60 L58,40 L80,16" />
        <path d="M8,50 L46,52 L74,44 L92,30" />
        <path d="M30,64 L52,54 L60,30" />
        <path d="M22,78 L44,64 L58,58 L74,60" />
      </g>
      <g stroke="#CFE0DA" strokeWidth="0.7" fill="none">
        <path d="M14,86 L40,60 L58,40 L80,16" />
        <path d="M8,50 L46,52 L74,44 L92,30" />
      </g>
    </svg>
  );
}
