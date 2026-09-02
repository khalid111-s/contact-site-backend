// إعدادات التطبيق (الراوتس، الاتصال بمانجو).
// من غير app.listen، عشان يصلح للتشغيل المحلي وعلى Vercel في نفس الوقت.
// ده باك إند API بحت - مفيهوش أي ملفات ثابتة، الفرونت إند مشروع Vercel منفصل.

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS - اسمح بس لرابط الفرونت إند بتاعك (أو * مؤقتًا وقت التطوير)
const clientUrls = (process.env.CLIENT_URL || '*')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

app.use(cors({
  origin: clientUrls.includes('*') ? true : clientUrls,
}));
app.use(express.json());

// MongoDB Connection (مع كاش عشان الـ Serverless متعملش اتصال جديد كل مرة)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/contact_site';
let cachedConnectionPromise = null;

async function connectDB() {
  // لو فيه اتصال شغال فعلاً، ارجع على طول
  if (mongoose.connection.readyState === 1) return;

  // لو فيه محاولة اتصال شغالة بالفعل، متبدأش واحدة تانية جنبها - استنى نفس المحاولة
  // (ده بيمنع مشكلة إن كذا طلب يوصلوا في نفس اللحظة على Vercel ويعملوا كذا اتصال مع بعض)
  if (!cachedConnectionPromise) {
    cachedConnectionPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000, // كانت 5 ثواني، رفعتها عشان تدي فرصة للـ cluster لو بيصحى من pause
      socketTimeoutMS: 20000,
      connectTimeoutMS: 15000,
      bufferCommands: false,
      maxPoolSize: 5,
    }).then((conn) => {
      console.log('✅ Connected to MongoDB');
      return conn;
    }).catch((err) => {
      // لو فشلت المحاولة، امسح الكاش عشان الطلب اللي بعده يقدر يجرب تاني من الصفر
      cachedConnectionPromise = null;
      throw err;
    });
  }

  await cachedConnectionPromise;
  await initContact();
}

// نتأكد إن الاتصال شغال قبل أي طلب - بيتعالج هنا بدل ما الطلب يعلّق من غير رسالة
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    // محاولة تانية وأخيرة قبل ما نرجّع خطأ للمستخدم - في حالة إن أول محاولة وقعت بس السيرفر رجع يشتغل بسرعة
    try {
      await connectDB();
      next();
    } catch (err2) {
      console.error('❌ MongoDB Error (retry failed):', err2.message);
      res.status(503).json({ error: 'تعذر الاتصال بقاعدة البيانات، جرب تاني بعد شوية' });
    }
  }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
  whatsappNumber: { type: String, default: '201000000000' },
  telegramNumber: { type: String, default: '201000000000' },
  whatsappActive: { type: Boolean, default: true },
  telegramActive: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Initialize default contact if none exists
let contactInitialized = false;
async function initContact() {
  if (contactInitialized) return;
  try {
    const count = await Contact.countDocuments();
    if (count === 0) {
      await Contact.create({});
      console.log('✅ Default contact created');
    }
    contactInitialized = true;
  } catch (err) {
    console.error('❌ Could not initialize default contact:', err.message);
  }
}

// ==================== API Routes ====================

// Get contact info
app.get('/api/contact', async (req, res) => {
  try {
    const contact = await Contact.findOne().sort({ updatedAt: -1 });
    if (!contact) {
      const newContact = await Contact.create({});
      return res.json(newContact);
    }
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update contact info
app.put('/api/contact', async (req, res) => {
  try {
    const { whatsappNumber, telegramNumber, whatsappActive, telegramActive } = req.body;

    let contact = await Contact.findOne().sort({ updatedAt: -1 });
    if (!contact) {
      contact = new Contact();
    }

    if (whatsappNumber !== undefined) contact.whatsappNumber = whatsappNumber;
    if (telegramNumber !== undefined) contact.telegramNumber = telegramNumber;
    if (whatsappActive !== undefined) contact.whatsappActive = whatsappActive;
    if (telegramActive !== undefined) contact.telegramActive = telegramActive;
    contact.updatedAt = new Date();

    await contact.save();
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check بسيط
app.get('/', (req, res) => {
  res.send('Contact Site API is running...');
});

module.exports = app;
