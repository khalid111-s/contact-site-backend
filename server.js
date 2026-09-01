// نقطة الدخول للتشغيل المحلي على جهازك (npm start).
// على Vercel، بيتم استخدام api/index.js بدل الملف ده.
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
});
