# 🚂 Nova Bots Server

خادم تشغيل بوتات Discord على Railway

## 📋 المتطلبات

1. حساب على [Railway](https://railway.app)
2. مشروع Supabase (موجود)

## 🚀 خطوات النشر على Railway

### 1. إنشاء حساب Railway
1. اذهب إلى https://railway.app
2. اضغط **Start a New Project**
3. سجل بالـ GitHub

### 2. نشر المشروع
1. اضغط **+ New Project**
2. اختر **Deploy from GitHub repo**
3. اختر المستودع (أو ارفع المجلد مباشرة)
4. Railway سيكتشف تلقائياً أنه Node.js

### 3. إضافة المتغيرات البيئية
في Railway Dashboard > Variables أضف:

```
SUPABASE_URL=https://ogtwquccqenwyzrozpvt.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key من Supabase>
BOTS_API_KEY=nova-bots-secret-key-2024
```

### 4. الحصول على الرابط
Railway سيعطيك رابط مثل:
```
https://nova-bots-server.up.railway.app
```

## 🔗 API Endpoints

| Endpoint | Method | الوصف |
|----------|--------|-------|
| `/` | GET | Health check |
| `/bot/start` | POST | تشغيل بوت |
| `/bot/stop` | POST | إيقاف بوت |
| `/bot/status/:botId` | GET | حالة البوت |
| `/bot/logs/:botId` | GET | سجلات البوت |
| `/bots` | GET | جميع البوتات العاملة |

## 📝 أمثلة

### تشغيل بوت
```bash
curl -X POST https://your-railway-url/bot/start \
  -H "Content-Type: application/json" \
  -H "x-api-key: nova-bots-secret-key-2024" \
  -d '{
    "botId": "bot-123",
    "userId": "user-456",
    "files": [{"filename": "index.js", "content": "console.log(\"Hello\")", "path": "/"}],
    "envVars": [{"key": "DISCORD_TOKEN", "value": "your-token"}]
  }'
```

### إيقاف بوت
```bash
curl -X POST https://your-railway-url/bot/stop \
  -H "Content-Type: application/json" \
  -H "x-api-key: nova-bots-secret-key-2024" \
  -d '{"botId": "bot-123"}'
```

## 💰 التكلفة

- **Hobby Plan**: مجاني ($5 كرديت شهرياً)
- **Pro Plan**: $20/شهر

## ⚠️ ملاحظات مهمة

1. البوتات تعمل 24/7 على Railway
2. يمكن تشغيل عدة بوتات في نفس الوقت
3. السجلات تُرسل تلقائياً لـ Supabase
4. إذا أُعيد تشغيل الخادم، البوتات تحتاج إعادة تشغيل
