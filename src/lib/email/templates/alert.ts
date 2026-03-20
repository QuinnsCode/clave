/**
 * src/lib/email/templates/alert.ts
 * Alert email template — plain, readable, fast to scan at 3am.
 */

export interface AlertEmailData {
    accountId:    string;
    tierName:     string;
    budgetPct:    number;       // e.g. 75
    currentSpend: number;       // USD
    projected:    number;       // USD month-end
    budget:       number;       // USD
    topService:   string;       // "Workers AI"
    appUrl:       string;
  }
  
  export function alertEmailHtml(d: AlertEmailData): string {
    const pctColor = d.budgetPct >= 100 ? "#ef4444" : d.budgetPct >= 75 ? "#f97316" : "#eab308";
    return `<!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#060a06;font-family:'Courier New',monospace;color:#e8f0e8;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <tr><td>
        <!-- Header -->
        <div style="border-bottom:1px solid #1a2e1a;padding-bottom:16px;margin-bottom:24px;">
          <span style="color:#f48c06;font-size:18px;font-weight:bold;letter-spacing:0.1em;">▲ FLAREUP</span>
          <span style="color:#3a4e3a;font-size:11px;margin-left:12px;letter-spacing:0.1em;">BILLING ALERT</span>
        </div>
  
        <!-- Alert badge -->
        <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.3);border-radius:4px;padding:16px 20px;margin-bottom:24px;">
          <div style="color:${pctColor};font-size:13px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px;">
            ● ${d.tierName}
          </div>
          <div style="color:#e8f0e8;font-size:32px;font-weight:bold;">
            ${d.budgetPct}% of budget
          </div>
          <div style="color:#8a9e8a;font-size:12px;margin-top:4px;">
            acct ${d.accountId.slice(0, 8)}…
          </div>
        </div>
  
        <!-- Numbers -->
        <table width="100%" style="border-collapse:collapse;margin-bottom:24px;">
          ${row("Current spend", `$${d.currentSpend.toFixed(2)}`)}
          ${row("Projected month-end", `$${d.projected.toFixed(2)}`, pctColor)}
          ${row("Monthly budget", `$${d.budget.toFixed(2)}`)}
          ${row("Top service", d.topService)}
        </table>
  
        <!-- CTA -->
        <div style="text-align:center;margin-bottom:32px;">
          <a href="https://${d.appUrl}/dashboard"
             style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#dc2626,#e85d04);color:#fff;text-decoration:none;border-radius:3px;font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;">
            Open Dashboard →
          </a>
        </div>
  
        <!-- Footer -->
        <div style="border-top:1px solid #1a2e1a;padding-top:16px;color:#3a4e3a;font-size:11px;line-height:1.7;letter-spacing:0.04em;">
          // your token is never stored · delete account = ciphertext gone<br>
          // to stop these alerts, <a href="https://${d.appUrl}/alerts" style="color:#f48c06;">manage alert settings</a>
        </div>
      </td></tr>
    </table>
  </body>
  </html>`;
  }
  
  function row(label: string, value: string, color = "#e8f0e8"): string {
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #1a2e1a;color:#8a9e8a;font-size:12px;">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #1a2e1a;color:${color};font-size:12px;text-align:right;font-weight:bold;">${value}</td>
    </tr>`;
  }
  
  export function alertEmailText(d: AlertEmailData): string {
    return `FLAREUP — BILLING ALERT
  ========================
  ${d.tierName}: ${d.budgetPct}% of budget
  
  Current spend:        $${d.currentSpend.toFixed(2)}
  Projected month-end:  $${d.projected.toFixed(2)}
  Monthly budget:       $${d.budget.toFixed(2)}
  Top service:          ${d.topService}
  
  Open dashboard: https://${d.appUrl}/dashboard
  Manage alerts:  https://${d.appUrl}/alerts
  `;
  }