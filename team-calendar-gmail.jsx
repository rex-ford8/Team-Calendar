import { useState, useEffect } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const DEFAULT_MEMBERS = [
  { id: 1, name: "Alex", email: "", color: "#E8704A", initials: "AX" },
  { id: 2, name: "Jordan", email: "", color: "#4A90D9", initials: "JD" },
  { id: 3, name: "Morgan", email: "", color: "#5BB87A", initials: "MG" },
  { id: 4, name: "Riley", email: "", color: "#B87AC8", initials: "RL" },
  { id: 5, name: "Sam", email: "", color: "#C8A83A", initials: "SM" },
];

const EVENT_TYPES = [
  { value: "meeting", label: "Meeting", icon: "◈" },
  { value: "reminder", label: "Reminder", icon: "◎" },
  { value: "deadline", label: "Deadline", icon: "▲" },
  { value: "review", label: "Review", icon: "◉" },
];

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { return new Date(y, m, 1).getDay(); }
function dateStr(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  return `${MONTHS[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
}

const SAMPLE_EVENTS = [
  { id: 1, title: "Sprint Planning", date: "2026-05-11", type: "meeting", members: [1,2,3], time: "10:00", notes: "Q2 sprint kickoff" },
  { id: 2, title: "Design Review", date: "2026-05-14", type: "review", members: [2,4], time: "14:00", notes: "" },
  { id: 3, title: "Project Deadline", date: "2026-05-20", type: "deadline", members: [1,2,3,4,5], time: "17:00", notes: "Final deliverables due" },
  { id: 4, title: "Weekly Sync", date: "2026-05-07", type: "meeting", members: [1,3,5], time: "09:00", notes: "" },
];

// ─── GMAIL VIA CLAUDE API ──────────────────────────────────────────────────
async function sendGmailNotification({ event, members, action, allEmails }) {
  const attendeeNames = members.filter(m => event.members.includes(m.id)).map(m => m.name).join(", ");
  const attendeeEmails = members.filter(m => event.members.includes(m.id) && m.email).map(m => m.email);
  const recipients = allEmails ? members.filter(m => m.email).map(m => m.email) : attendeeEmails;

  if (recipients.length === 0) return { success: false, error: "No email addresses configured for attendees." };

  const typeInfo = EVENT_TYPES.find(t => t.value === event.type);
  const actionVerb = action === "created" ? "added" : action === "updated" ? "updated" : "removed";
  const subject = `[TeamCal] ${typeInfo?.icon} ${event.title} — ${actionVerb} for ${fmtDate(event.date)}`;

  const htmlBody = `
<div style="font-family: 'Courier New', monospace; background: #0F0F0F; color: #E8E0D5; padding: 32px; border-radius: 12px; max-width: 520px; margin: 0 auto;">
  <div style="font-size: 11px; letter-spacing: 0.15em; color: #666; margin-bottom: 8px; text-transform: uppercase;">TeamCal Notification</div>
  <div style="font-size: 22px; font-weight: 800; color: #E8E0D5; margin-bottom: 4px;">${event.title}</div>
  <div style="font-size: 13px; color: #E8704A; margin-bottom: 24px;">${typeInfo?.icon} ${typeInfo?.label} · ${action.toUpperCase()}</div>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #222; color: #666; font-size: 11px; letter-spacing: 0.1em; width: 100px;">DATE</td><td style="padding: 8px 0; border-bottom: 1px solid #222; font-size: 13px;">${fmtDate(event.date)}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #222; color: #666; font-size: 11px; letter-spacing: 0.1em;">TIME</td><td style="padding: 8px 0; border-bottom: 1px solid #222; font-size: 13px;">${event.time}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #222; color: #666; font-size: 11px; letter-spacing: 0.1em;">ATTENDEES</td><td style="padding: 8px 0; border-bottom: 1px solid #222; font-size: 13px;">${attendeeNames || "All team"}</td></tr>
    ${event.notes ? `<tr><td style="padding: 8px 0; color: #666; font-size: 11px; letter-spacing: 0.1em;">NOTES</td><td style="padding: 8px 0; font-size: 13px;">${event.notes}</td></tr>` : ""}
  </table>
  <div style="margin-top: 24px; font-size: 11px; color: #444;">Sent via TeamCal · ${new Date().toLocaleString()}</div>
</div>`;

  const prompt = `You are a Gmail assistant. Use the Gmail MCP tool to create a draft email with these exact details:
- to: ${JSON.stringify(recipients)}
- subject: "${subject}"
- htmlBody: ${JSON.stringify(htmlBody)}

Call the Gmail create_draft tool now with those parameters. Return only "DRAFT_CREATED" if successful.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        mcp_servers: [{ type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail-mcp" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    const toolUsed = data.content?.some(b => b.type === "mcp_tool_use");
    if (toolUsed || text.includes("DRAFT_CREATED") || text.toLowerCase().includes("draft")) {
      return { success: true, recipients, text };
    }
    return { success: false, error: text || "No draft created" };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function TeamCalendar() {
  const [members, setMembers] = useState(DEFAULT_MEMBERS);
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [cur, setCur] = useState({ year: 2026, month: 4 });
  const [selectedDay, setSelectedDay] = useState(null);
  const [modal, setModal] = useState(null); // "event" | "settings" | null
  const [editEvt, setEditEvt] = useState(null);
  const [form, setForm] = useState({ title: "", type: "meeting", members: [1], time: "10:00", notes: "", date: "" });
  const [notifState, setNotifState] = useState(null); // {status, msg}
  const [notifyAll, setNotifyAll] = useState(false);
  const [sendNotif, setSendNotif] = useState(true);
  const today = new Date();

  const { year, month } = cur;
  const daysInM = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);

  const getEventsForDay = (d) => events.filter(e => e.date === dateStr(year, month, d));

  const openAdd = (day) => {
    const ds = dateStr(year, month, day);
    setEditEvt(null);
    setForm({ title: "", type: "meeting", members: [1], time: "10:00", notes: "", date: ds });
    setSendNotif(true);
    setModal("event");
  };

  const openEdit = (evt, e) => {
    e?.stopPropagation();
    setEditEvt(evt);
    setForm({ title: evt.title, type: evt.type, members: evt.members, time: evt.time, notes: evt.notes || "", date: evt.date });
    setSendNotif(true);
    setModal("event");
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    let saved;
    let action;
    if (editEvt) {
      saved = { ...editEvt, ...form };
      setEvents(ev => ev.map(e => e.id === editEvt.id ? saved : e));
      action = "updated";
    } else {
      saved = { id: Date.now(), ...form };
      setEvents(ev => [...ev, saved]);
      action = "created";
    }
    setModal(null);

    if (sendNotif) {
      setNotifState({ status: "sending", msg: "Sending Gmail drafts..." });
      const result = await sendGmailNotification({ event: saved, members, action, allEmails: notifyAll });
      if (result.success) {
        setNotifState({ status: "ok", msg: `✓ Gmail draft created for ${result.recipients.length} recipient${result.recipients.length !== 1 ? "s" : ""}` });
      } else {
        setNotifState({ status: "err", msg: `Gmail: ${result.error}` });
      }
      setTimeout(() => setNotifState(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (!editEvt) return;
    setEvents(ev => ev.filter(e => e.id !== editEvt.id));
    setModal(null);
    if (sendNotif) {
      setNotifState({ status: "sending", msg: "Sending cancellation drafts..." });
      const result = await sendGmailNotification({ event: editEvt, members, action: "cancelled", allEmails: notifyAll });
      if (result.success) {
        setNotifState({ status: "ok", msg: `✓ Cancellation draft created for ${result.recipients.length} recipient${result.recipients.length !== 1 ? "s" : ""}` });
      } else {
        setNotifState({ status: "err", msg: `Gmail: ${result.error}` });
      }
      setTimeout(() => setNotifState(null), 5000);
    }
  };

  const updateMember = (id, field, val) => {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, [field]: val } : m));
  };

  const toggleFormMember = (id) => {
    setForm(f => ({ ...f, members: f.members.includes(id) ? f.members.filter(x => x !== id) : [...f.members, id] }));
  };

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const monthEvents = events.filter(e => e.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`));

  return (
    <div style={{ minHeight: "100vh", background: "#F7F3EE", fontFamily: "'DM Mono', monospace", color: "#1A1A1A" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Fraunces:ital,wght@0,700;0,900;1,600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .day-cell { transition: background 0.12s; }
        .day-cell:hover { background: #EDE8E2 !important; cursor: pointer; }
        .pill:hover { opacity: 0.75; transform: translateX(1px); cursor: pointer; transition: all 0.1s; }
        .btn-ghost:hover { background: #EDE8E2 !important; }
        .btn-primary:hover { background: #1A1A1A !important; }
        .btn-danger:hover { background: #fee2e2 !important; color: #dc2626 !important; }
        input, select, textarea { font-family: 'DM Mono', monospace !important; }
        input:focus, select:focus, textarea:focus { outline: 2px solid #1A1A1A !important; outline-offset: -2px; }
        .modal-bg { animation: fadeIn 0.15s; }
        .modal-card { animation: slideUp 0.18s cubic-bezier(.16,1,.3,1); }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
        .notif-bar { animation: slideDown 0.2s cubic-bezier(.16,1,.3,1); }
        @keyframes slideDown { from{transform:translateY(-12px);opacity:0} to{transform:translateY(0);opacity:1} }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #ccc; }
      `}</style>

      {/* Notification bar */}
      {notifState && (
        <div className="notif-bar" style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          background: notifState.status === "ok" ? "#166534" : notifState.status === "err" ? "#7f1d1d" : "#1A1A1A",
          color: "#fff", padding: "10px 20px", fontSize: 12, letterSpacing: "0.05em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {notifState.status === "sending" && <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>}
          {notifState.msg}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 38, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px", color: "#1A1A1A" }}>
              team<span style={{ fontStyle: "italic", color: "#E8704A" }}>cal</span>
            </div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 5, letterSpacing: "0.18em" }}>SHARED TEAM SCHEDULE · GMAIL SYNC</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {members.map(m => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 20,
                border: `1.5px solid ${m.color}33`,
                background: m.color + "15",
                fontSize: 11, color: m.color,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 500 }}>{m.initials}</div>
                {m.name}
                {m.email && <span style={{ color: m.color + "99", fontSize: 9 }}>✓</span>}
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setModal("settings")} style={{
              border: "1.5px solid #E0DAD2", background: "transparent", color: "#999",
              padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11, letterSpacing: "0.05em",
            }}>⚙ Settings</button>
          </div>
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <button className="btn-ghost" onClick={() => setCur(c => c.month === 0 ? {year:c.year-1,month:11} : {year:c.year,month:c.month-1})} style={{ border: "1.5px solid #E0DAD2", background: "transparent", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 15 }}>‹</button>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, letterSpacing: "-1px" }}>
            {MONTHS[month]} <span style={{ color: "#E8704A", fontStyle: "italic" }}>{year}</span>
          </div>
          <button className="btn-ghost" onClick={() => setCur(c => c.month === 11 ? {year:c.year+1,month:0} : {year:c.year,month:c.month+1})} style={{ border: "1.5px solid #E0DAD2", background: "transparent", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 15 }}>›</button>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "#AAA", letterSpacing: "0.05em" }}>
            {monthEvents.length} event{monthEvents.length !== 1 ? "s" : ""} this month
          </div>
        </div>

        {/* Calendar */}
        <div style={{ background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1.5px solid #E0DAD2" }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 9, letterSpacing: "0.15em", color: "#BBB", fontWeight: 500, borderRight: "1px solid #F0EBE4" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} style={{ minHeight: 96, borderRight: "1px solid #F0EBE4", borderBottom: "1px solid #F0EBE4", background: "#FDFAF7" }} />
            ))}
            {Array.from({ length: daysInM }).map((_, i) => {
              const day = i + 1;
              const dayEvts = getEventsForDay(day);
              const sel = selectedDay === day;
              const tod = isToday(day);
              return (
                <div key={day} className="day-cell" onClick={() => setSelectedDay(sel ? null : day)} style={{
                  minHeight: 96, padding: "8px 6px",
                  borderRight: "1px solid #F0EBE4", borderBottom: "1px solid #F0EBE4",
                  background: sel ? "#F0EBE4" : "transparent",
                  position: "relative",
                }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: "50%",
                    background: tod ? "#1A1A1A" : "transparent",
                    color: tod ? "#fff" : sel ? "#1A1A1A" : "#666",
                    fontSize: 12, fontWeight: tod ? 500 : 400, marginBottom: 4,
                  }}>{day}</div>
                  {dayEvts.slice(0, 3).map(evt => {
                    const m0 = members.find(m => m.id === evt.members[0]);
                    const t = EVENT_TYPES.find(t => t.value === evt.type);
                    return (
                      <div key={evt.id} className="pill" onClick={e => openEdit(evt, e)} style={{
                        borderLeft: `2px solid ${m0?.color || "#E8704A"}`,
                        background: (m0?.color || "#E8704A") + "18",
                        padding: "2px 5px", borderRadius: "0 3px 3px 0",
                        fontSize: 10, color: m0?.color || "#E8704A",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        marginBottom: 2,
                      }}>{t?.icon} {evt.title}</div>
                    );
                  })}
                  {dayEvts.length > 3 && <div style={{ fontSize: 9, color: "#BBB", paddingLeft: 4 }}>+{dayEvts.length - 3}</div>}
                  <div onClick={e => { e.stopPropagation(); openAdd(day); }} style={{
                    position: "absolute", top: 5, right: 5, width: 18, height: 18,
                    borderRadius: "50%", background: "#F0EBE4", color: "#AAA",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, cursor: "pointer", opacity: 0, transition: "opacity 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0}
                  >+</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        {selectedDay && (
          <div style={{ marginTop: 14, background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 700 }}>{MONTHS[month]} {selectedDay}</div>
              <button className="btn-primary" onClick={() => openAdd(selectedDay)} style={{
                background: "#1A1A1A", border: "none", color: "#F7F3EE",
                padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontSize: 11, letterSpacing: "0.06em",
              }}>+ Add Event</button>
            </div>
            {getEventsForDay(selectedDay).length === 0 ? (
              <div style={{ color: "#CCC", fontSize: 12, padding: "4px 0" }}>No events · click + to add one.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {getEventsForDay(selectedDay).map(evt => {
                  const t = EVENT_TYPES.find(t => t.value === evt.type);
                  return (
                    <div key={evt.id} onClick={e => openEdit(evt, e)} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      background: "#FDFAF7", borderRadius: 8, border: "1px solid #F0EBE4", cursor: "pointer",
                    }}>
                      <div style={{ fontSize: 18 }}>{t?.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{evt.title}</div>
                        <div style={{ fontSize: 10, color: "#AAA", marginTop: 2 }}>{evt.time} · {t?.label}{evt.notes ? " · " + evt.notes : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 3 }}>
                        {evt.members.map(mid => {
                          const m = members.find(x => x.id === mid);
                          return <div key={mid} style={{ width: 22, height: 22, borderRadius: "50%", background: m?.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 600 }}>{m?.initials}</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EVENT MODAL */}
      {modal === "event" && (
        <div className="modal-bg" onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ background: "#F7F3EE", border: "1.5px solid #E0DAD2", borderRadius: 14, padding: 26, width: "100%", maxWidth: 420 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, marginBottom: 20, letterSpacing: "-0.5px" }}>
              {editEvt ? "Edit Event" : "New Event"}
              <span style={{ color: "#BBB", fontSize: 12, fontFamily: "'DM Mono', monospace", marginLeft: 8, fontWeight: 400 }}>{form.date}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <div style={{ fontSize: 10, color: "#AAA", marginBottom: 5, letterSpacing: "0.1em" }}>TITLE</div>
                <input value={form.title} onChange={e => setForm(f => ({...f,title:e.target.value}))} placeholder="Event title..." style={{ width: "100%", padding: "9px 11px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 13, color: "#1A1A1A" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#AAA", marginBottom: 5, letterSpacing: "0.1em" }}>TYPE</div>
                  <select value={form.type} onChange={e => setForm(f => ({...f,type:e.target.value}))} style={{ width: "100%", padding: "9px 11px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 13, color: "#1A1A1A" }}>
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#AAA", marginBottom: 5, letterSpacing: "0.1em" }}>TIME</div>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({...f,time:e.target.value}))} style={{ width: "100%", padding: "9px 11px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 13, color: "#1A1A1A" }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#AAA", marginBottom: 5, letterSpacing: "0.1em" }}>NOTES</div>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} placeholder="Optional notes..." rows={2} style={{ width: "100%", padding: "9px 11px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 12, color: "#1A1A1A", resize: "none" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#AAA", marginBottom: 8, letterSpacing: "0.1em" }}>ATTENDEES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {members.map(m => (
                    <div key={m.id} onClick={() => toggleFormMember(m.id)} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                      border: `1.5px solid ${form.members.includes(m.id) ? m.color : "#E0DAD2"}`,
                      background: form.members.includes(m.id) ? m.color + "18" : "#fff",
                      fontSize: 11, color: form.members.includes(m.id) ? m.color : "#AAA", transition: "all 0.12s",
                    }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: form.members.includes(m.id) ? m.color : "#E0DAD2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff" }}>{m.initials}</div>
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>
              {/* Gmail notify toggle */}
              <div style={{ background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.05em" }}>📧 Send Gmail notification</div>
                  <div onClick={() => setSendNotif(v => !v)} style={{
                    width: 36, height: 20, borderRadius: 10, background: sendNotif ? "#1A1A1A" : "#E0DAD2",
                    position: "relative", cursor: "pointer", transition: "background 0.15s",
                  }}>
                    <div style={{ position: "absolute", top: 2, left: sendNotif ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
                  </div>
                </div>
                {sendNotif && (
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, color: "#888" }}>
                      <input type="checkbox" checked={notifyAll} onChange={e => setNotifyAll(e.target.checked)} style={{ width: "auto" }} />
                      Notify entire team (not just attendees)
                    </label>
                    {members.filter(m => form.members.includes(m.id) && !m.email).length > 0 && (
                      <div style={{ fontSize: 10, color: "#E8704A", marginTop: 6 }}>
                        ⚠ Some attendees have no email set — go to Settings to add them.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn-primary" onClick={handleSave} style={{ flex: 1, background: "#1A1A1A", border: "none", color: "#F7F3EE", padding: "11px", borderRadius: 8, cursor: "pointer", fontSize: 12, letterSpacing: "0.06em" }}>
                {sendNotif ? "Save & Notify" : "Save Event"}
              </button>
              {editEvt && <button className="btn-danger" onClick={handleDelete} style={{ background: "#fff", border: "1.5px solid #FECACA", color: "#EF4444", padding: "11px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, transition: "all 0.12s" }}>Delete</button>}
              <button className="btn-ghost" onClick={() => setModal(null)} style={{ background: "#fff", border: "1.5px solid #E0DAD2", color: "#AAA", padding: "11px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {modal === "settings" && (
        <div className="modal-bg" onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ background: "#F7F3EE", border: "1.5px solid #E0DAD2", borderRadius: 14, padding: 26, width: "100%", maxWidth: 440 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.5px" }}>Team Settings</div>
            <div style={{ fontSize: 11, color: "#AAA", marginBottom: 20, letterSpacing: "0.05em" }}>Add Gmail addresses to enable notifications</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {members.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 600, flexShrink: 0 }}>{m.initials}</div>
                  <input value={m.name} onChange={e => updateMember(m.id, "name", e.target.value)} placeholder="Name" style={{ width: 90, padding: "7px 9px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 12, color: "#1A1A1A" }} />
                  <input value={m.email} onChange={e => updateMember(m.id, "email", e.target.value)} placeholder="email@gmail.com" style={{ flex: 1, padding: "7px 9px", background: "#fff", border: "1.5px solid #E0DAD2", borderRadius: 7, fontSize: 12, color: "#1A1A1A" }} />
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setModal(null)} style={{ marginTop: 20, width: "100%", background: "#1A1A1A", border: "none", color: "#F7F3EE", padding: "11px", borderRadius: 8, cursor: "pointer", fontSize: 12, letterSpacing: "0.06em" }}>Save Settings</button>
          </div>
        </div>
      )}
    </div>
  );
}
