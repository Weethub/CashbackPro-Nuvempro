const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * GET /api/support — Public endpoint (no auth required)
 * Returns published FAQs + support config (video, whatsapp)
 */
router.get('/', async (req, res, next) => {
  try {
    const [faqs, configs] = await Promise.all([
      prisma.adminFaq.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          question: true,
          answer: true,
          videoUrl: true,
          category: true,
          sortOrder: true,
        },
      }),
      prisma.adminConfig.findMany({
        where: { key: { in: ['support_video_url', 'support_whatsapp'] } },
      }),
    ]);

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
