const $ = (id) => document.getElementById(id);
const form = $("tradeForm");
const fmtR = (n) => `${Number(n || 0) > 0 ? "+" : ""}${Number(n || 0).toFixed(2)}R`;
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const average = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

$("todayLabel").textContent = new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date()).toUpperCase();
$("tradeDate").value = new Date().toISOString().slice(0,10);

document.querySelectorAll('.upload-card input[type="file"]').forEach(input => input.addEventListener("change", () => {
  const name = input.files?.[0]?.name || "Choose chart image";
  input.closest(".upload-card").querySelector(".file-name").textContent = name;
}));

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

async function loadDashboard() {
  const [metrics, allTrades] = await Promise.all([getJSON("/api/metrics"), getJSON("/api/trades")]);
  $("netR").textContent = fmtR(metrics.netR);
  $("netR").className = "metric-value " + (metrics.netR > 0 ? "positive" : metrics.netR < 0 ? "negative" : "");
  $("winRate").textContent = `${metrics.winRate.toFixed(1)}%`;
  $("winCount").textContent = `${metrics.wins} wins from ${metrics.totalTrades} trades`;
  $("expectancy").textContent = fmtR(metrics.expectancy);
  $("expectancy").className = "metric-value " + (metrics.expectancy > 0 ? "positive" : metrics.expectancy < 0 ? "negative" : "");
  $("profitFactor").textContent = metrics.profitFactor === null ? "∞" : Number(metrics.profitFactor).toFixed(2);
  $("totalTrades").textContent = metrics.totalTrades;
  $("w-l-b").textContent = `${metrics.wins} / ${metrics.losses} / ${metrics.breakeven}`;
  const confidence = allTrades.map(t=>Number(t.confidence)).filter(n=>n>0);
  const discipline = allTrades.map(t=>Number(t.discipline)).filter(n=>n>0);
  $("avgConfidence").textContent = average(confidence) === null ? "—" : `${average(confidence).toFixed(1)} / 5`;
  $("avgDiscipline").textContent = average(discipline) === null ? "—" : `${average(discipline).toFixed(1)} / 5`;
  $("drawdown").textContent = `Max drawdown: ${Number(metrics.maxDrawdownR).toFixed(2)}R`;
  $("chartEmpty").style.display = metrics.equity.length ? "none" : "grid";
  drawChart(metrics.equity);
  renderTrades(allTrades);
}

function drawChart(points) {
  const canvas = $("equityChart");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  ctx.scale(dpr,dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0,0,w,h);
  const pad = {l:30,r:10,t:18,b:24};
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const vals = points.map(p=>p.totalR);
  let min = Math.min(0,...vals), max = Math.max(0,...vals);
  if (min===max){min-=1;max+=1}
  const y = v => pad.t+(max-v)/(max-min)*plotH;
  const x = i => pad.l+(points.length<=1?plotW/2:i/(points.length-1)*plotW);
  ctx.strokeStyle="#2a374d";ctx.lineWidth=1;
  for(let i=0;i<5;i++){const val=min+(max-min)*i/4;const yy=y(val);ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle="#77869d";ctx.font="10px system-ui";ctx.fillText(val.toFixed(1)+"R",0,yy+3)}
  if(!points.length)return;
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p.totalR)):ctx.moveTo(x(i),y(p.totalR)));
  ctx.lineTo(x(points.length-1),y(0));ctx.lineTo(x(0),y(0));ctx.closePath();ctx.fillStyle="rgba(139,156,255,.10)";ctx.fill();
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p.totalR)):ctx.moveTo(x(i),y(p.totalR)));
  ctx.strokeStyle=points[points.length-1].totalR>=0?"#8b9cff":"#ff8292";ctx.lineWidth=2.5;ctx.lineJoin="round";ctx.stroke();
  points.forEach((p,i)=>{if(i===points.length-1){ctx.beginPath();ctx.arc(x(i),y(p.totalR),4,0,Math.PI*2);ctx.fillStyle="#dce2ff";ctx.fill()}});
}

