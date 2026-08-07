const axios = require('axios');

/**
 * Serviço de e-mail transacional best-effort via API HTTP do Resend.
 *
 * Design:
 *  - Sem SMTP, sem nova dependência (usa o `axios` já presente).
 *  - É **best-effort**: nunca lança. Se não houver `RESEND_API_KEY` ou destinatário,
 *    retorna `{ skipped: true }` silenciosamente. Falhas da API são logadas e engolidas
 *    para não derrubar o fluxo que disparou o envio (ex.: abertura de ticket).
 *
 * Env:
 *  - RESEND_API_KEY      → chave da API Resend (re_...). Sem ela, e-mails são no-op.
 *  - SUPPORT_FROM_EMAIL  → remetente. Fallback: APP_EMAIL. Ex.: "Suporte <suporte@app.com>"
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function getFromAddress() {
  const from = process.env.SUPPORT_FROM_EMAIL || process.env.APP_EMAIL || '';
  return from.trim();
}

/**
 * Envia um e-mail. Best-effort — nunca lança.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, id?: string }>}
 */
async function sendEmail({ to, subject, html, replyTo } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getFromAddress();

  if (!apiKey) return { ok: false, skipped: true, reason: 'no_api_key' };
  if (!from) return { ok: false, skipped: true, reason: 'no_from_address' };
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return { ok: false, skipped: true, reason: 'no_recipient' };
  }
  if (!subject || !html) return { ok: false, skipped: true, reason: 'missing_content' };

  try {
    const payload = { from, to: Array.isArray(to) ? to : [to], subject, html };
    if (replyTo) payload.reply_to = replyTo;

    const { data } = await axios.post(RESEND_ENDPOINT, payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    return { ok: true, id: data?.id };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error('[email] falha ao enviar (ignorado):', detail);
    return { ok: false, reason: detail };
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function nl2br(str) {
  return String(str == null ? '' : str).replace(/\n/g, '<br>');
}

/**
 * Molde visual único pra todos os e-mails transacionais do programa de
 * fidelidade — cabeçalho na cor da loja, corpo, destaque (código/pontos) e
 * rodapé. `leadText` é o texto LIVRE que o lojista escreve no painel: entra
 * só como o parágrafo inicial (escapado — nunca HTML bruto do lojista) e
 * NUNCA substitui o `highlightHtml`, que é sempre montado pelo sistema com o
 * dado real (código do cupom, pontos, saldo) — garante que o e-mail nunca sai
 * sem a informação que o cliente precisa, não importa o que o lojista escreva.
 */
function renderEmail({ brandColor, eyebrow, title, leadText, highlightHtml, ctaUrl, ctaLabel, footNote }) {
  const color = brandColor || '#7C3AED';
  const leadHtml = leadText
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">${nl2br(escapeHtml(leadText))}</p>`
    : '';
  const highlight = highlightHtml
    ? `<div style="margin:0 0 20px;padding:20px;background:#F5F3F7;border-radius:14px;text-align:center;">${highlightHtml}</div>`
    : '';
  const cta = ctaUrl
    ? `<div style="text-align:center;margin-top:4px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 30px;border-radius:10px;">${escapeHtml(ctaLabel || 'Acessar')}</a></div>`
    : '';

  return `
<div style="background:#F5F3F7;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ECE9F1;">
    <div style="background:${color};padding:30px 32px 26px;color:#ffffff;">
      ${eyebrow ? `<div style="font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;opacity:.85;margin:0 0 8px;">${escapeHtml(eyebrow)}</div>` : ''}
      <div style="font-size:22px;font-weight:800;line-height:1.3;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:28px 32px 8px;">
      ${leadHtml}
      ${highlight}
      ${cta}
    </div>
    <div style="padding:20px 32px;margin-top:14px;background:#FAF9FC;border-top:1px solid #ECE9F1;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.5;">
      ${escapeHtml(footNote || 'Você recebeu este e-mail porque faz parte do programa de fidelidade desta loja.')}
    </div>
  </div>
</div>`.trim();
}

module.exports = { sendEmail, getFromAddress, renderEmail, escapeHtml };
