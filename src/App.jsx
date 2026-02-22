import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ============================================================
// CONFIG
// ============================================================
const API = window.__ENOUGHFI_API__ || "https://enoughfi-api.onrender.com/api";

// ============================================================
// THEME — Warm, modern, FIRE-inspired
// ============================================================
const T = {
  bg: "#FAFAF8", surface: "#FFFFFF", surfaceAlt: "#F5F5F0",
  text: "#1A1A1A", textSec: "#6B6B6B", textTer: "#9CA3AF",
  accent: "#059669", accentLight: "#D1FAE5", accentDark: "#047857",
  fire: "#F97316", fireLight: "#FFF7ED", fireDark: "#EA580C",
  danger: "#EF4444", dangerLight: "#FEE2E2",
  warn: "#F59E0B", warnLight: "#FEF3C7",
  blue: "#3B82F6", blueLight: "#EFF6FF",
  purple: "#8B5CF6",
  border: "#E5E5E0", borderLight: "#F0F0EB",
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  shadowLg: "0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
  shadowXl: "0 12px 40px rgba(0,0,0,0.12)",
  radius: 14, radiusSm: 10, radiusXl: 20,
  font: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace"
};

// ============================================================
// HELPERS
// ============================================================
const fmt = (n) => {
  const num = parseFloat(n) || 0; const abs = Math.abs(num);
  if (abs >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${(num / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
const fmtFull = (n) => parseFloat(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmtDate = (d) => { if (!d) return ""; return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }); };
const fmtDateInput = (d) => { if (!d) return new Date().toISOString().split("T")[0]; return new Date(d).toISOString().split("T")[0]; };
const getCurrentFY = () => { const now = new Date(); return now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear(); };
const getFYRange = (fy) => ({ start: `${fy}-04-01`, end: `${fy + 1}-03-31` });
const getFYLabel = (fy) => `FY ${fy}-${(fy + 1).toString().slice(2)}`;
const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const getMonthRange = (fy, monthIdx) => {
  const year = monthIdx < 9 ? fy : fy + 1;
  const month = ((monthIdx + 3) % 12) + 1;
  const start = `${year}-${String(month).padStart(2,"0")}-01`;
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  return { start, end: `${ny}-${String(nm).padStart(2,"0")}-01` };
};
// Number to Indian words converter
const numToWords = (n) => {
  const num = parseFloat(n) || 0;
  if (num === 0) return "";
  const abs = Math.abs(num);
  if (abs >= 10000000) {
    const cr = abs / 10000000;
    return `${num < 0 ? "Minus " : ""}${cr % 1 === 0 ? cr : cr.toFixed(2)} Crore${cr !== 1 ? "s" : ""}`;
  }
  if (abs >= 100000) {
    const lk = abs / 100000;
    return `${num < 0 ? "Minus " : ""}${lk % 1 === 0 ? lk : lk.toFixed(2)} Lakh${lk !== 1 ? "s" : ""}`;
  }
  if (abs >= 1000) {
    const th = abs / 1000;
    return `${num < 0 ? "Minus " : ""}${th % 1 === 0 ? th : th.toFixed(1)} Thousand`;
  }
  return `${num < 0 ? "Minus " : ""}₹${abs.toLocaleString("en-IN")}`;
};

const typeColors = { Asset:"#059669", Liability:"#dc2626", Income:"#2563eb", Expense:"#d97706", Equity:"#7c3aed" };
const typeIcons = { Asset:"↗", Liability:"↙", Income:"＋", Expense:"－", Equity:"◎" };
const exportCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
};

// ============================================================
// API LAYER
// ============================================================
const api = {
  token: null,
  async call(method, path, body, isFormData) {
    const headers = {};
    if (!isFormData) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const doFetch = async () => {
      const res = await fetch(`${API}${path}`, { method, headers, body: isFormData ? body : body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    };
    try {
      return await doFetch();
    } catch (err) {
      if (err.message?.includes("Failed to fetch")) {
        // Server likely waking up — retry once after 2s
        await new Promise(r => setTimeout(r, 2000));
        try { return await doFetch(); } catch { throw new Error("Server is starting up. Please try again in a few seconds."); }
      }
      throw err;
    }
  },
  // Auth
  login: (e,p) => api.call("POST","/auth/login",{email:e,password:p}),
  register: (n,e,p) => api.call("POST","/auth/register",{name:n,email:e,password:p}),
  me: () => api.call("GET","/auth/me"),
  demoLogin: () => api.call("POST","/auth/demo-login"),
  // Accounts & Transactions
  getAccounts: () => api.call("GET","/accounts"),
  createAccount: (d) => api.call("POST","/accounts",d),
  updateAccount: (id,d) => api.call("PUT",`/accounts/${id}`,d),
  deleteAccount: (id) => api.call("DELETE",`/accounts/${id}`),
  getTransactions: (p="") => api.call("GET",`/transactions?${p}`),
  getSummary: (p="") => api.call("GET",`/transactions/summary?${p}`),
  createTransaction: (d) => api.call("POST","/transactions",d),
  updateTransaction: (id,d) => api.call("PUT",`/transactions/${id}`,d),
  deleteTransaction: (id) => api.call("DELETE",`/transactions/${id}`),
  getDashboard: () => api.call("GET","/dashboard"),
  getFIRE: (p="") => api.call("GET",`/analytics/fire?${p}`),
  getTaxSummary: (fy) => api.call("GET",`/analytics/tax-summary${fy?`?financial_year=${fy}`:""}`),
  importCSV: (fd) => { const h={}; if(api.token) h["Authorization"]=`Bearer ${api.token}`; return fetch(`${API}/transactions/import-csv`,{method:"POST",headers:h,body:fd}).then(r=>r.json()); },
  importUpload: (fd) => { const h={}; if(api.token) h["Authorization"]=`Bearer ${api.token}`; return fetch(`${API}/import/upload`,{method:"POST",headers:h,body:fd}).then(r=>{if(!r.ok) return r.json().then(d=>{throw new Error(d.error||'Upload failed')});return r.json()}); },
  getStaged: (batchId) => api.call("GET",`/import/staged${batchId?`?batch_id=${batchId}`:""}`),
  updateStaged: (id,data) => api.call("PUT",`/import/staged/${id}`,data),
  updateStagedBulk: (ids,updates) => api.call("PUT","/import/staged-bulk",{ids,updates}),
  confirmImport: (batchId) => api.call("POST","/import/confirm",{batch_id:batchId}),
  clearStaged: (batchId) => api.call("DELETE",`/import/staged${batchId?`?batch_id=${batchId}`:""}`),
  // Admin
  adminUsers: () => api.call("GET","/admin/users"),
  adminStats: () => api.call("GET","/admin/stats"),
  adminDeleteUser: (id) => api.call("DELETE",`/admin/users/${id}`),
  adminToggle: (id) => api.call("PUT",`/admin/users/${id}/toggle-admin`),
  // V5: Onboarding & FIRE
  getOnboarding: () => api.call("GET","/onboarding"),
  saveOnboarding: (d) => api.call("POST","/onboarding",d),
  getFireSnapshot: () => api.call("GET","/fire/snapshot"),
  getFireImpact: (d) => api.call("POST","/fire/impact",d),
  quickAdd: (d) => api.call("POST","/quick-add",d),
  askFi: (msg) => api.call("POST","/ask-fi",{message:msg}),
  getFiHistory: () => api.call("GET","/ask-fi/history"),
  clearFiHistory: () => api.call("DELETE","/ask-fi/history"),
};

// ============================================================
// SHARED UI COMPONENTS
// ============================================================
const Spin = ({s=20}) => <div style={{width:s,height:s,border:`2.5px solid ${T.border}`,borderTopColor:T.accent,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;

const Pill = ({children, color=T.accent, bg}) => (
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 10px",fontSize:11,fontWeight:600,borderRadius:20,background:bg||(color+"14"),color,letterSpacing:"-0.01em"}}>{children}</span>
);

const Card = ({children, style={}, onClick, hover}) => (
  <div onClick={onClick} style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:20,boxShadow:T.shadow,transition:"all .2s",...(onClick?{cursor:"pointer"}:{}),
    ...(hover?{":hover":{boxShadow:T.shadowLg}}:{}),...style}}>{children}</div>
);

const Btn = ({children, onClick, variant="primary", size="md", disabled, loading, style={}, full}) => {
  const styles = {
    primary: { background:T.accent, color:"#fff", border:"none" },
    secondary: { background:T.surfaceAlt, color:T.text, border:`1px solid ${T.border}` },
    fire: { background:`linear-gradient(135deg, ${T.fire}, ${T.fireDark})`, color:"#fff", border:"none" },
    danger: { background:T.danger, color:"#fff", border:"none" },
    ghost: { background:"transparent", color:T.textSec, border:"none" },
    outline: { background:"transparent", color:T.accent, border:`1.5px solid ${T.accent}` },
  };
  const sizes = {
    sm: { padding:"6px 14px", fontSize:13 },
    md: { padding:"10px 20px", fontSize:14 },
    lg: { padding:"14px 28px", fontSize:16 },
  };
  return (
    <button onClick={disabled||loading?undefined:onClick} disabled={disabled||loading} style={{
      ...styles[variant]||styles.primary, ...sizes[size]||sizes.md,
      borderRadius:T.radiusSm, fontWeight:600, fontFamily:T.font, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.5:1, display:"inline-flex", alignItems:"center", gap:8, transition:"all .15s",
      letterSpacing:"-0.01em", width:full?"100%":"auto", justifyContent:"center", ...style
    }}>{loading?<Spin s={16}/>:null}{children}</button>
  );
};

const Input = ({label, value, onChange, type="text", placeholder, prefix, suffix, style={}, inputStyle={}, required, min, max, step}) => (
  <div style={{display:"flex",flexDirection:"column",gap:4,...style}}>
    {label && <label style={{fontSize:13,fontWeight:600,color:T.textSec,letterSpacing:"-0.01em"}}>{label}{required&&<span style={{color:T.danger}}> *</span>}</label>}
    <div style={{position:"relative",display:"flex",alignItems:"center"}}>
      {prefix && <span style={{position:"absolute",left:12,fontSize:14,color:T.textTer,fontWeight:600,pointerEvents:"none"}}>{prefix}</span>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
        style={{width:"100%",padding:"10px 14px",paddingLeft:prefix?36:14,paddingRight:suffix?36:14,
        fontSize:15,fontFamily:T.font,border:`1.5px solid ${T.border}`,borderRadius:T.radiusSm,
        background:T.surface,outline:"none",transition:"border .2s",fontWeight:500,...inputStyle}}/>
      {suffix && <span style={{position:"absolute",right:12,fontSize:12,color:T.textTer,fontWeight:500,pointerEvents:"none"}}>{suffix}</span>}
    </div>
  </div>
);

// Icons
const I = {
  home: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tx: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  acc: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  rep: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  set: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3"/></svg>,
  fi: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  fire: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52.74-4.14 2.1-5.86C6.42 7.6 7.8 5.47 8.3 2.54c.06-.3.3-.54.6-.54.24 0 .44.15.52.37C10.56 5.4 12 7.2 13.26 8.23c.14.12.3.1.42-.04.16-.2.26-.44.3-.7.04-.36.22-.64.52-.76.24-.1.5-.04.68.16C17.04 9.1 19 11.5 19 15c0 4.42-3.13 8-7 8z"/></svg>,
  plus: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeLinecap="round"/></svg>,
  send: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  close: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/></svg>,
  admin: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ============================================================
// TOAST
// ============================================================
function Toast({message,type,onClose}) {
  useEffect(()=>{const t=setTimeout(onClose,4000);return()=>clearTimeout(t)},[onClose]);
  const colors = { success:T.accent, error:T.danger, info:T.blue, warning:T.warn };
  return (
    <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,
      background:T.surface,border:`1.5px solid ${colors[type]||T.border}`,borderRadius:T.radiusSm,
      padding:"12px 20px",boxShadow:T.shadowLg,display:"flex",alignItems:"center",gap:10,
      animation:"slideDown .3s ease",maxWidth:"90%",fontFamily:T.font}} onClick={onClose}>
      <div style={{width:8,height:8,borderRadius:4,background:colors[type]||T.accent,flexShrink:0}}/>
      <span style={{fontSize:14,fontWeight:500,color:T.text}}>{message}</span>
    </div>
  );
}

// ============================================================
// MODAL
// ============================================================
function Modal({open,onClose,title,width,children}) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.3)",backdropFilter:"blur(4px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose?.()}}>
      <div style={{background:T.surface,borderRadius:`${T.radiusXl}px ${T.radiusXl}px 0 0`,width:"100%",maxWidth:width||520,
        maxHeight:"92vh",overflow:"auto",animation:"slideUp .25s ease",boxShadow:T.shadowXl,padding:"20px 20px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{fontSize:18,fontWeight:700,letterSpacing:"-0.02em"}}>{title}</h3>
          {onClose && <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textTer,padding:4}}>{I.close}</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// GLOBAL STYLES
// ============================================================
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{margin:0;-webkit-font-smoothing:antialiased;background:${T.bg}}
    input:focus,select:focus,textarea:focus{border-color:${T.accent}!important;box-shadow:0 0 0 3px ${T.accent}12}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes scaleIn{from{transform:scale(0.95);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes slideDown{from{transform:translateX(-50%) translateY(-16px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
    @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(5,150,105,0.2)}50%{box-shadow:0 0 40px rgba(5,150,105,0.4)}}
    @keyframes countUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes progressFill{from{width:0}to{width:var(--target-width)}}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-thumb{background:#d4d4d4;border-radius:3px}
    select option:disabled{color:#999;font-weight:600}
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    input[type="number"]{-moz-appearance:textfield}
    input[type="range"]{-webkit-appearance:none;width:100%;height:6px;background:${T.border};border-radius:3px;outline:none}
    input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;background:${T.accent};border-radius:50%;cursor:pointer;box-shadow:0 2px 6px rgba(5,150,105,0.3)}
  `}</style>
);

// ============================================================
// LANDING PAGE
// ============================================================
function LandingPage({onGetStarted, onDemo}) {
  // Pre-warm the backend so it's ready when user clicks Login/Register
  useEffect(()=>{fetch(`${API.replace('/api','')}/health`).catch(()=>{})},[]);
  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(180deg, #F0FDF4 0%, ${T.bg} 40%)`,fontFamily:T.font}}>
      <GlobalStyles/>
      {/* Nav */}
      <div style={{maxWidth:800,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.04em"}}>
          <span>Enough</span><span style={{color:T.accent}}>Fi</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn variant="ghost" size="sm" onClick={()=>onGetStarted("login")}>Log in</Btn>
          <Btn size="sm" onClick={()=>onGetStarted("register")}>Get Started</Btn>
        </div>
      </div>

      {/* Hero */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"60px 24px 40px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🔥</div>
        <h1 style={{fontSize:38,fontWeight:900,letterSpacing:"-0.04em",lineHeight:1.1,marginBottom:16,color:T.text}}>
          Know your<br/><span style={{color:T.accent}}>FIRE number</span><br/>in 3 minutes
        </h1>
        <p style={{fontSize:18,color:T.textSec,lineHeight:1.5,maxWidth:480,margin:"0 auto 32px",fontWeight:400}}>
          Track your money, plan your freedom. EnoughFi tells you exactly when you can stop working — and helps you get there faster.
        </p>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <Btn variant="fire" size="lg" onClick={()=>onGetStarted("register")}>
            Start Free — 3 min setup
          </Btn>
          <Btn variant="outline" size="lg" onClick={onDemo}>
            Try Live Demo
          </Btn>
        </div>
      </div>

      {/* What is FIRE? */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"20px 24px 40px"}}>
        <div style={{background:`linear-gradient(135deg, ${T.fireLight}, #FFF5EB)`,borderRadius:T.radiusXl,border:`1.5px solid ${T.fire}22`,padding:"28px 24px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-20,right:-10,fontSize:80,opacity:0.08,pointerEvents:"none"}}>🔥</div>
          <div style={{fontSize:13,fontWeight:700,color:T.fireDark,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>What is FIRE?</div>
          <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:"-0.03em",marginBottom:12,lineHeight:1.3}}>
            Financial Independence, Retire Early
          </div>
          <div style={{fontSize:15,color:T.textSec,lineHeight:1.7,marginBottom:16}}>
            FIRE is the idea that if you save and invest enough, you can build a corpus that generates enough passive income to cover your living expenses — forever. That number is your <strong style={{color:T.fireDark}}>FIRE number</strong>.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10}}>
            {[
              { emoji:"🎯", label:"Your FIRE Number", desc:"25× your annual expenses" },
              { emoji:"📊", label:"The 4% Rule", desc:"Withdraw 4% yearly, money lasts forever" },
              { emoji:"🏖️", label:"Freedom", desc:"Work becomes a choice, not a compulsion" },
            ].map((item,i) => (
              <div key={i} style={{background:"rgba(255,255,255,0.7)",borderRadius:T.radiusSm,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:4}}>{item.emoji}</div>
                <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:2}}>{item.label}</div>
                <div style={{fontSize:11,color:T.textSec,lineHeight:1.4}}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Morgan Housel Quotes */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 24px 40px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:"20px 24px",boxShadow:T.shadow,position:"relative"}}>
            <div style={{fontSize:32,color:T.accent,fontWeight:900,lineHeight:1,marginBottom:4,opacity:0.3}}>"</div>
            <div style={{fontSize:15,color:T.text,lineHeight:1.7,fontStyle:"italic",marginBottom:10}}>
              The hardest financial skill is getting the goalpost to stop moving. If expectations rise with results, there is no logic in striving for more because you'll feel the same after putting in extra effort.
            </div>
            <div style={{fontSize:13,fontWeight:600,color:T.textSec}}>
              — Morgan Housel, <span style={{fontStyle:"italic"}}>The Psychology of Money</span>
            </div>
          </div>

          <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:"20px 24px",boxShadow:T.shadow,position:"relative"}}>
            <div style={{fontSize:32,color:T.fire,fontWeight:900,lineHeight:1,marginBottom:4,opacity:0.3}}>"</div>
            <div style={{fontSize:15,color:T.text,lineHeight:1.7,fontStyle:"italic",marginBottom:10}}>
              The highest form of wealth is the ability to wake up every morning and say, "I can do whatever I want today." Independence, at any income level, is driven by your savings rate. And past a certain level of income, your savings rate is driven by your ability to keep your lifestyle expectations from running away.
            </div>
            <div style={{fontSize:13,fontWeight:600,color:T.textSec}}>
              — Morgan Housel, <span style={{fontStyle:"italic"}}>The Psychology of Money</span>
            </div>
          </div>

          <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:"20px 24px",boxShadow:T.shadow,position:"relative"}}>
            <div style={{fontSize:32,color:T.purple,fontWeight:900,lineHeight:1,marginBottom:4,opacity:0.3}}>"</div>
            <div style={{fontSize:15,color:T.text,lineHeight:1.7,fontStyle:"italic",marginBottom:10}}>
              True spending is the stuff you avoid buying and never had to worry about. The art of spending money well is one of the most overlooked and underappreciated financial skills. Getting value from money is an art, not a science. Everyone's different.
            </div>
            <div style={{fontSize:13,fontWeight:600,color:T.textSec}}>
              — Morgan Housel, <span style={{fontStyle:"italic"}}>Same as Ever</span> & <span style={{fontStyle:"italic"}}>The Art of Spending Money</span>
            </div>
          </div>
        </div>
      </div>

      {/* Value Props */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 24px 40px",display:"grid",gap:16}}>
        <div style={{fontSize:13,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"center",marginBottom:4}}>How EnoughFi helps you</div>
        {[
          { emoji:"📸", title:"Your Money Snapshot", desc:"Answer 5 simple questions. See your net worth and FIRE number instantly. No accounting knowledge needed." },
          { emoji:"🤖", title:"Ask Fi — AI Financial Advisor", desc:"\"Can I buy a ₹2L TV?\" — Fi analyzes your real finances and shows the impact on your retirement date." },
          { emoji:"⚡", title:"Quick Add Expenses", desc:"One tap to log expenses. Pick a category emoji. That's it. Double-entry bookkeeping happens silently in the background." },
          { emoji:"🔥", title:"FIRE Dashboard", desc:"See your progress to financial freedom. Every spending decision shows its impact on when you can stop working." },
        ].map((f,i) => (
          <div key={i} style={{display:"flex",gap:16,padding:20,background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,boxShadow:T.shadow}}>
            <div style={{fontSize:28,flexShrink:0}}>{f.emoji}</div>
            <div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4,letterSpacing:"-0.02em"}}>{f.title}</div>
              <div style={{fontSize:14,color:T.textSec,lineHeight:1.5}}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Already have an account? */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 24px 24px"}}>
        <div style={{background:T.surfaceAlt,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:"24px",textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:12}}>Already have an account?</div>
          <Btn variant="secondary" size="md" onClick={()=>onGetStarted("login")}>
            Log in to your dashboard →
          </Btn>
        </div>
      </div>

      {/* Footer */}
      <div style={{textAlign:"center",padding:"30px 24px",borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:13,color:T.textTer,lineHeight:1.8}}>
          Built for the FIRE community 🇮🇳 · Your data stays yours · No ads, ever
        </div>
        <div style={{fontSize:11,color:T.textTer,marginTop:8,lineHeight:1.6}}>
          Quotes from <em>The Psychology of Money</em> & <em>The Art of Spending Money</em> by Morgan Housel. All rights with the author.
          <br/>EnoughFi is not a financial advisor. Please consult a SEBI-registered advisor for investment decisions.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH SCREEN
// ============================================================
function AuthScreen({onLogin,initialMode,onBack}) {
  const [mode,setMode]=useState(initialMode||"login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [loadSec,setLoadSec]=useState(0);
  useEffect(()=>{if(loading){setLoadSec(0);const t=setInterval(()=>setLoadSec(s=>s+1),1000);return()=>clearInterval(t)}},[loading]);

  const handleSubmit=async()=>{
    setLoading(true);setError("");
    try{
      if(mode==="register"){
        if(!name||!email||!pass) throw new Error("All fields required");
        const data=await api.register(name,email,pass);
        api.token=data.token;localStorage.setItem("ft_token",data.token);
        onLogin(data.user,data.token);
      } else {
        if(!email||!pass) throw new Error("Email and password required");
        const data=await api.login(email,pass);
        api.token=data.token;localStorage.setItem("ft_token",data.token);
        onLogin(data.user,data.token);
      }
    }catch(e){setError(e.message)}
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.font,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <GlobalStyles/>
      <div style={{width:"100%",maxWidth:400}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.textSec,fontSize:14,fontWeight:500,fontFamily:T.font,marginBottom:24,display:"flex",alignItems:"center",gap:6}}>
          ← Back
        </button>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-0.04em",marginBottom:8}}>
          <span>Enough</span><span style={{color:T.accent}}>Fi</span>
        </div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:24,letterSpacing:"-0.02em"}}>
          {mode==="register" ? "Create your account" : "Welcome back"}
        </h2>

        {error && <div style={{background:T.dangerLight,color:T.danger,padding:"10px 14px",borderRadius:T.radiusSm,fontSize:13,fontWeight:500,marginBottom:16}}>{error}</div>}

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {mode==="register" && <Input label="Your name" value={name} onChange={setName} placeholder="Rachit" required/>}
          <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com" required/>
          <Input label="Password" value={pass} onChange={setPass} type="password" placeholder="••••••••" required/>
          <Btn full size="lg" onClick={handleSubmit} loading={loading}>{mode==="register"?"Create Account":"Log In"}</Btn>
          {loading && loadSec > 3 && <div style={{textAlign:"center",fontSize:12,color:T.textTer,marginTop:8,lineHeight:1.5}}>
            Server is waking up (~20-30s on first visit)...
          </div>}
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:14,color:T.textSec}}>
          {mode==="register" ? <>Already have an account? <button onClick={()=>setMode("login")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontWeight:600,fontFamily:T.font,fontSize:14}}>Log in</button></>
            : <>New here? <button onClick={()=>setMode("register")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontWeight:600,fontFamily:T.font,fontSize:14}}>Create account</button></>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ONBOARDING WIZARD — The heart of the v5 experience
// ============================================================
const ONBOARDING_STEPS = [
  { id:"own", emoji:"🏦", title:"What do you own?", subtitle:"Your assets — bank balance, investments, property" },
  { id:"owe", emoji:"💳", title:"What do you owe?", subtitle:"Your debts — loans, credit cards" },
  { id:"earn", emoji:"💰", title:"What do you earn?", subtitle:"Your monthly take-home income" },
  { id:"spend", emoji:"🛒", title:"What do you spend?", subtitle:"Your average monthly expenses" },
  { id:"dream", emoji:"🔥", title:"Your FIRE dream", subtitle:"When do you want to stop working?" },
];

const EXPENSE_CATEGORIES = [
  { id:"rent", label:"Rent / Home EMI", emoji:"🏠" },
  { id:"groceries", label:"Groceries & Household", emoji:"🛒" },
  { id:"utilities", label:"Utilities (Elec, Water, WiFi)", emoji:"💡" },
  { id:"transport", label:"Transport / Fuel", emoji:"🚗" },
  { id:"dining", label:"Dining Out / Ordering In", emoji:"🍕" },
  { id:"shopping", label:"Shopping & Personal", emoji:"🛍️" },
  { id:"health", label:"Health / Insurance", emoji:"🏥" },
  { id:"education", label:"Education / Kids School", emoji:"📚" },
  { id:"sip", label:"SIP / Monthly Investments", emoji:"📈" },
  { id:"remittance", label:"Sending to Family / Parents", emoji:"💝" },
  { id:"entertainment", label:"Entertainment / Subscriptions", emoji:"🎬" },
  { id:"travel", label:"Travel", emoji:"✈️" },
  { id:"other", label:"Other Expenses", emoji:"📦" },
];

function AmountInput({label, emoji, value, onChange, placeholder}) {
  const hasValue = parseFloat(value) > 0;
  const inputRef = useRef(null);
  return (
    <div style={{display:"flex",alignItems:"stretch",gap:0,background:T.surfaceAlt,borderRadius:T.radiusSm,border:`1.5px solid ${hasValue ? T.accent + "60" : T.borderLight}`,overflow:"hidden",transition:"border-color .2s"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:48,flexShrink:0,background:T.surfaceAlt,pointerEvents:"none"}}>
        <span style={{fontSize:22}}>{emoji}</span>
      </div>
      <div style={{flex:1,padding:"10px 14px 8px 0",cursor:"text"}} onClick={()=>inputRef.current?.focus()}>
        <div style={{fontSize:11,fontWeight:600,color:T.textSec,marginBottom:3,letterSpacing:"0.02em",textTransform:"uppercase",pointerEvents:"none"}}>{label}</div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:15,fontWeight:700,color:hasValue?T.accent:T.textTer,pointerEvents:"none"}}>₹</span>
          <input ref={inputRef} type="number" value={value||""} onChange={e=>onChange(parseFloat(e.target.value)||0)}
            placeholder="0"
            onFocus={e=>e.target.select()}
            style={{flex:1,border:"none",background:"transparent",fontSize:20,fontWeight:700,fontFamily:T.font,outline:"none",
              color:hasValue?T.text:T.textTer,width:"100%",padding:0,
              WebkitAppearance:"none",MozAppearance:"textfield"}}/>
        </div>
        {hasValue && (
          <div style={{fontSize:11,color:T.accent,fontWeight:500,marginTop:2,pointerEvents:"none",letterSpacing:"-0.01em"}}>
            ₹{parseFloat(value).toLocaleString("en-IN")} — {numToWords(value)}
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingWizard({onComplete, userName, onSkip}) {
  const [step,setStep]=useState(0);
  const [saving,setSaving]=useState(false);
  const [data,setData]=useState({
    bank_balance:0, investments:0, property_value:0, retirement_funds:0, other_assets:0, loans_given:0,
    home_loan:0, credit_card_debt:0, other_loans:0, loans_from_friends:0,
    monthly_income:0, other_income:0,
    monthly_expenses:0, expense_breakdown:{},
    target_retirement_age:45, desired_monthly_income:0, current_age:30,
  });
  const [expenseMode,setExpenseMode]=useState("quick"); // "quick" or "detailed"

  const set = (key, val) => setData(d => ({...d, [key]: val}));
  const setExpCat = (cat, val) => setData(d => ({...d, expense_breakdown: {...d.expense_breakdown, [cat]: val}}));

  const totalExpenseDetailed = Object.values(data.expense_breakdown).reduce((a,b) => a + (parseFloat(b)||0), 0);

  const canProceed = () => {
    if (step === 0) return true; // Assets are optional
    if (step === 1) return true; // Debts optional
    if (step === 2) return data.monthly_income > 0;
    if (step === 3) return expenseMode === "quick" ? data.monthly_expenses > 0 : totalExpenseDetailed > 0;
    if (step === 4) return data.current_age > 0;
    return true;
  };

  const handleNext = async () => {
    if (step < 4) { setStep(step + 1); return; }
    // Final step — save
    setSaving(true);
    try {
      const finalData = {...data};
      if (expenseMode === "detailed") {
        finalData.monthly_expenses = totalExpenseDetailed;
      }
      if (!finalData.desired_monthly_income) {
        finalData.desired_monthly_income = finalData.monthly_expenses * 0.7;
      }
      await api.saveOnboarding(finalData);
      onComplete();
    } catch(e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const currentStep = ONBOARDING_STEPS[step];

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(180deg, ${T.accentLight} 0%, ${T.bg} 30%)`,fontFamily:T.font,padding:24}}>
      <GlobalStyles/>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        {/* Skip option for existing users */}
        {onSkip && (
          <div style={{textAlign:"right",marginBottom:8}}>
            <button onClick={onSkip} style={{background:"none",border:"none",cursor:"pointer",color:T.textTer,fontSize:13,fontWeight:500,fontFamily:T.font,padding:"4px 0",textDecoration:"underline",textUnderlineOffset:2}}>
              Skip setup, go to dashboard →
            </button>
          </div>
        )}
        {/* Progress */}
        <div style={{display:"flex",gap:6,marginBottom:32}}>
          {ONBOARDING_STEPS.map((s,i) => (
            <div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=step?T.accent:T.border,transition:"background .3s"}}/>
          ))}
        </div>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:8}}>{currentStep.emoji}</div>
          <h2 style={{fontSize:26,fontWeight:800,letterSpacing:"-0.03em",marginBottom:6}}>{currentStep.title}</h2>
          <p style={{fontSize:15,color:T.textSec}}>{currentStep.subtitle}</p>
        </div>

        {/* Step Content */}
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s ease"}}>
          {step === 0 && <>
            <AmountInput emoji="🏦" label="Bank balance (all banks combined)" value={data.bank_balance} onChange={v=>set("bank_balance",v)}/>
            <AmountInput emoji="📈" label="Investments (MF, stocks, FD, gold)" value={data.investments} onChange={v=>set("investments",v)}/>
            <AmountInput emoji="🏠" label="Property value (house, land, flat)" value={data.property_value} onChange={v=>set("property_value",v)}/>
            <AmountInput emoji="🏛️" label="Retirement funds (EPF, PPF, NPS)" value={data.retirement_funds} onChange={v=>set("retirement_funds",v)}/>
            <AmountInput emoji="🤝" label="Loan given to someone (friend, family)" value={data.loans_given} onChange={v=>set("loans_given",v)}/>
            <AmountInput emoji="💎" label="Other (crypto, cash, gold jewelry)" value={data.other_assets} onChange={v=>set("other_assets",v)}/>
            <div style={{textAlign:"center",padding:"12px 0",fontSize:13,color:T.textTer}}>
              Don't have exact numbers? Estimates are fine — you can update later.
            </div>
          </>}

          {step === 1 && <>
            <AmountInput emoji="🏠" label="Home loan outstanding" value={data.home_loan} onChange={v=>set("home_loan",v)}/>
            <AmountInput emoji="💳" label="Credit card outstanding" value={data.credit_card_debt} onChange={v=>set("credit_card_debt",v)}/>
            <AmountInput emoji="📝" label="Other loans (car, personal, education)" value={data.other_loans} onChange={v=>set("other_loans",v)}/>
            <AmountInput emoji="🤝" label="Borrowed from friends / family" value={data.loans_from_friends} onChange={v=>set("loans_from_friends",v)}/>
            <div style={{textAlign:"center",padding:"12px 0",fontSize:13,color:T.textTer}}>
              No debts? Lucky you! Just click Next.
            </div>
          </>}

          {step === 2 && <>
            <AmountInput emoji="💼" label="Monthly salary (take-home, after tax)" value={data.monthly_income} onChange={v=>set("monthly_income",v)}/>
            <AmountInput emoji="💸" label="Other monthly income (rent, freelance, dividends)" value={data.other_income} onChange={v=>set("other_income",v)}/>
          </>}

          {step === 3 && <>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <Btn variant={expenseMode==="quick"?"primary":"secondary"} size="sm" onClick={()=>setExpenseMode("quick")}>Quick — one number</Btn>
              <Btn variant={expenseMode==="detailed"?"primary":"secondary"} size="sm" onClick={()=>setExpenseMode("detailed")}>Detailed breakdown</Btn>
            </div>
            {expenseMode === "quick" ? (
              <AmountInput emoji="🛒" label="Total monthly expenses (roughly)" value={data.monthly_expenses} onChange={v=>set("monthly_expenses",v)}/>
            ) : (
              <>
                {EXPENSE_CATEGORIES.map(cat => (
                  <AmountInput key={cat.id} emoji={cat.emoji} label={cat.label} value={data.expense_breakdown[cat.id]} onChange={v=>setExpCat(cat.id,v)} placeholder="0"/>
                ))}
                <div style={{fontSize:11,color:T.textTer,textAlign:"center",padding:"4px 12px",lineHeight:1.5}}>
                  💡 Include SIP/investments here — they're monthly outflows from your salary. Your investment account balance is tracked separately under assets.
                </div>
                <div style={{textAlign:"center",padding:"8px 0",fontSize:14,fontWeight:700,color:T.accent}}>
                  Total: ₹{totalExpenseDetailed.toLocaleString("en-IN")}/month
                  {totalExpenseDetailed > 0 && <span style={{fontSize:12,fontWeight:500,color:T.textSec}}> ({numToWords(totalExpenseDetailed)})</span>}
                </div>
              </>
            )}
          </>}

          {step === 4 && <>
            <div style={{padding:"16px 20px",background:T.surfaceAlt,borderRadius:T.radius}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textSec,marginBottom:8}}>Your current age</div>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <input type="range" min="18" max="65" value={data.current_age} onChange={e=>set("current_age",parseInt(e.target.value))} style={{flex:1}}/>
                <div style={{fontSize:28,fontWeight:900,color:T.text,minWidth:48,textAlign:"center"}}>{data.current_age}</div>
              </div>
            </div>

            <div style={{padding:"16px 20px",background:T.fireLight,borderRadius:T.radius,border:`1.5px solid ${T.fire}22`}}>
              <div style={{fontSize:13,fontWeight:600,color:T.fireDark,marginBottom:8}}>🔥 I want to retire by age</div>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <input type="range" min={data.current_age+1} max="70" value={data.target_retirement_age} onChange={e=>set("target_retirement_age",parseInt(e.target.value))} style={{flex:1}}/>
                <div style={{fontSize:28,fontWeight:900,color:T.fireDark,minWidth:48,textAlign:"center"}}>{data.target_retirement_age}</div>
              </div>
              <div style={{fontSize:12,color:T.textTer,marginTop:6}}>That's {data.target_retirement_age - data.current_age} years from now</div>
            </div>

            <AmountInput emoji="🏖️" label="Desired monthly income after retirement" value={data.desired_monthly_income} onChange={v=>set("desired_monthly_income",v)}/>
            <div style={{fontSize:12,color:T.textTer,textAlign:"center"}}>
              Rule of thumb: 60-80% of current expenses. Leave blank for auto-calculation.
            </div>
          </>}
        </div>

        {/* Navigation */}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:32,gap:12}}>
          {step > 0 ? (
            <Btn variant="secondary" onClick={()=>setStep(step-1)}>← Back</Btn>
          ) : <div/>}
          <Btn variant={step===4?"fire":"primary"} onClick={handleNext} disabled={!canProceed()} loading={saving} style={{minWidth:140}}>
            {step === 4 ? "🔥 See My FIRE Number" : "Next →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FIRE DASHBOARD — The main view after onboarding
// ============================================================
function FIREDashboard({user, fireData, toast, onAskFi, onNavigate, onRefresh}) {
  if (!fireData || !fireData.hasProfile) return <div style={{textAlign:"center",padding:40}}><Spin s={24}/></div>;

  const d = fireData;
  const progressPct = Math.min(100, d.fireProgress || 0);
  const onTrackColor = d.onTrack ? T.accent : T.fire;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn .4s ease"}}>
      {/* Greeting */}
      <div>
        <h2 style={{fontSize:22,fontWeight:800,letterSpacing:"-0.03em"}}>
          {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, {user?.name?.split(" ")[0] || "there"} 👋
        </h2>
        <p style={{fontSize:14,color:T.textSec,marginTop:4}}>Here's your FIRE dashboard</p>
      </div>

      {/* Net Worth Card */}
      <div style={{background:`linear-gradient(135deg, ${T.accent}, ${T.accentDark})`,borderRadius:T.radiusXl,padding:"24px 20px",color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:50,background:"rgba(255,255,255,0.1)"}}/>
        <div style={{fontSize:12,fontWeight:500,opacity:0.8,marginBottom:4}}>NET WORTH</div>
        <div style={{fontSize:32,fontWeight:900,letterSpacing:"-0.03em",animation:"countUp .5s ease"}}>
          ₹{fmt(d.netWorth)}
        </div>
        <div style={{display:"flex",gap:16,marginTop:12,fontSize:13,fontWeight:500}}>
          <span>↗ Assets: ₹{fmt(d.totalAssets)}</span>
          <span>↙ Debts: ₹{fmt(d.totalDebts)}</span>
        </div>
      </div>

      {/* FIRE Progress */}
      <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:20,boxShadow:T.shadow}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.02em"}}>🔥 FIRE Progress</div>
          <Pill color={onTrackColor}>{d.onTrack ? "On Track" : `${Math.round(d.yearsToFire)}yr to go`}</Pill>
        </div>

        {/* Progress Bar */}
        <div style={{position:"relative",height:28,background:T.surfaceAlt,borderRadius:14,overflow:"hidden",marginBottom:12}}>
          <div style={{
            position:"absolute",top:0,left:0,height:"100%",borderRadius:14,
            background:`linear-gradient(90deg, ${T.accent}, ${T.fire})`,
            width:`${progressPct}%`,transition:"width 1s ease",
          }}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:13,fontWeight:800,color:progressPct>50?"#fff":T.text}}>
            {progressPct.toFixed(1)}%
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:12}}>
          <div style={{textAlign:"center",padding:"10px 8px",background:T.surfaceAlt,borderRadius:T.radiusSm}}>
            <div style={{fontWeight:600,color:T.textSec}}>FIRE Number</div>
            <div style={{fontWeight:800,fontSize:16,color:T.fireDark,marginTop:2}}>₹{fmt(d.fireNumber)}</div>
          </div>
          <div style={{textAlign:"center",padding:"10px 8px",background:T.surfaceAlt,borderRadius:T.radiusSm}}>
            <div style={{fontWeight:600,color:T.textSec}}>Retire By</div>
            <div style={{fontWeight:800,fontSize:16,color:onTrackColor,marginTop:2}}>Age {d.projectedRetirementAge}</div>
          </div>
          <div style={{textAlign:"center",padding:"10px 8px",background:T.surfaceAlt,borderRadius:T.radiusSm}}>
            <div style={{fontWeight:600,color:T.textSec}}>Years Left</div>
            <div style={{fontWeight:800,fontSize:16,marginTop:2}}>{Math.max(0, d.yearsToFire)}</div>
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16,boxShadow:T.shadow}}>
          <div style={{fontSize:11,fontWeight:600,color:T.textSec}}>SAVINGS RATE</div>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:"-0.03em",color:d.savingsRate>=30?T.accent:d.savingsRate>=15?T.warn:T.danger}}>
            {d.savingsRate?.toFixed(0)}%
          </div>
          <div style={{fontSize:12,color:T.textTer,marginTop:4}}>₹{fmt(d.monthlySavings)}/month saved</div>
        </div>
        <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16,boxShadow:T.shadow}}>
          <div style={{fontSize:11,fontWeight:600,color:T.textSec}}>EMERGENCY FUND</div>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:"-0.03em",color:d.emergencyMonths>=6?T.accent:d.emergencyMonths>=3?T.warn:T.danger}}>
            {d.emergencyMonths?.toFixed(1)}
          </div>
          <div style={{fontSize:12,color:T.textTer,marginTop:4}}>months of expenses</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16,boxShadow:T.shadow}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12,letterSpacing:"-0.02em"}}>Quick Questions for Fi</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[
            "Can I afford a big purchase?",
            "Where is my money going?",
            "How do I retire earlier?",
          ].map((q,i) => (
            <button key={i} onClick={()=>onAskFi(q)}
              style={{textAlign:"left",padding:"10px 14px",background:T.surfaceAlt,borderRadius:T.radiusSm,border:`1px solid ${T.borderLight}`,
                cursor:"pointer",fontSize:14,fontFamily:T.font,fontWeight:500,color:T.text,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{q}</span>
              <span style={{color:T.accent,fontSize:16}}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Mode Link */}
      <button onClick={()=>onNavigate("transactions")}
        style={{textAlign:"center",padding:14,background:"transparent",border:`1px dashed ${T.border}`,borderRadius:T.radius,
          cursor:"pointer",fontSize:13,fontWeight:500,color:T.textSec,fontFamily:T.font}}>
        📋 View Full Transactions & Accounts →
      </button>
    </div>
  );
}

// ============================================================
// QUICK ADD — Floating button + modal
// ============================================================
const QUICK_CATEGORIES = [
  { name:"Groceries", emoji:"🛒" }, { name:"Dining Out", emoji:"🍕" },
  { name:"Transport", emoji:"🚗" }, { name:"Shopping", emoji:"🛍️" },
  { name:"Utilities", emoji:"💡" }, { name:"Health", emoji:"🏥" },
  { name:"Education", emoji:"📚" }, { name:"SIP/Investments", emoji:"📈" },
  { name:"Sending to Family", emoji:"💝" }, { name:"Entertainment", emoji:"🎬" },
  { name:"Rent/EMI", emoji:"🏠" }, { name:"Travel", emoji:"✈️" },
  { name:"Other Expenses", emoji:"📦" },
];

function QuickAddModal({open, onClose, toast}) {
  const [amount,setAmount]=useState("");
  const [category,setCategory]=useState("");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);

  const handleSave = async () => {
    if (!amount || !category) return;
    setSaving(true);
    try {
      await api.quickAdd({ amount: parseFloat(amount), category, description: note || category });
      toast(`₹${parseFloat(amount).toLocaleString("en-IN")} on ${category} ✅`, "success");
      setAmount(""); setCategory(""); setNote("");
      onClose();
    } catch(e) { toast(e.message, "error"); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Add Expense">
      {/* Amount */}
      <div style={{textAlign:"center",padding:"16px 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          <span style={{fontSize:28,fontWeight:700,color:T.textTer}}>₹</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
            autoFocus style={{border:"none",background:"transparent",fontSize:42,fontWeight:900,fontFamily:T.font,
            outline:"none",color:T.text,width:200,textAlign:"center"}}/>
        </div>
      </div>

      {/* Category Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
        {QUICK_CATEGORIES.map(cat => (
          <button key={cat.name} onClick={()=>setCategory(cat.name)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
              borderRadius:T.radiusSm,border:category===cat.name?`2px solid ${T.accent}`:`1.5px solid ${T.borderLight}`,
              background:category===cat.name?T.accentLight:T.surfaceAlt,cursor:"pointer",transition:"all .15s"}}>
            <span style={{fontSize:22}}>{cat.emoji}</span>
            <span style={{fontSize:9,fontWeight:600,color:category===cat.name?T.accent:T.textSec,
              textAlign:"center",lineHeight:1.2}}>{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Note (optional) */}
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note (optional)"
        style={{width:"100%",padding:"10px 14px",fontSize:14,fontFamily:T.font,border:`1.5px solid ${T.border}`,
          borderRadius:T.radiusSm,background:T.surface,outline:"none",marginBottom:16}}/>

      <Btn full variant="primary" onClick={handleSave} loading={saving} disabled={!amount||!category}>
        Add Expense
      </Btn>
    </Modal>
  );
}

// ============================================================
// ASK FI — AI Chat Interface
// ============================================================
function AskFiDrawer({open, onClose, toast}) {
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [initialLoad,setInitialLoad]=useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(()=>{
    if(open && initialLoad){
      loadHistory();
      setInitialLoad(false);
    }
    if(open) setTimeout(()=>inputRef.current?.focus(), 300);
  },[open]);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"})},[messages]);

  const loadHistory = async () => {
    try {
      const hist = await api.getFiHistory();
      if(hist.length) setMessages(hist.map(m=>({role:m.role,content:m.content})));
    } catch(e) {}
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if(!msg) return;
    setInput("");
    setMessages(prev => [...prev, {role:"user",content:msg}]);
    setLoading(true);
    try {
      const res = await api.askFi(msg);
      setMessages(prev => [...prev, {role:"assistant",content:res.response}]);
    } catch(e) {
      setMessages(prev => [...prev, {role:"assistant",content:"Sorry, I'm having trouble right now. Please try again."}]);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    try { await api.clearFiHistory(); } catch(e) {}
    setMessages([]);
  };

  if(!open) return null;

  return (
    <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",flexDirection:"column",background:T.bg,animation:"slideInRight .3s ease",fontFamily:T.font}}>
      {/* Header */}
      <div style={{padding:"12px 16px",background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:16,background:`linear-gradient(135deg,${T.accent},${T.fire})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🤖</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.02em"}}>Ask Fi</div>
            <div style={{fontSize:11,color:T.accent,fontWeight:500}}>Your AI financial advisor</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {messages.length > 0 && <Btn variant="ghost" size="sm" onClick={handleClear}>Clear</Btn>}
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textTer,padding:4}}>{I.close}</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:12}}>
        {messages.length === 0 && (
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:40,marginBottom:12}}>🤖</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Hi! I'm Fi</div>
            <div style={{fontSize:14,color:T.textSec,lineHeight:1.5,marginBottom:20}}>
              I know your complete financial picture. Ask me anything!
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {["Can I buy a TV for ₹2 lakh?", "When can I retire?", "Should I prepay my home loan or invest?", "Where is my money going?"].map((q,i) => (
                <button key={i} onClick={()=>sendMessage(q)}
                  style={{textAlign:"left",padding:"12px 16px",background:T.surface,borderRadius:T.radiusSm,
                    border:`1.5px solid ${T.border}`,cursor:"pointer",fontSize:14,fontFamily:T.font,fontWeight:500,
                    color:T.text,transition:"all .15s"}}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m,i) => (
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{
              maxWidth:"85%",padding:"12px 16px",borderRadius:m.role==="user"?`${T.radius}px ${T.radius}px 4px ${T.radius}px`:`${T.radius}px ${T.radius}px ${T.radius}px 4px`,
              background:m.role==="user"?T.accent:T.surface,color:m.role==="user"?"#fff":T.text,
              border:m.role==="user"?"none":`1px solid ${T.border}`,boxShadow:T.shadow,
              fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap",fontWeight:m.role==="user"?500:400,
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,maxWidth:"60%"}}>
            <div style={{display:"flex",gap:4}}>
              {[0,1,2].map(i => <div key={i} style={{width:6,height:6,borderRadius:3,background:T.textTer,animation:`pulse 1s ease infinite ${i*0.2}s`}}/>)}
            </div>
            <span style={{fontSize:13,color:T.textSec}}>Fi is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef}/>
      </div>

      {/* Input */}
      <div style={{padding:"12px 16px",background:T.surface,borderTop:`1px solid ${T.border}`,flexShrink:0,paddingBottom:"max(12px, env(safe-area-inset-bottom))"}}>
        <div style={{display:"flex",gap:8}}>
          <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}}
            placeholder="Ask Fi anything about your money..."
            style={{flex:1,padding:"12px 16px",fontSize:15,fontFamily:T.font,border:`1.5px solid ${T.border}`,
              borderRadius:24,background:T.surfaceAlt,outline:"none"}}/>
          <button onClick={()=>sendMessage()} disabled={!input.trim()||loading}
            style={{width:44,height:44,borderRadius:22,background:input.trim()?T.accent:T.border,border:"none",
              cursor:input.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .15s",color:"#fff",flexShrink:0}}>
            {I.send}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN TAB (kept from v4)
// ============================================================
function AdminTab({toast}) {
  const [users,setUsers]=useState([]);const [stats,setStats]=useState(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const [u,s]=await Promise.all([api.adminUsers(),api.adminStats()]);setUsers(u);setStats(s)}catch(e){toast(e.message,"error")}setLoading(false)})()},[]);
  if(loading) return <div style={{textAlign:"center",padding:40}}><Spin s={24}/></div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <h2 style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Admin Panel</h2>
      {stats && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[{l:"Users",v:stats.total_users},{l:"Transactions",v:stats.total_transactions},{l:"Accounts",v:stats.total_accounts}].map(s=>(
            <div key={s.l} style={{background:T.surface,borderRadius:T.radiusSm,border:`1px solid ${T.border}`,padding:14,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900}}>{s.v}</div>
              <div style={{fontSize:11,color:T.textSec,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,overflow:"hidden"}}>
        {users.map((u,i)=>(
          <div key={u.user_id} style={{padding:"12px 16px",borderBottom:i<users.length-1?`1px solid ${T.borderLight}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:600}}>{u.name} {u.is_admin&&<Pill color={T.purple}>Admin</Pill>} {u.is_demo&&<Pill color={T.warn}>Demo</Pill>}</div>
              <div style={{fontSize:12,color:T.textTer}}>{u.email}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn variant="ghost" size="sm" onClick={async()=>{try{await api.adminToggle(u.user_id);const us=await api.adminUsers();setUsers(us);toast("Toggled","success")}catch(e){toast(e.message,"error")}}}>
                {u.is_admin?"Remove Admin":"Make Admin"}
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TRANSACTIONS TAB (adapted from v4)
// ============================================================
function TransactionsTab({accounts,toast,initialAccountId}) {
  const [txns,setTxns]=useState([]);const [loading,setLoading]=useState(true);
  const [selectedFY,setSelectedFY]=useState(getCurrentFY());
  const [showImport,setShowImport]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [editTx,setEditTx]=useState(null);
  const [filterAccount,setFilterAccount]=useState(initialAccountId||"");
  const [filterCategory,setFilterCategory]=useState("");
  const [searchQ,setSearchQ]=useState("");
  const [page,setPage]=useState(1);

  const loadTxns = useCallback(async()=>{
    setLoading(true);
    try{
      const fy = getFYRange(selectedFY);
      const params = new URLSearchParams({start_date:fy.start,end_date:fy.end,limit:"200",offset:String((page-1)*200)});
      if(filterAccount) params.set("account_id",filterAccount);
      if(filterCategory) params.set("category",filterCategory);
      if(searchQ) params.set("search",searchQ);
      const data = await api.getTransactions(params.toString());
      setTxns(data.transactions||data);
    } catch(e){toast(e.message,"error")}
    setLoading(false);
  },[selectedFY,filterAccount,filterCategory,searchQ,page]);

  useEffect(()=>{loadTxns()},[loadTxns]);

  const categories = useMemo(()=>[...new Set(txns.map(t=>t.category).filter(Boolean))].sort(),[txns]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Transactions</h2>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" size="sm" onClick={()=>setShowImport(true)}>Import</Btn>
          <Btn size="sm" onClick={()=>{setEditTx(null);setShowAdd(true)}}>+ Add</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <select value={selectedFY} onChange={e=>setSelectedFY(parseInt(e.target.value))}
          style={{padding:"6px 12px",borderRadius:T.radiusSm,border:`1.5px solid ${T.border}`,fontSize:13,fontFamily:T.font,fontWeight:600,background:T.surface}}>
          {Array.from({length:5},(_,i)=>getCurrentFY()-i).map(fy=><option key={fy} value={fy}>{getFYLabel(fy)}</option>)}
        </select>
        <select value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}
          style={{padding:"6px 12px",borderRadius:T.radiusSm,border:`1.5px solid ${T.border}`,fontSize:13,fontFamily:T.font,background:T.surface}}>
          <option value="">All Accounts</option>
          {accounts.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}
        </select>
        <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search..."
          style={{padding:"6px 12px",borderRadius:T.radiusSm,border:`1.5px solid ${T.border}`,fontSize:13,fontFamily:T.font,flex:1,minWidth:100}}/>
      </div>

      {loading ? <div style={{textAlign:"center",padding:30}}><Spin/></div> : txns.length === 0 ? (
        <div style={{textAlign:"center",padding:40,color:T.textSec}}>No transactions found</div>
      ) : (
        <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          {txns.map((tx,i)=>(
            <div key={tx.transaction_id} onClick={()=>{setEditTx(tx);setShowAdd(true)}}
              style={{padding:"12px 16px",borderBottom:i<txns.length-1?`1px solid ${T.borderLight}`:"none",cursor:"pointer",transition:"background .1s",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>{tx.description||tx.category||"Transaction"}</div>
                <div style={{fontSize:12,color:T.textTer}}>{fmtDate(tx.date)} · {tx.debit_account_name} → {tx.credit_account_name}</div>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>₹{fmt(tx.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <TransactionModal open={showAdd} onClose={()=>{setShowAdd(false);setEditTx(null)}} accounts={accounts} editTx={editTx} onSave={()=>{setShowAdd(false);setEditTx(null);loadTxns()}} toast={toast}/>}
      {showImport && <ImportModal open={showImport} onClose={()=>setShowImport(false)} onSuccess={loadTxns} toast={toast} accounts={accounts}/>}
    </div>
  );
}

// ============================================================
// TRANSACTION MODAL (from v4)
// ============================================================
function TransactionModal({open,onClose,accounts,editTx,onSave,toast}) {
  const [date,setDate]=useState(fmtDateInput(editTx?.date));
  const [amount,setAmount]=useState(editTx?.amount||"");
  const [desc,setDesc]=useState(editTx?.description||"");
  const [debit,setDebit]=useState(editTx?.debit_account_id||"");
  const [credit,setCredit]=useState(editTx?.credit_account_id||"");
  const [category,setCategory]=useState(editTx?.category||"");
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!date||!amount||!debit||!credit) return toast("Fill all required fields","error");
    setSaving(true);
    try{
      const data={date,amount:parseFloat(amount),description:desc,debit_account_id:debit,credit_account_id:credit,category};
      if(editTx) await api.updateTransaction(editTx.transaction_id,data);
      else await api.createTransaction(data);
      toast(editTx?"Updated":"Created","success");
      onSave();
    }catch(e){toast(e.message,"error")}
    setSaving(false);
  };

  const grouped = useMemo(()=>{
    const g = {};
    accounts.forEach(a=>{if(!g[a.account_type])g[a.account_type]=[];g[a.account_type].push(a)});
    return g;
  },[accounts]);

  return (
    <Modal open={open} onClose={onClose} title={editTx?"Edit Transaction":"New Transaction"}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Input label="Date" type="date" value={date} onChange={setDate} required/>
        <Input label="Amount" type="number" value={amount} onChange={setAmount} prefix="₹" required/>
        <Input label="Description" value={desc} onChange={setDesc} placeholder="Coffee at Starbucks"/>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:13,fontWeight:600,color:T.textSec}}>Debit (money goes to) <span style={{color:T.danger}}>*</span></label>
          <select value={debit} onChange={e=>setDebit(e.target.value)}
            style={{padding:"10px 14px",fontSize:14,fontFamily:T.font,border:`1.5px solid ${T.border}`,borderRadius:T.radiusSm,background:T.surface}}>
            <option value="">Select account</option>
            {Object.entries(grouped).map(([type,accs])=>(<optgroup key={type} label={type}>{accs.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}</optgroup>))}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:13,fontWeight:600,color:T.textSec}}>Credit (money comes from) <span style={{color:T.danger}}>*</span></label>
          <select value={credit} onChange={e=>setCredit(e.target.value)}
            style={{padding:"10px 14px",fontSize:14,fontFamily:T.font,border:`1.5px solid ${T.border}`,borderRadius:T.radiusSm,background:T.surface}}>
            <option value="">Select account</option>
            {Object.entries(grouped).map(([type,accs])=>(<optgroup key={type} label={type}>{accs.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}</optgroup>))}
          </select>
        </div>
        <Input label="Category" value={category} onChange={setCategory} placeholder="Groceries"/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          {editTx && <Btn variant="danger" onClick={async()=>{try{await api.deleteTransaction(editTx.transaction_id);toast("Deleted","success");onSave()}catch(e){toast(e.message,"error")}}}>Delete</Btn>}
          <Btn full onClick={handleSave} loading={saving}>{editTx?"Update":"Create"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// IMPORT MODAL (simplified from v4)
// ============================================================
function ImportModal({open,onClose,onSuccess,toast,accounts}) {
  const [file,setFile]=useState(null);const [uploading,setUploading]=useState(false);const [result,setResult]=useState(null);
  const [password,setPassword]=useState("");

  const handleUpload=async()=>{
    if(!file) return;
    setUploading(true);
    try{
      const fd=new FormData();fd.append("file",file);
      if(password) fd.append("password",password);
      const r=await api.importUpload(fd);
      setResult(r);toast(`${r.count||r.staged_count||0} transactions found`,"success");
    }catch(e){toast(e.message,"error")}
    setUploading(false);
  };

  const handleConfirm=async()=>{
    if(!result?.batch_id) return;
    try{await api.confirmImport(result.batch_id);toast("Imported!","success");onSuccess?.();onClose()}catch(e){toast(e.message,"error")}
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Transactions">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{padding:20,borderRadius:T.radiusSm,border:`2px dashed ${T.border}`,textAlign:"center",background:T.surfaceAlt}}>
          <input type="file" accept=".csv,.pdf" onChange={e=>setFile(e.target.files[0])} style={{fontSize:14,fontFamily:T.font}}/>
          <div style={{fontSize:12,color:T.textTer,marginTop:8}}>Supports bank statement PDFs and CSV files</div>
        </div>
        {file?.name?.endsWith('.pdf') && <Input label="PDF Password (if protected)" value={password} onChange={setPassword} type="password" placeholder="Leave blank if none"/>}
        {!result ? <Btn full onClick={handleUpload} loading={uploading} disabled={!file}>Upload & Parse</Btn>
          : <div>
              <div style={{padding:12,background:T.accentLight,borderRadius:T.radiusSm,fontSize:14,marginBottom:12}}>
                ✅ {result.count||result.staged_count||0} transactions ready to import
              </div>
              <Btn full onClick={handleConfirm}>Confirm Import</Btn>
            </div>}
      </div>
    </Modal>
  );
}

// ============================================================
// ACCOUNTS TAB (adapted from v4)
// ============================================================
function AccountsTab({accounts,refreshAccounts,toast,onViewAccount}) {
  const [showAdd,setShowAdd]=useState(false);
  const [editAcc,setEditAcc]=useState(null);
  const grouped=useMemo(()=>{const g={};accounts.forEach(a=>{if(!g[a.account_type])g[a.account_type]=[];g[a.account_type].push(a)});return g},[accounts]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Accounts</h2>
        <Btn size="sm" onClick={()=>{setEditAcc(null);setShowAdd(true)}}>+ Add</Btn>
      </div>
      {Object.entries(grouped).map(([type,accs])=>{
        const total=accs.reduce((s,a)=>s+parseFloat(a.current_balance||0),0);
        return (
          <div key={type}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,padding:"0 4px"}}>
              <div style={{fontSize:13,fontWeight:700,color:typeColors[type]||T.textSec}}>{typeIcons[type]} {type}s</div>
              <div style={{fontSize:13,fontWeight:700,color:typeColors[type]}}>{fmtFull(total)}</div>
            </div>
            <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,overflow:"hidden"}}>
              {accs.map((a,i)=>(
                <div key={a.account_id} style={{padding:"12px 16px",borderBottom:i<accs.length-1?`1px solid ${T.borderLight}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                  onClick={()=>onViewAccount(a.account_id)}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>{a.account_name}</div>
                    {a.sub_type && <div style={{fontSize:11,color:T.textTer}}>{a.sub_type}</div>}
                  </div>
                  <div style={{fontSize:14,fontWeight:700}}>{fmtFull(a.current_balance)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {showAdd && <AccountModal open={showAdd} onClose={()=>{setShowAdd(false);setEditAcc(null)}} editAcc={editAcc}
        onSave={async()=>{setShowAdd(false);setEditAcc(null);await refreshAccounts()}} toast={toast}/>}
    </div>
  );
}

// ============================================================
// ACCOUNT MODAL
// ============================================================
function AccountModal({open,onClose,editAcc,onSave,toast}) {
  const [name,setName]=useState(editAcc?.account_name||"");
  const [type,setType]=useState(editAcc?.account_type||"Asset");
  const [sub,setSub]=useState(editAcc?.sub_type||"");
  const [balance,setBalance]=useState(editAcc?.current_balance||0);
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!name) return toast("Name required","error");
    setSaving(true);
    try{
      const d={account_name:name,account_type:type,sub_type:sub,current_balance:parseFloat(balance)||0};
      if(editAcc) await api.updateAccount(editAcc.account_id,d);
      else await api.createAccount(d);
      toast(editAcc?"Updated":"Created","success");onSave();
    }catch(e){toast(e.message,"error")}
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editAcc?"Edit Account":"New Account"}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Input label="Account Name" value={name} onChange={setName} required/>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:13,fontWeight:600,color:T.textSec}}>Type</label>
          <select value={type} onChange={e=>setType(e.target.value)} style={{padding:"10px 14px",fontSize:14,fontFamily:T.font,border:`1.5px solid ${T.border}`,borderRadius:T.radiusSm}}>
            {["Asset","Liability","Income","Expense","Equity"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <Input label="Sub-type" value={sub} onChange={setSub} placeholder="e.g. Bank, Investment, Salary"/>
        <Input label="Balance" type="number" value={balance} onChange={setBalance} prefix="₹"/>
        <Btn full onClick={handleSave} loading={saving}>{editAcc?"Update":"Create"}</Btn>
      </div>
    </Modal>
  );
}

// ============================================================
// REPORTS TAB (simplified from v4)
// ============================================================
function ReportsTab({toast}) {
  const [selectedFY,setSelectedFY]=useState(getCurrentFY());
  const [summary,setSummary]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    setLoading(true);
    try{
      const fy=getFYRange(selectedFY);
      const s=await api.getSummary(`start_date=${fy.start}&end_date=${fy.end}`);
      setSummary(s);
    }catch(e){toast(e.message,"error")}
    setLoading(false);
  })()},[selectedFY]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Reports</h2>
        <select value={selectedFY} onChange={e=>setSelectedFY(parseInt(e.target.value))}
          style={{padding:"6px 12px",borderRadius:T.radiusSm,border:`1.5px solid ${T.border}`,fontSize:13,fontFamily:T.font,fontWeight:600}}>
          {Array.from({length:5},(_,i)=>getCurrentFY()-i).map(fy=><option key={fy} value={fy}>{getFYLabel(fy)}</option>)}
        </select>
      </div>
      {loading ? <div style={{textAlign:"center",padding:30}}><Spin/></div> : summary && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16}}>
              <div style={{fontSize:11,fontWeight:600,color:T.textSec}}>TOTAL INCOME</div>
              <div style={{fontSize:20,fontWeight:900,color:T.accent}}>{fmtFull(summary.income?.total||0)}</div>
            </div>
            <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16}}>
              <div style={{fontSize:11,fontWeight:600,color:T.textSec}}>TOTAL EXPENSES</div>
              <div style={{fontSize:20,fontWeight:900,color:T.fire}}>{fmtFull(summary.expense?.total||0)}</div>
            </div>
          </div>
          {summary.expense?.by_account && (
            <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Expense Breakdown</div>
              {summary.expense.by_account.sort((a,b)=>b.total-a.total).map(a=>(
                <div key={a.account_name} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.borderLight}`}}>
                  <span style={{fontSize:13}}>{a.account_name}</span>
                  <span style={{fontSize:13,fontWeight:700}}>{fmtFull(a.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({user,toast,onLogout,onEditProfile}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <h2 style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Settings</h2>
      <div style={{background:T.surface,borderRadius:T.radius,border:`1px solid ${T.border}`,padding:20}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{user.name}</div>
        <div style={{fontSize:14,color:T.textSec}}>{user.email}</div>
        {user.is_demo && <Pill color={T.warn} style={{marginTop:8}}>Demo Account</Pill>}
      </div>
      <Btn variant="outline" full onClick={onEditProfile}>Update My Financial Profile</Btn>
      <Btn variant="secondary" full onClick={()=>{
        if(confirm("Export all your data as CSV?")) {
          api.getTransactions("limit=99999").then(data=>{
            const txns = data.transactions || data;
            if(txns.length) exportCSV(txns.map(t=>({Date:t.date,Amount:t.amount,Description:t.description,Category:t.category,Debit:t.debit_account_name,Credit:t.credit_account_name})),"enoughfi-export.csv");
            else toast("No transactions to export","info");
          }).catch(e=>toast(e.message,"error"));
        }
      }}>Export Data (CSV)</Btn>
      <Btn variant="danger" full onClick={onLogout}>Log Out</Btn>
      <div style={{textAlign:"center",fontSize:12,color:T.textTer,padding:"8px 0"}}>
        EnoughFi v5.0 · Built for the FIRE community 🔥
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP COMPONENT
// ============================================================
export default function App() {
  const [user,setUser]=useState(null);
  const [accounts,setAccounts]=useState([]);
  const [tab,setTab]=useState("home");
  const [toastMsg,setToastMsg]=useState(null);
  const [init,setInit]=useState(true);
  const [viewAccountId,setViewAccountId]=useState(null);
  const [page,setPage]=useState("landing"); // "landing", "auth", "onboarding", "app"
  const [authMode,setAuthMode]=useState("login");
  const [fireData,setFireData]=useState(null);
  const [showQuickAdd,setShowQuickAdd]=useState(false);
  const [showAskFi,setShowAskFi]=useState(false);
  const [askFiInitialQ,setAskFiInitialQ]=useState(null);

  const toast=useCallback((msg,type="info")=>setToastMsg({message:msg,type,key:Date.now()}),[]);
  const refreshAccounts=useCallback(async()=>{try{const a=await api.getAccounts();setAccounts(a)}catch{}},[]);

  const loadFireData = useCallback(async()=>{
    try { const d=await api.getFireSnapshot(); setFireData(d); } catch(e) { console.log("FIRE load error:",e); }
  },[]);

  useEffect(()=>{(async()=>{
    const token=localStorage.getItem("ft_token");
    if(token){
      api.token=token;
      try{
        // Run all startup calls in parallel instead of sequentially
        const u=await api.me();
        setUser(u);
        const [accts, ob] = await Promise.all([
          api.getAccounts(),
          api.getOnboarding()
        ]);
        setAccounts(accts);
        if(ob.complete) {
          setPage("app");
          loadFireData(); // This can load in background
        } else {
          setPage("onboarding");
        }
      }catch{localStorage.removeItem("ft_token");api.token=null}
    }
    setInit(false);
  })()},[]);

  const handleLogin=async(u,token)=>{
    setUser(u);api.token=token;
    try{setAccounts(await api.getAccounts())}catch{};
    // Check onboarding
    try{
      const ob = await api.getOnboarding();
      if(ob.complete) { setPage("app"); loadFireData(); }
      else setPage("onboarding");
    }catch{ setPage("onboarding"); }
  };

  const handleLogout=()=>{
    localStorage.removeItem("ft_token");api.token=null;
    setUser(null);setAccounts([]);setTab("home");setPage("landing");setFireData(null);
  };

  const handleDemoLogin=async()=>{
    try{
      const data=await api.demoLogin();
      api.token=data.token;localStorage.setItem("ft_token",data.token);
      setUser(data.user);
      try{setAccounts(await api.getAccounts())}catch{}
      // Demo user may or may not have profile
      try{
        const ob = await api.getOnboarding();
        if(ob.complete) { setPage("app"); loadFireData(); }
        else setPage("onboarding");
      }catch{ setPage("app"); }
      toast("Welcome to the demo! Explore freely.","success");
    }catch(e){toast(e.message,"error")}
  };

  const handleOnboardingComplete=async()=>{
    await refreshAccounts();
    await loadFireData();
    setPage("app");
    toast("🔥 Your FIRE dashboard is ready!","success");
  };

  const handleAskFi = (question) => {
    setAskFiInitialQ(question);
    setShowAskFi(true);
  };

  const handleNavigate=(t)=>setTab(t);
  const handleViewAccount=(accountId)=>{setViewAccountId(accountId);setTab("transactions")};
  const switchTab=(t)=>{if(t!=="transactions")setViewAccountId(null);setTab(t)};

  const [loadTime, setLoadTime] = useState(0);
  useEffect(()=>{if(init){const t=setInterval(()=>setLoadTime(s=>s+1),1000);return()=>clearInterval(t)}},[init]);

  if(init) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.font}}>
    <div style={{textAlign:"center"}}>
      <Spin s={28}/>
      <div style={{marginTop:12,fontSize:14,color:T.textSec,fontWeight:500}}>Loading EnoughFi...</div>
      {loadTime > 3 && <div style={{marginTop:8,fontSize:12,color:T.textTer,maxWidth:260,lineHeight:1.5}}>
        Server is waking up — this takes ~20-30 seconds on first visit. Hang tight! 🔥
      </div>}
    </div>
  </div>;

  if(page==="landing"&&!user) return <LandingPage onGetStarted={(mode)=>{setAuthMode(mode);setPage("auth")}} onDemo={handleDemoLogin}/>;
  if(page==="auth"&&!user) return <AuthScreen onLogin={handleLogin} initialMode={authMode} onBack={()=>setPage("landing")}/>;
  if(page==="onboarding"&&user) return <OnboardingWizard onComplete={handleOnboardingComplete} userName={user?.name} onSkip={async()=>{
    try { await api.call("PUT","/onboarding/skip"); } catch(e) {}
    setPage("app");loadFireData();toast("Skipped setup. You can fill it anytime from Settings.","info");
  }}/>;
  if(!user) return <LandingPage onGetStarted={(mode)=>{setAuthMode(mode);setPage("auth")}} onDemo={handleDemoLogin}/>;

  const isAdmin = user?.is_admin;
  const tabs=[
    {id:"home",label:"Home",icon:I.fire},
    {id:"transactions",label:"Txns",icon:I.tx},
    {id:"accounts",label:"Accounts",icon:I.acc},
    {id:"reports",label:"Reports",icon:I.rep},
    ...(isAdmin?[{id:"admin",label:"Admin",icon:I.admin}]:[]),
    {id:"settings",label:"More",icon:I.set},
  ];

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.font,color:T.text}}>
      <GlobalStyles/>
      {toastMsg&&<Toast {...toastMsg} onClose={()=>setToastMsg(null)}/>}

      {/* Top Bar */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(250,250,249,0.88)",backdropFilter:"blur(14px)",borderBottom:`1px solid ${T.border}`}}>
        <div style={{maxWidth:720,margin:"0 auto",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:18,fontWeight:900,letterSpacing:"-0.04em",cursor:"pointer"}} onClick={()=>switchTab("home")}>
            <span>Enough</span><span style={{color:T.accent}}>Fi</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {user?.is_demo&&<Pill color={T.warn}>Demo</Pill>}
            <span style={{fontSize:12,color:T.textTer,fontWeight:500}}>{user.name?.split(" ")[0]}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"18px 20px 120px"}}>
        {tab==="home"&&<FIREDashboard user={user} fireData={fireData} toast={toast} onAskFi={handleAskFi} onNavigate={handleNavigate} onRefresh={loadFireData}/>}
        {tab==="transactions"&&<TransactionsTab accounts={accounts} toast={toast} initialAccountId={viewAccountId}/>}
        {tab==="accounts"&&<AccountsTab accounts={accounts} refreshAccounts={refreshAccounts} toast={toast} onViewAccount={handleViewAccount}/>}
        {tab==="reports"&&<ReportsTab toast={toast}/>}
        {tab==="admin"&&isAdmin&&<AdminTab toast={toast}/>}
        {tab==="settings"&&<SettingsTab user={user} toast={toast} onLogout={handleLogout} onEditProfile={()=>setPage("onboarding")}/>}
      </div>

      {/* Floating Quick Add Button */}
      <button onClick={()=>setShowQuickAdd(true)}
        style={{position:"fixed",bottom:80,right:20,width:56,height:56,borderRadius:28,
          background:`linear-gradient(135deg, ${T.accent}, ${T.accentDark})`,border:"none",cursor:"pointer",
          boxShadow:"0 4px 16px rgba(5,150,105,0.3)",display:"flex",alignItems:"center",justifyContent:"center",
          color:"#fff",zIndex:99,transition:"transform .15s",fontSize:24}}>
        ₹
      </button>

      {/* Floating Ask Fi Button */}
      <button onClick={()=>setShowAskFi(true)}
        style={{position:"fixed",bottom:80,left:20,width:48,height:48,borderRadius:24,
          background:`linear-gradient(135deg, ${T.fire}, ${T.fireDark})`,border:"none",cursor:"pointer",
          boxShadow:"0 4px 16px rgba(249,115,22,0.3)",display:"flex",alignItems:"center",justifyContent:"center",
          color:"#fff",zIndex:99,transition:"transform .15s",fontSize:18}}>
        🤖
      </button>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.94)",backdropFilter:"blur(14px)",borderTop:`1px solid ${T.border}`,zIndex:100}}>
        <div style={{maxWidth:720,margin:"0 auto",display:"flex"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>switchTab(t.id)} style={{flex:1,padding:"8px 0 max(8px, env(safe-area-inset-bottom))",border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?T.accent:T.textTer,transition:"color .15s",fontFamily:T.font}}>
              <div style={{transition:"transform .15s",transform:tab===t.id?"scale(1.1)":"scale(1)"}}>{t.icon}</div>
              <span style={{fontSize:9,fontWeight:tab===t.id?700:500,letterSpacing:"-0.01em"}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      <QuickAddModal open={showQuickAdd} onClose={()=>setShowQuickAdd(false)} toast={toast}/>
      <AskFiDrawer open={showAskFi} onClose={()=>{setShowAskFi(false);setAskFiInitialQ(null)}} toast={toast}/>
    </div>
  );
}
