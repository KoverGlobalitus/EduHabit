const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  // Берём токен из httpOnly-куки
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, name }
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен' });
  }
};
