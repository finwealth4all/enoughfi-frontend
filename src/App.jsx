import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ============================================================
// CONFIG
// ============================================================
const API = window.__ENOUGHFI_API__ || "https://finance-tracker-api-wz6y.onrender.com/api";

// ============================================================
// HELPERS
// ============================================================
const fmt = (n) => {
  const num = parseFloat(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${(num / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
const fmtFull = (n) =>
  parseFloat(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmtDate = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
};
const fmtDateInput = (d) => {
  if (!d) return new Date().toISOString().split("T")[0];
  return new Date(d).toISOString().split("T")[0];
};
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
    try {
      const res = await fetch(`${API}${path}`, { method, headers, body: isFormData ? body : body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      if (err.message?.includes("Failed to fetch")) throw new Error("Server waking up (~30s). Please retry.");
      throw err;
    }
  },
  login: (e,p) => api.call("POST","/auth/login",{email:e,password:p}),
  register: (n,e,p) => api.call("POST","/auth/register",{name:n,email:e,password:p}),
  me: () => api.call("GET","/auth/me"),
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
  // Smart statement import
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
  // Demo
  demoLogin: () => api.call("POST","/auth/demo-login"),
};

// ============================================================
// THEME
// ============================================================
const T = {
  bg:"#fafaf9", card:"#ffffff", cardHover:"#fafaf9", border:"#e7e5e4",
  text:"#1c1917", textSec:"#78716c", textTer:"#a8a29e",
  accent:"#1c1917", accentLight:"#f5f5f4", accentMid:"#e7e5e4",
  success:"#059669", successBg:"#ecfdf5", danger:"#dc2626", dangerBg:"#fef2f2",
  warn:"#d97706", warnBg:"#fffbeb", info:"#2563eb", infoBg:"#eff6ff",
  purple:"#7c3aed",
  r: "14px", rs: "10px", rFull: "9999px",
  font: "'Outfit', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
  shadow: "0 1px 3px rgba(28,25,23,0.06), 0 1px 2px rgba(28,25,23,0.04)",
  shadowMd: "0 4px 6px -1px rgba(28,25,23,0.07), 0 2px 4px -2px rgba(28,25,23,0.05)",
};

// ============================================================
// ICONS (inline SVG)
// ============================================================
const I = {
  home:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tx:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M7 10l5-6 5 6M7 14l5 6 5-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  acc:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>,
  rep:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 20h18M6 16V10M10 16V4M14 16V8M18 16V12" strokeLinecap="round"/></svg>,
  set:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>,
  close:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>,
  search:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" strokeLinecap="round"/></svg>,
  trash:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" strokeLinecap="round"/></svg>,
  edit:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  logout:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  filter:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  upload:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  download:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chev:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:<svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  back:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tag:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" strokeLinecap="round" strokeLinejoin="round"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  folder:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  eye:<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
};

// ============================================================
// REUSABLE COMPONENTS
// ============================================================
const Spin = ({s=20}) => <div style={{width:s,height:s,border:`2px solid ${T.border}`,borderTopColor:T.accent,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block"}}/>;

function Toast({message,type,onClose}) {
  useEffect(()=>{const t=setTimeout(onClose,3500);return()=>clearTimeout(t)},[onClose]);
  const c={success:T.success,error:T.danger,info:T.accent};
  return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:c[type]||T.accent,color:"#fff",padding:"10px 22px",borderRadius:T.rFull,fontSize:13,fontFamily:T.font,fontWeight:500,zIndex:9999,animation:"slideDown .3s ease",maxWidth:"92vw",boxShadow:T.shadowMd}}>{message}</div>;
}

const Empty = ({icon,title,sub,action}) => (
  <div style={{textAlign:"center",padding:"48px 20px",color:T.textSec}}>
    <div style={{fontSize:40,marginBottom:10,opacity:0.25}}>{icon||"📭"}</div>
    <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>{title}</div>
    <div style={{fontSize:12,marginBottom:16}}>{sub}</div>
    {action}
  </div>
);

const Btn = ({children,onClick,v="primary",s="md",disabled,loading,style:st,...p}) => {
  const base = {fontFamily:T.font,fontWeight:500,border:"none",cursor:disabled?"not-allowed":"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,transition:"all .15s",opacity:disabled?0.5:1,borderRadius:T.rs,letterSpacing:"-0.01em"};
  const sz = {sm:{padding:"5px 11px",fontSize:12},md:{padding:"9px 16px",fontSize:13},lg:{padding:"12px 24px",fontSize:14}};
  const vr = {primary:{background:T.accent,color:"#fff"},secondary:{background:T.accentLight,color:T.text,border:`1px solid ${T.border}`},ghost:{background:"transparent",color:T.textSec},danger:{background:T.dangerBg,color:T.danger}};
  return <button onClick={onClick} disabled={disabled||loading} style={{...base,...sz[s],...vr[v],...st}} {...p}>{loading?<Spin s={14}/>:null}{children}</button>;
};

const Inp = ({label,error,style:st,...p}) => (
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:600,color:T.textSec,marginBottom:4,fontFamily:T.font,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</label>}
    <input style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${error?T.danger:T.border}`,borderRadius:T.rs,fontSize:13,fontFamily:T.font,background:"#fff",color:T.text,outline:"none",boxSizing:"border-box",transition:"border .15s",...st}} {...p}/>
    {error&&<div style={{fontSize:10,color:T.danger,marginTop:3}}>{error}</div>}
  </div>
);

const Sel = ({label,options,style:st,...p}) => (
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:600,color:T.textSec,marginBottom:4,fontFamily:T.font,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</label>}
    <select style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${T.border}`,borderRadius:T.rs,fontSize:13,fontFamily:T.font,background:"#fff",color:T.text,outline:"none",boxSizing:"border-box",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",...st}} {...p}>
      {options.map(o => typeof o==="string"?<option key={o} value={o}>{o}</option>:<option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  </div>
);

function Modal({open,onClose,title,width,children}) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(28,25,23,0.35)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.card,borderRadius:"18px",width:"100%",maxWidth:width||520,maxHeight:"90vh",overflow:"auto",animation:"scaleIn .25s",padding:"22px 24px 28px",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{fontSize:17,fontWeight:700,margin:0,fontFamily:T.font,letterSpacing:"-0.02em"}}>{title}</h3>
          <button onClick={onClose} style={{background:T.accentLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",display:"flex",color:T.textSec}}>{I.close}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Card = ({children,style:st,onClick,hover}) => (
  <div onClick={onClick} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r,padding:16,cursor:onClick?"pointer":"default",transition:"all .15s",boxShadow:T.shadow,...st}}
    onMouseEnter={e=>{if(hover||onClick){e.currentTarget.style.borderColor="#d6d3d1";e.currentTarget.style.boxShadow=T.shadowMd}}}
    onMouseLeave={e=>{if(hover||onClick){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow=T.shadow}}}>{children}</div>
);

const Pill = ({children,color=T.textSec,bg}) => (
  <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:T.rFull,background:bg||`${color}14`,color,fontFamily:T.font,whiteSpace:"nowrap",letterSpacing:"0.01em"}}>{children}</span>
);

const StatCard = ({label,value,sub,color,icon}) => (
  <Card style={{padding:"14px 16px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:10,fontWeight:600,color:T.textSec,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{label}</div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:T.mono,color:color||T.text,letterSpacing:"-0.02em"}}>{value}</div>
        {sub&&<div style={{fontSize:11,color:T.textSec,marginTop:2}}>{sub}</div>}
      </div>
      {icon&&<div style={{width:36,height:36,borderRadius:10,background:`${color||T.accent}10`,display:"flex",alignItems:"center",justifyContent:"center",color:color||T.accent,fontSize:16}}>{icon}</div>}
    </div>
  </Card>
);

// FY + Month Selector
const FYSelector = ({fy,setFy,month,setMonth}) => (
  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
    <select value={fy} onChange={e=>{setFy(parseInt(e.target.value));if(setMonth)setMonth(null)}} style={{padding:"7px 30px 7px 12px",borderRadius:T.rFull,border:`1.5px solid ${T.accent}`,fontSize:12,fontWeight:600,fontFamily:T.font,background:T.accent,color:"#fff",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",cursor:"pointer"}}>
      {[2025,2024,2023,2022,2021,2020].map(y=><option key={y} value={y}>{getFYLabel(y)}</option>)}
    </select>
    {setMonth && (
      <div style={{display:"flex",gap:3,overflowX:"auto",flex:1,paddingBottom:2}}>
        <button onClick={()=>setMonth(null)} style={{padding:"5px 10px",borderRadius:T.rFull,border:"none",fontSize:11,fontWeight:month===null?600:500,cursor:"pointer",fontFamily:T.font,background:month===null?T.accent:T.accentLight,color:month===null?"#fff":T.textSec,whiteSpace:"nowrap",transition:"all .15s"}}>All</button>
        {MONTHS.map((m,i)=>(
          <button key={m} onClick={()=>setMonth(i)} style={{padding:"5px 10px",borderRadius:T.rFull,border:"none",fontSize:11,fontWeight:month===i?600:500,cursor:"pointer",fontFamily:T.font,background:month===i?T.accent:T.accentLight,color:month===i?"#fff":T.textSec,whiteSpace:"nowrap",transition:"all .15s"}}>{m}</button>
        ))}
      </div>
    )}
  </div>
);

// ============================================================
// LANDING PAGE — Marketing page for enoughfi.com
// ============================================================
function LandingPage({onGetStarted, onDemo}) {
  const [demoLoading,setDemoLoading]=useState(false);
  const features = [
    {icon:"📊",title:"Net Worth Dashboard",desc:"See your complete financial picture — assets, liabilities, and net worth at a glance."},
    {icon:"🏦",title:"Bank Statement Import",desc:"Upload PDF/CSV statements from HDFC, SBI, ICICI and more. Auto-parsed and classified."},
    {icon:"📁",title:"Double-Entry Accounting",desc:"Professional GnuCash-style bookkeeping with 139+ account categories."},
    {icon:"🔥",title:"FIRE Calculator",desc:"Track your journey to Financial Independence. Know your FIRE number."},
    {icon:"🧾",title:"Tax Reports",desc:"Auto-categorize transactions for ITR filing. 80C, 80D, HRA and more."},
    {icon:"📱",title:"Works Everywhere",desc:"Beautiful responsive design. Use on phone, tablet, or desktop."},
  ];
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.font,color:T.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{margin:0;-webkit-font-smoothing:antialiased;background:${T.bg}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
      `}</style>

      {/* Nav */}
      <div style={{maxWidth:960,margin:"0 auto",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.04em"}}>
          <span style={{color:T.text}}>Enough</span><span style={{color:T.success}}>Fi</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn v="secondary" s="sm" onClick={()=>onGetStarted("login")}>Log In</Btn>
          <Btn s="sm" onClick={()=>onGetStarted("register")}>Sign Up Free</Btn>
        </div>
      </div>

      {/* Hero */}
      <div style={{maxWidth:960,margin:"0 auto",padding:"60px 24px 40px",textAlign:"center"}}>
        <div style={{display:"inline-block",background:T.successBg,color:T.success,padding:"5px 16px",borderRadius:T.rFull,fontSize:12,fontWeight:600,marginBottom:20}}>🔥 Built for the FIRE community</div>
        <h1 style={{fontSize:"clamp(32px, 6vw, 56px)",fontWeight:900,letterSpacing:"-0.04em",lineHeight:1.1,marginBottom:16}}>
          Your money.<br/>Your <span style={{color:T.success}}>freedom</span>.
        </h1>
        <p style={{fontSize:17,color:T.textSec,maxWidth:520,margin:"0 auto 32px",lineHeight:1.6}}>
          Track every rupee with professional double-entry accounting. Import bank statements automatically. Know your FIRE number. All for free.
        </p>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <Btn s="lg" onClick={()=>onGetStarted("register")} style={{fontSize:15,padding:"14px 32px",borderRadius:T.rFull}}>Get Started — It's Free</Btn>
          <Btn v="secondary" s="lg" onClick={async()=>{setDemoLoading(true);await onDemo();setDemoLoading(false)}} style={{fontSize:15,padding:"14px 32px",borderRadius:T.rFull}}>
            {demoLoading?<Spin s={14}/>:null} Try Live Demo
          </Btn>
        </div>
        <div style={{fontSize:12,color:T.textTer,marginTop:12}}>No credit card required. Your data stays yours.</div>
      </div>

      {/* Stats Bar */}
      <div style={{maxWidth:680,margin:"0 auto 40px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,padding:"0 24px"}}>
        {[{n:"100%",l:"Free & Open"},{n:"256-bit",l:"SSL Encrypted"},{n:"10K+",l:"Transactions Handled"}].map(s=>
          <div key={s.l} style={{textAlign:"center",padding:16,background:T.card,borderRadius:T.r,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:22,fontWeight:800,fontFamily:T.mono,color:T.success}}>{s.n}</div>
            <div style={{fontSize:11,color:T.textSec,fontWeight:500}}>{s.l}</div>
          </div>
        )}
      </div>

      {/* Features Grid */}
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 24px 60px"}}>
        <h2 style={{textAlign:"center",fontSize:28,fontWeight:800,letterSpacing:"-0.03em",marginBottom:6}}>Everything you need</h2>
        <p style={{textAlign:"center",fontSize:14,color:T.textSec,marginBottom:32}}>No spreadsheets. No complexity. Just clarity.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(230px, 1fr))",gap:14}}>
          {features.map(f=>
            <div key={f.title} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r,padding:22,transition:"all .2s"}}>
              <div style={{fontSize:28,marginBottom:10}}>{f.icon}</div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{f.title}</div>
              <div style={{fontSize:12,color:T.textSec,lineHeight:1.6}}>{f.desc}</div>
            </div>
          )}
        </div>
      </div>

      {/* How it Works */}
      <div style={{background:T.card,borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,padding:"50px 24px"}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <h2 style={{textAlign:"center",fontSize:28,fontWeight:800,letterSpacing:"-0.03em",marginBottom:32}}>Get started in 3 minutes</h2>
          <div style={{display:"grid",gap:20}}>
            {[{n:"1",t:"Create your account",d:"Sign up free. No credit card, no strings attached."},{n:"2",t:"Import your bank statements",d:"Upload PDFs or CSVs from any major Indian bank. We auto-parse everything."},{n:"3",t:"See your full picture",d:"Dashboard shows net worth, FIRE progress, spending trends, and tax reports."}].map(s=>
              <div key={s.n} style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:T.accent,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{s.n}</div>
                <div>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:3}}>{s.t}</div>
                  <div style={{fontSize:13,color:T.textSec,lineHeight:1.5}}>{s.d}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{textAlign:"center",padding:"60px 24px"}}>
        <h2 style={{fontSize:28,fontWeight:800,letterSpacing:"-0.03em",marginBottom:8}}>Ready to take control?</h2>
        <p style={{fontSize:14,color:T.textSec,marginBottom:24}}>Join thousands tracking their path to financial independence.</p>
        <Btn s="lg" onClick={()=>onGetStarted("register")} style={{fontSize:15,padding:"14px 36px",borderRadius:T.rFull}}>Start Free Today</Btn>
      </div>

      {/* Footer */}
      <div style={{borderTop:`1px solid ${T.border}`,padding:"24px",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,letterSpacing:"-0.04em",marginBottom:4}}>
          <span>Enough</span><span style={{color:T.success}}>Fi</span>
        </div>
        <div style={{fontSize:11,color:T.textTer}}>Built with care for the Indian FIRE community. Your data never leaves your control.</div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH SCREEN — Login/Register with EnoughFi branding
// ============================================================
function AuthScreen({onLogin,initialMode,onBack}) {
  const [isLogin,setIsLogin]=useState(initialMode!=="register");
  const [form,setForm]=useState({name:"",email:"",password:""});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const submit = async()=>{
    setError("");setLoading(true);
    try{const data=isLogin?await api.login(form.email,form.password):await api.register(form.name,form.email,form.password);api.token=data.token;localStorage.setItem("ft_token",data.token);onLogin(data.user,data.token)}catch(e){setError(e.message)}
    setLoading(false);
  };
  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg, ${T.bg} 0%, #e7e5e4 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:T.font}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:36,fontWeight:900,letterSpacing:"-0.04em",color:T.text}}>
            <span>Enough</span><span style={{color:T.success}}>Fi</span>
          </div>
          <div style={{fontSize:13,color:T.textSec,marginTop:6}}>Your personal finance companion</div>
        </div>
        <Card style={{padding:28}}>
          <div style={{display:"flex",marginBottom:20,background:T.accentLight,borderRadius:T.rs,padding:3}}>
            {["Login","Register"].map(t=><button key={t} onClick={()=>{setIsLogin(t==="Login");setError("")}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.font,background:(t==="Login")===isLogin?"#fff":"transparent",color:(t==="Login")===isLogin?T.text:T.textSec,boxShadow:(t==="Login")===isLogin?T.shadow:"none",transition:"all .15s"}}>{t}</button>)}
          </div>
          {!isLogin&&<Inp label="Name" placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>}
          <Inp label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
          <Inp label="Password" type="password" placeholder="Min 8 characters" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()}/>
          {error&&<div style={{fontSize:12,color:T.danger,marginBottom:12,padding:"8px 12px",background:T.dangerBg,borderRadius:8}}>{error}</div>}
          <Btn onClick={submit} loading={loading} style={{width:"100%",marginTop:4}} s="lg">{isLogin?"Sign In":"Create Account"}</Btn>
        </Card>
        {onBack&&<div style={{textAlign:"center",marginTop:16}}><Btn v="ghost" s="sm" onClick={onBack}>{I.back} Back to home</Btn></div>}
      </div>
    </div>
  );
}

// ============================================================
// ADMIN PANEL — User management (admin-only tab)
// ============================================================
function AdminTab({toast}) {
  const [users,setUsers]=useState([]);
  const [stats,setStats]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    try{
      const [u,s]=await Promise.all([api.adminUsers(),api.adminStats()]);
      setUsers(u);setStats(s);
    }catch(e){toast(e.message,"error")}
    setLoading(false);
  })()},[toast]);

  const handleDelete=async(id,name)=>{
    if(!confirm(`Delete user "${name}" and ALL their data? This cannot be undone.`))return;
    try{await api.adminDeleteUser(id);setUsers(prev=>prev.filter(u=>u.user_id!==id));toast("User deleted","success")}catch(e){toast(e.message,"error")}
  };

  const handleToggleAdmin=async(id)=>{
    try{const u=await api.adminToggle(id);setUsers(prev=>prev.map(x=>x.user_id===id?{...x,is_admin:u.is_admin}:x));toast(`Admin ${u.is_admin?"granted":"revoked"}`,"success")}catch(e){toast(e.message,"error")}
  };

  if(loading) return <div style={{textAlign:"center",padding:80}}><Spin s={28}/></div>;

  return (
    <div>
      <h2 style={{margin:"0 0 20px",fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Admin Panel</h2>

      {/* Stats */}
      {stats&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:10,marginBottom:20}}>
          <StatCard label="Users" value={stats.total_users} color={T.accent} icon="👥"/>
          <StatCard label="Transactions" value={fmtFull(stats.total_transactions).replace("₹","")} color={T.info} icon="📊"/>
          <StatCard label="Accounts" value={stats.total_accounts} color={T.success} icon="🏦"/>
        </div>
      )}

      {/* Users List */}
      <Card style={{padding:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>All Users</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.font}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${T.border}`,textAlign:"left"}}>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Name</th>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Email</th>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Joined</th>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Txns</th>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Role</th>
                <th style={{padding:"8px 10px",fontWeight:600,color:T.textSec}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.user_id} style={{borderBottom:`1px solid ${T.accentLight}`}}>
                  <td style={{padding:"10px"}}><strong>{u.name}</strong></td>
                  <td style={{padding:"10px",color:T.textSec}}>{u.email}</td>
                  <td style={{padding:"10px",color:T.textSec}}>{fmtDate(u.created_at)}</td>
                  <td style={{padding:"10px",fontFamily:T.mono}}>{u.transaction_count||0}</td>
                  <td style={{padding:"10px"}}><Pill color={u.is_admin?T.purple:T.textSec}>{u.is_admin?"Admin":"User"}</Pill></td>
                  <td style={{padding:"10px"}}>
                    <div style={{display:"flex",gap:6}}>
                      <Btn v="ghost" s="sm" onClick={()=>handleToggleAdmin(u.user_id)}>{u.is_admin?"Revoke":"Grant"}</Btn>
                      {!u.is_demo&&<Btn v="danger" s="sm" onClick={()=>handleDelete(u.user_id,u.name)}>{I.trash}</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// DASHBOARD TAB — Rich overview
// ============================================================
function DashboardTab({user,accounts,toast,onNavigate}) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{try{setData(await api.getDashboard())}catch(e){toast(e.message,"error")} setLoading(false)})()},[toast]);

  const totals = useMemo(()=>{
    const t={};
    accounts.forEach(a=>{if(!t[a.account_type])t[a.account_type]=0;t[a.account_type]+=parseFloat(a.calculated_balance||a.current_balance||0)});
    return t;
  },[accounts]);

  const netWorth=(totals.Asset||0)-Math.abs(totals.Liability||0);

  // Asset allocation
  const assetBreakdown = useMemo(()=>{
    const g={};
    accounts.filter(a=>a.account_type==="Asset").forEach(a=>{const k=a.sub_type||"Other";if(!g[k])g[k]=0;g[k]+=parseFloat(a.calculated_balance||a.current_balance||0)});
    return Object.entries(g).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  },[accounts]);

  const liabBreakdown = useMemo(()=>{
    const g={};
    accounts.filter(a=>a.account_type==="Liability").forEach(a=>{const k=a.sub_type||"Other";if(!g[k])g[k]=0;g[k]+=Math.abs(parseFloat(a.calculated_balance||a.current_balance||0))});
    return Object.entries(g).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  },[accounts]);

  const totalAssets=assetBreakdown.reduce((s,[,v])=>s+v,0);
  const totalLiab=liabBreakdown.reduce((s,[,v])=>s+v,0);
  const pieColors=["#059669","#2563eb","#7c3aed","#d97706","#06b6d4","#ec4899","#14b8a6","#6366f1","#f97316","#84cc16","#e11d48","#0ea5e9"];

  if(loading) return <div style={{textAlign:"center",padding:80}}><Spin s={28}/></div>;
  if(!data) return <Empty icon="📊" title="Could not load" sub="Please retry"/>;

  const monthly=(data.monthly_summary||[]).reverse().slice(-12);
  const maxBar=Math.max(...monthly.flatMap(m=>[parseFloat(m.income),parseFloat(m.expenses)]),1);

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Dashboard</h2>
        <span style={{fontSize:13,color:T.textSec}}>Welcome back{user?.name?`, ${user.name.split(" ")[0]}`:""}</span>
      </div>

      {/* Net Worth Hero */}
      <Card style={{marginBottom:16,background:"linear-gradient(135deg, #1c1917 0%, #44403c 100%)",color:"#fff",border:"none",padding:"24px 28px"}}>
        <div style={{fontSize:11,opacity:0.5,fontWeight:600,letterSpacing:"0.08em"}}>NET WORTH</div>
        <div style={{fontSize:34,fontWeight:800,fontFamily:T.mono,letterSpacing:"-0.03em",marginTop:4}}>{fmtFull(netWorth)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:16}}>
          {[{l:"Assets",v:totals.Asset||0,c:"#34d399"},{l:"Liabilities",v:Math.abs(totals.Liability||0),c:"#fca5a5"},{l:"Transactions",v:data.transaction_count,c:"#93c5fd",isCount:true}].map(x=>(
            <div key={x.l} style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:9,opacity:0.5,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>{x.l}</div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:T.mono,color:x.c,marginTop:2}}>{x.isCount?x.v?.toLocaleString():`₹${fmt(x.v)}`}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <StatCard label="Total Income" value={`₹${fmt(totals.Income||0)}`} color={T.info} icon="💰"/>
        <StatCard label="Total Expenses" value={`₹${fmt(Math.abs(totals.Expense||0))}`} color={T.warn} icon="🛒"/>
      </div>

      {/* Monthly Trend */}
      {monthly.length>0&&(
        <Card style={{marginBottom:16,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700}}>Monthly Trend</div>
            <div style={{display:"flex",gap:12}}>
              <span style={{fontSize:10,display:"flex",alignItems:"center",gap:4,color:T.textSec}}><span style={{width:8,height:4,borderRadius:2,background:T.success,display:"inline-block"}}/>Income</span>
              <span style={{fontSize:10,display:"flex",alignItems:"center",gap:4,color:T.textSec}}><span style={{width:8,height:4,borderRadius:2,background:T.danger,display:"inline-block"}}/>Expense</span>
            </div>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"flex-end",height:130}}>
            {monthly.map(m=>{
              const inc=parseFloat(m.income),exp=parseFloat(m.expenses),net=inc-exp;
              return (
                <div key={m.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{fontSize:8,fontFamily:T.mono,color:net>=0?T.success:T.danger,fontWeight:700,whiteSpace:"nowrap"}}>{net>=0?"+":"−"}₹{fmt(Math.abs(net))}</div>
                  <div style={{display:"flex",gap:1,alignItems:"flex-end",height:90,width:"100%"}}>
                    <div title={`Income: ₹${fmt(inc)}`} style={{flex:1,background:`linear-gradient(180deg, ${T.success}, ${T.success}40)`,borderRadius:"4px 4px 0 0",height:`${Math.max((inc/maxBar)*100,3)}%`,transition:"height .5s"}}/>
                    <div title={`Expense: ₹${fmt(exp)}`} style={{flex:1,background:`linear-gradient(180deg, ${T.danger}, ${T.danger}40)`,borderRadius:"4px 4px 0 0",height:`${Math.max((exp/maxBar)*100,3)}%`,transition:"height .5s"}}/>
                  </div>
                  <div style={{fontSize:9,color:T.textTer,whiteSpace:"nowrap"}}>{m.month?.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Asset Allocation */}
      {assetBreakdown.length>0&&(
        <Card style={{marginBottom:16,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Asset Allocation</div>
          <div style={{display:"flex",height:18,borderRadius:T.rFull,overflow:"hidden",marginBottom:14}}>
            {assetBreakdown.map(([cat,val],i)=>(
              <div key={cat} style={{width:`${(val/totalAssets)*100}%`,background:pieColors[i%pieColors.length],minWidth:2}} title={`${cat}: ${fmtFull(val)}`}/>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px"}}>
            {assetBreakdown.map(([cat,val],i)=>(
              <div key={cat} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
                <span style={{width:8,height:8,borderRadius:3,background:pieColors[i%pieColors.length],display:"inline-block",flexShrink:0}}/>
                <span style={{fontSize:11,color:T.textSec,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat}</span>
                <span style={{fontSize:11,fontFamily:T.mono,color:T.text,fontWeight:600,whiteSpace:"nowrap"}}>{fmt(val)}</span>
                <span style={{fontSize:9,color:T.textTer,whiteSpace:"nowrap"}}>{((val/totalAssets)*100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Liability Breakdown */}
      {liabBreakdown.length>0&&(
        <Card style={{marginBottom:16,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Liabilities</div>
          {liabBreakdown.map(([cat,val])=>{
            const pct=totalLiab>0?(val/totalLiab)*100:0;
            return (
              <div key={cat} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:12,fontWeight:500}}>{cat}</span>
                  <span style={{fontSize:12,fontFamily:T.mono,color:T.danger,fontWeight:600}}>₹{fmt(val)}</span>
                </div>
                <div style={{height:5,background:T.accentLight,borderRadius:3}}>
                  <div style={{height:"100%",background:`${T.danger}70`,borderRadius:3,width:`${pct}%`,transition:"width .5s"}}/>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Top Spending */}
      {(data.top_categories||[]).length>0&&(
        <Card style={{marginBottom:16,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Top Spending (This Month)</div>
          {data.top_categories.slice(0,8).map((c,i)=>{
            const max=parseFloat(data.top_categories[0].total);
            return (
              <div key={c.category} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:12,fontWeight:500}}>{c.category}</span>
                  <span style={{fontSize:12,fontFamily:T.mono,color:T.textSec,fontWeight:500}}>₹{fmt(c.total)}</span>
                </div>
                <div style={{height:4,background:T.accentLight,borderRadius:2}}>
                  <div style={{height:"100%",background:T.accent,borderRadius:2,width:`${(parseFloat(c.total)/max)*100}%`,opacity:1-i*0.07,transition:"width .5s"}}/>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Recent Transactions */}
      {(data.recent_transactions||[]).length>0&&(
        <Card style={{padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700}}>Recent Transactions</div>
            <Btn v="ghost" s="sm" onClick={()=>onNavigate("transactions")}>View all {I.chevR}</Btn>
          </div>
          {data.recent_transactions.slice(0,6).map(tx=>{
            const isExp=tx.debit_account_type==="Expense",isInc=tx.credit_account_type==="Income";
            return (
              <div key={tx.transaction_id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.accentLight}`}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description||tx.category||"—"}</div>
                  <div style={{fontSize:10,color:T.textTer,marginTop:1}}>{fmtDate(tx.date)} · {tx.debit_account_name||tx.credit_account_name}</div>
                </div>
                <span style={{fontSize:14,fontWeight:700,fontFamily:T.mono,color:isExp?T.danger:isInc?T.success:T.text,flexShrink:0}}>{isExp?"−":isInc?"+":""}₹{fmt(tx.amount)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ============================================================
// TRANSACTIONS TAB — Enhanced filters, bulk ops, export
// ============================================================
function TransactionsTab({accounts,toast,initialAccountId}) {
  const [txns,setTxns]=useState([]);
  const [loading,setLoading]=useState(true);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [search,setSearch]=useState("");
  const [filterAcc,setFilterAcc]=useState(initialAccountId||"");
  const [fy,setFy]=useState(getCurrentFY());
  const [month,setMonth]=useState(null);
  const [showModal,setShowModal]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [editTx,setEditTx]=useState(null);
  const [showFilters,setShowFilters]=useState(false);
  const [periodTotals,setPeriodTotals]=useState({income:0,expense:0});
  const [selected,setSelected]=useState(new Set());
  const [bulkCategory,setBulkCategory]=useState("");
  const [showBulk,setShowBulk]=useState(false);

  // Reset account filter when navigating away and back
  useEffect(()=>{if(initialAccountId)setFilterAcc(initialAccountId)},[initialAccountId]);

  const dateParams=useMemo(()=>{
    if(month!==null){const{start,end}=getMonthRange(fy,month);return`start_date=${start}&end_date=${end}`}
    const{start,end}=getFYRange(fy);return`start_date=${start}&end_date=${end}`;
  },[fy,month]);

  const fetchTxns=useCallback(async()=>{
    setLoading(true);
    try{
      let params=`page=${page}&limit=30&sort_by=date&sort_order=DESC&${dateParams}`;
      if(search) params+=`&search=${encodeURIComponent(search)}`;
      if(filterAcc) params+=`&account_id=${filterAcc}`;
      const data=await api.getTransactions(params);
      setTxns(data.transactions||[]);
      setTotal(data.pagination?.total||0);
    }catch(e){toast(e.message,"error")}
    setLoading(false);
  },[page,search,filterAcc,dateParams,toast]);

  const fetchSummary=useCallback(async()=>{
    try{
      let p=dateParams;
      if(filterAcc) p+=`&account_id=${filterAcc}`;
      const data=await api.getSummary(p);
      setPeriodTotals({income:data.income||0,expense:data.expense||0});
    }catch{}
  },[dateParams,filterAcc]);

  useEffect(()=>{fetchTxns()},[fetchTxns]);
  useEffect(()=>{fetchSummary()},[fetchSummary]);
  useEffect(()=>{setPage(1);setSelected(new Set())},[fy,month,filterAcc,search]);

  const handleDelete=async(id)=>{if(!confirm("Delete this transaction?"))return;try{await api.deleteTransaction(id);toast("Deleted","success");fetchTxns();fetchSummary()}catch(e){toast(e.message,"error")}};

  const toggleSelect=(id)=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const selectAll=()=>{if(selected.size===txns.length)setSelected(new Set());else setSelected(new Set(txns.map(t=>t.transaction_id)))};

  const handleBulkCategory=async()=>{
    if(!bulkCategory||selected.size===0)return;
    let ok=0;
    for(const id of selected){try{await api.updateTransaction(id,{category:bulkCategory});ok++}catch{}}
    toast(`Updated ${ok} transactions`,"success");
    setSelected(new Set());setShowBulk(false);setBulkCategory("");fetchTxns();
  };

  const handleExport=()=>{
    exportCSV(txns.map(t=>({Date:t.date?.split("T")[0],Amount:t.amount,Description:t.description,From:t.credit_account_name,To:t.debit_account_name,Category:t.category,Tax_Section:t.tax_category||""})),`transactions-${getFYLabel(fy)}.csv`);
    toast("Exported!","success");
  };

  const groupedByDate=useMemo(()=>{
    const groups={};
    txns.forEach(tx=>{const key=tx.date?.split("T")[0]||"unknown";if(!groups[key])groups[key]={date:key,txns:[]};groups[key].txns.push(tx)});
    return Object.values(groups);
  },[txns]);

  const filterAccName=filterAcc?accounts.find(a=>a.account_id===filterAcc)?.account_name:null;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <h2 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Transactions</h2>
          <span style={{fontSize:12,color:T.textSec}}>{total.toLocaleString()} in {month!==null?MONTHS[month]:getFYLabel(fy)}</span>
          {filterAccName&&<div style={{marginTop:4}}><Pill color={T.info}>{filterAccName}</Pill> <button onClick={()=>setFilterAcc("")} style={{fontSize:10,color:T.textSec,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>clear</button></div>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <Btn v="secondary" s="sm" onClick={handleExport}>{I.download}</Btn>
          <Btn v="secondary" s="sm" onClick={()=>setShowImport(true)}>{I.upload}</Btn>
          <Btn s="sm" onClick={()=>{setEditTx(null);setShowModal(true)}}>{I.plus} Add</Btn>
        </div>
      </div>

      <FYSelector fy={fy} setFy={setFy} month={month} setMonth={setMonth}/>

      {/* Period Summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[{l:"Income",v:periodTotals.income,c:T.success,pre:"+"},{l:"Expense",v:periodTotals.expense,c:T.danger,pre:"−"},{l:"Net",v:periodTotals.income-periodTotals.expense,c:periodTotals.income-periodTotals.expense>=0?T.success:T.danger}].map(x=>(
          <Card key={x.l} style={{padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textSec,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>{x.l}</div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:T.mono,color:x.c,marginTop:2}}>{x.pre||""}₹{fmt(Math.abs(x.v))}</div>
          </Card>
        ))}
      </div>

      {/* Search + Filters */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <div style={{flex:1,position:"relative"}}>
          <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.textTer}}>{I.search}</div>
          <input placeholder="Search transactions..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"9px 12px 9px 32px",border:`1.5px solid ${T.border}`,borderRadius:T.rs,fontSize:13,fontFamily:T.font,background:"#fff",outline:"none",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>setShowFilters(!showFilters)} style={{padding:"9px 12px",border:`1.5px solid ${filterAcc?T.accent:T.border}`,borderRadius:T.rs,background:filterAcc?T.accentLight:"#fff",cursor:"pointer",display:"flex",alignItems:"center",color:T.textSec}}>{I.filter}</button>
      </div>

      {showFilters&&(
        <Card style={{marginBottom:14,padding:14}}>
          <Sel label="Account" value={filterAcc} onChange={e=>setFilterAcc(e.target.value)} options={[{value:"",label:"All accounts"},...accounts.map(a=>({value:a.account_id,label:`${a.account_name} (${a.account_type})`}))]}/>
          {filterAcc&&<Btn v="ghost" s="sm" onClick={()=>setFilterAcc("")}>Clear</Btn>}
        </Card>
      )}

      {/* Bulk Actions Bar */}
      {selected.size>0&&(
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,padding:"8px 14px",background:T.infoBg,borderRadius:T.rs,border:`1px solid ${T.info}30`}}>
          <span style={{fontSize:12,fontWeight:600,color:T.info}}>{selected.size} selected</span>
          <Btn v="secondary" s="sm" onClick={()=>setShowBulk(true)}>{I.tag} Re-categorize</Btn>
          <Btn v="ghost" s="sm" onClick={()=>setSelected(new Set())}>Clear</Btn>
        </div>
      )}

      {/* Transaction List */}
      {loading?<div style={{textAlign:"center",padding:48}}><Spin s={24}/></div>
        :txns.length===0?<Empty icon="💸" title="No transactions" sub="Try a different period or add one" action={<Btn s="sm" onClick={()=>{setEditTx(null);setShowModal(true)}}>{I.plus} Add</Btn>}/>
        :<div>
          {/* Select all toggle */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"4px 0"}}>
            <input type="checkbox" checked={selected.size===txns.length&&txns.length>0} onChange={selectAll} style={{accentColor:T.accent}}/>
            <span style={{fontSize:11,color:T.textSec}}>Select all on page</span>
          </div>

          {groupedByDate.map(group=>(
            <div key={group.date}>
              <div style={{fontSize:11,fontWeight:700,color:T.textTer,padding:"10px 4px 4px",position:"sticky",top:52,background:T.bg,zIndex:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                {new Date(group.date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}
              </div>
              {group.txns.map(tx=>{
                const isExp=tx.debit_account_type==="Expense",isInc=tx.credit_account_type==="Income",isTransfer=!isExp&&!isInc;
                const amtColor=isExp?T.danger:isInc?T.success:T.info;
                const sign=isExp?"−":isInc?"+":"↔";
                const isSel=selected.has(tx.transaction_id);
                return (
                  <Card key={tx.transaction_id} style={{padding:"10px 14px",marginBottom:3,borderColor:isSel?`${T.info}60`:T.border,background:isSel?T.infoBg:T.card}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <input type="checkbox" checked={isSel} onChange={()=>toggleSelect(tx.transaction_id)} style={{marginTop:4,accentColor:T.accent,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                              <span style={{width:7,height:7,borderRadius:"50%",background:amtColor,flexShrink:0}}/>
                              <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description||tx.category||"Transaction"}</span>
                            </div>
                            <div style={{fontSize:11,color:T.textSec,marginLeft:13,marginBottom:3}}>
                              <span style={{color:typeColors[tx.credit_account_type]||T.textSec}}>{tx.credit_account_name}</span>
                              <span style={{margin:"0 5px",color:T.textTer}}>→</span>
                              <span style={{color:typeColors[tx.debit_account_type]||T.textSec}}>{tx.debit_account_name}</span>
                            </div>
                            <div style={{display:"flex",gap:4,marginLeft:13,flexWrap:"wrap"}}>
                              {tx.category&&tx.category!=="Uncategorized"&&<Pill>{tx.category}</Pill>}
                              {tx.tax_category&&<Pill color={T.info}>§{tx.tax_category}</Pill>}
                              {isTransfer&&<Pill color={T.info}>Transfer</Pill>}
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontSize:15,fontWeight:700,fontFamily:T.mono,color:amtColor,letterSpacing:"-0.02em"}}>{sign}₹{fmt(tx.amount)}</div>
                            <div style={{display:"flex",gap:3,marginTop:5,justifyContent:"flex-end"}}>
                              <button onClick={()=>{setEditTx(tx);setShowModal(true)}} style={{background:T.accentLight,border:"none",borderRadius:5,padding:4,cursor:"pointer",display:"flex",color:T.textSec}} title="Edit">{I.edit}</button>
                              <button onClick={()=>handleDelete(tx.transaction_id)} style={{background:T.dangerBg,border:"none",borderRadius:5,padding:4,cursor:"pointer",display:"flex",color:T.danger}} title="Delete">{I.trash}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      }

      {/* Pagination */}
      {total>30&&(
        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:16,alignItems:"center"}}>
          <Btn v="secondary" s="sm" disabled={page<=1} onClick={()=>setPage(page-1)}>← Prev</Btn>
          <span style={{fontSize:12,color:T.textSec,fontFamily:T.mono}}>Page {page}/{Math.ceil(total/30)}</span>
          <Btn v="secondary" s="sm" disabled={page>=Math.ceil(total/30)} onClick={()=>setPage(page+1)}>Next →</Btn>
        </div>
      )}

      {/* Bulk Re-categorize Modal */}
      <Modal open={showBulk} onClose={()=>setShowBulk(false)} title={`Re-categorize ${selected.size} transactions`} width={400}>
        <Sel label="New Category" value={bulkCategory} onChange={e=>setBulkCategory(e.target.value)} options={["","Groceries","Food","Dining Out","Rent","EMI Payment","Electricity","Water","Gas","Internet","Mobile","Fuel","Transport","Medical","Insurance","Shopping","Entertainment","Travel","Education","Subscription","Salary","Interest","Dividend","Capital Gains","Gift","Tax Paid","Donation","Household","Maintenance","Bank Charges","Transfer","Miscellaneous"].map(s=>({value:s,label:s||"Select category"}))}/>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <Btn v="secondary" onClick={()=>setShowBulk(false)} style={{flex:1}}>Cancel</Btn>
          <Btn onClick={handleBulkCategory} disabled={!bulkCategory} style={{flex:2}}>Apply to {selected.size} transactions</Btn>
        </div>
      </Modal>

      <TransactionModal open={showModal} onClose={()=>{setShowModal(false);setEditTx(null)}} accounts={accounts} editTx={editTx} onSave={()=>{setShowModal(false);setEditTx(null);fetchTxns();fetchSummary()}} toast={toast}/>
      <ImportModal open={showImport} onClose={()=>setShowImport(false)} onSuccess={()=>{setShowImport(false);fetchTxns();fetchSummary()}} toast={toast} accounts={accounts}/>
    </div>
  );
}

// ============================================================
// TRANSACTION MODAL
// ============================================================
function TransactionModal({open,onClose,accounts,editTx,onSave,toast}) {
  const [form,setForm]=useState({date:fmtDateInput(),amount:"",description:"",narration:"",debit_account_id:"",credit_account_id:"",category:"Uncategorized",tax_category:""});
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(editTx) setForm({date:fmtDateInput(editTx.date),amount:editTx.amount,description:editTx.description||"",narration:editTx.narration||"",debit_account_id:editTx.debit_account_id,credit_account_id:editTx.credit_account_id,category:editTx.category||"Uncategorized",tax_category:editTx.tax_category||""});
    else setForm({date:fmtDateInput(),amount:"",description:"",narration:"",debit_account_id:"",credit_account_id:"",category:"Uncategorized",tax_category:""});
  },[editTx,open]);

  const save=async()=>{
    if(!form.amount||!form.debit_account_id||!form.credit_account_id){toast("Fill: Amount, From, To","error");return}
    setSaving(true);
    try{const p={...form,amount:parseFloat(form.amount)};if(editTx){await api.updateTransaction(editTx.transaction_id,p);toast("Updated","success")}else{await api.createTransaction(p);toast("Added","success")}onSave()}catch(e){toast(e.message,"error")}
    setSaving(false);
  };

  const presets=[{label:"🛒 Expense",dt:"Expense",ct:"Asset"},{label:"💰 Income",dt:"Asset",ct:"Income"},{label:"🔄 Transfer",dt:"Asset",ct:"Asset"},{label:"💳 EMI",dt:"Liability",ct:"Asset"}];
  const grouped={};accounts.forEach(a=>{if(!grouped[a.account_type])grouped[a.account_type]=[];grouped[a.account_type].push(a)});
  const accOpts=[{value:"",label:"Select account"},...Object.entries(grouped).flatMap(([type,accs])=>[{value:`__${type}`,label:`── ${type} ──`,disabled:true},...accs.sort((a,b)=>a.account_name.localeCompare(b.account_name)).map(a=>({value:a.account_id,label:`  ${a.account_name}`}))])];
  const categories=["Uncategorized","Groceries","Food","Dining Out","Rent","EMI Payment","Electricity","Water","Gas","Internet","Mobile","Fuel","Transport","Medical","Insurance","Shopping","Entertainment","Travel","Education","Subscription","Salary","Interest","Dividend","Capital Gains","Gift","Tax Paid","Donation","Household","Maintenance","Bank Charges","Transfer","Miscellaneous"];
  const taxCats=["","80C","80D","80E","80G","80TTA","80CCD","24(b)","10(14)","HRA","LTA"];

  return (
    <Modal open={open} onClose={onClose} title={editTx?"Edit Transaction":"New Transaction"}>
      {!editTx&&<div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
        {presets.map(p=><Btn key={p.label} v="secondary" s="sm" onClick={()=>{const d=accounts.find(a=>a.account_type===p.dt);const c=accounts.find(a=>a.account_type===p.ct);setForm({...form,debit_account_id:d?.account_id||"",credit_account_id:c?.account_id||""})}}>{p.label}</Btn>)}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <Inp label="Date *" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
        <Inp label="Amount (₹) *" type="number" placeholder="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
      </div>
      <Sel label="From (Credit — source) *" value={form.credit_account_id} onChange={e=>setForm({...form,credit_account_id:e.target.value})} options={accOpts}/>
      <Sel label="To (Debit — destination) *" value={form.debit_account_id} onChange={e=>setForm({...form,debit_account_id:e.target.value})} options={accOpts}/>
      <Inp label="Description" placeholder="What was this for?" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <Sel label="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} options={categories}/>
        <Sel label="Tax Section" value={form.tax_category} onChange={e=>setForm({...form,tax_category:e.target.value})} options={taxCats.map(t=>({value:t,label:t||"None"}))}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <Btn v="secondary" onClick={onClose} style={{flex:1}}>Cancel</Btn>
        <Btn onClick={save} loading={saving} style={{flex:2}}>{editTx?"Update":"Add Transaction"}</Btn>
      </div>
    </Modal>
  );
}

// ============================================================
// CSV IMPORT MODAL
// ============================================================
function ImportModal({open,onClose,onSuccess,toast,accounts}) {
  const [step,setStep]=useState(1); // 1=Upload, 2=Review, 3=Done
  const [file,setFile]=useState(null);
  const [password,setPassword]=useState("");
  const [sourceAccount,setSourceAccount]=useState("");
  const [loading,setLoading]=useState(false);
  const [batchId,setBatchId]=useState(null);
  const [staged,setStaged]=useState([]);
  const [result,setResult]=useState(null);
  const [selected,setSelected]=useState(new Set());
  const [editingId,setEditingId]=useState(null);
  const [bulkCat,setBulkCat]=useState("");
  const [showBulkPanel,setShowBulkPanel]=useState(false);
  const [parseInfo,setParseInfo]=useState(null);
  const fileRef=useRef(null);

  // Reset on open
  useEffect(()=>{if(open){setStep(1);setFile(null);setPassword("");setSourceAccount("");setBatchId(null);setStaged([]);setResult(null);setSelected(new Set());setEditingId(null);setParseInfo(null)}},[open]);

  const accOpts=useMemo(()=>{
    const grouped={};
    (accounts||[]).forEach(a=>{if(!grouped[a.account_type])grouped[a.account_type]=[];grouped[a.account_type].push(a)});
    return [{value:"",label:"Select source account"},...Object.entries(grouped).flatMap(([type,accs])=>[{value:`__${type}`,label:`── ${type} ──`,disabled:true},...accs.sort((a,b)=>a.account_name.localeCompare(b.account_name)).map(a=>({value:a.account_id,label:`  ${a.account_name}`}))])];
  },[accounts]);

  const categories=["Uncategorized","Food","Grocery","Shopping","Travel","Fuel","Subscription","Utilities","Telecom","Insurance","Medical","Housing","EMI Payment","Salary","Interest","Dividend","Transfer","Tax","Education","Entertainment","Donation","Maintenance","Bank Charges","Miscellaneous"];

  // Step 1: Upload & Parse
  const handleUpload=async()=>{
    if(!file){toast("Select a file","error");return}
    if(!sourceAccount){toast("Select the source bank/CC account","error");return}
    setLoading(true);
    try{
      const fd=new FormData();
      fd.append("file",file);
      if(password) fd.append("password",password);
      fd.append("source_account_id",sourceAccount);
      const data=await api.importUpload(fd);
      setBatchId(data.batch_id);
      setParseInfo(data);
      // Fetch staged transactions
      const rows=await api.getStaged(data.batch_id);
      setStaged(rows);
      setStep(2);
      toast(`Parsed ${data.total_parsed} transactions!`,"success");
    }catch(e){toast(e.message,"error")}
    setLoading(false);
  };

  // Step 2: Review helpers
  const updateRow=async(id,updates)=>{
    try{
      await api.updateStaged(id,updates);
      setStaged(prev=>prev.map(r=>r.id===id?{...r,...updates}:r));
    }catch(e){toast(e.message,"error")}
  };
  const rejectRow=(id)=>updateRow(id,{status:'rejected'});
  const rejectSelected=async()=>{
    if(selected.size===0)return;
    try{await api.updateStagedBulk([...selected],{status:'rejected'});setStaged(prev=>prev.map(r=>selected.has(r.id)?{...r,status:'rejected'}:r));setSelected(new Set());toast(`Rejected ${selected.size}`,"info")}catch(e){toast(e.message,"error")}
  };
  const bulkCategoryApply=async()=>{
    if(!bulkCat||selected.size===0)return;
    try{await api.updateStagedBulk([...selected],{suggested_category:bulkCat});setStaged(prev=>prev.map(r=>selected.has(r.id)?{...r,suggested_category:bulkCat}:r));setSelected(new Set());setBulkCat("");setShowBulkPanel(false);toast(`Updated ${selected.size}`,"success")}catch(e){toast(e.message,"error")}
  };
  const toggleSel=(id)=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const selectAllActive=()=>{const active=staged.filter(r=>r.status!=='rejected');if(selected.size===active.length)setSelected(new Set());else setSelected(new Set(active.map(r=>r.id)))};

  // Step 3: Confirm import
  const handleConfirm=async()=>{
    setLoading(true);
    try{
      const data=await api.confirmImport(batchId);
      setResult(data);
      setStep(3);
      toast(`Imported ${data.imported} transactions!`,"success");
    }catch(e){toast(e.message,"error")}
    setLoading(false);
  };

  const activeCount=staged.filter(r=>r.status!=='rejected').length;
  const withAccounts=staged.filter(r=>r.status!=='rejected'&&r.suggested_debit_account_id&&r.suggested_credit_account_id).length;
  const highConf=staged.filter(r=>r.status!=='rejected'&&r.confidence>=0.5).length;
  const isPdf=file?.name?.toLowerCase().endsWith('.pdf');

  return (
    <Modal open={open} onClose={()=>{if(batchId&&step===2){api.clearStaged(batchId).catch(()=>{})}onClose()}} title={step===1?"Import Statement":step===2?"Review Transactions":"Import Complete"} width={step===2?720:520}>

      {/* STEP 1: Upload */}
      {step===1&&(<div>
        <div style={{fontSize:12,color:T.textSec,marginBottom:16,lineHeight:1.7}}>
          Upload a <strong>bank statement</strong> or <strong>credit card statement</strong> (PDF, CSV, or Excel). Transactions will be extracted, auto-classified, and shown for your review before importing.
        </div>

        <Sel label="Source Account (which bank/card is this from?) *" value={sourceAccount} onChange={e=>setSourceAccount(e.target.value)} options={accOpts}/>

        <div style={{border:`2px dashed ${file?T.success:T.border}`,borderRadius:T.r,padding:28,textAlign:"center",marginBottom:14,background:file?T.successBg:T.accentLight,cursor:"pointer",transition:"all .2s"}} onClick={()=>fileRef.current?.click()}>
          <div style={{marginBottom:8,color:file?T.success:T.textSec,fontSize:28}}>{file?"✓":I.upload}</div>
          <div style={{fontSize:13,fontWeight:500,color:file?T.success:T.textSec}}>{file?file.name:"Click to select file"}</div>
          <div style={{fontSize:11,color:T.textTer,marginTop:4}}>PDF, CSV, Excel — up to 20MB</div>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.xls,.xlsx" onChange={e=>setFile(e.target.files[0])} style={{display:"none"}}/>
        </div>

        {(isPdf||password)&&(
          <div style={{marginBottom:14}}>
            <Inp label="PDF Password *" type="password" placeholder="Enter your statement password" value={password} onChange={e=>setPassword(e.target.value)}/>
            <div style={{fontSize:10,color:T.textTer,marginTop:2,lineHeight:1.5}}>
              💡 Common bank PDF passwords: <strong>Date of birth</strong> (DDMMYYYY), <strong>Account number</strong>, <strong>PAN card</strong>, or <strong>last 4 digits of account + DOB</strong>. Check your bank's email for the password hint.
            </div>
          </div>
        )}

        <div style={{background:T.infoBg,borderRadius:T.rs,padding:12,marginBottom:14,fontSize:11,color:T.info,lineHeight:1.6}}>
          <strong>Supported formats:</strong> HDFC, SBI, ICICI bank statements & credit card statements. CSV/Excel from any bank with Date + Amount columns. Password-protected PDFs supported.
        </div>

        <div style={{display:"flex",gap:8}}>
          <Btn v="secondary" onClick={onClose} style={{flex:1}}>Cancel</Btn>
          <Btn onClick={handleUpload} loading={loading} disabled={!file||!sourceAccount} style={{flex:2}}>Upload & Parse</Btn>
        </div>
      </div>)}

      {/* STEP 2: Review */}
      {step===2&&(<div>
        {/* Summary Bar */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
          {[{l:"Total",v:staged.length,c:T.text},{l:"Active",v:activeCount,c:T.success},{l:"Classified",v:highConf,c:T.info},{l:"Rejected",v:staged.length-activeCount,c:T.danger}].map(x=>(
            <div key={x.l} style={{textAlign:"center",padding:"6px 4px",background:T.accentLight,borderRadius:T.rs}}>
              <div style={{fontSize:9,color:T.textTer,textTransform:"uppercase",fontWeight:600}}>{x.l}</div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:T.mono,color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>

        {/* Bulk Actions */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <input type="checkbox" checked={selected.size===activeCount&&activeCount>0} onChange={selectAllActive} style={{accentColor:T.accent}}/>
          <span style={{fontSize:11,color:T.textSec}}>{selected.size>0?`${selected.size} selected`:"Select all"}</span>
          {selected.size>0&&(<>
            <Btn v="secondary" s="sm" onClick={()=>setShowBulkPanel(!showBulkPanel)}>{I.tag} Category</Btn>
            <Btn v="danger" s="sm" onClick={rejectSelected}>{I.trash} Reject</Btn>
          </>)}
        </div>

        {showBulkPanel&&selected.size>0&&(
          <div style={{display:"flex",gap:6,marginBottom:10,padding:"8px 10px",background:T.infoBg,borderRadius:T.rs,alignItems:"center"}}>
            <select value={bulkCat} onChange={e=>setBulkCat(e.target.value)} style={{flex:1,padding:"6px 8px",borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,fontFamily:T.font}}>
              <option value="">Select category</option>
              {categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <Btn s="sm" onClick={bulkCategoryApply} disabled={!bulkCat}>Apply to {selected.size}</Btn>
          </div>
        )}

        {/* Transaction List */}
        <div style={{maxHeight:"50vh",overflowY:"auto",marginBottom:14,border:`1px solid ${T.border}`,borderRadius:T.rs}}>
          {staged.map((tx,idx)=>{
            const isRejected=tx.status==='rejected';
            const isSel=selected.has(tx.id);
            const isEditing=editingId===tx.id;
            const confColor=tx.confidence>=0.7?T.success:tx.confidence>=0.4?T.warn:T.danger;
            const hasAccounts=tx.suggested_debit_account_id&&tx.suggested_credit_account_id;

            return (
              <div key={tx.id} style={{padding:"8px 10px",borderBottom:`1px solid ${T.accentLight}`,opacity:isRejected?0.35:1,background:isSel?T.infoBg:isRejected?"#fafafa":"#fff",transition:"all .15s"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  {!isRejected&&<input type="checkbox" checked={isSel} onChange={()=>toggleSel(tx.id)} style={{marginTop:3,accentColor:T.accent}}/>}
                  {isRejected&&<span style={{fontSize:10,color:T.danger,marginTop:3}}>✕</span>}

                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                          <span style={{fontSize:11,color:T.textTer,fontFamily:T.mono,flexShrink:0}}>{tx.date?.split("T")[0]}</span>
                          <span style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description||"—"}</span>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                          {!isEditing?(
                            <Pill color={confColor} bg={`${confColor}12`}>{tx.suggested_category||"Uncategorized"}</Pill>
                          ):(
                            <select value={tx.suggested_category||""} onChange={e=>updateRow(tx.id,{suggested_category:e.target.value})} style={{padding:"2px 6px",borderRadius:4,border:`1px solid ${T.border}`,fontSize:10,fontFamily:T.font}}>
                              {categories.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          <span style={{fontSize:9,color:confColor,fontWeight:600}}>{Math.round((tx.confidence||0)*100)}%</span>
                          {!hasAccounts&&!isRejected&&<span style={{fontSize:9,color:T.warn,fontWeight:500}}>⚠ needs accounts</span>}
                          <Pill color={tx.transaction_type==='credit'?T.success:T.danger}>{tx.transaction_type==='credit'?'IN':'OUT'}</Pill>
                        </div>

                        {isEditing&&!isRejected&&(
                          <div style={{marginTop:6,display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                            <select value={tx.suggested_debit_account_id||""} onChange={e=>updateRow(tx.id,{suggested_debit_account_id:parseInt(e.target.value)||null})} style={{padding:"4px 6px",borderRadius:4,border:`1px solid ${T.border}`,fontSize:10,fontFamily:T.font}}>
                              <option value="">To (debit)...</option>
                              {(accounts||[]).map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} ({a.account_type})</option>)}
                            </select>
                            <select value={tx.suggested_credit_account_id||""} onChange={e=>updateRow(tx.id,{suggested_credit_account_id:parseInt(e.target.value)||null})} style={{padding:"4px 6px",borderRadius:4,border:`1px solid ${T.border}`,fontSize:10,fontFamily:T.font}}>
                              <option value="">From (credit)...</option>
                              {(accounts||[]).map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} ({a.account_type})</option>)}
                            </select>
                          </div>
                        )}
                      </div>

                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:700,fontFamily:T.mono,color:tx.transaction_type==='credit'?T.success:T.danger}}>
                          {tx.transaction_type==='credit'?"+":"−"}₹{fmt(tx.amount)}
                        </div>
                        {!isRejected&&(
                          <div style={{display:"flex",gap:2,marginTop:3,justifyContent:"flex-end"}}>
                            <button onClick={()=>setEditingId(isEditing?null:tx.id)} style={{background:isEditing?T.accent:T.accentLight,border:"none",borderRadius:4,padding:3,cursor:"pointer",display:"flex",color:isEditing?"#fff":T.textSec}} title="Edit">{I.edit}</button>
                            <button onClick={()=>rejectRow(tx.id)} style={{background:T.dangerBg,border:"none",borderRadius:4,padding:3,cursor:"pointer",display:"flex",color:T.danger}} title="Reject">{I.trash}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {staged.length===0&&<div style={{padding:24,textAlign:"center",color:T.textSec,fontSize:12}}>No transactions found</div>}
        </div>

        {/* Confirm Bar */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Btn v="danger" s="sm" onClick={()=>{api.clearStaged(batchId).catch(()=>{});onClose()}}>Cancel</Btn>
          <div style={{flex:1,textAlign:"center",fontSize:11,color:T.textSec}}>
            <strong>{withAccounts}</strong> of {activeCount} ready to import
          </div>
          <Btn onClick={handleConfirm} loading={loading} disabled={withAccounts===0}>Confirm Import ({withAccounts})</Btn>
        </div>
      </div>)}

      {/* STEP 3: Done */}
      {step===3&&result&&(<div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🎉</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Import Complete!</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800,fontFamily:T.mono,color:T.success}}>{result.imported}</div>
            <div style={{fontSize:11,color:T.textSec}}>Imported</div>
          </Card>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800,fontFamily:T.mono,color:T.warn}}>{result.skipped}</div>
            <div style={{fontSize:11,color:T.textSec}}>Skipped</div>
          </Card>
        </div>
        {result.errors?.length>0&&(
          <div style={{fontSize:11,color:T.danger,marginBottom:12,textAlign:"left",padding:"8px 12px",background:T.dangerBg,borderRadius:T.rs}}>
            {result.errors.map((e,i)=><div key={i}>{e}</div>)}
          </div>
        )}
        <div style={{fontSize:12,color:T.textSec,marginBottom:16}}>
          The system has learned your category preferences for future imports.
        </div>
        <Btn onClick={()=>{onSuccess()}} style={{width:"100%"}} s="lg">Done</Btn>
      </div>)}
    </Modal>
  );
}

// ============================================================
// ACCOUNTS TAB — Clickable accounts → drill into transactions
// ============================================================
function AccountsTab({accounts,refreshAccounts,toast,onViewAccount}) {
  const [showModal,setShowModal]=useState(false);
  const [editAcc,setEditAcc]=useState(null);
  const [filter,setFilter]=useState("All");
  const [collapsed,setCollapsed]=useState({});

  const toggle=(key)=>setCollapsed(p=>({...p,[key]:!p[key]}));
  const types=["All","Asset","Liability","Income","Expense"];
  const filtered=filter==="All"?accounts:accounts.filter(a=>a.account_type===filter);

  const hierarchy=useMemo(()=>{
    const tree={};
    filtered.forEach(a=>{
      const path=a.description||"";
      const parts=path.split(":");
      const type=a.account_type;
      if(!tree[type])tree[type]={total:0,groups:{}};
      const group=parts.length>=2?parts[1].trim():(a.sub_type||"Other");
      if(!tree[type].groups[group])tree[type].groups[group]={total:0,accounts:[]};
      const bal=parseFloat(a.calculated_balance||a.current_balance||0);
      tree[type].total+=bal;
      tree[type].groups[group].total+=bal;
      tree[type].groups[group].accounts.push({...a,balance:bal});
    });
    Object.values(tree).forEach(t=>Object.values(t.groups).forEach(g=>g.accounts.sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance))));
    return tree;
  },[filtered]);

  const netWorth=(hierarchy.Asset?.total||0)-Math.abs(hierarchy.Liability?.total||0);
  const fmtBal=(bal,type)=>{if(type==="Liability"||type==="Income")return fmtFull(Math.abs(bal));return fmtFull(bal)};

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <h2 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Accounts</h2>
          <span style={{fontSize:12,color:T.textSec}}>{accounts.length} accounts</span>
        </div>
        <Btn s="sm" onClick={()=>{setEditAcc(null);setShowModal(true)}}>{I.plus} Add</Btn>
      </div>

      {/* Net Worth */}
      <Card style={{marginBottom:16,background:"linear-gradient(135deg, #1c1917 0%, #44403c 100%)",color:"#fff",border:"none",padding:"20px 24px"}}>
        <div style={{fontSize:10,opacity:0.5,fontWeight:600,letterSpacing:"0.08em"}}>NET WORTH</div>
        <div style={{fontSize:30,fontWeight:800,fontFamily:T.mono,letterSpacing:"-0.03em",marginTop:2}}>{fmtFull(netWorth)}</div>
        <div style={{display:"flex",gap:16,marginTop:10,fontSize:11,opacity:0.8}}>
          <span>Assets: <strong style={{fontFamily:T.mono,color:"#34d399"}}>{fmtFull(hierarchy.Asset?.total||0)}</strong></span>
          <span>Liabilities: <strong style={{fontFamily:T.mono,color:"#fca5a5"}}>{fmtFull(Math.abs(hierarchy.Liability?.total||0))}</strong></span>
        </div>
      </Card>

      {/* Type Filter */}
      <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto"}}>
        {types.map(t=>(
          <button key={t} onClick={()=>setFilter(t)} style={{padding:"6px 14px",borderRadius:T.rFull,border:"none",fontSize:11,fontWeight:filter===t?600:500,cursor:"pointer",fontFamily:T.font,whiteSpace:"nowrap",background:filter===t?T.accent:T.accentLight,color:filter===t?"#fff":T.textSec,transition:"all .15s"}}>
            {t}{t!=="All"&&` (${accounts.filter(a=>a.account_type===t).length})`}
          </button>
        ))}
      </div>

      {/* Account Tree */}
      {Object.entries(hierarchy).map(([type,{total,groups}])=>(
        <div key={type} style={{marginBottom:18}}>
          <div onClick={()=>toggle(type)} style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,cursor:"pointer",padding:"8px 10px",background:`${typeColors[type]}08`,borderRadius:T.rs,border:`1px solid ${typeColors[type]}18`}}>
            <span style={{transform:collapsed[type]?"rotate(-90deg)":"rotate(0)",transition:"transform .2s",display:"flex",color:typeColors[type]}}>{I.chev}</span>
            <span style={{fontSize:15,color:typeColors[type],fontWeight:700}}>{typeIcons[type]}</span>
            <span style={{fontSize:14,fontWeight:700,color:T.text,flex:1}}>{type}</span>
            <span style={{fontSize:14,fontFamily:T.mono,color:typeColors[type],fontWeight:700}}>{fmtBal(total,type)}</span>
          </div>

          {!collapsed[type]&&Object.entries(groups).sort((a,b)=>Math.abs(b[1].total)-Math.abs(a[1].total)).map(([group,{total:gTotal,accounts:accs}])=>(
            <div key={group} style={{marginBottom:6,marginLeft:12}}>
              <div onClick={()=>toggle(`${type}-${group}`)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 10px",borderRadius:7,background:collapsed[`${type}-${group}`]?"transparent":T.accentLight}}>
                <span style={{transform:collapsed[`${type}-${group}`]?"rotate(-90deg)":"rotate(0)",transition:"transform .2s",display:"flex",color:T.textSec}}>{I.chevR}</span>
                <span style={{color:T.textSec,display:"flex"}}>{I.folder}</span>
                <span style={{fontSize:12,fontWeight:600,color:T.textSec,flex:1}}>{group}</span>
                <span style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.text}}>{fmtBal(gTotal,type)}</span>
                <Pill>{accs.length}</Pill>
              </div>

              {!collapsed[`${type}-${group}`]&&accs.map(a=>(
                <div key={a.account_id} onClick={()=>onViewAccount(a.account_id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px 7px 42px",borderLeft:`2px solid ${T.accentMid}`,marginLeft:12,cursor:"pointer",borderRadius:"0 6px 6px 0",transition:"background .1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.accentLight}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.account_name}</span>
                    <span style={{color:T.textTer,display:"flex",flexShrink:0,opacity:0.5}}>{I.eye}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,fontWeight:700,fontFamily:T.mono,color:a.balance<0&&type!=="Liability"&&type!=="Income"?T.danger:T.text}}>{fmtBal(a.balance,type)}</span>
                    <button onClick={e=>{e.stopPropagation();setEditAcc(a);setShowModal(true)}} style={{background:"none",border:"none",cursor:"pointer",padding:2,color:T.textTer,display:"flex",opacity:0.4}} title="Edit">{I.edit}</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {filtered.length===0&&<Empty icon="🏦" title="No accounts" sub="Add an account to get started"/>}

      <AccountModal open={showModal} onClose={()=>{setShowModal(false);setEditAcc(null)}} editAcc={editAcc} onSave={()=>{setShowModal(false);setEditAcc(null);refreshAccounts()}} toast={toast}/>
    </div>
  );
}

// ============================================================
// ACCOUNT MODAL
// ============================================================
function AccountModal({open,onClose,editAcc,onSave,toast}) {
  const [form,setForm]=useState({account_name:"",account_type:"Asset",sub_type:"",description:"",opening_balance:0});
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(editAcc) setForm({account_name:editAcc.account_name,account_type:editAcc.account_type,sub_type:editAcc.sub_type||"",description:editAcc.description||"",opening_balance:0});
    else setForm({account_name:"",account_type:"Asset",sub_type:"",description:"",opening_balance:0});
  },[editAcc,open]);
  const subTypes={Asset:["Bank Account","Cash","Wallet","Fixed Deposit","Mutual Fund","Stocks","Gold","Crypto","Retirement","Property","Vehicle","Loan Given","Other"],Liability:["Home Loan","Loan","Credit Card","Tax","Other"],Income:["Employment","Interest","Dividend","Capital Gains","Passive","Other"],Expense:["Food","Housing","Utilities","Transport","Health","Shopping","Entertainment","Travel","Education","Subscription","Insurance","Maintenance","Donation","Tax","Other"],Equity:["Capital","Other"]};
  const save=async()=>{
    if(!form.account_name){toast("Name required","error");return}setSaving(true);
    try{if(editAcc){await api.updateAccount(editAcc.account_id,form);toast("Updated","success")}else{await api.createAccount(form);toast("Created","success")}onSave()}catch(e){toast(e.message,"error")}setSaving(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={editAcc?"Edit Account":"New Account"}>
      <Inp label="Account Name *" placeholder="e.g. SBI Savings" value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})}/>
      {!editAcc&&<Sel label="Type *" value={form.account_type} onChange={e=>setForm({...form,account_type:e.target.value,sub_type:""})} options={["Asset","Liability","Income","Expense","Equity"]}/>}
      <Sel label="Sub Type" value={form.sub_type} onChange={e=>setForm({...form,sub_type:e.target.value})} options={["",...(subTypes[form.account_type]||[])].map(s=>({value:s,label:s||"Select"}))}/>
      <Inp label="Description" placeholder="Optional" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      {!editAcc&&<Inp label="Opening Balance" type="number" placeholder="0" value={form.opening_balance} onChange={e=>setForm({...form,opening_balance:parseFloat(e.target.value)||0})}/>}
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <Btn v="secondary" onClick={onClose} style={{flex:1}}>Cancel</Btn>
        <Btn onClick={save} loading={saving} style={{flex:2}}>{editAcc?"Update":"Create"}</Btn>
      </div>
    </Modal>
  );
}

// ============================================================
// REPORTS TAB
// ============================================================
function ReportsTab({toast}) {
  const [fire,setFire]=useState(null);
  const [tax,setTax]=useState(null);
  const [loading,setLoading]=useState(true);
  const [active,setActive]=useState("fire");
  const [fy,setFy]=useState(getCurrentFY());

  useEffect(()=>{(async()=>{setLoading(true);try{const[f,t]=await Promise.all([api.getFIRE("current_age=30&target_age=45").catch(()=>null),api.getTaxSummary(fy).catch(()=>null)]);setFire(f);setTax(t)}catch(e){toast(e.message,"error")}setLoading(false)})()},[toast,fy]);

  if(loading) return <div style={{textAlign:"center",padding:80}}><Spin s={28}/></div>;

  return (
    <div>
      <h2 style={{margin:"0 0 14px",fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Reports</h2>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{id:"fire",label:"🔥 FIRE"},{id:"tax",label:"📋 Tax Summary"}].map(r=>(
          <button key={r.id} onClick={()=>setActive(r.id)} style={{padding:"7px 16px",borderRadius:T.rFull,border:"none",fontSize:12,fontWeight:active===r.id?600:500,cursor:"pointer",fontFamily:T.font,background:active===r.id?T.accent:T.accentLight,color:active===r.id?"#fff":T.textSec,transition:"all .15s"}}>{r.label}</button>
        ))}
      </div>

      {active==="fire"&&fire&&(
        <div>
          <Card style={{marginBottom:14,padding:24,textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>FIRE Progress</div>
            <div style={{position:"relative",width:150,height:150,margin:"0 auto"}}>
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r="62" stroke={T.accentLight} strokeWidth="10" fill="none"/>
                <circle cx="75" cy="75" r="62" stroke={T.success} strokeWidth="10" fill="none" strokeDasharray={`${2*Math.PI*62}`} strokeDashoffset={`${2*Math.PI*62*(1-Math.min(fire.progress_percentage||0,100)/100)}`} strokeLinecap="round" transform="rotate(-90 75 75)" style={{transition:"stroke-dashoffset 1s"}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}>
                <div style={{fontSize:26,fontWeight:800,fontFamily:T.mono}}>{Math.min(fire.progress_percentage||0,100).toFixed(1)}%</div>
                <div style={{fontSize:10,color:T.textSec}}>of FIRE goal</div>
              </div>
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[{l:"FIRE Number",v:`₹${fmt(fire.fire_number)}`,c:T.warn},{l:"Net Worth",v:`₹${fmt(fire.current_net_worth)}`,c:T.success},{l:"Monthly Savings",v:`₹${fmt(fire.monthly_savings)}`,c:T.info},{l:"Savings Rate",v:`${fire.savings_rate||0}%`,c:(fire.savings_rate||0)>=50?T.success:T.warn},{l:"Years to FIRE",v:fire.years_to_fire||"∞",c:T.accent},{l:"FIRE Age",v:fire.fire_age||"—",c:T.accent}].map(s=>(
              <StatCard key={s.l} label={s.l} value={s.v} color={s.c}/>
            ))}
          </div>
        </div>
      )}
      {active==="fire"&&!fire&&<Empty icon="🔥" title="FIRE data unavailable" sub="Need income & expense data"/>}

      {active==="tax"&&(
        <div>
          <FYSelector fy={fy} setFy={y=>{setFy(y);setLoading(true);api.getTaxSummary(y).then(t=>{setTax(t);setLoading(false)}).catch(()=>setLoading(false))}}/>
          <Card style={{padding:18}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Tax Summary</div>
            <div style={{fontSize:11,color:T.textSec,marginBottom:16}}>{getFYLabel(fy)}</div>
            {tax?.tax_categories&&Object.keys(tax.tax_categories).length>0?
              Object.entries(tax.tax_categories).map(([section,info])=>(
                <div key={section} style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <Pill color={T.info}>Section {section}</Pill>
                    <span style={{fontSize:14,fontWeight:700,fontFamily:T.mono}}>{fmtFull(info.total)}</span>
                  </div>
                  {info.items?.map((item,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 12px",fontSize:12}}>
                      <span style={{color:T.textSec}}>{item.category}</span>
                      <span style={{fontFamily:T.mono,fontWeight:500}}>{fmtFull(item.total_amount)}</span>
                    </div>
                  ))}
                </div>
              ))
            :<Empty icon="📋" title="No tax data" sub="Tag transactions with tax sections to see summary"/>}
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({user,toast,onLogout}) {
  return (
    <div>
      <h2 style={{margin:"0 0 20px",fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>Settings</h2>

      {/* Profile */}
      <Card style={{marginBottom:14,padding:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Profile</div>
        <div style={{display:"grid",gap:10}}>
          {[{l:"Name",v:user?.name},{l:"Email",v:user?.email},{l:"Member Since",v:user?.created_at?fmtDate(user.created_at):"—"},{l:"Last Login",v:user?.last_login?fmtDate(user.last_login):"—"}].map(x=>(
            <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.accentLight}`}}>
              <span style={{fontSize:12,color:T.textSec,fontWeight:500}}>{x.l}</span>
              <span style={{fontSize:12,fontWeight:600}}>{x.v||"—"}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* App Info */}
      <Card style={{marginBottom:14,padding:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>About</div>
        <div style={{fontSize:12,color:T.textSec,lineHeight:1.7}}>
          <p style={{margin:"0 0 8px"}}><strong>EnoughFi</strong> — Your path to financial independence</p>
          <p style={{margin:"0 0 8px"}}>Built with React + Node.js + PostgreSQL.</p>
          <p style={{margin:0}}>Version 4.0 · Made with 🔥 for the FIRE community</p>
        </div>
      </Card>

      {/* Data Export */}
      <Card style={{marginBottom:14,padding:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Data</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn v="secondary" s="sm" onClick={async()=>{try{const d=await api.getTransactions("limit=99999");exportCSV((d.transactions||[]).map(t=>({Date:t.date?.split("T")[0],Amount:t.amount,Description:t.description,From:t.credit_account_name,To:t.debit_account_name,Category:t.category,Tax:t.tax_category||""})),"all-transactions.csv");toast("Exported!","success")}catch(e){toast(e.message,"error")}}}>{I.download} Export All Transactions</Btn>
          <Btn v="secondary" s="sm" onClick={async()=>{try{const a=await api.getAccounts();exportCSV(a.map(ac=>({Name:ac.account_name,Type:ac.account_type,SubType:ac.sub_type||"",Balance:ac.calculated_balance||ac.current_balance||0,Path:ac.description||""})),"accounts.csv");toast("Exported!","success")}catch(e){toast(e.message,"error")}}}>{I.download} Export Accounts</Btn>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card style={{padding:20,borderColor:`${T.danger}30`}}>
        <div style={{fontSize:14,fontWeight:700,color:T.danger,marginBottom:10}}>Session</div>
        <Btn v="danger" s="md" onClick={onLogout}>{I.logout} Sign Out</Btn>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user,setUser]=useState(null);
  const [accounts,setAccounts]=useState([]);
  const [tab,setTab]=useState("dashboard");
  const [toastMsg,setToastMsg]=useState(null);
  const [init,setInit]=useState(true);
  const [viewAccountId,setViewAccountId]=useState(null);
  const [page,setPage]=useState("landing"); // "landing", "auth", "app"
  const [authMode,setAuthMode]=useState("login"); // "login" or "register"

  const toast=useCallback((msg,type="info")=>setToastMsg({message:msg,type,key:Date.now()}),[]);
  const refreshAccounts=useCallback(async()=>{try{const a=await api.getAccounts();setAccounts(a)}catch{}},[]);

  useEffect(()=>{(async()=>{
    const token=localStorage.getItem("ft_token");
    if(token){api.token=token;try{const u=await api.me();setUser(u);setAccounts(await api.getAccounts());setPage("app")}catch{localStorage.removeItem("ft_token");api.token=null}}
    setInit(false);
  })()},[]);

  const handleLogin=async(u,token)=>{setUser(u);api.token=token;try{setAccounts(await api.getAccounts())}catch{};setPage("app")};
  const handleLogout=()=>{localStorage.removeItem("ft_token");api.token=null;setUser(null);setAccounts([]);setTab("dashboard");setPage("landing")};

  const handleDemoLogin=async()=>{
    try{
      const data=await api.demoLogin();
      api.token=data.token;localStorage.setItem("ft_token",data.token);
      setUser(data.user);
      try{setAccounts(await api.getAccounts())}catch{}
      setPage("app");
      toast("Welcome to the demo! Explore freely — data resets periodically.","success");
    }catch(e){toast(e.message,"error")}
  };

  const handleNavigate=(t)=>setTab(t);
  const handleViewAccount=(accountId)=>{setViewAccountId(accountId);setTab("transactions")};

  if(init) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.font}}><Spin s={28}/></div>;

  // Landing page (not logged in, no auth screen)
  if(page==="landing"&&!user) return <LandingPage onGetStarted={(mode)=>{setAuthMode(mode);setPage("auth")}} onDemo={handleDemoLogin}/>;

  // Auth screen
  if(page==="auth"&&!user) return <AuthScreen onLogin={handleLogin} initialMode={authMode} onBack={()=>setPage("landing")}/>;

  // Not logged in fallback
  if(!user) return <LandingPage onGetStarted={(mode)=>{setAuthMode(mode);setPage("auth")}} onDemo={handleDemoLogin}/>;

  // Clear viewAccountId when switching away from transactions
  const switchTab=(t)=>{if(t!=="transactions")setViewAccountId(null);setTab(t)};

  const isAdmin = user?.is_admin;
  const tabs=[
    {id:"dashboard",label:"Home",icon:I.home},
    {id:"transactions",label:"Txns",icon:I.tx},
    {id:"accounts",label:"Accounts",icon:I.acc},
    {id:"reports",label:"Reports",icon:I.rep},
    ...(isAdmin?[{id:"admin",label:"Admin",icon:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" strokeLinecap="round" strokeLinejoin="round"/></svg>}]:[]),
    {id:"settings",label:"Settings",icon:I.set},
  ];

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.font,color:T.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{margin:0;-webkit-font-smoothing:antialiased;background:${T.bg}}
        input:focus,select:focus{border-color:${T.accent}!important;box-shadow:0 0 0 3px ${T.accent}12}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes scaleIn{from{transform:scale(0.95);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes slideDown{from{transform:translateX(-50%) translateY(-16px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#d4d4d4;border-radius:3px}
        select option:disabled{color:#999;font-weight:600}
        input[type="checkbox"]{width:15px;height:15px;cursor:pointer}
      `}</style>

      {toastMsg&&<Toast {...toastMsg} onClose={()=>setToastMsg(null)}/>}

      {/* Top Bar */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(250,250,249,0.88)",backdropFilter:"blur(14px)",borderBottom:`1px solid ${T.border}`}}>
        <div style={{maxWidth:720,margin:"0 auto",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:18,fontWeight:900,letterSpacing:"-0.04em",cursor:"pointer"}} onClick={()=>switchTab("dashboard")}>
            <span>Enough</span><span style={{color:T.success}}>Fi</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {user?.is_demo&&<Pill color={T.warn}>Demo</Pill>}
            <span style={{fontSize:12,color:T.textTer,fontWeight:500}}>{user.name?.split(" ")[0]}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"18px 20px 110px"}}>
        {tab==="dashboard"&&<DashboardTab user={user} accounts={accounts} toast={toast} onNavigate={handleNavigate}/>}
        {tab==="transactions"&&<TransactionsTab accounts={accounts} toast={toast} initialAccountId={viewAccountId}/>}
        {tab==="accounts"&&<AccountsTab accounts={accounts} refreshAccounts={refreshAccounts} toast={toast} onViewAccount={handleViewAccount}/>}
        {tab==="reports"&&<ReportsTab toast={toast}/>}
        {tab==="admin"&&isAdmin&&<AdminTab toast={toast}/>}
        {tab==="settings"&&<SettingsTab user={user} toast={toast} onLogout={handleLogout}/>}
      </div>

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
    </div>
  );
}
