const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * GET /api/support — Public endpoint (no auth required)
 * Returns published FAQs + support config (video, whatsapp)
 */
router.get('/', async (req, res, next) => {
  try {
    // Idioma da loja: o app envia ?lang=pt-BR|es-AR|es-MX|pt|es. Normaliza para a
    // base (pt | es); qualquer coisa fora disso vira 'pt'.
    const base = String(req.query.lang || '').slice(0, 2).toLowerCase();
    const locale = base === 'es' ? 'es' : 'pt';

    const faqSelect = {
      id: true,
      question: true,
      answer: true,
      videoUrl: true,
      category: true,
      sortOrder: true,
    };
    const faqOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

    const [faqsRaw, configs] = await Promise.all([
      prisma.adminFaq.findMany({
        where: { isPublished: true, locale },
        orderBy: faqOrder,
        select: faqSelect,
      }),
      prisma.adminConfig.findMany({
        where: { key: { in: ['support_video_url', 'support_whatsapp'] } },
      }),
    ]);

    // Fallback: sem FAQ no idioma pedido (e não é pt) → usa as de português.
    let faqs = faqsRaw;
    if (faqs.length === 0 && locale !== 'pt') {
      faqs = await prisma.adminFaq.findMany({
        where: { isPublished: true, locale: 'pt' },
        orderBy: faqOrder,
        select: faqSelect,
      });
    }

    const configMap = Object.fromEntries(configs.map((c) => [c.key, c.value]));

    res.json({
      faqs,
      mainVideoUrl: configMap.support_video_url || '',
      whatsapp: configMap.support_whatsapp || '',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
