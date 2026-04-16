import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerCarRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, SITE_URL } = ctx;

  // ======= FILE UPLOAD SETUP (multer) =======
  // Use Render persistent disk /data in production, local ./uploads in dev
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataRoot = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
  const uploadsDir = path.join(dataRoot, 'uploads');
  const imagesDir = path.join(uploadsDir, 'images');
  const docsDir = path.join(uploadsDir, 'documents');
  const mediaDir = path.join(uploadsDir, 'media');

  // Create upload directories if they don't exist
  [uploadsDir, imagesDir, docsDir, mediaDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  console.log(`[BOOT] routes/cars.ts uploads dir: ${uploadsDir}`);

  // Multer config for car images (max 10MB per image)
  const imageStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, imagesDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `car_${unique}${ext}`);
    }
  });
  const uploadImages = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files allowed'));
    }
  });

  // Multer config for KYC documents (PDF/images, max 5MB)
  const docStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `doc_${unique}${ext}`);
    }
  });
  const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs allowed'));
    }
  });

  // Multer config for media (engine sound + inspection PDF, max 25MB)
  const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `media_${unique}${ext}`);
    }
  });
  const uploadMedia = multer({
    storage: mediaStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (_req, file, cb) => {
      const ext = (file.originalname || '').toLowerCase();
      const isAudio = file.mimetype.startsWith('audio/') || ext.endsWith('.mp3') || ext.endsWith('.wav') || ext.endsWith('.ogg') || ext.endsWith('.m4a');
      const isPdf = file.mimetype === 'application/pdf' || ext.endsWith('.pdf');
      const isVideo = file.mimetype.startsWith('video/') || ext.endsWith('.mp4') || ext.endsWith('.webm');
      if (isAudio || isPdf || isVideo) cb(null, true);
      else cb(new Error(`نوع الملف غير مدعوم (${file.mimetype}). يُقبل: MP3, WAV, PDF, MP4`));
    }
  });

  // ======= UPLOAD ROUTES =======

  // POST /api/upload/images - Upload up to 20 car images
  app.post('/api/upload/images', requireAuth, (uploadImages.array('images', 20) as any), ((req: any, res: any) => {
    try {
      if (!req.files || (req.files as any).length === 0) {
        return res.status(400).json({ error: 'لم يتم رفع أي صور' });
      }
      const urls = (req.files as any[]).map((f: any) => `/uploads/images/${f.filename}`);
      res.json({ success: true, urls, count: urls.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع الصور' });
    }
  }) as any);

  // POST /api/upload/media — engine sound + inspection PDF upload
  app.post('/api/upload/media', requireAuth, (uploadMedia.single('media') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
      const url = `/uploads/media/${req.file.filename}`;
      res.json({ success: true, url, filename: req.file.filename });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع الملف' });
    }
  }) as any);

  // POST /api/upload/document - KYC & general document upload
  app.post("/api/upload/document", requireAuth, (uploadDoc.single('document') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "لم يتم اختيار ملف" });
      const { userId, docType } = req.body;
      const filename = req.file.filename;
      const url = `/uploads/${filename}`;

      // Save to kyc_documents table
      if (userId) {
        const docId = `kyc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        try {
          db.prepare(`INSERT INTO kyc_documents (id, userId, docType, filename, url, status, uploadedAt)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
            .run(docId, userId, docType || 'kyc', filename, url, new Date().toISOString());
          db.prepare("UPDATE users SET kycStatus = 'pending' WHERE id = ?").run(userId);
        } catch (e) { console.error('KYC doc save error:', e); }
      }

      res.json({ success: true, url, filename });
    } catch (e: any) {
      res.status(500).json({ error: "فشل رفع الملف: " + e.message });
    }
  }) as any);

  // ======= CAR CRUD ROUTES =======

  // GET /api/cars — list all cars (public)
  app.get("/api/cars", (req, res) => {
    const cars: any[] = db.prepare("SELECT * FROM cars").all();
    res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
  });

  // POST /api/cars — create car (requireAuth)
  app.post("/api/cars", requireAuth, (req, res) => {
    const {
      make, model, year, vin, lotNumber, location,
      odometer, primaryDamage, titleType, engine, drive,
      transmission, status, auctionEndDate, images,
      buyItNow, startPrice, currentBid, reservePrice, sellerId, currency,
      acceptOffers, videoUrl, inspectionPdf,
      trim, mileageUnit, engineSize, horsepower, drivetrain, fuelType,
      exteriorColor, interiorColor, secondaryDamage, keys, runsDrives, notes
    } = req.body;

    // VIN LOCK - check for duplicates
    const existing: any = db.prepare("SELECT id FROM cars WHERE vin = ?").get(vin);
    if (existing) {
      return res.status(400).json({ error: `VIN ${vin} is already registered in the system.` });
    }

    // If user is a seller and no sellerId provided, auto-set from auth token
    const effectiveSellerId = sellerId || ((req as any).user?.role === 'seller' ? (req as any).user.id : '');

    const id = Date.now().toString();
    try {
      db.prepare(`
        INSERT INTO cars(
          id, lotNumber, vin, make, model, trim, year, odometer, engine, engineSize, horsepower,
          transmission, drive, drivetrain, fuelType, exteriorColor, interiorColor,
          primaryDamage, secondaryDamage, titleType, location, currentBid, reservePrice,
          buyItNow, currency, images, videoUrl, inspectionPdf, status,
          auctionEndDate, sellerId, keys, runsDrives, notes, mileageUnit, acceptOffers
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, lotNumber || '', vin, make, model, trim || '', year || 2024, odometer || 0, engine || '', engineSize || '', horsepower || '',
        transmission || '', drive || '', drivetrain || '', fuelType || '', exteriorColor || '', interiorColor || '',
        primaryDamage || '', secondaryDamage || '', titleType || '', location || '',
        currentBid || 0, reservePrice || 0, buyItNow || 0, currency || 'USD', JSON.stringify(images || []),
        videoUrl || '', inspectionPdf || '', 'pending_approval',
        auctionEndDate || '', effectiveSellerId, keys || 'yes', runsDrives || 'yes', notes || '', mileageUnit || 'mi', acceptOffers ? 1 : 0
      );
      res.json({ id, ...req.body });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Failed to add car or invalid data" });
    }
  });

  // PUT /api/cars/:id — update existing car
  app.put("/api/cars/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const {
      make, model, year, vin, lotNumber, location,
      odometer, primaryDamage, titleType, engine, drive,
      transmission, status, auctionEndDate, images,
      buyItNow, startPrice, currentBid, reservePrice, sellerId, currency,
      acceptOffers, videoUrl, inspectionPdf, engineAudioUrl, engineVideoUrl,
      trim, mileageUnit, engineSize, horsepower, drivetrain, fuelType,
      exteriorColor, interiorColor, secondaryDamage, keys, runsDrives, notes,
      actualOdometer, cylinders, auctionLane, showroomName, saleStatus,
      locationDetails, exchangeRate, minPrice, specialNote, buyNowPrice,
      acceptedOfferPercentage, youtubeVideoUrl, engineSoundUrl, inspectionReportUrl,
      isRecommended, isBuyNow
    } = req.body;

    try {
      const existing: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!existing) return res.status(404).json({ error: "السيارة غير موجودة" });

      db.prepare(`
        UPDATE cars SET
          make = ?, model = ?, year = ?, vin = ?, lotNumber = ?,
          odometer = ?, engine = ?, transmission = ?, drive = ?, fuelType = ?,
          reservePrice = ?, images = ?, videoUrl = ?, inspectionPdf = ?,
          sellerId = ?, currency = ?, acceptOffers = ?, notes = ?,
          exteriorColor = ?, interiorColor = ?, keys = ?, runsDrives = ?,
          location = ?, primaryDamage = ?, secondaryDamage = ?, titleType = ?,
          buyItNow = ?, trim = ?, mileageUnit = ?, engineSize = ?, horsepower = ?,
          drivetrain = ?, auctionEndDate = ?,
          engineAudioUrl = ?, engineVideoUrl = ?, showroomName = ?, isRecommended = ?,
          isBuyNow = ?, buyItNow = ?
        WHERE id = ?
      `).run(
        make ?? existing.make, model ?? existing.model, year ?? existing.year,
        vin ?? existing.vin, lotNumber ?? existing.lotNumber,
        odometer ?? existing.odometer, engine ?? existing.engine,
        transmission ?? existing.transmission, drive ?? existing.drive,
        fuelType ?? existing.fuelType, reservePrice ?? existing.reservePrice,
        JSON.stringify(images || JSON.parse(existing.images || '[]')),
        videoUrl ?? engineVideoUrl ?? youtubeVideoUrl ?? existing.videoUrl,
        inspectionPdf ?? inspectionReportUrl ?? existing.inspectionPdf,
        sellerId ?? existing.sellerId, currency ?? existing.currency,
        acceptOffers !== undefined ? (acceptOffers ? 1 : 0) : existing.acceptOffers,
        notes ?? specialNote ?? existing.notes,
        exteriorColor ?? existing.exteriorColor, interiorColor ?? existing.interiorColor,
        keys ?? existing.keys, runsDrives ?? existing.runsDrives,
        location ?? locationDetails ?? existing.location,
        primaryDamage ?? existing.primaryDamage, secondaryDamage ?? existing.secondaryDamage,
        titleType ?? existing.titleType, buyItNow ?? buyNowPrice ?? existing.buyItNow,
        trim ?? existing.trim, mileageUnit ?? existing.mileageUnit,
        engineSize ?? existing.engineSize, horsepower ?? existing.horsepower,
        drivetrain ?? existing.drivetrain, auctionEndDate ?? existing.auctionEndDate,
        engineAudioUrl ?? engineSoundUrl ?? existing.engineAudioUrl ?? '',
        engineVideoUrl ?? youtubeVideoUrl ?? existing.engineVideoUrl ?? '',
        showroomName ?? existing.showroomName ?? '',
        isRecommended !== undefined ? (isRecommended ? 1 : 0) : existing.isRecommended ?? 0,
        isBuyNow !== undefined ? (isBuyNow ? 1 : 0) : existing.isBuyNow ?? 0,
        buyItNow ?? buyNowPrice ?? existing.buyItNow ?? null,
        id
      );

      res.json({ success: true, id });
    } catch (e: any) {
      console.error('Car update error:', e);
      res.status(400).json({ error: e.message || "فشل تحديث السيارة" });
    }
  });

  // GET /api/cars/:id — single car details (public)
  app.get("/api/cars/:id", (req, res) => {
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(req.params.id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
      // Attach bids
      const bids: any[] = db.prepare(`
        SELECT b.*, u.firstName, u.lastName FROM bids b
        JOIN users u ON b.userId = u.id
        WHERE b.carId = ? ORDER BY b.amount DESC`).all(req.params.id);
      try { car.images = JSON.parse(car.images || '[]'); } catch { car.images = []; }
      res.json({ ...car, bids });
    } catch (e) { res.status(500).json({ error: "فشل جلب تفاصيل السيارة" }); }
  });

  // POST /api/cars/:id/re-list — re-list car for auction
  app.post("/api/cars/:id/re-list", requireAuth, (req, res) => {
    const { id } = req.params;
    const { nextAuctionDate } = req.body;
    const reqUser = (req as any).user;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      // RBAC check — use JWT role, not body param
      if (reqUser.role !== 'admin' && car.sellerId !== reqUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة إدراج هذه السيارة" });
      }

      db.prepare(`
        UPDATE cars SET
      status = 'upcoming',
        auctionEndDate = ?,
        currentBid = 0,
        winnerId = NULL,
        offerMarketEndTime = NULL,
        ultimoEndTime = NULL
        WHERE id = ?
        `).run(nextAuctionDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), id);

      io.emit("car_updated", { id, status: 'upcoming' });
      res.json({ success: true, message: "تم إعادة إدراج السيارة بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل إعادة إدراج السيارة" });
    }
  });

  // POST /api/cars/:id/reschedule — reschedule unsold car back to upcoming
  app.post("/api/cars/:id/reschedule", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      const { newAuctionEnd } = req.body;
      db.prepare("UPDATE cars SET status = 'upcoming', auctionEndDate = ?, currentBid = 0, winnerId = NULL WHERE id = ?")
        .run(newAuctionEnd || '', id);
      io.emit("car_updated", { id, status: 'upcoming' });
      res.json({ success: true, message: "تمت إعادة جدولة السيارة" });
    } catch (e: any) {
      res.status(500).json({ error: "فشل إعادة الجدولة" });
    }
  });

  // POST /api/cars/:id/notify-winner — send notification to the winner to pay
  app.post("/api/cars/:id/notify-winner", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
      if (!car.winnerId) return res.status(400).json({ error: "لا يوجد فائز لهذه السيارة" });

      sendNotification(car.winnerId,
        'تهانينا! فزت بالمزاد',
        `لقد فزت بالمزاد على ${car.make} ${car.model} (${car.year || ''}) بمبلغ $${(car.currentBid || 0).toLocaleString()}. يرجى إتمام الدفع خلال 7 أيام.`,
        'success', `/dashboard/user`
      );

      res.json({ success: true, message: "تم إرسال إشعار الدفع للفائز" });
    } catch (e: any) {
      res.status(500).json({ error: "فشل إرسال الإشعار" });
    }
  });

  // ======= LIBYAN MARKET ROUTES =======

  // GET /api/libyan-market — list market prices (public)
  app.get("/api/libyan-market", (req, res) => {
    try {
      const { make, model, year, condition, q, page, limit: lim } = req.query;
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(200, parseInt(lim as string) || 200);
      const offset = (pageNum - 1) * pageSize;

      let query = "SELECT * FROM libyan_market_prices WHERE 1=1";
      const params: any[] = [];

      // Smart full-text search (Arabic + English)
      if (q) {
        query += " AND (make LIKE ? OR makeEn LIKE ? OR model LIKE ? OR modelEn LIKE ?)";
        const s = `%${q}%`;
        params.push(s, s, s, s);
      }
      if (make) { query += " AND (make LIKE ? OR makeEn LIKE ?)"; params.push(`%${make}%`, `%${make}%`); }
      if (model) { query += " AND (model LIKE ? OR modelEn LIKE ?)"; params.push(`%${model}%`, `%${model}%`); }
      if (year) { query += " AND year = ?"; params.push(parseInt(year as string)); }
      if (condition) { query += " AND condition = ?"; params.push(condition); }

      const total = (db.prepare(`SELECT COUNT(*) as c FROM libyan_market_prices WHERE 1=1${query.split('WHERE 1=1')[1]}`).get(...params) as any)?.c || 0;
      query += ` ORDER BY make ASC, year DESC, model ASC LIMIT ${pageSize} OFFSET ${offset}`;
      const data: any[] = db.prepare(query).all(...params);

      res.json({ data, total, page: pageNum, pageSize, pages: Math.ceil(total / pageSize) });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/libyan-market/match — smart price lookup for a specific car (public)
  app.get("/api/libyan-market/match", (req, res) => {
    try {
      const { make, model, year, condition, exchangeRate } = req.query;
      const rate = parseFloat(exchangeRate as string) || 4.85;
      if (!make || !model) return res.status(400).json({ error: "make and model required" });

      // Best match: exact make+model+year, then fallback to make+model, then make only
      const rows: any[] = db.prepare(`
        SELECT *, ABS(year - ?) as yearDiff
        FROM libyan_market_prices
        WHERE (make LIKE ? OR makeEn LIKE ?) AND (model LIKE ? OR modelEn LIKE ?)
        ORDER BY yearDiff ASC, priceLYD DESC
        LIMIT 5`).all(
          parseInt(year as string) || 2020,
          `%${make}%`, `%${make}%`,
          `%${model}%`, `%${model}%`
        );

      if (rows.length === 0) return res.json({ found: false });

      // Use the best match (closest year)
      const best = rows[0];
      const avgPriceLYD = rows.reduce((s, r) => s + (r.priceLYD || 0), 0) / rows.filter(r => r.priceLYD).length;
      const priceLYD = best.priceLYD || avgPriceLYD;
      const priceUSD = priceLYD / rate;

      res.json({
        found: true,
        priceLYD: Math.round(priceLYD),
        priceUSD: Math.round(priceUSD),
        exchangeRate: rate,
        matchedYear: best.year,
        condition: best.condition,
        make: best.make,
        makeEn: best.makeEn,
        model: best.model,
        modelEn: best.modelEn,
        similarCount: rows.length,
        lastUpdated: best.lastUpdated,
      });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // Alias: /api/libyan-market-prices → /api/libyan-market
  app.get("/api/libyan-market-prices", (req, res) => {
    try {
      const { make, model, year, condition } = req.query;
      let q = "SELECT * FROM libyan_market_prices WHERE 1=1";
      const params: any[] = [];
      if (make) { q += " AND (make LIKE ? OR makeEn LIKE ?)"; params.push(`%${make}%`, `%${make}%`); }
      if (model) { q += " AND (model LIKE ? OR modelEn LIKE ?)"; params.push(`%${model}%`, `%${model}%`); }
      if (year) { q += " AND year = ?"; params.push(Number(year)); }
      if (condition) { q += " AND condition = ?"; params.push(condition); }
      q += " ORDER BY priceLYD DESC LIMIT 200";
      const rows = db.prepare(q).all(...params);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: "فشل جلب أسعار السوق" }); }
  });

  // ======= PUBLIC API v1 =======

  // API Key validation middleware
  const validateApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ error: 'API key required', docs: `${SITE_URL}/api/v1/docs` });

    const validKey: any = db.prepare("SELECT * FROM api_keys WHERE key = ? AND active = 1").get(apiKey);
    if (!validKey) return res.status(403).json({ error: 'Invalid or disabled API key' });

    // Track usage
    db.prepare("UPDATE api_keys SET usageCount = usageCount + 1, lastUsedAt = ? WHERE key = ?")
      .run(new Date().toISOString(), apiKey);

    req.apiClient = validKey;
    next();
  };

  // API Documentation
  app.get("/api/v1/docs", (_req, res) => {
    res.json({
      name: "AutoPro Libya Public API",
      version: "1.0",
      description: "عرض سيارات مزادات أوتو برو على موقعك",
      baseUrl: `${SITE_URL}/api/v1`,
      authentication: "أضف X-API-KEY في الـ header أو ?api_key= في الرابط",
      endpoints: {
        "GET /api/v1/cars": "قائمة السيارات المتاحة (مع فلاتر)",
        "GET /api/v1/cars/:id": "تفاصيل سيارة واحدة",
        "GET /api/v1/cars/live": "السيارات في المزاد المباشر الآن",
        "GET /api/v1/cars/upcoming": "السيارات القادمة للمزاد",
        "GET /api/v1/cars/offers": "سيارات سوق العروض",
        "GET /api/v1/stats": "إحصائيات المنصة",
        "GET /api/v1/market-prices": "أسعار السوق الليبي"
      },
      filters: {
        make: "الماركة (Toyota, BMW...)",
        model: "الموديل",
        year_min: "أقل سنة",
        year_max: "أعلى سنة",
        price_min: "أقل سعر",
        price_max: "أعلى سعر",
        status: "الحالة (live, upcoming, offer_market, closed)",
        limit: "عدد النتائج (افتراضي 20، أقصى 100)",
        offset: "بداية النتائج (للـ pagination)"
      },
      example: `curl -H "X-API-KEY: YOUR_KEY" ${SITE_URL}/api/v1/cars?make=Toyota&limit=10`,
      rateLimit: "1000 طلب/ساعة"
    });
  });

  // List cars with filters
  app.get("/api/v1/cars", validateApiKey, (req, res) => {
    try {
      const { make, model, year_min, year_max, price_min, price_max, status, limit, offset, sort } = req.query;

      let where = "WHERE 1=1";
      const params: any[] = [];

      if (make) { where += " AND LOWER(c.make) LIKE ?"; params.push(`%${(make as string).toLowerCase()}%`); }
      if (model) { where += " AND LOWER(c.model) LIKE ?"; params.push(`%${(model as string).toLowerCase()}%`); }
      if (year_min) { where += " AND c.year >= ?"; params.push(Number(year_min)); }
      if (year_max) { where += " AND c.year <= ?"; params.push(Number(year_max)); }
      if (price_min) { where += " AND c.currentBid >= ?"; params.push(Number(price_min)); }
      if (price_max) { where += " AND c.currentBid <= ?"; params.push(Number(price_max)); }
      if (status) { where += " AND c.status = ?"; params.push(status); }
      else { where += " AND c.status IN ('live', 'upcoming', 'offer_market')"; }

      const lim = Math.min(Number(limit) || 20, 100);
      const off = Number(offset) || 0;
      const orderBy = sort === 'price_asc' ? 'c.currentBid ASC' : sort === 'price_desc' ? 'c.currentBid DESC' : sort === 'year_desc' ? 'c.year DESC' : 'c.id DESC';

      const total = (db.prepare(`SELECT COUNT(*) as c FROM cars c ${where}`).get(...params) as any)?.c || 0;
      const cars = db.prepare(`
        SELECT c.id, c.lotNumber, c.vin, c.make, c.model, c.trim, c.year, c.odometer, c.mileageUnit,
               c.engine, c.transmission, c.drive, c.fuelType, c.exteriorColor, c.primaryDamage,
               c.titleType, c.location, c.currentBid, c.reservePrice, c.currency, c.images,
               c.status, c.auctionEndDate, c.acceptOffers
        FROM cars c ${where}
        ORDER BY ${orderBy} LIMIT ? OFFSET ?
      `).all(...params, lim, off);

      // Parse images JSON
      const parsed = cars.map((c: any) => ({
        ...c,
        images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(),
        url: `${SITE_URL}/car-details/${c.id}`,
        bidUrl: c.status === 'live' ? `${SITE_URL}/live-auction` : `${SITE_URL}/car-details/${c.id}`
      }));

      res.json({
        success: true,
        total,
        limit: lim,
        offset: off,
        count: parsed.length,
        cars: parsed
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single car details
  app.get("/api/v1/cars/:id", validateApiKey, (req, res) => {
    try {
      const car: any = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM bids WHERE carId = c.id) as bidCount,
          (SELECT MAX(amount) FROM bids WHERE carId = c.id) as highestBid
        FROM cars c WHERE c.id = ?
      `).get(req.params.id);

      if (!car) return res.status(404).json({ error: 'Car not found' });

      car.images = (() => { try { return JSON.parse(car.images); } catch { return []; } })();
      car.url = `${SITE_URL}/car-details/${car.id}`;
      car.bidUrl = car.status === 'live' ? `${SITE_URL}/live-auction` : `${SITE_URL}/car-details/${car.id}`;

      res.json({ success: true, car });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Live auction cars
  app.get("/api/v1/cars/live", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, auctionEndDate, images, location FROM cars WHERE status = 'live'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/live-auction` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Upcoming cars
  app.get("/api/v1/cars/upcoming", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, auctionEndDate, images, location FROM cars WHERE status = 'upcoming'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/car-details/${c.id}` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Offer market cars
  app.get("/api/v1/cars/offers", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, reservePrice, offerMarketEndTime, images, location FROM cars WHERE status = 'offer_market'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/car-details/${c.id}` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Platform stats
  app.get("/api/v1/stats", validateApiKey, (_req, res) => {
    try {
      const totalCars = (db.prepare("SELECT COUNT(*) as c FROM cars").get() as any)?.c || 0;
      const liveCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'live'").get() as any)?.c || 0;
      const upcomingCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'upcoming'").get() as any)?.c || 0;
      const soldCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status IN ('closed', 'sold')").get() as any)?.c || 0;
      const totalBids = (db.prepare("SELECT COUNT(*) as c FROM bids").get() as any)?.c || 0;
      const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get() as any)?.c || 0;
      res.json({ success: true, stats: { totalCars, liveCars, upcomingCars, soldCars, totalBids, totalUsers } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Libyan market prices
  app.get("/api/v1/market-prices", validateApiKey, (req, res) => {
    try {
      const { make, model, year } = req.query;
      let where = "WHERE 1=1";
      const params: any[] = [];
      if (make) { where += " AND LOWER(make) LIKE ?"; params.push(`%${(make as string).toLowerCase()}%`); }
      if (model) { where += " AND LOWER(model) LIKE ?"; params.push(`%${(model as string).toLowerCase()}%`); }
      if (year) { where += " AND year = ?"; params.push(Number(year)); }

      const prices = db.prepare(`SELECT make, makeEn, model, modelEn, year, priceLYD, transmission, fuel, mileage, city FROM libyan_market_prices ${where} ORDER BY make, model, year LIMIT 50`).all(...params);
      res.json({ success: true, count: prices.length, prices });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}
