"use client";

import { useState, useMemo } from "react";

type ServerlessProvider = { label: string; ratePerMin: number };

const PROVIDERS: ServerlessProvider[] = [
  { label: "CF Workers AI",   ratePerMin: 0.006  },
  { label: "Deepgram nova-3", ratePerMin: 0.0043 },
  { label: "AssemblyAI",      ratePerMin: 0.0065 },
];

const BASE_COST_PER_USER_HR = 0.033;
const CA_SALES_TAX          = 0.1025;
const SE_TAX_RATE           = 0.153;
const INFRA_OVERHEAD        = 20;

const PROFIT_MULTIPLES = [
  { label: "2× profit", m: 3  },
  { label: "3× profit", m: 4  },
  { label: "5× profit", m: 6  },
  { label: "10× profit", m: 11 },
];

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + Math.abs(n).toFixed(2);
}
function fmtSign(n: number): string {
  return (n >= 0 ? "+" : "-") + fmtMoney(n);
}

function SliderRow({ label, id, min, max, step, value, display, onChange }: {
  label: string; id: string; min: number; max: number; step: number;
  value: number; display: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 200 }}>{label}</span>
      <input type="range" id={id} min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {display}
      </span>
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: "good" | "bad" | "warn";
}) {
  const colors = { good: "#1a6b3a", bad: "#b91c1c", warn: "#8a5c00" };
  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 8, padding: "12px 16px", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: highlight ? colors[highlight] : "inherit" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />;
}

