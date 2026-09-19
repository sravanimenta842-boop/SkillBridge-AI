'use strict';
const db = require('../db');
const { requireUser } = require('../auth');

module.exports = function (router) {
  router.get('/api/notifications', ({ req }) => {
    const u = requireUser(req);
    const items = db.all(
      `SELECT id, type, title, body, view, created_at AS createdAt, (read_at IS NOT NULL) AS read
         FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40`, u.id).map((n) => ({ ...n, read: !!n.read }));
    const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id).n;
    return { items, unread };
  });

  router.post('/api/notifications/read', async ({ req, body }) => {
    const u = requireUser(req);
    const b = await body();
    if (Array.isArray(b.ids) && b.ids.length) {
      for (const id of b.ids.slice(0, 100)) {
        db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', db.now(), Number(id), u.id);
      }
    } else {
      db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', db.now(), u.id);
    }
    return { ok: true };
  });

  router.delete('/api/notifications', ({ req }) => {
    db.run('DELETE FROM notifications WHERE user_id = ?', requireUser(req).id);
    return { ok: true };
  });
};
