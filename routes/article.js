const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const articles = await prisma.article.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(articles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const article = await prisma.article.findUnique({
      where: { id }
    });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

router.get('/:id/bookmark', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const bookmark = await prisma.articleBookmark.findUnique({
      where: {
        userId_articleId: {
          userId: req.user.id,
          articleId: id
        }
      }
    });

    res.json({ bookmarked: Boolean(bookmark) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch bookmark status' });
  }
});

router.post('/:id/bookmark', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const article = await prisma.article.findUnique({ where: { id } });

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    await prisma.articleBookmark.upsert({
      where: {
        userId_articleId: {
          userId: req.user.id,
          articleId: id
        }
      },
      update: {},
      create: {
        userId: req.user.id,
        articleId: id
      }
    });

    res.json({ bookmarked: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

router.delete('/:id/bookmark', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.articleBookmark.deleteMany({
      where: {
        userId: req.user.id,
        articleId: id
      }
    });

    res.json({ bookmarked: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

module.exports = router;