function renderTrades(trades) {
  $("journalCount").textContent = `${trades.length} ${trades.length===1?"entry":"entries"}`;
  if (!trades.length) {
    $("tradeList").innerHTML = '<div class="empty-state"><span>▤</span><b>No trades match</b><p>Try clearing your filters or add a trade.</p></div>';
    return;
  }
  $("tradeList").innerHTML = trades.map(t => {
    const resultClass = t.result_r>0 ? "result-win" : t.result_r<0 ? "result-loss" : "result-be";
    const tags = [t.direction, t.session, t.setup, t.emotion_before ? `Before: ${t.emotion_before}` : "", t.emotion_after ? `After: ${t.emotion_after}` : ""].filter(Boolean);
    const shots = [
      t.screenshot1 ? `<a href="${safe(t.screenshot1)}" target="_blank" rel="noopener"><img src="${safe(t.screenshot1)}" alt="Before-entry chart screenshot"><span>Before entry ↗</span></a>` : "",
      t.screenshot2 ? `<a href="${safe(t.screenshot2)}" target="_blank" rel="noopener"><img src="${safe(t.screenshot2)}" alt="After-exit chart screenshot"><span>After exit ↗</span></a>` : ""
    ].filter(Boolean).join("");
    const details = [
      ["Entry", t.entry_price ?? "—"], ["Stop", t.stop_price ?? "—"], ["Exit", t.exit_price ?? "—"],
      ["Confidence", t.confidence ? `${t.confidence}/5` : "—"], ["Discipline", t.discipline ? `${t.discipline}/5` : "—"], ["Risk unit", t.risk_amount ? `${t.risk_amount}R` : "—"]
    ];
    return `<article class="trade-card">
      <div class="trade-card-top"><div><div class="trade-symbol">${safe(t.symbol)} <span style="color:#7f8da4;font-weight:500">· ${safe(t.direction)}</span></div><div class="trade-meta">${safe(t.trade_date)}${t.session ? " · "+safe(t.session)+" session" : ""}</div></div><div style="display:flex;align-items:center;gap:8px"><span class="result-pill ${resultClass}">${fmtR(t.result_r)}</span><button class="delete-button" data-delete="${t.id}" title="Delete this entry">Delete</button></div></div>
      <div class="trade-tags">${tags.map(tag=>`<span class="trade-tag">${safe(tag)}</span>`).join("")}</div>
      <div class="trade-detail">${details.map(([label,value])=>`<div class="detail-item">${label}<b>${safe(value)}</b></div>`).join("")}</div>
      ${t.notes ? `<p class="trade-notes">${safe(t.notes)}</p>` : ""}
      ${shots ? `<div class="screenshots">${shots}</div>` : ""}
    </article>`;
  }).join("");
  document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this trade and its uploaded screenshots?")) return;
    const res = await fetch(`/api/trades/${btn.dataset.delete}`, {method:"DELETE"});
    if (!res.ok) { alert("Could not delete this trade."); return; }
    await loadDashboard();
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("formMessage");
  const button = $("saveButton");
  message.textContent = "";
  message.className = "form-message";
  button.disabled = true; button.textContent = "Saving…";
  try {
    const data = new FormData(form);
    const res = await fetch("/api/trades", {method:"POST", body:data});
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Could not save entry.");
    message.textContent = "Trade saved. Your metrics have been updated.";
    message.className = "form-message success";
    form.reset();
    $("tradeDate").value = new Date().toISOString().slice(0,10);
    document.querySelectorAll(".file-name").forEach(el => el.textContent = "Choose chart image");
    await loadDashboard();
    document.querySelector("#journal").scrollIntoView({behavior:"smooth",block:"start"});
  } catch (err) {
    message.textContent = err.message;
    message.className = "form-message error";
  } finally {
    button.disabled = false; button.textContent = "Save trade entry ↗";
  }
});

$("applyFilters").addEventListener("click", async () => {
  const params = new URLSearchParams();
  const symbol = $("filterSymbol").value.trim().toUpperCase();
  if (symbol) params.set("symbol",symbol);
  if ($("filterFrom").value) params.set("from",$("filterFrom").value);
  if ($("filterTo").value) params.set("to",$("filterTo").value);
  const trades = await getJSON(`/api/trades?${params.toString()}`);
  renderTrades(trades);
});
$("clearFilters").addEventListener("click", async () => {
  $("filterSymbol").value = ""; $("filterFrom").value = ""; $("filterTo").value = "";
  const trades = await getJSON("/api/trades"); renderTrades(trades);
});
window.addEventListener("resize", () => loadDashboard().catch(console.error));
loadDashboard().catch(err => console.error("Could not load journal:",err));
