# 🍄 Mario Cloud Game

لعبة منصّات بأسلوب ماريو تعمل في المتصفح (HTML5 Canvas) مع خادم Node.js وقاعدة PostgreSQL للوحة الصدارة.

## المزايا
- قفز وانزلاق بالأسهم (↑ / المسافة للقفز، ↓ للانزلاق) + أزرار لمس للجوال
- 3 محاولات، وعند الخسارة تظهر العملات المجمّعة
- إذا جمعت **50 عملة أو أكثر** يمكنك شراء محاولة بـ 50 عملة (زر B)
- لعبة مستمرة: عملات جديدة وأعداء جدد كل موجة، وحفر في الأرض تتسع مع المستوى
- لوحة صدارة (أفضل 3) محفوظة في قاعدة البيانات

## الهيكل
```
mario-cloud-game/
├── README.md
├── package.json
├── .env.example
├── public/            # الواجهة الأمامية
│   ├── index.html
│   ├── style.css
│   └── game.js
└── server/            # الخادم وقاعدة البيانات
    ├── index.js
    └── schema.sql
```

## التشغيل محلياً
```bash
npm install
cp .env.example .env     # ثم عدّل DATABASE_URL
npm start
```
افتح: http://localhost:3000

> بدون `DATABASE_URL` تعمل اللعبة بشكل طبيعي لكن لوحة الصدارة تكون معطّلة.

## الرفع على السحابة (Render / Railway / Fly.io ...)
1. أنشئ قاعدة **PostgreSQL** من المزود وانسخ رابط الاتصال.
2. ارفع المشروع على GitHub واربطه بالمزود كـ **Web Service** من نوع Node.
3. Build command: `npm install` — Start command: `npm start`
4. أضف متغيرات البيئة: `DATABASE_URL` و `DATABASE_SSL=true` (المنفذ `PORT` يضبطه المزود).
5. جدول `scores` يُنشأ تلقائياً عند أول تشغيل من `server/schema.sql`.

## API
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/leaderboard` | أفضل 3 نتائج |
| POST | `/api/scores` | حفظ نتيجة `{name, coins, level}` |
| GET | `/api/health` | فحص الحالة |

## ملاحظة أمان
اللعبة تعمل في المتصفح، لذا يمكن للاعب متلاعب إرسال نتيجة مزيّفة. الخادم يتحقق من المدخلات ويحدّ عدد الطلبات، لكنه لا يضمن صحة النتيجة نفسها.
