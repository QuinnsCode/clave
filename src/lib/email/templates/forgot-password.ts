/**
 * src/lib/email/templates/forgot-password.ts
 */

export interface ForgotPasswordEmailData {
    resetUrl:  string;
    appUrl:    string;
    expiresIn: string; // "1 hour"
  }
  
  export function forgotPasswordHtml(d: ForgotPasswordEmailData): string {
    return `<!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#060a06;font-family:'Courier New',monospace;color:#e8f0e8;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <tr><td>
        <div style="border-bottom:1px solid #1a2e1a;padding-bottom:16px;margin-bottom:24px;">
          <span style="color:#f48c06;font-size:18px;font-weight:bold;letter-spacing:0.1em;">▲ FLAREUP</span>
          <span style="color:#3a4e3a;font-size:11px;margin-left:12px;letter-spacing:0.1em;">PASSWORD RESET</span>
        </div>
  
        <p style="color:#8a9e8a;font-size:13px;line-height:1.7;margin-bottom:24px;">
          Someone requested a password reset for your FlareUp account.
          If that wasn't you, ignore this email — nothing changes.
        </p>
  
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${d.resetUrl}"
             style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#dc2626,#e85d04);color:#fff;text-decoration:none;border-radius:3px;font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;">
            Reset Password →
          </a>
        </div>
  
        <div style="background:#0a0f0a;border:1px solid #1a2e1a;border-radius:3px;padding:12px 16px;margin-bottom:24px;">
          <div style="color:#3a4e3a;font-size:11px;letter-spacing:0.08em;margin-bottom:4px;">// or copy this link</div>
          <div style="color:#f48c06;font-size:11px;word-break:break-all;">${d.resetUrl}</div>
        </div>
  
        <div style="border-top:1px solid #1a2e1a;padding-top:16px;color:#3a4e3a;font-size:11px;line-height:1.7;">
          // link expires in ${d.expiresIn}<br>
          // if you didn't request this, your password hasn't changed
        </div>
      </td></tr>
    </table>
  </body>
  </html>`;
  }
  
  export function forgotPasswordText(d: ForgotPasswordEmailData): string {
    return `FLAREUP — PASSWORD RESET
  =========================
  Reset your password: ${d.resetUrl}
  
  Link expires in ${d.expiresIn}.
  If you didn't request this, ignore this email.
  `;
  }