export default function CostCalculator() {
  const [totalUsers,     setTotalUsers]     = useState(490);
  const [paidPct,        setPaidPct]        = useState(1);
  const [subPrice,       setSubPrice]       = useState(5);
  const [freeMinutes,    setFreeMinutes]    = useState(30);
  const [newUserPct,     setNewUserPct]     = useState(30);
  const [hrsPerUser,     setHrsPerUser]     = useState(80);
  const [speakers,       setSpeakers]       = useState(2);
  const [concurrent,     setConcurrent]     = useState(128);
  const [providerIdx,    setProviderIdx]    = useState(0);
  const [nodeCost,       setNodeCost]       = useState(70);
  const [workersPerNode, setWorkersPerNode] = useState(17);
  const [maxBurn,        setMaxBurn]        = useState(50);

  const provider = PROVIDERS[providerIdx];

  const calc = useMemo(() => {
    const paidUsers    = Math.round(totalUsers * paidPct / 100);
    const freeUsers    = totalUsers - paidUsers;
    const grossRevenue = paidUsers * subPrice;
    const salesTax     = grossRevenue * CA_SALES_TAX;
    const netRevenue   = grossRevenue - salesTax;

    const rateRatio     = provider.ratePerMin / 0.006;
    const costPerUserHr = BASE_COST_PER_USER_HR * speakers * rateRatio;
    const freeHrsCapped = freeMinutes / 60;

    const paidCost     = paidUsers * hrsPerUser * costPerUserHr;
    const newFreeUsers = Math.round(freeUsers * newUserPct / 100);
    const freeCost     = newFreeUsers * freeHrsCapped * costPerUserHr;
    const serverlessCost = paidCost + freeCost;

    const costPerUserMonth = hrsPerUser * costPerUserHr;
    const breakeven        = costPerUserMonth > 0 ? nodeCost / costPerUserMonth : 9999;

    const totalSpeakerHrs = (paidUsers * hrsPerUser + newFreeUsers * freeHrsCapped) * speakers;
    const avgConcurrent   = totalSpeakerHrs / 730;
    const neededWorkers   = totalUsers >= breakeven
      ? Math.max(avgConcurrent, Math.min(concurrent * speakers, avgConcurrent * 3))
      : avgConcurrent;
    const nodesNeeded = Math.max(1, Math.ceil(neededWorkers / workersPerNode));
    const nodesCost   = nodesNeeded * nodeCost;

    const totalInfra_serverless = serverlessCost + INFRA_OVERHEAD;
    const totalInfra_selfhosted = (totalUsers >= breakeven ? nodesCost : serverlessCost) + INFRA_OVERHEAD;
    const serverlessMinutes     = totalSpeakerHrs * 60 * 0.3;
    const totalInfra_hybrid     = (totalUsers >= breakeven ? nodesCost : 0)
                                + serverlessMinutes * provider.ratePerMin
                                + INFRA_OVERHEAD;

    const profit_serverless = netRevenue - totalInfra_serverless;
    const profit_selfhosted = netRevenue - totalInfra_selfhosted;
    const profit_hybrid     = netRevenue - totalInfra_hybrid;
    const afterTax = (p: number) => p > 0 ? p * (1 - SE_TAX_RATE) : p;

    const regime: "serverless" | "hybrid" | "selfhosted" =
      totalUsers < breakeven * 0.7 ? "serverless" :
      totalUsers > breakeven * 1.3 ? "selfhosted" : "hybrid";

    const freeCostPerUser    = freeHrsCapped * costPerUserHr;
    const freeOffset         = freeCostPerUser > 0 ? subPrice / freeCostPerUser : Infinity;
    const revenuePerPaidUser = paidUsers > 0 ? (netRevenue - freeCost - INFRA_OVERHEAD) / paidUsers : 0;
    const zeroCostHrsPerUser = costPerUserHr > 0 ? Math.max(0, revenuePerPaidUser / costPerUserHr) : Infinity;
    const overLimit          = hrsPerUser > zeroCostHrsPerUser;

    const bestProfit     = Math.max(profit_serverless, profit_selfhosted, profit_hybrid);
    const revenueContrib = Math.max(0, bestProfit);

    return {
      paidUsers, freeUsers, newFreeUsers, grossRevenue, netRevenue, salesTax,
      paidCost, freeCost, serverlessCost,
      nodesNeeded, breakeven, regime,
      pastBreakeven: totalUsers >= breakeven,
      freeCostPerUser, freeOffset, zeroCostHrsPerUser, overLimit,
      bestProfit, revenueContrib,
      rows: [
        {
          label:       `Pure serverless (${provider.label})`,
          infra:       totalInfra_serverless,
          profit:      profit_serverless,
          afterTax:    afterTax(profit_serverless),
          costPerUser: paidUsers > 0 ? totalInfra_serverless / paidUsers : 0,
        },
        {
          label:       totalUsers >= breakeven
            ? `Self-hosted (${nodesNeeded} node${nodesNeeded > 1 ? "s" : ""})`
            : `Self-hosted (not yet — need ~${Math.round(breakeven).toLocaleString()} users)`,
          infra:       totalInfra_selfhosted,
          profit:      profit_selfhosted,
          afterTax:    afterTax(profit_selfhosted),
          costPerUser: paidUsers > 0 ? totalInfra_selfhosted / paidUsers : 0,
        },
        {
          label:       "Hybrid (nodes + overflow)",
          infra:       totalInfra_hybrid,
          profit:      profit_hybrid,
          afterTax:    afterTax(profit_hybrid),
          costPerUser: paidUsers > 0 ? totalInfra_hybrid / paidUsers : 0,
        },
      ],
    };
  }, [totalUsers, paidPct, subPrice, freeMinutes, newUserPct, hrsPerUser, speakers,
      concurrent, providerIdx, nodeCost, workersPerNode, provider, maxBurn]);

  const allNegative = calc.rows.every(r => r.profit < 0);

  const verdictConfig = allNegative ? {
    bg: "#fef2f2", color: "#b91c1c",
    text: `All options are running negative — stay serverless and minimize burn. You need ~${Math.round(calc.breakeven).toLocaleString()} paid users at $${subPrice}/mo to break even on a node. Focus on conversion.`,
  } : ({
    serverless: { bg: "#e8f4ff", color: "#1a5fa8", text: `At ${totalUsers.toLocaleString()} users you need ~${Math.round(calc.breakeven).toLocaleString()} to justify a node. Stay serverless — zero ops, pure margin.` },
    hybrid:     { bg: "#fff8e8", color: "#8a5c00", text: `Near crossover (~${Math.round(calc.breakeven).toLocaleString()} users). One node for baseline, CF handles the rest.` },
    selfhosted: { bg: "#e8f7ee", color: "#1a6b3a", text: `Self-hosted saves ${fmtMoney(calc.serverlessCost - calc.rows[1].infra)}/mo vs pure serverless at your volume.` },
  } as const)[calc.regime];

  return (
    <div style={{ "--muted": "#888", "--border": "#e5e5e5", "--card-bg": "#f9f9f9", padding: "0 24px", maxWidth: 820 } as React.CSSProperties}>

      <SectionTitle>Your users</SectionTitle>
      <SliderRow label="Total users"        id="totalUsers" min={10}  max={10000} step={10} value={totalUsers} display={totalUsers.toLocaleString()} onChange={setTotalUsers} />
      <SliderRow label="Paid conversion %"  id="paidPct"    min={1}   max={30}    step={1}  value={paidPct}    display={`${paidPct}%`}               onChange={setPaidPct} />
      <SliderRow label="Subscription price" id="subPrice"   min={3}   max={20}    step={1}  value={subPrice}   display={`$${subPrice}/mo`}            onChange={setSubPrice} />

      <Divider />

      <SectionTitle>Free tier</SectionTitle>
      <SliderRow label="Trial length (one-time)" id="freeMinutes" min={0} max={60} step={5}
        value={freeMinutes} display={freeMinutes === 0 ? "none" : `${freeMinutes} min`} onChange={setFreeMinutes} />
      <SliderRow label="New users this month %" id="newUserPct" min={1} max={100} step={1}
        value={newUserPct} display={`${newUserPct}%`} onChange={setNewUserPct} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -4, marginBottom: 4 }}>
        {freeMinutes > 0
          ? `${calc.newFreeUsers.toLocaleString()} new free users burning trial this month — 1 paid user ($${subPrice}) offsets ~${Math.round(calc.freeOffset).toLocaleString()} trial burns`
          : "No free trial — zero trial cost"}
      </div>

      <Divider />

      <SectionTitle>Usage (worst case — paid users)</SectionTitle>
      <SliderRow label="Hrs transcribed / user / mo" id="hrsPerUser" min={1} max={120} step={1} value={hrsPerUser} display={`${hrsPerUser} hrs`} onChange={setHrsPerUser} />
      {calc.zeroCostHrsPerUser < Infinity && (
        <div style={{ fontSize: 12, marginTop: -4, marginBottom: 4, color: calc.overLimit ? "#b91c1c" : "#1a6b3a" }}>
          {calc.overLimit
            ? `⚠ Over limit — zero cost ceiling is ${calc.zeroCostHrsPerUser.toFixed(1)} hrs/user/mo at $${subPrice}/mo. Consider raising price or capping usage.`
            : `✓ Within zero cost ceiling of ${calc.zeroCostHrsPerUser.toFixed(1)} hrs/user/mo`}
        </div>
      )}
      <SliderRow label="Avg speakers per session" id="speakers"   min={1} max={10}  step={1} value={speakers}   display={String(speakers)}   onChange={setSpeakers} />
      <SliderRow label="Peak concurrent users"    id="concurrent" min={1} max={500} step={1} value={concurrent} display={String(concurrent)} onChange={setConcurrent} />

      <Divider />

      <SectionTitle>Infrastructure</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 200 }}>Serverless fallback</span>
        <select value={providerIdx} onChange={e => setProviderIdx(Number(e.target.value))}
          style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)" }}>
          {PROVIDERS.map((p, i) => <option key={i} value={i}>{p.label} — ${p.ratePerMin}/min</option>)}
        </select>
      </div>
      <SliderRow label="Node cost / mo"   id="nodeCost"       min={10} max={300} step={5} value={nodeCost}       display={`$${nodeCost}/mo`}     onChange={setNodeCost} />
      <SliderRow label="Workers per node" id="workersPerNode" min={2}  max={37}  step={1} value={workersPerNode} display={String(workersPerNode)} onChange={setWorkersPerNode} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -4 }}>
        +${INFRA_OVERHEAD}/mo fixed overhead (CF Workers Paid, D1/KV, misc)
      </div>

      <Divider />

      {/* ── Metrics row 1 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
        <MetricCard label="Gross revenue"     value={fmtMoney(calc.grossRevenue)}  sub={`${calc.paidUsers} × $${subPrice}`} />
        <MetricCard label="After CA tax"      value={fmtMoney(calc.netRevenue)}    sub={`−${fmtMoney(calc.salesTax)} sales tax`} highlight="warn" />
        <MetricCard label="Trial cost"        value={fmtMoney(calc.freeCost)}      sub={`${calc.newFreeUsers.toLocaleString()} new users × ${freeMinutes}min`} />
        <MetricCard label="Zero cost ceiling" value={calc.zeroCostHrsPerUser === Infinity ? "∞" : `${calc.zeroCostHrsPerUser.toFixed(1)} hrs`}
          sub={`max hrs/user at $${subPrice}/mo`} highlight={calc.overLimit ? "bad" : "good"} />
      </div>

      {/* ── Metrics row 2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <MetricCard label="Nodes needed" value={calc.pastBreakeven ? String(calc.nodesNeeded) : "—"}
          sub={calc.pastBreakeven ? `${calc.nodesNeeded} × $${nodeCost}/mo` : `need ~${Math.round(calc.breakeven).toLocaleString()} users`} />
        <MetricCard label="Breakeven" value={Math.round(calc.breakeven).toLocaleString()} sub="users to justify a node" />
      </div>

      {/* ── Verdict ── */}
      <div style={{ background: verdictConfig.bg, color: verdictConfig.color, borderRadius: 8, padding: "12px 16px", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
        {verdictConfig.text}
      </div>

      {/* ── Table ── */}
      <SectionTitle>What to charge per paid user to hit each profit multiple</SectionTitle>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        Formula: (total infra × multiplier) ÷ paid users. Amber = above current price. Red = well above. ✓ = current price already covers this margin.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Option", "Infra/mo", "Cost/user", ...PROFIT_MULTIPLES.map(p => p.label), "Current profit"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>{row.label}</td>
                <td style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(row.infra)}</td>
                <td style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{fmtMoney(row.costPerUser)}</td>
                {PROFIT_MULTIPLES.map(({ label, m }) => {
                  const price = calc.paidUsers > 0 ? (row.infra * m) / calc.paidUsers : 0;
                  const over  = price > subPrice;
                  const way   = price > subPrice * 1.5;
                  const color = over ? (way ? "#b91c1c" : "#8a5c00") : "#1a6b3a";
                  const delta = over ? `+$${(price - subPrice).toFixed(2)} needed` : "✓ covered";
                  return (
                    <td key={label} style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ fontWeight: 600, color }}>${price.toFixed(2)}</span>
                      <span style={{ display: "block", fontSize: 10, color, marginTop: 1 }}>{delta}</span>
                    </td>
                  );
                })}
                <td style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: row.profit >= 0 ? "#1a6b3a" : "#b91c1c" }}>
                  {fmtSign(row.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, lineHeight: 1.6 }}>
        Paid transcription: {fmtMoney(calc.paidCost)}/mo · New user trials: {fmtMoney(calc.freeCost)}/mo ({calc.newFreeUsers.toLocaleString()} of {calc.freeUsers.toLocaleString()} free users are new) · CA sales tax ({(CA_SALES_TAX * 100).toFixed(2)}%) on gross revenue · SE tax (~15.3%) on positive profit only · ${ INFRA_OVERHEAD}/mo overhead included in all options
      </div>

      <Divider />

      {/* ── Growth budget ── */}
      <SectionTitle>Growth budget</SectionTitle>
      <SliderRow label="Max monthly burn" id="maxBurn" min={0} max={500} step={10} value={maxBurn} display={`$${maxBurn}/mo`} onChange={setMaxBurn} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -4, marginBottom: 16 }}>
        Amount you're willing to go negative each month to fund growth
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <MetricCard label="Revenue to growth"    value={fmtMoney(Math.max(0, calc.revenueContrib))}              sub="profit funding new trials"    highlight={calc.revenueContrib > 0 ? "good" : undefined} />
        <MetricCard label="Total growth budget"  value={fmtMoney(Math.max(0, calc.revenueContrib) + maxBurn)}    sub={`$${maxBurn} burn + ${fmtMoney(Math.max(0, calc.revenueContrib))} profit`} />
        <MetricCard label="New trials this month" value={calc.freeCostPerUser > 0 ? Math.floor((Math.max(0, calc.revenueContrib) + maxBurn) / calc.freeCostPerUser).toLocaleString() : "∞"} sub="before waitlist kicks in" highlight="good" />
        <MetricCard label="Waitlist triggered at" value={calc.freeCostPerUser > 0 ? Math.floor((Math.max(0, calc.revenueContrib) + maxBurn) / calc.freeCostPerUser).toLocaleString() + " signups" : "never"} sub={`~${fmtMoney(calc.freeCostPerUser)} cost per trial`} highlight="warn" />
      </div>

      {maxBurn === 0 && calc.revenueContrib <= 0 && (
        <div style={{ fontSize: 13, color: "#8a5c00", background: "#fff8e8", borderRadius: 8, padding: "10px 14px", marginTop: 12 }}>
          No growth budget — waitlist everyone until revenue covers trial costs.
        </div>
      )}
      {(maxBurn > 0 || calc.revenueContrib > 0) && calc.freeCostPerUser > 0 && (() => {
        const budget = Math.max(0, calc.revenueContrib) + maxBurn;
        const slots  = Math.floor(budget / calc.freeCostPerUser);
        const within = calc.newFreeUsers <= slots;
        return (
          <div style={{ fontSize: 13, color: "#1a5fa8", background: "#e8f4ff", borderRadius: 8, padding: "10px 14px", marginTop: 12 }}>
            At {newUserPct}% monthly growth you're onboarding ~{calc.newFreeUsers.toLocaleString()} new free users/mo costing {fmtMoney(calc.freeCost)}.
            {" "}Your budget covers {slots.toLocaleString()} trials —
            {within ? " you're within budget, no waitlist needed." : ` waitlist triggers after ${slots.toLocaleString()} signups this month.`}
          </div>
        );
      })()}
    </div>
  );
}