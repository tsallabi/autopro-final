import bcrypt from 'bcryptjs';
import { requireAdmin, requireAuth } from '../lib/middleware.ts';
import * as agentcollab from '../lib/agentcollab.ts';
import { getKeys as getAgentCollabKeys, isEnabled as agentCollabEnabled } from '../lib/agentcollab-bootstrap.ts';
import { runFullEntitySync } from '../lib/agentcollab-sync.ts';
import { pushStatsSnapshot } from '../lib/agentcollab-stats.ts';
import type { AppContext } from '../lib/types.ts';

export function registerAdminRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage, sendEmail, walletCredit, walletDebit, completeInvoicePayment, JWT_SECRET, SITE_URL, SALT_ROUNDS, transporter } = ctx;

  // [buying-power-multiplier] One-shot reconciliation at boot:
  // every user with deposit > 0 should have buyingPower = deposit * 10.
  // Fixes any rows that were left behind by the PUT-with-stale-buyingPower
  // bug (admin set deposit=1000 but buyingPower stayed at 0, blocking
  // bidding even after manual activation).
  //
  // Conservative: only touches rows where the mismatch is real — never
  // raises a user who's currently exposed (has live leading bids that
  // already lowered the available buyingPower).
  try {
    const fixed: any = db.prepare(`
      UPDATE users
         SET buyingPower = deposit * 10
       WHERE COALESCE(deposit, 0) > 0
         AND COALESCE(buyingPower, 0) < deposit * 10
         AND NOT EXISTS (
           SELECT 1 FROM cars
            WHERE winnerId = users.id
              AND status IN ('live', 'upcoming')
         )
    `).run();
    if (fixed && fixed.changes > 0) {
      console.log(`[buying-power-fix] reconciled ${fixed.changes} users to deposit * 10`);
    }
  } catch (e: any) {
    console.error('[buying-power-fix] boot reconciliation failed:', e?.message);
  }

  // ══════════════════════════════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════════════════════════════

  app.post("/api/settings", requireAdmin, (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare("UPDATE system_settings SET value = ?, updatedAt = ? WHERE key = ?");
      const insertStmt = db.prepare("INSERT OR IGNORE INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, 'Added via API', ?)");

      const now = new Date().toISOString();
      db.transaction(() => {
        for (const [key, value] of Object.entries(updates)) {
          const valStr = String(value);
          const result = stmt.run(valStr, now, key);
          if (result.changes === 0) {
            insertStmt.run(key, valStr, now);
          }
        }
      })();
      res.json({ success: true, message: "Settings updated successfully" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update settings", details: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  DEBUG / SEED
  // ══════════════════════════════════════════════════════════════

  app.get("/api/debug/seed-simulation", requireAdmin, (req, res) => {
    try {
      console.log("🚀 API Triggered Full Simulation Seeding...");

      // Buyers
      const buyers = [
        { id: "buyer-1", firstName: "خا��د", lastName: "المنفي", email: "buyer1@test.com", phone: "0911111111", password: "user123", role: "buyer", status: "active", deposit: 10000, buyingPower: 100000 },
        { id: "buyer-2", firstName: "أحمد", lastName: "الورفلي", email: "buyer2@test.com", phone: "0922222222", password: "user123", role: "buyer", status: "active", deposit: 15000, buyingPower: 150000 },
        { id: "buyer-3", firstName: "مصطفى", lastName: "القمودي", email: "buyer3@test.com", phone: "0933333333", password: "user123", role: "buyer", status: "active", deposit: 5000, buyingPower: 50000 },
        { id: "buyer-4", firstName: "سالم", lastName: "الزنتاني", email: "buyer4@test.com", phone: "0944444444", password: "user123", role: "buyer", status: "active", deposit: 20000, buyingPower: 200000 },
        { id: "buyer-5", firstName: "عمر", lastName: "المختار", email: "buyer5@test.com", phone: "0955555555", password: "user123", role: "buyer", status: "active", deposit: 500, buyingPower: 5000 },
      ];

      for (const buyer of buyers) {
        db.prepare(`
                INSERT OR REPLACE INTO users (id, firstName, lastName, email, phone, password, role, status, deposit, buyingPower, joinDate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(buyer.id, buyer.firstName, buyer.lastName, buyer.email, buyer.phone, buyer.password, buyer.role, buyer.status, buyer.deposit, buyer.buyingPower, new Date().toISOString());
      }

      // 20 Cars
      const carMakes = ['Mercedes-Benz', 'BMW', 'Toyota', 'Porsche', 'Audi', 'Lexus', 'Land Rover', 'Jeep'];
      const carModelMap: any = {
        'Mercedes-Benz': ['S580', 'G63 AMG', 'E350', 'GLE 53'],
        'BMW': ['760Li', 'X7 M60i', 'M4 Competition', 'iX'],
        'Toyota': ['Land Cruiser 300', 'Camry SE', 'Avalon', 'Supra'],
        'Porsche': ['911 Turbo S', 'Cayenne Coupe', 'Panamera', 'Taycan'],
        'Audi': ['RS7', 'Q8 E-tron', 'A8L', 'RSQ8'],
        'Lexus': ['LX600', 'LS500h', 'RX350', 'LC500'],
        'Land Rover': ['Range Rover Autobiography', 'Defender 110 V8', 'Sport', 'Velar'],
        'Jeep': ['Grand Wagoneer', 'Wrangler Rubicon', 'Grand Cherokee L', 'Gladiator']
      };

      const sampleImages = [
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70",
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf",
        "https://images.unsplash.com/photo-1494976388531-d10596957faf",
        "https://images.unsplash.com/photo-1511919884228-dd9071060965",
        "https://images.unsplash.com/photo-1614200187524-dc4b892acf16",
        "https://images.unsplash.com/photo-1610647752706-c87b89793ee7",
        "https://images.unsplash.com/photo-1555353540-64fd1b6226f7",
        "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2",
        "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e",
        "https://images.unsplash.com/photo-1542281286-6e0a369e88bf",
        "https://images.unsplash.com/photo-1550009158-9ebf69173e03"
      ].map(url => `${url}?auto=format&fit=crop&q=80&w=800`);

      for (let i = 1; i <= 20; i++) {
        const make = carMakes[i % carMakes.length];
        const models = carModelMap[make];
        const model = models[i % models.length];
        const id = `sim-car-${i}`;
        let status = 'upcoming';
        if (i <= 5) status = 'live';
        if (i > 15) status = 'offer_market';

        const imgIdx = (i - 1) % sampleImages.length;
        const carImages = [
          sampleImages[imgIdx],
          sampleImages[(imgIdx + 1) % sampleImages.length],
          sampleImages[(imgIdx + 2) % sampleImages.length]
        ];

        db.prepare(`
                INSERT OR REPLACE INTO cars (
                    id, lotNumber, vin, make, model, year, odometer, engineSize, horsepower,
                    transmission, drivetrain, fuelType, exteriorColor, interiorColor,
                    primaryDamage, secondaryDamage, titleType, location, currentBid,
                    reservePrice, buyItNow, status, images, sellerId, auctionEndDate,
                    keys, runsDrives, notes, mileageUnit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
          id, (70000000 + i).toString(), `SVIN${i}${Date.now().toString(36)}`,
          make, model, 2022 + (i % 3), 1500 * i, "4.0L V8", "500 hp",
          "Automatic", "AWD", "Gasoline", "Obsidian Black", "Nappa Leather",
          "None", "None", "Clean Title", "Dubai, UAE", i * 2000,
          i * 5000 + 10000, i * 6000 + 20000, status, JSON.stringify(carImages),
          "seller-1", new Date(Date.now() + 172800000).toISOString(),
          "Yes", "Yes", "سيارة ممتازة بحالة الوكالة - تجربة محاكاة", "km"
        );
      }

      // Scenarios
      const amount1 = 45000;
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?").run("buyer-1", amount1, "sim-car-1");
      (ctx as any).createWinInvoices("buyer-1", "sim-car-1", amount1);

      const amount16 = 55000;
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?").run("buyer-2", amount16, "sim-car-16");
      (ctx as any).createWinInvoices("buyer-2", "sim-car-16", amount16);
      sendInternalMessage("admin-1", "buyer-2", "🏆 تم قبول عرضك!", "تمت الموافقة على عرضك لسيارة sim-car-16 بمبلغ $" + amount16);

      db.prepare("UPDATE cars SET status = 'offer_market', currentBid = 35000, reservePrice = 40000, offerMarketEndTime = ? WHERE id = ?")
        .run(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), "sim-car-2");
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp) VALUES (?, ?, ?, ?, ?)").run(`bid-${Date.now()}-1`, "sim-car-2", "buyer-3", 35000, new Date().toISOString());
      sendNotification("buyer-3", "😔 المزاد لم يصل للسعر المطلوب", "سيارة sim-car-2 انتقلت لسوق العروض، يمكنك تقديم عرض جديد هناك!", "warning");

      db.prepare("UPDATE cars SET status = 'offer_market', currentBid = 62000 WHERE id = ?").run("sim-car-17");
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp) VALUES (?, ?, ?, ?, ?)").run(`bid-${Date.now()}-2`, "sim-car-17", "buyer-4", 62000, new Date().toISOString());
      sendInternalMessage("buyer-4", "admin-1", "طلب شراء | سيارة sim-car-17", "لقد قدمت عرضاً بقيمة $62,000 وأنتظر موافقتكم.");

      sendNotification("buyer-5", "💡 فرص جديدة بانتظاركم", "لم يحالفك الحظ اليوم؟ شاهد هذه السيارات المميزة التي تناسب ميزانيتك!");

      res.json({ success: true, message: "Simulation seeded successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: PAYMENT REQUESTS
  // ══════════════════════════════════════════════════════════════

  // GET /api/admin/payment-requests — admin: list all payment requests
  app.get("/api/admin/payment-requests", requireAdmin, (_req, res) => {
    try {
      const requests: any[] = db.prepare(`
        SELECT pr.*, u.firstName, u.lastName, u.email
        FROM payment_requests pr
        JOIN users u ON pr.userId = u.id
        ORDER BY pr.requestedAt DESC
      `).all();
      const pending = (requests as any[]).filter((r: any) => r.status === 'pending').length;
      res.json({ requests, pendingCount: pending });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/admin/payment-requests/:id/approve — admin approves top-up / withdrawal
  app.post("/api/admin/payment-requests/:id/approve", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        if (pr.type === 'topup') {
          walletCredit(pr.userId, pr.amount, `شحن محفظة — مراجعة Admin`, id);
          sendNotification(pr.userId, '✅ تم شحن محفظتك', `تمت الموافقة على طلبك ✔ — تم إضافة $${Number(pr.amount).toLocaleString()} لمحفظتك. يمكنك الآن المزايدة!`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'withdrawal') {
          walletDebit(pr.userId, pr.amount, `سحب رصيد — مراجعة Admin`, id);
          sendNotification(pr.userId, '💸 تمت الموافقة على السحب', `تمت الموافقة على سحب $${Number(pr.amount).toLocaleString()} — سيُحوَّل خلال 2-3 أيام عمل.`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'invoice_payment') {
          completeInvoicePayment(pr.invoiceId, timestamp, pr.method);
          sendNotification(pr.userId, '✅ تم تأكيد الدفع', `تمت الموافقة على تأكيد دفع الفاتورة #${pr.invoiceId} بنجاح.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
        }

        db.prepare("UPDATE payment_requests SET status='approved', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || null, timestamp, id);
      })();

      // Send receipt internal message after transaction commits
      const walletAfter: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(pr.userId);
      const newBalance = walletAfter ? Number(walletAfter.balance).toLocaleString() : '—';
      if (pr.type === 'topup') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال شحن محفظة — تم قبول طلبك',
          `إيصال شحن محفظة\n\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nرصيد المحفظة الجديد: $${newBalance}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      } else if (pr.type === 'invoice_payment') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال دفع فاتورة — تم تأكيد الدفع',
          `إيصال دفع فاتورة\n\nرقم الفاتورة: ${pr.invoiceId}\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/payment-requests/:id/reject
  app.post("/api/admin/payment-requests/:id/reject", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        db.prepare("UPDATE payment_requests SET status='rejected', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || 'تم الرفض', timestamp, id);

        if (pr.type === 'invoice_payment') {
          db.prepare("UPDATE invoices SET status='unpaid', paidVia=NULL WHERE id=?").run(pr.invoiceId);
          sendNotification(pr.userId, '❌ تم رفض تأكيد الدفع', `تم رفض إثبات ��لدفع للفاتورة #${pr.invoiceId}. السبب: ${adminNote || 'مراجعة البيانات'}. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.`, 'error');
        } else {
          sendNotification(pr.userId, '❌ تم رفض طلبك', `للأسف، تم رفض طلب ${pr.type === 'topup' ? 'شحن المحفظة' : 'السحب'} بمبلغ $${Number(pr.amount).toLocaleString()}. السبب: ${adminNote || 'مراجعة البيانات'}.`, 'error');
        }
      })();

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: WALLET STATS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/wallet-stats", requireAdmin, (_req, res) => {
    try {
      const totalDeposited = (db.prepare("SELECT SUM(totalDeposited) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalBalance = (db.prepare("SELECT SUM(balance) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalSpent = (db.prepare("SELECT SUM(totalSpent) as v FROM buyer_wallets").get() as any)?.v || 0;
      const pendingTopups = (db.prepare("SELECT COUNT(*) as c FROM payment_requests WHERE status='pending' AND type='topup'").get() as any)?.c || 0;
      const pendingInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='unpaid'").get() as any)?.v || 0;
      res.json({ totalDeposited, totalBalance, totalSpent, pendingTopups, pendingInvoices });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: BRANCHES & CONFIG
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/branches", requireAdmin, (req, res) => {
    try {
      const branches: any[] = db.prepare("SELECT * FROM branch_configs").all();
      const branchesWithStats = branches.map((branch: any) => {
        const userCount: any = db.prepare("SELECT COUNT(*) as count FROM users WHERE country = ? OR country = ?").get(branch.id, branch.name) as any;
        const carCount: any = db.prepare("SELECT COUNT(*) as count FROM cars WHERE location LIKE ?").get(`%${branch.name}%`) as any;
        return {
          ...branch,
          userCount: userCount.count,
          carCount: carCount.count
        };
      });
      res.json(branchesWithStats);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  app.post("/api/admin/config", requireAdmin, (req, res) => {
    const { id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone } = req.body;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO branch_configs (id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Failed to update config" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: OFFICES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/offices", requireAdmin, (req, res) => {
    try {
      const offices: any[] = db.prepare(`
        SELECT o.*, b.name as branchName,
               (SELECT COUNT(*) FROM users WHERE office = o.name) AS userCount
        FROM offices o
        LEFT JOIN branch_configs b ON o.branchId = b.id
      `).all();
      res.json(offices);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch offices" });
    }
  });

  app.post("/api/admin/offices", requireAdmin, (req, res) => {
    const { id, name, branchId, manager, status } = req.body;
    const officeId = id || `off-${Date.now()}`;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO offices (id, name, branchId, manager, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(officeId, name, branchId || 'main', manager || '', status || 'active');
      res.json({ success: true, id: officeId });
    } catch (e) {
      res.status(400).json({ error: "Failed to save office" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: CAR DELETE & OFFER MARKET
  // ══════════════════════════════════════════════════════════════

  app.delete("/api/cars/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM cars WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete car" });
    }
  });

  app.get("/api/admin/offer-market-cars", requireAdmin, (req, res) => {
    // [bidder-display] Join users to expose who placed the offer + their
    // eligibility (KYC, deposit, buyingPower, biddingEnabled). The marketplace
    // view (case 'offer_market' in AdminDashboard) needs these fields to
    // render the bidder column. Without the JOIN the UI would just show
    // "currentBid" with no idea who's bidding.
    try {
      const cars: any[] = db.prepare(`
        SELECT c.*,
               c.currentBid AS highestOffer,
               u.id          AS bidderId,
               u.firstName   AS bidderFirstName,
               u.lastName    AS bidderLastName,
               u.email       AS bidderEmail,
               u.phone       AS bidderPhone,
               u.country     AS bidderCountry,
               u.kycStatus   AS bidderKycStatus,
               u.status      AS bidderStatus,
               u.deposit     AS bidderDeposit,
               u.buyingPower AS bidderBuyingPower,
               u.biddingEnabled AS bidderBiddingEnabled,
               u.joinDate    AS bidderJoinDate
          FROM cars c
          LEFT JOIN users u ON c.winnerId = u.id
         WHERE c.status = 'offer_market'
      `).all();
      res.json(cars.map((car: any) => {
        const bidderDetails = car.bidderId ? {
          id: car.bidderId,
          firstName: car.bidderFirstName,
          lastName: car.bidderLastName,
          email: car.bidderEmail,
          phone: car.bidderPhone,
          country: car.bidderCountry,
          kycStatus: car.bidderKycStatus,
          status: car.bidderStatus,
          deposit: Number(car.bidderDeposit) || 0,
          buyingPower: Number(car.bidderBuyingPower) || 0,
          biddingEnabled: Number(car.bidderBiddingEnabled) === 1,
          joinDate: car.bidderJoinDate,
        } : null;
        let imagesArr: any[] = [];
        try { imagesArr = car.images ? JSON.parse(car.images) : []; } catch { imagesArr = []; }
        return {
          ...car,
          highestOffer: Number(car.highestOffer) || 0,
          bidderDetails,
          images: Array.isArray(imagesArr) ? imagesArr : [],
        };
      }));
    } catch (e: any) {
      console.error('[offer-market-cars] failed:', e?.message);
      res.status(500).json({ error: "Failed to fetch offer market cars" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: MARKETING
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/mailing-list", requireAdmin, (req, res) => {
    try {
      const list = db.prepare("SELECT id, firstName, lastName, email FROM users WHERE role IN ('buyer', 'user', 'user_pending', 'seller')").all();
      res.json(list);
    } catch (e) { res.status(500).json({ error: "Failed to fetch mailing list" }); }
  });

  app.get("/api/admin/marketing-cars", requireAdmin, (req, res) => {
    try {
      const list = db.prepare("SELECT * FROM cars WHERE status IN ('live', 'active', 'upcoming', 'offer_market', 'ultimo') OR isBuyNow = 1").all();
      res.json(list.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) { res.status(500).json({ error: "Failed to fetch marketing cars" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: NOTIFICATION TEMPLATES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/notification-templates", requireAdmin, (req, res) => {
    try {
      const templates = db.prepare("SELECT * FROM notification_templates ORDER BY updatedAt DESC").all();
      res.json(templates);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notification templates" });
    }
  });

  app.put("/api/admin/notification-templates/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { subject, body_html, body_whatsapp } = req.body;
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE notification_templates
        SET subject = ?, body_html = ?, body_whatsapp = ?, updatedAt = ?
        WHERE id = ?
      `).run(subject, body_html, body_whatsapp, now, id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: USER MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  app.get("/api/users", requireAdmin, (req, res) => {
    try {
      // [hide-rejected] By default the user-management table excludes
      // rejected (kycStatus='rejected') and banned users — those belong in
      // the dedicated "مرفوضة" tab of the KYC Center, not the main roster.
      // Pass ?includeRejected=1 to get everyone (used by exports / audits).
      const includeRejected = String((req.query as any)?.includeRejected || '') === '1';
      const where = includeRejected
        ? ''
        : `WHERE COALESCE(kycStatus, '') != 'rejected'
             AND COALESCE(status, '') NOT IN ('banned', 'rejected')`;

      // [bidding-toggle] Include biddingEnabled + lastLogin so the admin
      // table can render the bidding toggle column and the lifecycle badges
      // (registered → KYC approved → bidding enabled).
      const users: any[] = db.prepare(`
        SELECT id, firstName, lastName, email, phone, role, status, kycStatus,
               deposit, buyingPower, commission, manager, office, companyName,
               country, address1, address2, joinDate, lastLogin,
               biddingEnabled, biddingEnabledAt, biddingEnabledBy
          FROM users
         ${where}
         ORDER BY joinDate DESC
      `).all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/pending-users", requireAdmin, (req, res) => {
    try {
      const users: any[] = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE status = 'pending_approval'").all();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب المستخدمين المعلقين" });
    }
  });

  app.post("/api/admin/approve-user/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending_approval'").run(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (user) {
        sendInternalMessage('admin-1', id,
          '✅ تم تفعيل حسابك بنجاح!',
          `تهانينا ${user.firstName}!\n\nتم الموافقة على حسابك وتفعيله بنجاح. يمكنك الآن:\n\n1. 💰 إيداع العربون لتفعيل القوة الشرائية\n2. 🔍 تصفح السيارات المتاحة\n3. 🔨 المشاركة في المزادات المباشرة\n\nتذكر: القوة الشرائية = العربون × 10\n\nنتمنى لك تجربة مزايدة ناجحة!\nفريق ماكينا أوتو برو 🚗`
        );
        io.to(`user_${id}`).emit("account_approved", { userId: id, status: 'active' });
      }
      res.json({ success: true, message: "تم تفعيل المستخدم بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل تفعيل المستخدم" });
    }
  });

  // [bidding-toggle] Admin flips a user's biddingEnabled flag after
  // verifying deposit + KYC + identity. This is the SINGLE explicit
  // gate for bidding — replaces the old "approve user" tangle.
  app.post("/api/admin/users/:id/toggle-bidding", requireAdmin, (req: any, res) => {
    const { id } = req.params;
    const { enabled } = req.body || {};
    const adminId = req.user?.id || 'admin';
    const flag = enabled ? 1 : 0;
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      if (String(user.role || '').toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'لا حاجة لتفعيل المزايدة لحسابات الإدارة' });
      }
      const now = new Date().toISOString();
      db.prepare("UPDATE users SET biddingEnabled = ?, biddingEnabledAt = ?, biddingEnabledBy = ? WHERE id = ?")
        .run(flag, flag ? now : null, flag ? adminId : null, id);

      // [buying-power-multiplier] Defense in depth: whenever we ACTIVATE
      // bidding, make sure the 10x buying power is in place. This catches
      // any user whose deposit was set via a path that didn't update
      // buyingPower (legacy data, manual DB edits, the PUT-with-stale-
      // buyingPower bug pre-fix).
      if (flag) {
        const dep = Number(user.deposit || 0);
        const expectedBP = dep * 10;
        if (dep > 0 && Number(user.buyingPower || 0) !== expectedBP) {
          db.prepare("UPDATE users SET buyingPower = ? WHERE id = ?").run(expectedBP, id);
        }
      }

      if (flag) {
        try {
          sendInternalMessage('admin-1', id,
            '⚡ تم تفعيل صلاحية المزايدة!',
            `تهانينا ${user.firstName || ''}!\n\nتم تفعيل حسابك للمزايدة. يمكنك الآن:\n\n` +
            `• تقديم عروض على السيارات في سوق العروض\n` +
            `• المشاركة في المزادات الحية\n` +
            `• استخدام Buy Now للسيارات المتاحة\n\n` +
            `بالتوفيق! 🏁\nفريق AutoPro Libya 🚗`
          );
          io.to(`user_${id}`).emit('bidding_enabled', { userId: id });
        } catch {}
      } else {
        try {
          sendInternalMessage('admin-1', id,
            '⏸️ تم إيقاف صلاحية المزايدة مؤقتاً',
            `تم إيقاف صلاحية المزايدة في حسابك. للاستفسار راسل الإدارة.`
          );
          io.to(`user_${id}`).emit('bidding_disabled', { userId: id });
        } catch {}
      }
      res.json({ success: true, biddingEnabled: flag });
    } catch (e: any) {
      res.status(500).json({ error: 'فشل تحديث صلاحية المزايدة: ' + e?.message });
    }
  });

  app.post("/api/admin/reject-user/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (user) {
        sendInternalMessage('admin-1', id,
          '❌ لم تتم الموافقة على حسابك',
          `عزيزي ${user.firstName}،\n\nنأسف لإبلاغك بأنه لم تتم الموافقة على طلب انضمامك.\n\nالسبب: ${reason || 'لم يتم تحديد سبب'}\n\nيمكنك التواصل مع فريق الدعم لمزيد من التوضيح.\n\nفريق ماكينا أوتو برو 🚗`
        );
        io.to(`user_${id}`).emit("account_rejected", { userId: id, reason });
      }
      res.json({ success: true, message: "تم رفض المستخدم" });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض المستخدم" });
    }
  });

  // [user-delete] Shared handler registered on BOTH paths because the admin
  // UI calls DELETE /api/admin/users/:id while other callers use
  // DELETE /api/users/:id. Previously only /api/users/:id existed, so the
  // dashboard's delete button hit a non-existent route → 404 → the generic
  // "فشل في حذف المستخدم" toast. That's the real reason deletes "never
  // worked" despite earlier fixes.
  const deleteUserHandler = (req: any, res: any) => {
    const { id } = req.params;
    const adminId = req.user?.id || 'admin';
    try {
      const user: any = db.prepare("SELECT id, email, phone, role FROM users WHERE id = ?").get(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      if (String(user.role || '').toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'لا يمكن حذف حساب إداري' });
      }

      // [user-delete] Blocklist the email + phone FIRST so the person can't
      // simply re-register with the same details after deletion.
      const now = new Date().toISOString();
      try {
        db.prepare(`INSERT INTO blocked_identities (id, email, phone, reason, blockedBy, blockedAt)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
               (user.email || '').toLowerCase(), user.phone || '',
               'admin delete', adminId, now);
      } catch (e: any) {
        console.error('[user-delete] blocklist insert failed:', e?.message);
      }

      // [user-delete] FK-safe removal. The users table is referenced by many
      // tables (bids, cars.sellerId/winnerId, transactions, …). A bare DELETE
      // fails on those constraints. Toggle FK enforcement off for this single
      // delete (better-sqlite3 is one connection, and we're not inside an open
      // transaction here, so the PRAGMA takes effect). Null out the car
      // ownership references first so auction history rows don't point at a
      // ghost id.
      db.pragma('foreign_keys = OFF');
      try {
        try { db.prepare("UPDATE cars SET sellerId = NULL WHERE sellerId = ?").run(id); } catch {}
        try { db.prepare("UPDATE cars SET winnerId = NULL WHERE winnerId = ?").run(id); } catch {}
        db.prepare("DELETE FROM users WHERE id = ?").run(id);
      } finally {
        db.pragma('foreign_keys = ON');
      }

      try { io.emit('user_deleted', { id }); } catch {}
      res.json({ success: true });
    } catch (err: any) {
      console.error('[user-delete] failed:', err?.message);
      res.status(500).json({ error: "فشل في حذف المستخدم: " + (err?.message || '') });
    }
  };
  app.delete("/api/users/:id", requireAdmin, deleteUserHandler);
  app.delete("/api/admin/users/:id", requireAdmin, deleteUserHandler);

  // [user-ban] Soft alternative to delete — keeps the account row (and its
  // auction history) but blocks the person from logging in or re-registering.
  app.post("/api/users/:id/ban", requireAdmin, (req: any, res) => {
    const { id } = req.params;
    const adminId = req.user?.id || 'admin';
    const reason = String(req.body?.reason || 'admin ban');
    try {
      const user: any = db.prepare("SELECT id, email, phone, role FROM users WHERE id = ?").get(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      if (String(user.role || '').toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'لا يمكن حظر حساب إداري' });
      }
      const now = new Date().toISOString();
      db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(id);
      try {
        db.prepare(`INSERT INTO blocked_identities (id, email, phone, reason, blockedBy, blockedAt)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
               (user.email || '').toLowerCase(), user.phone || '', reason, adminId, now);
      } catch (e: any) {
        console.error('[user-ban] blocklist insert failed:', e?.message);
      }
      try { io.to(`user_${id}`).emit('account_banned', { userId: id }); } catch {}
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'فشل حظر المستخدم: ' + (err?.message || '') });
    }
  });

  app.put("/api/users/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
      // Only update fields that were actually sent
      const current: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!current) return res.status(404).json({ error: "المستخدم غير موجود" });

      const fields = ['firstName', 'lastName', 'email', 'phone', 'role', 'status',
        'deposit', 'buyingPower', 'commission', 'manager', 'office', 'companyName',
        'country', 'address1', 'address2', 'kycStatus'];

      const setClauses: string[] = [];
      const values: any[] = [];

      for (const field of fields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      // [buying-power-multiplier] If the admin changed `deposit`, ALWAYS
      // recompute buyingPower = deposit * 10 and drop any buyingPower the
      // client sent. The UI ships the entire selectedUser object (including
      // the stale buyingPower from before the edit), so the old guard
      // `updates.buyingPower === undefined` was never true and the rule
      // silently broke: deposit=1000 left buyingPower=0 and the user
      // couldn't bid.
      if (updates.deposit !== undefined
          && Number(updates.deposit) !== Number(current.deposit || 0)) {
        // Strip any explicit buyingPower clause that the loop above added,
        // then append the recomputed value.
        const bpIdx = setClauses.findIndex(c => c.startsWith('buyingPower'));
        if (bpIdx >= 0) {
          setClauses.splice(bpIdx, 1);
          values.splice(bpIdx, 1);
        }
        setClauses.push('buyingPower = ?');
        values.push(Number(updates.deposit) * 10);
      }

      if (setClauses.length === 0) return res.json({ success: true, message: "لا توجد تغييرات" });

      values.push(id);
      db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: CAR REVIEW
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/pending-cars", requireAdmin, (req, res) => {
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب السيارات المعلقة" });
    }
  });

  app.post("/api/admin/approve-car/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE cars SET status = 'upcoming', auctionEndDate = NULL, auctionStartTime = NULL WHERE id = ? AND status = 'pending_approval'").run(id);
      io.emit("car_approved", { carId: id });

      // Notify seller that their car was approved
      const approvedCar: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (approvedCar?.sellerId) {
        sendNotification(approvedCar.sellerId,
          'تم اعتماد سيارتك!',
          `تمت الموافقة على سيارتك ${approvedCar.make} ${approvedCar.model} (${approvedCar.year || ''}) وهي الآن في قائمة المزادات القادمة.`,
          'success', `/dashboard/seller?view=inventory`
        );
      }

      res.json({ success: true, message: "تم اعتماد السيارة بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل اعتماد السيارة" });
    }
  });

  app.post("/api/admin/reject-car/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    try {
      db.prepare("UPDATE cars SET status = 'rejected' WHERE id = ?").run(id);
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (car?.sellerId) {
        sendInternalMessage('admin-1', car.sellerId, '❌ تم رفض سيارتك',
          `عذراً، تم رفض سيارتك ${car.make} ${car.model} (${car.year || ''}).${reason ? '\nالسبب: ' + reason : ''}`,
          'general');
        sendNotification(car.sellerId, '❌ تم رفض سيارتك',
          `تم رفض سيارتك ${car.make} ${car.model}. ${reason || ''}`, 'error');
      }
      res.json({ success: true, message: "تم رفض السيارة" });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض السيارة" });
    }
  });

  // POST /api/admin/cars/:id/request-edit — request seller to edit their car
  app.post("/api/admin/cars/:id/request-edit", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
      if (car.sellerId) {
        sendInternalMessage('admin-1', car.sellerId, '📝 مطلوب تعديل على سيارتك',
          `يرجى تعديل بيانات سيارتك ${car.make} ${car.model} (${car.year || ''}).\n\nملاحظات الإدارة:\n${notes || 'لا توجد تفاصيل'}`,
          'general');
        sendNotification(car.sellerId, '📝 مطلوب تعديل على سيارتك',
          `يرجى مراجعة وتعديل بيانات سيارتك ${car.make} ${car.model}. راجع رسائلك للتفاصيل.`, 'warning',
          `/dashboard/seller?view=inventory`);
      }
      res.json({ success: true, message: "تم إرسال طلب التعديل للبائع" });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال طلب التعديل" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SHIPMENTS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/shipments", requireAdmin, (req, res) => {
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber,
               u.firstName, u.lastName, u.email, u.phone
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        JOIN users u ON s.userId = u.id
        GROUP BY s.carId
        ORDER BY s.createdAt DESC
      `).all();
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الشحنات" });
    }
  });

  app.post("/api/admin/shipments/:id/update-status", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status, trackingNotes, currentLocation, estimatedDelivery, trackingNumber } = req.body;
    try {
      const now = new Date().toISOString();
      db.prepare(`UPDATE shipments SET status = ?, trackingNotes = ?, currentLocation = ?, estimatedDelivery = ?, trackingNumber = ?, updatedAt = ? WHERE id = ?`)
        .run(status, trackingNotes || '', currentLocation || '', estimatedDelivery || '', trackingNumber || '', now, id);

      const shipment: any = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id);
      if (shipment) {
        const statusLabels: Record<string, string> = {
          'awaiting_payment': 'بانتظار الدفع',
          'paid': 'تم الدفع',
          'shipping_requested': 'طلب الشحن 🚚',
          'in_transit': 'قيد النقل',
          'in_warehouse': 'في المستودع',
          'in_shipping': 'جاري الشحن',
          'customs': 'التخليص الجمركي',
          'delivered': 'تم التوصيل'
        };
        const car: any = db.prepare("SELECT make, model, year FROM cars WHERE id = ?").get(shipment.carId);
        const itemInfo = car ? `${car.year} ${car.make} ${car.model}` : `سيارة #${shipment.carId}`;
        const shippingLink = `https://www.autopro.ac/dashboard/shipments`;
        const carLink = `https://www.autopro.ac/cars/${shipment.carId}`;

        const statusMsg = `${trackingNumber ? `كود التتبع: ${trackingNumber} | ` : ''}${currentLocation ? `الموقع: ${currentLocation} | ` : ''}${estimatedDelivery ? `تاريخ الوصول: ${new Date(estimatedDelivery).toLocaleDateString('ar-EG')}` : ''} ${trackingNotes ? ` | ملاحظات: ${trackingNotes}` : ''}`;

        sendNotification(shipment.userId, statusLabels[status] || status, statusMsg, 'info', 'shipping_status_update', {
          shippingLink,
          carLink,
          itemInfo
        });

        sendInternalMessage('admin-1', shipment.userId,
          `📦 تحديث حالة الشحن: ${statusLabels[status] || status}`,
          `تم تحديث حالة شحن سيارتك إلى: ${statusLabels[status] || status}\n${trackingNumber ? `كود التتبع: ${trackingNumber}\n` : ''}${currentLocation ? `الموقع الحالي: ${currentLocation}\n` : ''}${estimatedDelivery ? `التاريخ المتوقع للوصول: ${new Date(estimatedDelivery).toLocaleDateString('ar-EG')}\n` : ''}${trackingNotes ? `ملاحظات: ${trackingNotes}` : ''}`
        );
        io.to(`user_${shipment.userId}`).emit("shipment_updated", { ...shipment, status });

        // If status is in_warehouse, activate shipping invoice
        if (status === 'in_warehouse') {
          db.prepare("UPDATE invoices SET status = 'unpaid' WHERE carId = ? AND userId = ? AND type = 'shipping' AND status = 'pending'")
            .run(shipment.carId, shipment.userId);
        }
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث حالة الشحن" });
    }
  });

  app.post("/api/admin/shipments/:id/tracking", requireAdmin, (req, res) => {
    try {
      const { trackingNumber, shippingLine, containerNumber, eta } = req.body;
      try { db.exec("ALTER TABLE shipments ADD COLUMN trackingNumber TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN shippingLine TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN containerNumber TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN eta TEXT"); } catch (_) { }
      db.prepare("UPDATE shipments SET trackingNumber = ?, shippingLine = ?, containerNumber = ?, eta = ? WHERE id = ?")
        .run(trackingNumber || null, shippingLine || null, containerNumber || null, eta || null, req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: TRANSACTIONS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/transactions", requireAdmin, (req, res) => {
    const { status, type } = req.query;
    let query = "SELECT t.*, u.firstName, u.lastName FROM transactions t JOIN users u ON t.userId = u.id";
    const params: any[] = [];

    if (status || type) {
      query += " WHERE";
      if (status) {
        query += " t.status = ?";
        params.push(status);
      }
      if (type) {
        if (status) query += " AND";
        query += " t.type = ?";
        params.push(type);
      }
    }

    query += " ORDER BY t.timestamp DESC";

    try {
      const transactions: any[] = db.prepare(query).all(...params);
      res.json(transactions);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAdmin, (req, res) => {
    const { userId, amount, type, status } = req.body;
    const id = Date.now().toString();
    try {
      db.prepare("INSERT INTO transactions (id, userId, amount, type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, userId, amount, type, status || 'completed', new Date().toISOString()
      );
      // Update user buying power if it's a deposit
      if (type === 'deposit') {
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?").run(amount, amount * 10, userId);
      }
      res.json({ id, userId, amount, type });
    } catch (e) {
      res.status(400).json({ error: "Transaction failed" });
    }
  });

  app.get("/api/admin/all-transactions", requireAdmin, (req, res) => {
    try {
      const txs = db.prepare(`
        SELECT t.*, u.firstName, u.lastName
        FROM transactions t
        LEFT JOIN users u ON t.userId = u.id
        ORDER BY t.timestamp DESC
        `).all();
      res.json(txs);
    } catch (e) { res.status(500).json({ error: "Transactions fetch error" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: WITHDRAWAL REQUESTS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/withdrawal-requests", requireAdmin, (_req, res) => {
    try {
      const requests: any[] = db.prepare(`
        SELECT wr.*, u.firstName, u.lastName, u.email, u.iban
        FROM withdrawal_requests wr
        JOIN users u ON wr.sellerId = u.id
        ORDER BY wr.requestedAt DESC
      `).all();
      res.json(requests);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب طلبات السحب" });
    }
  });

  app.post("/api/admin/withdrawal-requests/:id/approve", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { note } = req.body;
    try {
      const wr: any = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(id) as any;
      if (!wr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.prepare("UPDATE withdrawal_requests SET status = 'completed', processedAt = ?, adminNote = ? WHERE id = ?")
        .run(new Date().toISOString(), note || '', id);

      db.prepare("UPDATE seller_wallets SET totalWithdrawn = totalWithdrawn + ?, lastUpdated = ? WHERE sellerId = ?")
        .run(wr.amount, new Date().toISOString(), wr.sellerId);

      // Log as seller transaction
      db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, commission, netAmount, status, description, timestamp, processedAt)
        VALUES (?, ?, 'withdrawal', ?, 0, ?, 'completed', 'تحويل بنكي مكتمل', ?, ?)`)
        .run(`stx-wd-${Date.now()}`, wr.sellerId, wr.amount, wr.amount, new Date().toISOString(), new Date().toISOString());

      sendNotification(wr.sellerId, '✅ تم تحويل المبلغ', `تم قبول طلب السحب وتحويل $${wr.amount.toLocaleString()} لحسابك البنكي.`, 'success');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل الموافقة على السحب" });
    }
  });

  app.post("/api/admin/withdrawal-requests/:id/reject", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      const wr: any = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(id) as any;
      if (!wr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.prepare("UPDATE withdrawal_requests SET status = 'rejected', processedAt = ?, adminNote = ? WHERE id = ?")
        .run(new Date().toISOString(), reason || '', id);

      // Refund: return amount to available balance
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance + ?, lastUpdated = ? WHERE sellerId = ?")
        .run(wr.amount, new Date().toISOString(), wr.sellerId);

      sendNotification(wr.sellerId, '❌ تم رفض طلب السحب', `للأسف تم رفض طلب السحب. السبب: ${reason || 'لم يتم توضيح السبب'}. تم إعادة المبلغ لرصيدك.`, 'alert');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض طلب السحب" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: KYC
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/kyc-pending", requireAdmin, (req, res) => {
    // [kyc-show-all] Return every user awaiting any kind of admin review:
    //   - kycStatus != 'approved'  (KYC not yet verified) OR
    //   - status = 'pending_approval' (account itself not yet activated)
    // The previous filter showed only kycStatus != 'approved', which hid
    // 53 stuck users whose KYC was approved long ago but whose account
    // status was never flipped to 'active'.
    //
    // Also `COALESCE(u.role, '') != 'admin'` — bare `u.role != 'admin'`
    // evaluates to NULL (≈ false) for users with NULL role, which would
    // silently drop them from the list.
    //
    // [kyc-rejected-tab] Optional ?filter= query param:
    //   pending   → kycStatus IN ('pending', NULL, '')   (default)
    //   rejected  → kycStatus = 'rejected'               (separate tab)
    //   all       → everything except approved+active    (legacy behavior)
    try {
      const filter = String(req.query?.filter || 'pending').toLowerCase();

      let where: string;
      if (filter === 'rejected') {
        where = `COALESCE(u.kycStatus, 'pending') = 'rejected'`;
      } else if (filter === 'all') {
        // Everyone not yet approved — but still NEVER show rejected here;
        // rejected has its own tab. (A rejected user keeps
        // status='pending_approval', so without the explicit exclusion the
        // OR clause below would drag them back in.)
        where = `(COALESCE(u.kycStatus, 'pending') != 'rejected')
                 AND (COALESCE(u.kycStatus, 'pending') != 'approved'
                      OR COALESCE(u.status, '') = 'pending_approval')`;
      } else {
        // default: pending only. MUST exclude rejected unconditionally —
        // the previous filter used only an OR on status='pending_approval',
        // and since rejecting a KYC sets kycStatus='rejected' WITHOUT
        // changing status (it stays 'pending_approval'), rejected users
        // leaked back into the "بانتظار المراجعة" tab. The leading
        // `kycStatus != 'rejected'` AND-clause is the fix.
        where = `(COALESCE(u.kycStatus, 'pending') != 'rejected')
                 AND (COALESCE(u.kycStatus, 'pending') NOT IN ('approved')
                      OR COALESCE(u.status, '') = 'pending_approval')`;
      }

      const users: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.role,
               u.kycStatus, u.status, u.joinDate,
               (SELECT COUNT(*) FROM kyc_documents WHERE userId = u.id) AS docCount
          FROM users u
         WHERE ${where}
           AND COALESCE(u.role, '') != 'admin'
         ORDER BY
           CASE WHEN (SELECT COUNT(*) FROM kyc_documents WHERE userId = u.id) > 0 THEN 0 ELSE 1 END,
           u.joinDate DESC
      `).all();

      const result = users.map((u: any) => ({
        ...u,
        documents: db.prepare("SELECT * FROM kyc_documents WHERE userId = ? ORDER BY uploadedAt DESC").all(u.id)
      }));

      res.json(result);
    } catch (e: any) {
      console.error('[kyc-pending] query failed:', e?.message);
      res.status(500).json({ error: "فشل جلب طلبات KYC" });
    }
  });

  // [kyc-rejected-tab] Aggregated counts for the tab badges in the UI.
  // Cheap query — one row, three COUNTs, no JOIN — runs as often as the
  // panel re-renders.
  app.get("/api/admin/kyc-counts", requireAdmin, (_req, res) => {
    try {
      const counts: any = db.prepare(`
        SELECT
          SUM(CASE WHEN COALESCE(kycStatus,'pending') NOT IN ('approved','rejected')
                    OR COALESCE(status,'') = 'pending_approval'
                   THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN COALESCE(kycStatus,'pending') = 'rejected'
                   THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN COALESCE(kycStatus,'pending') = 'approved'
                   THEN 1 ELSE 0 END) AS approved
        FROM users
        WHERE COALESCE(role,'') != 'admin'
      `).get();
      res.json({
        pending: counts?.pending || 0,
        rejected: counts?.rejected || 0,
        approved: counts?.approved || 0,
      });
    } catch (e: any) {
      console.error('[kyc-counts] failed:', e?.message);
      res.status(500).json({ error: 'فشل جلب الإحصاءات' });
    }
  });

  app.post("/api/admin/kyc/:userId/approve", requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { note } = req.body;
    try {
      db.prepare("UPDATE users SET kycStatus = 'approved' WHERE id = ?").run(userId);
      // [kyc-unblock] If the user is still 'pending_approval', flip them
      // to 'active' so they can use the platform. This DOES NOT enable
      // bidding — biddingEnabled is a separate explicit toggle the admin
      // controls from the user-management view after deposit verification.
      // We only touch pending_approval; banned/suspended/rejected stay as-is.
      db.prepare(`UPDATE users
                     SET status = 'active'
                   WHERE id = ?
                     AND COALESCE(status, '') IN ('', 'pending_approval')`).run(userId);
      db.prepare("UPDATE kyc_documents SET status = 'approved', reviewedAt = ?, reviewNote = ? WHERE userId = ? AND status = 'pending'")
        .run(new Date().toISOString(), note || '', userId);

      sendNotification(userId, '✅ تم توثيق حسابك (KYC)', 'تمت مراجعة وثائقك وتوثيق حسابك. لتفعيل المزايدة يرجى التواصل مع الإدارة لإكمال خطوات العربون.', 'success');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل الموافقة على KYC" });
    }
  });

  app.post("/api/admin/kyc/:userId/reject", requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    try {
      db.prepare("UPDATE users SET kycStatus = 'rejected' WHERE id = ?").run(userId);
      db.prepare("UPDATE kyc_documents SET status = 'rejected', reviewedAt = ?, reviewNote = ? WHERE userId = ? AND status = 'pending'")
        .run(new Date().toISOString(), reason || '', userId);

      sendNotification(userId, '❌ تم رفض وثائق التوثيق', `للأسف تم رفض وثائقك. السبب: ${reason || 'لم يتم توضيح السبب'}. يرجى رفع وثائق جديدة.`, 'alert');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض KYC" });
    }
  });

  app.get("/api/admin/kyc-documents/:userId", requireAdmin, (req, res) => {
    try {
      const docs: any[] = db.prepare("SELECT * FROM kyc_documents WHERE userId = ? ORDER BY uploadedAt DESC").all(req.params.userId);
      res.json(docs);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الوثائق" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: MESSAGES & NOTIFICATIONS (all)
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/all-messages", requireAdmin, (req, res) => {
    try {
      const msgs = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 500").all();
      res.json(msgs);
    } catch (e) { res.status(500).json({ error: "Failed to fetch messages" }); }
  });

  app.get("/api/admin/all-notifications", requireAdmin, (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 500").all();
      res.json(notes);
    } catch (e) { res.status(500).json({ error: "Failed to fetch notifications" }); }
  });

  app.get("/api/messages", requireAdmin, (req, res) => {
    try {
      const messages: any[] = db.prepare(`
        SELECT m.*,
        u1.firstName as senderFirstName, u1.lastName as senderLastName,
        u2.firstName as receiverFirstName, u2.lastName as receiverLastName
        FROM messages m
        JOIN users u1 ON m.senderId = u1.id
        JOIN users u2 ON m.receiverId = u2.id
        ORDER BY m.timestamp DESC
  `).all();
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SYSTEM SETTINGS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/settings", requireAdmin, (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM system_settings").all();
      res.json(Array.isArray(settings) ? settings : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array instead of error object to prevent frontend crash
    }
  });

  app.post("/api/admin/settings/update", requireAdmin, (req, res) => {
    const { key, value } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)")
        .run(key, value, new Date().toISOString());
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update setting" }); }
  });

  // ── Welcome Message Settings ──
  app.get("/api/admin/welcome-settings", requireAdmin, (_req, res) => {
    try {
      const keys = ['welcome_message_subject', 'welcome_message_content', 'deposit_reminder_text', 'company_address', 'company_phones', 'company_google_maps'];
      const settings: Record<string, string> = {};
      keys.forEach(key => {
        const row: any = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
        settings[key] = row?.value || '';
      });
      res.json(settings);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/welcome-settings", requireAdmin, (req, res) => {
    try {
      const allowed = ['welcome_message_subject', 'welcome_message_content', 'deposit_reminder_text', 'company_address', 'company_phones', 'company_google_maps'];
      const now = new Date().toISOString();
      const stmt = db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)");
      for (const [key, value] of Object.entries(req.body)) {
        if (allowed.includes(key)) {
          stmt.run(key, String(value), now);
        }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: EXTERNAL NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/external-notifications", requireAdmin, (req, res) => {
    try {
      const logs = db.prepare("SELECT * FROM external_notifications ORDER BY timestamp DESC LIMIT 100").all();
      res.json(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array
    }
  });

  app.post("/api/admin/external-notifications/test", requireAdmin, async (req, res) => {
    const { email, phone } = req.body;
    const results: any[] = [];

    // 1. Test Email
    if (email) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"AUTOPRO AUCTIONS" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "🔍 Test Notification - Auto Pro Platform",
          html: `<div dir="rtl" style="font-family: Arial; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                  <h2 style="color: #f97316;">AUTOPRO - Test Message</h2>
                  <p>This is a test email sent from your platform admin dashboard.</p>
                  <p>Status: <b>SMTP connection working correctly</b></p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                  <small style="color: #64748b;">Timestamp: ${new Date().toLocaleString('ar-LY')}</small>
                 </div>`
        });

        db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(`test-em-${Date.now()}`, 'email', email, 'Test Email Dispatch', 'Test email from Admin', 'sent', new Date().toISOString());
        results.push({ type: 'email', status: 'success' });
      } catch (err: any) {
        db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(`test-em-err-${Date.now()}`, 'email', email, 'Test Email Dispatch', 'Error: ' + err.message, 'error', new Date().toISOString());
        results.push({ type: 'email', status: 'error', message: err.message });
      }
    }

    // 2. Test WhatsApp (WasenderAPI)
    if (phone) {
      const token = process.env.WASENDER_TOKEN;

      if (!token) {
        results.push({ type: 'whatsapp', status: 'error', message: 'WASENDER_TOKEN missing in .env' });
      } else {
        try {
          // Strip leading zeros or + for WasenderAPI
          const finalPhone = phone.replace(/[^0-9]/g, '').replace(/^00/, '').replace(/^0/, '');

          const waRes = await fetch(`https://wasenderapi.com/api/send-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              to: finalPhone,
              text: `🚀 *AUTOPRO Platform Test*\n\nهذه رسالة تجريبية لتأكيد عمل نظام الواتساب (WasenderAPI) بنجاح.\n\nالوقت: ${new Date().toLocaleString('ar-LY')}`
            })
          });

          const waData: any = await waRes.json();
          if (waRes.ok) {
            db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .run(`test-wa-${Date.now()}`, 'whatsapp', phone, 'Test WhatsApp Dispatch', 'Test WhatsApp from Admin', 'sent', new Date().toISOString());
            results.push({ type: 'whatsapp', status: 'success' });
          } else {
            throw new Error(waData.message || 'Failed to dispatch WhatsApp');
          }
        } catch (err: any) {
          console.error('WhatsApp Test Failed:', err);
          db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(`test-wa-err-${Date.now()}`, 'whatsapp', phone, 'Test WhatsApp Dispatch', 'Error: ' + err.message, 'error', new Date().toISOString());
          results.push({ type: 'whatsapp', status: 'error', message: err.message });
        }
      }
    }

    res.json({
      results,
      success: results.length > 0 && results.every(r => r.status === 'success'),
      anySuccess: results.some(r => r.status === 'success')
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: CAMPAIGN
  // ══════════════════════════════════════════════════════════════

  app.post('/api/admin/send-campaign', requireAdmin, async (req, res) => {
    try {
      const { carId, type } = req.body;
      const stmt = db.prepare('SELECT * FROM cars WHERE id = ?');
      const car = stmt.get(carId) as any;
      if (!car) return res.status(404).json({ error: 'Car not found' });
      if (typeof car.images === 'string') car.images = JSON.parse(car.images);

      const usersStmt = db.prepare("SELECT * FROM users WHERE status = ? OR role = ?");
      const allUsers = usersStmt.all('active', 'مستخدم');
      const emails = allUsers.map((u: any) => u.email).filter(Boolean);

      let color = '#f97316';
      let title = 'سيارة قادمة في المزاد';
      let action = 'سجل للمزايدة الآن';

      if (type === 'live') {
        color = '#ef4444'; title = 'المزاد بدأ الآن!'; action = 'زايد الآن';
      } else if (type === 'offer_market') {
        color = '#3b82f6'; title = 'فرصة سوق العروض للسيارة الفاخرة'; action = 'قدم عرضك الآن السعر: $' + (car.currentBid || car.reservePrice);
      }

      const htmlTemplate = `
      <div dir="rtl" style="font-family: Arial; padding: 40px 20px; background: #0f172a; color: white;">
        <div style="max-width: 600px; margin: auto; background: #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
          <!-- Header -->
          <div style="padding: 30px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <h1 style="color: ${color}; margin: 0; font-size: 28px;">AUTOPRO AUCTIONS</h1>
            <p style="color: #94a3b8; margin: 10px 0 0;">${title}</p>
          </div>

          <!-- Image -->
          <img src="${car.images[0]}" style="width: 100%; height: 350px; object-fit: cover;" />

          <!-- Body -->
          <div style="padding: 40px 30px;">
            <h2 style="margin: 0 0 10px; font-size: 24px; text-align: center;">${car.make} ${car.model} ${car.year}</h2>
            <p style="color: #94a3b8; text-align: center; margin: 0 0 30px;">${car.trim || ''} - متواجدة في ${car.location}</p>

            <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin-bottom: 30px;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
                <span style="color: #94a3b8;">رقم اللوت (Lot)</span>
                <strong style="font-family: monospace;">${car.lotNumber}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
                <span style="color: #94a3b8;">رقم الهيكل (VIN)</span>
                <strong style="font-family: monospace;">${car.vin}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">السعر / المزايدة الحالية</span>
                <strong style="color: ${color}; font-size: 20px;">$${Number(car.currentBid || car.reservePrice).toLocaleString()}</strong>
              </div>
            </div>

            <a href="https://www.autopro.ac" style="display: block; background: ${color}; color: white; text-align: center; padding: 18px; border-radius: 14px; text-decoration: none; font-weight: bold; font-size: 18px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
              ${action}
            </a>
          </div>

          <!-- Footer -->
          <div style="padding: 20px; text-align: center; background: rgba(0,0,0,0.2);">
            <p style="color: #64748b; font-size: 12px; margin: 0;">هذه الرسالة تم إرسالها من منصة Libya Auto Pro</p>
          </div>
        </div>
      </div>
      `;

      // Process sending emails securely using Nodemailer
      for (const email of emails) {
        transporter.sendMail({
          from: '"AUTOPRO AUCTIONS" <' + process.env.SMTP_USER + '>',
          to: email,
          subject: `🔥 [AUTOPRO] ${title} ${car.make} ${car.model}`,
          html: htmlTemplate
        }).catch((err: any) => console.error('Email failed to send directly:', err));
      }

      res.json({ success: true, count: emails.length });
    } catch (error) {
      console.error('Campaign error:', error);
      res.status(500).json({ error: 'Failed to broadcast campaign' });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: DEPOSIT MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/pending-deposits", requireAdmin, (req, res) => {
    try {
      const deposits: any[] = db.prepare(`
        SELECT t.*, u.firstName, u.lastName, u.email
        FROM transactions t
        JOIN users u ON t.userId = u.id
        WHERE t.type = 'deposit' AND t.status = 'pending'
        `).all();
      res.json(deposits);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch pending deposits" });
    }
  });

  app.post("/api/admin/approve-deposit", requireAdmin, (req, res) => {
    const { transactionId } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as any;
      if (!tx || tx.status !== 'pending') return res.status(404).json({ error: "العملية غير موجودة أو معالجة مسبقاً" });

      // Use a transaction for atomic update
      const update = db.transaction(() => {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(transactionId);
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?")
          .run(tx.amount, tx.amount * 10, tx.userId);
        // Update buyer_wallets
        try {
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(tx.amount), Number(tx.amount), new Date().toISOString(), tx.userId);
        } catch (_) {}
      });
      update();

      sendNotification(tx.userId, 'تمت الموافقة على الإيداع', `تم إضافة $${tx.amount} لرصيدك وتحديث قوتك الشرائية.`, 'success');
      sendInternalMessage('admin-1', tx.userId, '✅ تأكيد إيداع رصيد', `تمت مراجعة طلب الإيداع الخاص بك بقيمة $${tx.amount} والموافقة عليه.\nيمكنك الآن البدء بالمزايدة.`);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to approve deposit" });
    }
  });

  app.post("/api/admin/reject-deposit", requireAdmin, (req, res) => {
    const { transactionId, reason } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as any;
      if (!tx) return res.status(404).json({ error: "العملية غير موجودة" });

      db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(transactionId);
      sendNotification(tx.userId, 'تم رفض طلب الإيداع', `للأسف تم رفض طلب الإيداع: ${reason} `, 'alert');

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to reject deposit" });
    }
  });

  app.post("/api/admin/approve-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      const amtLabel = tx.currency === 'LYD'
        ? `${Number(tx.amount).toLocaleString()} دينار ليبي`
        : `$${Number(tx.amount).toLocaleString()}`;

      db.transaction(() => {
        // 1. Confirm transaction
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);

        // 2. Update user deposit and buying power (deposit x 10)
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?")
          .run(tx.amount, tx.amount, tx.userId);

        // 3. Update buyer_wallets
        try {
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(tx.amount), Number(tx.amount), new Date().toISOString(), tx.userId);
        } catch (_) {}
      })();

      // 3. Fetch updated balances for receipt
      const updatedUser: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(tx.userId);
      const newDeposit = updatedUser ? Number(updatedUser.deposit).toLocaleString() : '—';
      const newBuyingPower = updatedUser ? Number(updatedUser.buyingPower).toLocaleString() : '—';
      const currSymbol = tx.currency === 'LYD' ? 'د.ل' : '$';

      // 4. Notify user (outside transaction so DB is already committed)
      sendNotification(tx.userId,
        '🎉 تمت الموافقة على إيداعك!',
        `تمت الموافقة على إيداعك بمبلغ ${amtLabel}! رصيدك الجديد: ${newDeposit} ${currSymbol}. قوتك الشرائية: ${newBuyingPower} ${currSymbol}`,
        'success', 'general_notification', {}, '/dashboard/user?view=wallet'
      );
      sendInternalMessage('admin-1', tx.userId,
        '✅ إيصال إيداع — تم قبول طلبك',
        `إيصال إيداع\n\nالمبلغ: ${amtLabel}\nالطريقة: ${tx.method || 'تحويل بنكي'}\nالمرجع: ${tx.referenceNo || txId}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nالرصيد الجديد: ${newDeposit} ${currSymbol}\nالقوة الشرائية: ${newBuyingPower} ${currSymbol}\n\nشكراً لثقتك في أوتو برو! 🧡`,
        'accounting'
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تأكيد الإيداع" });
    }
  });

  // POST /api/admin/reject-deposit/:txId — Admin rejects a bank transfer deposit
  app.post("/api/admin/reject-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      db.prepare("UPDATE transactions SET status = 'rejected', adminNote = ? WHERE id = ?")
        .run(reason || 'رُفض من قِبل الإدارة', txId);

      sendNotification(tx.userId,
        '❌ تم رفض طلب العربون',
        `للأسف تم رفض طلب إيداع العربون بمبلغ $${Number(tx.amount).toLocaleString()}. السبب: ${reason || 'يرجى التواصل مع الإدارة'}.`,
        'alert', '/deposit'
      );
      sendInternalMessage('admin-1', tx.userId,
        '❌ تم رفض طلب إيداع العربون',
        `عزيزي العميل، تم رفض طلب إيداع مبلغ $${Number(tx.amount).toLocaleString()}.\nالسبب: ${reason || 'يرجى التواصل مع الإدارة'}\nيمكنك المحاولة مرة أخرى عبر صفحة الإيداع.`
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض الإيداع" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: STATS, LOGS, CHART DATA
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    try {
      const totalSales: any = (db.prepare("SELECT SUM(amount) as total FROM bids").get() as any)?.total || 0;
      const activeAuctions: any = (db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get() as any)?.count || 0;
      const totalUsers: any = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count || 0;
      const commissionRateSetting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const totalCommission = totalSales * (parseFloat(commissionRateSetting?.value) || 0.07);
      const activeShipments: any = (db.prepare("SELECT COUNT(*) as count FROM shipments WHERE status NOT IN ('delivered', 'cancelled')").get() as any)?.count || 0;

      res.json({
        totalSales,
        activeAuctions,
        totalUsers,
        totalCommission,
        activeShipments,
        liveBids: activeAuctions
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/logs", requireAdmin, (req, res) => {
    try {
      const logs: any[] = db.prepare(`
        SELECT 'bid' as type, b.amount, b.timestamp, u.firstName, u.lastName, c.make, c.model, c.lotNumber
        FROM bids b
        JOIN users u ON b.userId = u.id
        JOIN cars c ON b.carId = c.id
        UNION ALL
        SELECT 'register' as type, 0 as amount, joinDate as timestamp, firstName, lastName, '' as make, '' as model, '' as lotNumber
        FROM users
        ORDER BY timestamp DESC
        LIMIT 20
        `).all();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.get("/api/admin/chart-data", requireAdmin, (req, res) => {
    try {
      // Simple aggregation by month for the last 6 months
      const data: any[] = db.prepare(`
        SELECT strftime('%Y-%m', timestamp) as month, COUNT(*) as count, SUM(amount) as sales
        FROM bids
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `).all();
      res.json(data.reverse());
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: INVOICES
  // ══════════════════════════════════════════════════════════════

  app.post("/api/admin/invoices/manual", requireAdmin, (req, res) => {
    const { userId, carId, amount, type, dueDate } = req.body;
    if (!userId || !carId || !amount || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const id = `inv-man-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const finalDueDate = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO invoices (id, userId, carId, amount, status, type, timestamp, dueDate)
        VALUES (?, ?, ?, ?, 'unpaid', ?, ?, ?)
      `).run(id, userId, carId, amount, type, timestamp, finalDueDate);

      // Notify the user about the new invoice
      const car: any = db.prepare("SELECT make, model, year FROM cars WHERE id = ?").get(carId);
      const itemInfo = car ? `${car.year} ${car.make} ${car.model}` : "سيارة غير معروفة";

      db.prepare(`
        INSERT INTO notifications (id, userId, title, message, type, timestamp)
        VALUES (?, ?, ?, ?, 'invoice', ?)
      `).run(`ntf-${Date.now()}`, userId, "فاتورة جديدة مستحقة 🧾", `تم إصدار فاتورة جديدة للمصاريف الإضافية (${type}) للسيارة ${itemInfo} بمبلغ $${amount.toLocaleString()}`, "info", timestamp);

      res.json({ success: true, id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create manual invoice" });
    }
  });

  app.get("/api/admin/invoices", requireAdmin, (req, res) => {
    try {
      const invoices = db.prepare(`
        SELECT i.*, u.firstName as buyerFirstName, u.lastName as buyerLastName, u.phone as buyerPhone,
               c.make, c.model, c.year, c.lotNumber, c.vin
        FROM invoices i
        LEFT JOIN users u ON i.userId = u.id
        LEFT JOIN cars c ON i.carId = c.id
        ORDER BY i.timestamp DESC
      `).all();
      res.json(invoices);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Invoices fetch error" });
    }
  });

  app.put("/api/admin/invoices/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body;
    try {
      try {
        db.prepare("ALTER TABLE invoices ADD COLUMN notes TEXT").run();
      } catch (e) { /* column may exist */ }

      db.prepare("UPDATE invoices SET amount = ?, notes = ? WHERE id = ?").run(amount, notes || '', id);
      res.json({ success: true, id, amount, notes });
    } catch (e) {
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SYSTEM SUMMARY
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/system-summary", requireAdmin, (req, res) => {
    try {
      const pendingUsers = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE status = 'pending_approval'").all();
      const pendingCars = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      const shipments = db.prepare("SELECT * FROM shipments WHERE status != 'delivered'").all();

      // Wallet financial overview (Phase 6: Sellers)
      let walletStats = { totalAvailable: 0, totalPending: 0, totalEarned: 0, totalWithdrawn: 0 };
      let withdrawalStats = { pendingCount: 0, pendingAmount: 0, completedAmount: 0 };

      // Buyer Wallet Overview (Phase 10)
      let buyerWalletStats = { totalCashBalance: 0, totalDeposited: 0, pendingTopups: 0, pendingTopupAmount: 0 };

      // Receivables (Invoices)
      let receivables = { unpaidPurchase: 0, unpaidTransport: 0, unpaidShipping: 0 };

      try {
        const ws = db.prepare("SELECT SUM(availableBalance) as a, SUM(pendingBalance) as p, SUM(totalEarned) as e, SUM(totalWithdrawn) as w FROM seller_wallets").get() as any;
        walletStats = { totalAvailable: ws?.a || 0, totalPending: ws?.p || 0, totalEarned: ws?.e || 0, totalWithdrawn: ws?.w || 0 };

        const wr = db.prepare("SELECT COUNT(*) as cnt, SUM(amount) as amt FROM withdrawal_requests WHERE status = 'pending'").get() as any;
        const wc = db.prepare("SELECT SUM(amount) as amt FROM withdrawal_requests WHERE status = 'completed'").get() as any;
        withdrawalStats = { pendingCount: wr?.cnt || 0, pendingAmount: wr?.amt || 0, completedAmount: wc?.amt || 0 };

        const bws = db.prepare("SELECT SUM(balance) as b, SUM(totalDeposited) as d FROM buyer_wallets").get() as any;
        const ptr = db.prepare("SELECT COUNT(*) as cnt, SUM(amount) as amt FROM payment_requests WHERE status = 'pending' AND type='topup'").get() as any;
        buyerWalletStats = { totalCashBalance: bws?.b || 0, totalDeposited: bws?.d || 0, pendingTopups: ptr?.cnt || 0, pendingTopupAmount: ptr?.amt || 0 };

        const inv = db.prepare("SELECT type, SUM(amount) as amt FROM invoices WHERE status = 'unpaid' GROUP BY type").all() as any[];
        inv.forEach(i => {
          if (i.type === 'purchase') receivables.unpaidPurchase = i.amt;
          if (i.type === 'transport') receivables.unpaidTransport = i.amt;
          if (i.type === 'shipping') receivables.unpaidShipping = i.amt;
        });

      } catch (_) { /* tables may not exist in early runs */ }

      res.json({
        pendingUsers,
        pendingCars: pendingCars.map((c: any) => ({ ...c, images: JSON.parse(c.images || '[]') })),
        shipments,
        walletStats,
        withdrawalStats,
        buyerWalletStats,
        receivables
      });
    } catch (e) {
      res.status(500).json({ error: "Summary error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: MERCHANTS & CAR REVIEW
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/merchants", requireAdmin, (req, res) => {
    try {
      res.json(db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE role = 'seller'").all());
    } catch (e) {
      res.status(500).json({ error: "Merchants error" });
    }
  });

  app.post("/api/admin/cars/:id/review", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { action, reason } = req.body;
    try {
      const status = action === 'approve' ? 'upcoming' : 'rejected';
      if (action === 'approve') {
        db.prepare("UPDATE cars SET status = 'upcoming', auctionEndDate = NULL, auctionStartTime = NULL WHERE id = ?").run(id);
      } else {
        db.prepare("UPDATE cars SET status = 'rejected' WHERE id = ?").run(id);
      }
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (car.sellerId) {
        sendInternalMessage('admin-1', car.sellerId, status === 'upcoming' ? '✅ تمت الموافقة' : '❌ تم الرفض',
          status === 'upcoming' ? `سيارتك ${car.make} ${car.model} الآن في قائمة المزادات القادمة!` : `عذراً، تم رفض سيارتك.السبب: ${reason} `);
      }
      io.emit("car_updated", { id, status });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Review error" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: MARKET ESTIMATES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/market-estimates", requireAdmin, (req, res) => {
    try {
      // Pull from the rich libyan_market_prices table (227 cars) — prefer over old empty market_estimates
      const lmpCount: any = db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get() as any;
      if ((lmpCount?.c || 0) > 0) {
        const data = db.prepare("SELECT id, make, makeEn, model, modelEn, year, priceLYD as price, condition, transmission, fuel, mileage, lastUpdated FROM libyan_market_prices ORDER BY make ASC, year DESC").all();
        return res.json(data);
      }
      // Fallback to old market_estimates table
      let data;
      try {
        data = db.prepare("SELECT * FROM market_estimates ORDER BY lastUpdated DESC").all();
      } catch (e) {
        data = db.prepare("SELECT * FROM market_estimates ORDER BY rowid DESC").all();
      }
      res.json(data);
    } catch (e) {
      console.error("Market estimates fetch crash:", e);
      res.status(500).json({ error: "Failed to fetch market estimates" });
    }
  });

  app.post("/api/admin/market-estimates", requireAdmin, (req, res) => {
    const { make, model, year, minPrice, maxPrice } = req.body;
    const id = `est - ${Date.now()} `;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("INSERT INTO market_estimates (id, make, model, year, minPrice, maxPrice, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, make, model, year, minPrice, maxPrice, lastUpdated);
      res.json({ id, make, model, year, minPrice, maxPrice, lastUpdated });
    } catch (e) { res.status(500).json({ error: "Failed to create market estimate" }); }
  });

  app.put("/api/admin/market-estimates/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { minPrice, maxPrice } = req.body;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("UPDATE market_estimates SET minPrice = ?, maxPrice = ?, lastUpdated = ? WHERE id = ?").run(minPrice, maxPrice, lastUpdated, id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update market estimate" }); }
  });

  app.delete("/api/admin/market-estimates/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM market_estimates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: ANALYTICS
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/reports-analytics", requireAdmin, (req, res) => {
    try {
      const activeUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get() as any)?.count || 0;
      const totalBids = (db.prepare("SELECT COUNT(*) as count FROM bids").get() as any)?.count || 0;
      const salesVol = (db.prepare("SELECT SUM(amount) as val FROM transactions WHERE status = 'completed' AND type = 'deposit'").get() as any)?.val || 0;

      const geoSalesRaw = db.prepare("SELECT u.country, SUM(c.currentBid) as total FROM cars c JOIN users u ON c.winnerId = u.id WHERE c.status = 'closed' GROUP BY u.country").all();

      res.json({
        activeUsers,
        totalBids,
        salesVol,
        geoSalesRaw
      });
    } catch(e) { res.status(500).json({ error: "Failed to fetch analytics" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: LIBYAN MARKET (CRUD + reseed)
  // ══════════════════════════════════════════════════════════════

  app.post("/api/libyan-market", requireAdmin, (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD } = req.body;
      if (!make || !model || !year) return res.status(400).json({ error: "الماركة والموديل والسنة مطلوبة" });
      const id = `lmp-${Date.now()}`;
      db.prepare(`INSERT INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, condition || 'مستعمل', make, makeEn || make, model, modelEn || model,
        parseInt(year as string), transmission || 'اوتوماتيك', fuel || 'بنزين',
        mileage || '—', priceLYD || null, new Date().toISOString().split('T')[0]);
      const row = db.prepare("SELECT * FROM libyan_market_prices WHERE id = ?").get(id);
      res.json({ success: true, id, row });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/libyan-market/:id", requireAdmin, (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD } = req.body;
      db.prepare(`UPDATE libyan_market_prices SET
        condition = ?, make = ?, makeEn = ?, model = ?, modelEn = ?,
        year = ?, transmission = ?, fuel = ?, mileage = ?,
        priceLYD = ?, lastUpdated = ?
        WHERE id = ?`
      ).run(condition, make, makeEn || make, model, modelEn || model,
        parseInt(year), transmission, fuel, mileage,
        priceLYD || null, new Date().toISOString().split('T')[0], req.params.id);
      res.json({ success: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/libyan-market/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM libyan_market_prices WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/libyan-market/reseed", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM libyan_market_prices").run();
      // NOTE: seedLibyanMarketPrices227() is defined in server.ts scope —
      // caller must ensure it's available or pass via ctx
      (ctx as any).seedLibyanMarketPrices227?.();
      const count = (db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get() as any)?.c || 0;
      res.json({ success: true, count, message: `تم إعادة تهيئة قاعدة البيانات — ${count} سيارة` });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: LIVE AUCTIONS MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  app.put("/api/admin/cars/:id/schedule", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { auctionStartTime, auctionEndDate, maxAuctionRetries } = req.body;
    try {
      db.prepare("UPDATE cars SET auctionStartTime = ?, auctionEndDate = ?, maxAuctionRetries = ?, status = 'upcoming' WHERE id = ?")
        .run(auctionStartTime, auctionEndDate, maxAuctionRetries, id);
      io.emit("car_updated", { id, status: 'upcoming', auctionStartTime });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to schedule vehicle" });
    }
  });

  app.post("/api/admin/cars/:id/mark-sold", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { winnerId, soldAmount } = req.body;
    try {
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?")
        .run(winnerId, soldAmount, id);

      (ctx as any).createWinInvoices(winnerId, id, soldAmount);
      io.emit("car_updated", { id, status: 'closed', winnerId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark car as sold" });
    }
  });

  app.get("/api/admin/manage-live-auctions", requireAdmin, (req, res) => {
    try {
      const scheduledCars = db.prepare("SELECT * FROM cars WHERE (status = 'upcoming' AND auctionStartTime IS NOT NULL) OR status = 'live'").all();
      const unscheduledCars = db.prepare("SELECT * FROM cars WHERE status = 'upcoming' AND (auctionStartTime IS NULL OR auctionEndDate IS NULL)").all();

      // [bidder-display] Same JOIN-with-users enrichment we apply to
      // /api/admin/offer-market-cars so the "عروض قيد التفاوض" tab can
      // render WHO placed each offer + their KYC/deposit/biddingEnabled
      // status. Without this the UI shows "$0 / بدون عروض" everywhere.
      const offerSqlBase = `
        SELECT c.*,
               c.currentBid AS highestOffer,
               u.id          AS bidderId,
               u.firstName   AS bidderFirstName,
               u.lastName    AS bidderLastName,
               u.email       AS bidderEmail,
               u.phone       AS bidderPhone,
               u.country     AS bidderCountry,
               u.kycStatus   AS bidderKycStatus,
               u.status      AS bidderStatus,
               u.deposit     AS bidderDeposit,
               u.buyingPower AS bidderBuyingPower,
               u.biddingEnabled AS bidderBiddingEnabled,
               u.joinDate    AS bidderJoinDate
          FROM cars c
          LEFT JOIN users u ON c.winnerId = u.id
         WHERE c.status = 'offer_market'
      `;
      const offerCarsRaw = db.prepare(offerSqlBase + " AND c.sellerCounterPrice IS NULL").all();
      const counterCarsRaw = db.prepare(offerSqlBase + " AND c.sellerCounterPrice IS NOT NULL").all();

      function attachBidder(car: any) {
        const bidderDetails = car.bidderId ? {
          id: car.bidderId,
          firstName: car.bidderFirstName,
          lastName: car.bidderLastName,
          email: car.bidderEmail,
          phone: car.bidderPhone,
          country: car.bidderCountry,
          kycStatus: car.bidderKycStatus,
          status: car.bidderStatus,
          deposit: Number(car.bidderDeposit) || 0,
          buyingPower: Number(car.bidderBuyingPower) || 0,
          biddingEnabled: Number(car.bidderBiddingEnabled) === 1,
          joinDate: car.bidderJoinDate,
        } : null;
        const eligibility = (() => {
          if (!bidderDetails) return { eligible: false, reasons: ['لا يوجد مُزايد مسجَّل'] };
          const reasons: string[] = [];
          const status = String(bidderDetails.status || '').toLowerCase();
          if (['banned', 'suspended', 'rejected', 'blocked'].includes(status)) reasons.push('الحساب محظور');
          if (!bidderDetails.biddingEnabled) reasons.push('المزايدة غير مُفعَّلة من الإدارة');
          if (bidderDetails.deposit <= 0) reasons.push('لم يدفع العربون');
          if (bidderDetails.kycStatus !== 'approved') reasons.push('KYC غير معتمد');
          if (bidderDetails.buyingPower < (car.highestOffer || 0)) reasons.push('قوته الشرائية أقل من العرض');
          return { eligible: reasons.length === 0, reasons };
        })();
        return {
          ...car,
          highestOffer: Number(car.highestOffer) || 0,
          bidderDetails,
          bidderEligibility: eligibility,
        };
      }
      const offerCars = (offerCarsRaw as any[]).map(attachBidder);
      const counterCars = (counterCarsRaw as any[]).map(attachBidder);

      const wonCarsRaw = db.prepare(`
        SELECT c.*,
               u.firstName as winnerFirstName, u.lastName as winnerLastName, u.email as winnerEmail,
               s.firstName as sellerFirstName, s.lastName as sellerLastName, s.companyName as sellerCompanyName,
               a.firstName as accFirstName, a.lastName as accLastName, a.companyName as accCompanyName,
               (SELECT COUNT(*) FROM invoices i WHERE i.carId = c.id AND i.type = 'purchase') as invoiceCreated,
               (SELECT COUNT(*) FROM invoices i WHERE i.carId = c.id AND i.type = 'purchase' AND i.isViewed = 1) as invoiceViewedCount,
               (SELECT COUNT(*) FROM notifications n WHERE n.userId = c.winnerId AND (n.message LIKE '%' || c.make || '%' OR n.title LIKE '%فزت%')) as notifSent
        FROM cars c
        LEFT JOIN users u ON c.winnerId = u.id
        LEFT JOIN users s ON c.sellerId = s.id
        LEFT JOIN users a ON c.acceptedBy = a.id
        WHERE c.status = 'closed'
        ORDER BY c.auctionEndDate DESC
        `).all() as any[];

      const wonCars = wonCarsRaw.map(car => ({
        ...car,
        sellerFullName: car.sellerCompanyName || (car.sellerFirstName ? `${car.sellerFirstName} ${car.sellerLastName}` : 'غير معروف'),
        acceptedByName: car.acceptedBy === 'admin-1' ? 'الإدارة (Admin)' : (car.accCompanyName || (car.accFirstName ? `${car.accFirstName} ${car.accLastName}` : 'تم القبول آلياً')),
        invoiceCreated: car.invoiceCreated > 0,
        invoiceViewed: car.invoiceViewedCount > 0,
        notificationSent: car.notifSent > 0
      }));

      res.json({
        scheduledCars,
        unscheduledCars,
        offerCars,
        counterCars,
        wonCars
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch live auctions management data" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: OFFICES (POST /api/offices)
  // ══════════════════════════════════════════════════════════════

  app.post("/api/offices", requireAdmin, (req, res) => {
    try {
      const { name, branchId, manager, phone, email, address, city, country, status } = req.body;
      const id = `office-${Date.now()}`;
      db.prepare(`INSERT INTO offices (id, name, branchId, manager, phone, email, address, city, country, status)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, name, branchId||null, manager||null, phone||null, email||null, address||null, city||null, country||'ليبيا', status||'active');
      res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: "فشل إنشاء المكتب" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SELLERS LIST
  // ══════════════════════════════════════════════════════════════

  app.get("/api/sellers", requireAdmin, (req, res) => {
    try {
      const sellers: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.status, u.kycStatus,
               u.companyName, u.country, u.joinDate,
               sw.availableBalance, sw.pendingBalance, sw.totalEarned, sw.totalWithdrawn,
               COUNT(c.id) as totalCars,
               SUM(CASE WHEN c.status = 'sold' THEN 1 ELSE 0 END) as soldCars
        FROM users u
        LEFT JOIN seller_wallets sw ON sw.sellerId = u.id
        LEFT JOIN cars c ON c.sellerId = u.id
        WHERE u.role IN ('seller','admin')
        GROUP BY u.id
        ORDER BY u.joinDate DESC`).all();
      res.json(sellers);
    } catch (e) { res.status(500).json({ error: "فشل جلب البائعين" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: MARKETING & CRM
  // ══════════════════════════════════════════════════════════════

  app.get("/api/marketing/leads", requireAdmin, (req, res) => {
    try {
      const leads: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.country, u.joinDate,
               u.status, u.kycStatus, u.role,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id) as totalBids,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id AND amount > 0) as activeBids,
               u.deposit,
               COALESCE(bw.balance, 0) as walletBalance,
               CASE
                 WHEN u.deposit > 0 THEN 'hot'
                 WHEN (SELECT COUNT(*) FROM bids WHERE userId = u.id) > 0 THEN 'warm'
                 ELSE 'cold'
               END as leadStatus
        FROM users u
        LEFT JOIN buyer_wallets bw ON bw.userId = u.id
        WHERE u.role NOT IN ('admin')
        ORDER BY u.joinDate DESC`).all();
      res.json(leads);
    } catch (e) { res.status(500).json({ error: "فشل جلب العملاء المحتملين" }); }
  });

  app.get("/api/crm/customers", requireAdmin, (req, res) => {
    try {
      const customers: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.country, u.joinDate,
               u.status, u.kycStatus, u.role, u.deposit, u.buyingPower,
               COALESCE(bw.balance, 0) as walletBalance,
               COALESCE(bw.totalDeposited, 0) as totalDeposited,
               COALESCE(bw.totalSpent, 0) as totalSpent,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id) as totalBids,
               (SELECT MAX(amount) FROM bids WHERE userId = u.id) as highestBid,
               (SELECT COUNT(*) FROM bids b2 JOIN cars c ON b2.carId = c.id WHERE b2.userId = u.id AND c.status = 'sold') as wonAuctions
        FROM users u
        LEFT JOIN buyer_wallets bw ON bw.userId = u.id
        ORDER BY totalDeposited DESC`).all();
      res.json(customers);
    } catch (e) { res.status(500).json({ error: "فشل جلب بيانات CRM" }); }
  });

  app.post("/api/crm/send-message", requireAdmin, (req, res) => {
    try {
      const { segment, subject, content, adminId } = req.body;
      if (!subject || !content) return res.status(400).json({ error: "الموضوع والمحتوى مطلوبان" });

      let userQuery = "SELECT id, firstName, email FROM users WHERE role NOT IN ('admin')";
      if (segment === 'hot') userQuery += " AND deposit > 0";
      else if (segment === 'warm') userQuery += " AND id IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'cold') userQuery += " AND deposit = 0 AND id NOT IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'kyc_pending') userQuery += " AND kycStatus = 'pending'";
      else if (segment === 'no_deposit') userQuery += " AND deposit = 0";

      const users: any[] = db.prepare(userQuery).all();
      let sent = 0;
      users.forEach((u: any) => {
        sendInternalMessage(adminId || 'admin-1', u.id, subject, content);
        sent++;
      });

      res.json({ success: true, sent, segment });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/send-notification", requireAdmin, (req, res) => {
    try {
      const { segment, title, message, type, link } = req.body;
      if (!title || !message) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });

      let userQuery = "SELECT id FROM users WHERE role NOT IN ('admin')";
      if (segment === 'hot') userQuery += " AND deposit > 0";
      else if (segment === 'warm') userQuery += " AND id IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'cold') userQuery += " AND deposit = 0";
      else if (segment === 'all_buyers') userQuery += "";

      const users: any[] = db.prepare(userQuery).all();
      users.forEach((u: any) => sendNotification(u.id, title, message, type || 'info', link));

      res.json({ success: true, sent: users.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/crm/notes/:userId", requireAdmin, (req, res) => {
    try {
      const notes = db.prepare("SELECT n.*, u.firstName || ' ' || u.lastName as addedByName FROM crm_notes n LEFT JOIN users u ON n.addedBy = u.id WHERE n.userId = ? ORDER BY n.createdAt DESC").all(req.params.userId);
      res.json(notes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/notes", requireAdmin, (req, res) => {
    try {
      const { userId, note } = req.body;
      if (!userId || !note) return res.status(400).json({ error: "مطلوب" });
      const id = `note-${Date.now()}`;
      db.prepare("INSERT INTO crm_notes (id, userId, note, addedBy, createdAt) VALUES (?, ?, ?, ?, ?)")
        .run(id, userId, note, (req as any).user?.id || 'admin', new Date().toISOString());
      res.json({ id, userId, note, createdAt: new Date().toISOString() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/update-status", requireAdmin, (req, res) => {
    try {
      const { userId, status } = req.body;
      if (!userId || !status) return res.status(400).json({ error: "مطلوب" });
      try { db.exec("ALTER TABLE users ADD COLUMN crmStatus TEXT"); } catch (_) { }
      db.prepare("UPDATE users SET crmStatus = ? WHERE id = ?").run(status, userId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: REPORTS & ACCOUNTING
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/reports", requireAdmin, (req, res) => {
    try {
      const { from, to } = req.query;
      const hasDateRange = from && to;

      // Read commission rate from system_settings
      const commRateSetting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const commRate = parseFloat(commRateSetting?.value) || 0.07;

      const totalRevenue = hasDateRange
        ? (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any)?.v || 0;
      const totalCommission = hasDateRange
        ? (db.prepare("SELECT SUM(amount * ?) as v FROM transactions WHERE type='commission' AND status='completed' AND timestamp BETWEEN ? AND ?").get(commRate, from, to) as any)?.v || 0
        : (db.prepare("SELECT SUM(amount * ?) as v FROM transactions WHERE type='commission' AND status='completed'").get(commRate) as any)?.v || 0;
      const totalDeposits = hasDateRange
        ? (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)
        : (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any);
      const pendingDeposits = (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='pending'").get() as any);
      const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('admin')").get() as any)?.c || 0;
      const newUsers = from
        ? (db.prepare("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('admin') AND joinDate >= ?").get(from) as any)?.c || 0
        : totalUsers;
      const totalBids = (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM bids").get() as any);
      const activeCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'live'").get() as any)?.c || 0;
      const soldCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'sold'").get() as any)?.c || 0;
      const pendingCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'pending'").get() as any)?.c || 0;
      const totalSellers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'seller'").get() as any)?.c || 0;
      const sellerPayouts = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;

      // Monthly breakdown (last 6 months)
      const monthly = db.prepare(`
        SELECT strftime('%Y-%m', timestamp) as month,
               COUNT(*) as count, SUM(amount) as total
        FROM transactions WHERE type='deposit' AND status='completed'
        GROUP BY month ORDER BY month DESC LIMIT 6`).all();

      // Top buyers
      const topBuyers = db.prepare(`
        SELECT u.firstName, u.lastName, u.email,
               COUNT(b.id) as bidCount, MAX(b.amount) as maxBid, u.deposit
        FROM users u JOIN bids b ON b.userId = u.id
        GROUP BY u.id ORDER BY bidCount DESC LIMIT 10`).all();

      // Top cars by bids
      const topCars = db.prepare(`
        SELECT c.make, c.model, c.year, c.lotNumber,
               COUNT(b.id) as bidCount, MAX(b.amount) as currentBid, c.status
        FROM cars c JOIN bids b ON b.carId = c.id
        GROUP BY c.id ORDER BY bidCount DESC LIMIT 10`).all();

      res.json({
        summary: {
          totalRevenue, totalCommission, sellerPayouts,
          totalDeposits: totalDeposits?.v || 0, depositCount: totalDeposits?.c || 0,
          pendingDepositAmount: pendingDeposits?.v || 0, pendingDepositCount: pendingDeposits?.c || 0,
          totalUsers, newUsers, totalSellers,
          totalBidVolume: totalBids?.v || 0, totalBidCount: totalBids?.c || 0,
          activeCars, soldCars, pendingCars,
        },
        monthly,
        topBuyers,
        topCars,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/audit-log", requireAdmin, (req, res) => {
    try {
      // Synthesize audit log from existing data
      const bids: any[] = db.prepare(`
        SELECT 'bid' as action, b.timestamp, u.firstName || ' ' || u.lastName as actor,
               u.email, 'مزايدة بمبلغ $' || b.amount as detail, b.carId as ref
        FROM bids b JOIN users u ON b.userId = u.id
        ORDER BY b.timestamp DESC LIMIT 50`).all();

      const deposits: any[] = db.prepare(`
        SELECT 'deposit' as action, t.timestamp, u.firstName || ' ' || u.lastName as actor,
               u.email, 'إيداع عربون $' || t.amount || ' (' || t.status || ')' as detail, t.id as ref
        FROM transactions t JOIN users u ON t.userId = u.id
        WHERE t.type = 'deposit'
        ORDER BY t.timestamp DESC LIMIT 50`).all();

      const registrations: any[] = db.prepare(`
        SELECT 'register' as action, joinDate as timestamp,
               firstName || ' ' || lastName as actor, email,
               'تسجيل حساب جديد' as detail, id as ref
        FROM users ORDER BY joinDate DESC LIMIT 30`).all();

      const combined = [...bids, ...deposits, ...registrations]
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100);

      res.json(combined);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: COMMISSION
  // ══════════════════════════════════════════════════════════════

  app.post("/api/admin/commission", requireAdmin, (req, res) => {
    try {
      const { carId, sellerId, saleAmount, commissionRate } = req.body;
      // Read default from system_settings if not provided in request
      const defaultRate: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const rate = commissionRate || parseFloat(defaultRate?.value) || 0.07;
      const commission = saleAmount * rate;
      const sellerNet = saleAmount - commission;

      const txId = `comm-${Date.now()}`;
      db.prepare(`INSERT INTO transactions (id, userId, amount, type, status, method, notes, timestamp)
        VALUES (?,'admin-1',?,'commission','completed','system',?,?)`
      ).run(txId, commission, `عمولة بيع ${carId} — ${(rate * 100).toFixed(1)}%`, new Date().toISOString());

      // Credit seller wallet (net amount)
      db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
        VALUES (?,?,0,?,0,?) ON CONFLICT(sellerId) DO UPDATE SET
        availableBalance = availableBalance + ?,
        totalEarned = totalEarned + ?,
        lastUpdated = ?`).run(sellerId, sellerNet, sellerNet, new Date().toISOString(), sellerNet, sellerNet, new Date().toISOString());

      // Record seller transaction
      const stxId = `stx-${Date.now()}`;
      db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, description, createdAt)
        VALUES (?,?,'credit',?,?,?)`).run(stxId, sellerId, sellerNet, `مستحقات بيع السيارة ${carId} (بعد خصم ${(rate*100).toFixed(1)}% عمولة)`, new Date().toISOString());

      sendNotification(sellerId, '💰 تم إضافة مستحقات البيع',
        `تم إضافة $${sellerNet.toLocaleString()} لمحفظتك (بعد خصم عمولة ${(rate*100).toFixed(1)}%). يمكنك طلب السحب الآ��.`, 'success', '/dashboard/seller');

      res.json({ success: true, commission, sellerNet, txId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SELLER PAYOUTS
  // ══════════════════════════════════════════════════════════════

  app.post("/api/admin/approve-seller-withdrawal/:reqId", requireAdmin, (req, res) => {
    try {
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ? AND status = 'pending'").get(req.params.reqId);
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.transaction(() => {
        db.prepare("UPDATE payment_requests SET status='approved', processedAt=? WHERE id=?").run(new Date().toISOString(), req.params.reqId);
        db.prepare("UPDATE seller_wallets SET pendingBalance = pendingBalance - ?, totalWithdrawn = totalWithdrawn + ? WHERE sellerId=?").run(pr.amount, pr.amount, pr.userId);
        const stxId = `stx-out-${Date.now()}`;
        db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, description, createdAt)
          VALUES (?,?,'debit',?,?,?)`).run(stxId, pr.userId, pr.amount, `سحب رصيد — تحويل بنكي`, new Date().toISOString());
      })();

      sendNotification(pr.userId, '✅ تمت الموافقة على طلب السحب',
        `تمت الموافقة على سحب $${Number(pr.amount).toLocaleString()}. سيصل التحويل خلال 3-5 أيام عمل.`, 'success');

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/seller-payouts", requireAdmin, (req, res) => {
    try {
      const payouts: any[] = db.prepare(`
        SELECT pr.*, u.firstName, u.lastName, u.email, u.companyName,
               sw.availableBalance, sw.totalEarned, sw.iban, sw.bankName
        FROM payment_requests pr
        JOIN users u ON pr.userId = u.id
        LEFT JOIN seller_wallets sw ON sw.sellerId = pr.userId
        WHERE pr.type = 'withdrawal'
        ORDER BY CASE pr.status WHEN 'pending' THEN 0 ELSE 1 END, pr.requestedAt DESC`).all();
      res.json(payouts);
    } catch (e) { res.status(500).json({ error: "فشل جلب طلبات السحب" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: FINANCIAL SUMMARY
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/financial-summary", requireAdmin, (req, res) => {
    try {
      const buyerDeposits = (db.prepare("SELECT SUM(balance) as v FROM buyer_wallets").get() as any)?.v || 0;
      const sellerAvailable = (db.prepare("SELECT SUM(availableBalance) as v FROM seller_wallets").get() as any)?.v || 0;
      const sellerPending = (db.prepare("SELECT SUM(pendingBalance) as v FROM seller_wallets").get() as any)?.v || 0;
      const totalCommission = (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='commission' AND status='completed'").get() as any)?.v || 0;
      const totalDepositIn = (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any)?.v || 0;
      const pendingWithdrawals = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='pending'").get() as any)?.v || 0;
      const approvedWithdrawals = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;
      const unpaidInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='unpaid'").get() as any)?.v || 0;
      const paidInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='paid'").get() as any)?.v || 0;

      res.json({
        assets: { buyerDeposits, totalDepositIn },
        liabilities: { sellerAvailable, sellerPending, pendingWithdrawals },
        revenue: { totalCommission, paidInvoices },
        pending: { pendingWithdrawals, unpaidInvoices },
        paid: { approvedWithdrawals },
        netPosition: totalDepositIn - sellerAvailable - sellerPending - approvedWithdrawals,
      });
    } catch (e) { res.status(500).json({ error: "فشل جلب الملخص المالي" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SECURITY LOG
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/security-log", requireAdmin, (req, res) => {
    try {
      const recentLogins: any[] = db.prepare(`
        SELECT id, firstName, lastName, email, lastLogin, status, country
        FROM users ORDER BY lastLogin DESC LIMIT 50`).all();
      const suspiciousUsers = recentLogins.filter((u: any) => u.status === 'suspended' || u.status === 'blocked');
      res.json({ recentLogins, suspiciousUsers, total: recentLogins.length });
    } catch (e) { res.status(500).json({ error: "فشل جلب سجل الأمان" }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: EXPENSES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/expenses", requireAdmin, (_req, res) => {
    try {
      const expenses = db.prepare("SELECT * FROM expenses ORDER BY date DESC").all();
      res.json(expenses);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/expenses", requireAdmin, (req, res) => {
    try {
      const { category, description, amount, currency, date } = req.body;
      if (!category || !description || !amount || !date) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة" });
      }
      const id = `exp-${Date.now()}`;
      db.prepare("INSERT INTO expenses (id, category, description, amount, currency, date, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, category, description, Number(amount), currency || 'USD', date, (req as any).user?.id || 'admin', new Date().toISOString());
      res.json({ id, category, description, amount: Number(amount), currency: currency || 'USD', date });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/expenses/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: INCOME STATEMENT
  // ══════════════════════════════════════════════════════════════

  app.get("/api/admin/income-statement", requireAdmin, (req, res) => {
    try {
      const { from, to } = req.query;
      const hasRange = from && to;

      const commissions = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type='commission' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type='commission' AND status='completed'").get() as any)?.v || 0;

      const paidInvoices = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status='paid' AND paidAt BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status='paid'").get() as any)?.v || 0;

      const totalExpenses = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE date BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM expenses").get() as any)?.v || 0;

      const expensesByCategory = hasRange
        ? db.prepare("SELECT category, SUM(amount) as total FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(from, to)
        : db.prepare("SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC").all();

      const sellerPayouts = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM payment_requests WHERE type='withdrawal' AND status='approved' AND updatedAt BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;

      const totalRevenue = commissions + paidInvoices;
      const totalCosts = totalExpenses + sellerPayouts;
      const netProfit = totalRevenue - totalCosts;

      res.json({
        revenue: { commissions, paidInvoices, total: totalRevenue },
        costs: { expenses: totalExpenses, sellerPayouts, total: totalCosts },
        expensesByCategory,
        netProfit,
        profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: API KEYS
  // ══════════════════════════════════════════════════════════════

  app.post("/api/admin/api-keys", requireAdmin, (req, res) => {
    try {
      const { name, website } = req.body;
      if (!name) return res.status(400).json({ error: "اسم التطبيق مطلوب" });
      const key = `autopro_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      db.prepare("INSERT INTO api_keys (key, name, website, active, usageCount, createdAt, lastUsedAt) VALUES (?, ?, ?, 1, 0, ?, ?)")
        .run(key, name, website || '', new Date().toISOString(), new Date().toISOString());
      res.json({ success: true, key, name, website });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/api-keys", requireAdmin, (_req, res) => {
    try {
      const keys = db.prepare("SELECT * FROM api_keys ORDER BY createdAt DESC").all();
      res.json(keys);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/admin/api-keys/:key/toggle", requireAdmin, (req, res) => {
    try {
      db.prepare("UPDATE api_keys SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE key = ?").run(req.params.key);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: EMPLOYEE MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  // GET /api/admin/employees — list all staff/admin + yard users with activity stats
  app.get("/api/admin/employees", requireAdmin, (_req, res) => {
    try {
      const employees: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.role, u.yardRole, u.status,
               u.joinDate, u.lastLogin, u.lastActiveAt, u.loginCount, u.totalLoginMinutes,
               (SELECT COUNT(*) FROM employee_tasks WHERE assignedTo = u.id AND status = 'completed') as tasksCompleted,
               (SELECT COUNT(*) FROM employee_tasks WHERE assignedTo = u.id AND status = 'pending') as tasksPending,
               (SELECT COUNT(*) FROM employee_activity_log WHERE userId = u.id) as totalActions,
               (SELECT COUNT(*) FROM cars WHERE sellerId = u.id OR acceptedBy = u.id) as carsHandled,
               (SELECT COUNT(*) FROM yard_vehicles WHERE createdBy = u.id) as yardVehiclesHandled,
               (SELECT COUNT(*) FROM yard_gate_movements WHERE gatekeeperId = u.id) as gateMovements
        FROM users u
        WHERE u.role IN ('admin','staff','manager','accountant')
           OR u.yardRole IN ('yard_manager','yard_supervisor','yard_employee','gatekeeper','sales_agent','auditor')
        ORDER BY u.joinDate DESC
      `).all();
      res.json({ employees });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/employees/:id/assign-role — assign role/yardRole (manager only)
  app.post("/api/admin/employees/:id/assign-role", requireAdmin, (req: any, res) => {
    try {
      const { id } = req.params;
      const { role, yardRole } = req.body || {};
      const allowedRoles = ['admin', 'staff', 'manager', 'accountant', 'buyer', 'seller'];
      const allowedYardRoles = [null, '', 'yard_manager', 'yard_supervisor', 'yard_employee', 'gatekeeper', 'sales_agent', 'auditor'];

      if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'صلاحية غير صالحة' });
      }
      if (yardRole !== undefined && !allowedYardRoles.includes(yardRole)) {
        return res.status(400).json({ error: 'دور حضيرة غير صالح' });
      }

      const updates: string[] = [];
      const values: any[] = [];
      if (role) { updates.push('role = ?'); values.push(role); }
      if (yardRole !== undefined) { updates.push('yardRole = ?'); values.push(yardRole || null); }
      if (updates.length === 0) return res.status(400).json({ error: 'لم يتم تحديد أي تغيير' });

      values.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      // Log the role change
      try {
        db.prepare(`INSERT INTO employee_activity_log (id, userId, action, category, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`act-${Date.now()}`, id, 'role_changed', 'admin', JSON.stringify({ role, yardRole, changedBy: req.user?.id }), new Date().toISOString());
      } catch {}

      res.json({ success: true, message: 'تم تحديث الصلاحية بنجاح' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/employees/:id/activity — activity log for a specific employee
  app.get("/api/admin/employees/:id/activity", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const category = req.query.category as string;

      let query = `SELECT * FROM employee_activity_log WHERE userId = ?`;
      const params: any[] = [id];

      if (category) {
        query += ` AND category = ?`;
        params.push(category);
      }

      query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const activities = db.prepare(query).all(...params);
      const total: any = db.prepare(
        `SELECT COUNT(*) as count FROM employee_activity_log WHERE userId = ?`
      ).get(id);

      res.json({ activities, total: total?.count || 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/employees/:id/task — create a task for an employee
  app.post("/api/admin/employees/:id/task", requireAdmin, (req: any, res) => {
    try {
      const { id } = req.params;
      const { title, description, priority, dueDate } = req.body;
      if (!title) return res.status(400).json({ error: "عنوان المهمة مطلوب" });

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO employee_tasks (id, assignedTo, assignedBy, title, description, priority, status, dueDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(taskId, id, req.user.id, title, description || '', priority || 'medium', dueDate || null, now);

      // Log the assignment as activity
      db.prepare(`
        INSERT INTO employee_activity_log (id, userId, action, details, category, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`act-${Date.now()}`, req.user.id, 'task_assigned', `تم تعيين مهمة "${title}" للموظف ${id}`, 'tasks', now);

      res.json({ success: true, taskId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/employees/:id/tasks — get tasks for an employee
  app.get("/api/admin/employees/:id/tasks", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const status = req.query.status as string;

      let query = `
        SELECT et.*, u.firstName as assignedByName, u.lastName as assignedByLastName
        FROM employee_tasks et
        LEFT JOIN users u ON et.assignedBy = u.id
        WHERE et.assignedTo = ?
      `;
      const params: any[] = [id];

      if (status) {
        query += ` AND et.status = ?`;
        params.push(status);
      }

      query += ` ORDER BY et.createdAt DESC`;

      const tasks = db.prepare(query).all(...params);
      res.json({ tasks });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/admin/employees/tasks/:taskId — update task status
  app.put("/api/admin/employees/tasks/:taskId", requireAdmin, (req: any, res) => {
    try {
      const { taskId } = req.params;
      const { status, description, priority, dueDate } = req.body;

      const task: any = db.prepare("SELECT * FROM employee_tasks WHERE id = ?").get(taskId);
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });

      const now = new Date().toISOString();
      const completedAt = status === 'completed' ? now : task.completedAt;

      db.prepare(`
        UPDATE employee_tasks
        SET status = COALESCE(?, status),
            description = COALESCE(?, description),
            priority = COALESCE(?, priority),
            dueDate = COALESCE(?, dueDate),
            completedAt = ?
        WHERE id = ?
      `).run(status || null, description || null, priority || null, dueDate || null, completedAt, taskId);

      // Log status change
      if (status) {
        db.prepare(`
          INSERT INTO employee_activity_log (id, userId, action, details, category, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`act-${Date.now()}`, req.user.id, 'task_updated', `تم تحديث المهمة "${task.title}" إلى ${status}`, 'tasks', now);
      }

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/employees/:id/review — submit a performance review
  app.post("/api/admin/employees/:id/review", requireAdmin, (req: any, res) => {
    try {
      const { id } = req.params;
      const { period, rating, notes } = req.body;
      if (!period || !rating) return res.status(400).json({ error: "الفترة والتقييم مطلوبان" });

      const now = new Date().toISOString();
      const reviewId = `review-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Gather auto-calculated metrics
      const carsAdded: any = db.prepare(
        `SELECT COUNT(*) as count FROM cars WHERE (sellerId = ? OR acceptedBy = ?) AND createdAt >= ?`
      ).get(id, id, period);

      const tasksCompleted: any = db.prepare(
        `SELECT COUNT(*) as count FROM employee_tasks WHERE assignedTo = ? AND status = 'completed' AND completedAt >= ?`
      ).get(id, period);

      const messagesHandled: any = db.prepare(
        `SELECT COUNT(*) as count FROM messages WHERE senderId = ? AND createdAt >= ?`
      ).get(id, period);

      db.prepare(`
        INSERT INTO employee_reviews (id, employeeId, reviewerId, period, rating, notes, carsAdded, customersHandled, tasksCompleted, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(reviewId, id, req.user.id, period, rating, notes || '', carsAdded?.count || 0, messagesHandled?.count || 0, tasksCompleted?.count || 0, now);

      res.json({ success: true, reviewId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/employees/:id/performance — get performance metrics
  app.get("/api/admin/employees/:id/performance", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const since = (req.query.since as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const user: any = db.prepare(
        `SELECT id, firstName, lastName, email, role, lastLogin, lastActiveAt, loginCount, totalLoginMinutes FROM users WHERE id = ?`
      ).get(id);
      if (!user) return res.status(404).json({ error: "الموظف غير موجود" });

      const carsAdded: any = db.prepare(
        `SELECT COUNT(*) as count FROM cars WHERE (sellerId = ? OR acceptedBy = ?) AND createdAt >= ?`
      ).get(id, id, since);

      const messagesSent: any = db.prepare(
        `SELECT COUNT(*) as count FROM messages WHERE senderId = ? AND createdAt >= ?`
      ).get(id, since);

      const tasksTotal: any = db.prepare(
        `SELECT COUNT(*) as count FROM employee_tasks WHERE assignedTo = ?`
      ).get(id);

      const tasksCompleted: any = db.prepare(
        `SELECT COUNT(*) as count FROM employee_tasks WHERE assignedTo = ? AND status = 'completed'`
      ).get(id);

      const tasksPending: any = db.prepare(
        `SELECT COUNT(*) as count FROM employee_tasks WHERE assignedTo = ? AND status = 'pending'`
      ).get(id);

      const recentActivities = db.prepare(
        `SELECT action, category, timestamp FROM employee_activity_log WHERE userId = ? ORDER BY timestamp DESC LIMIT 10`
      ).all(id);

      const reviews = db.prepare(
        `SELECT * FROM employee_reviews WHERE employeeId = ? ORDER BY createdAt DESC LIMIT 5`
      ).all(id);

      const avgRating: any = db.prepare(
        `SELECT AVG(rating) as avg FROM employee_reviews WHERE employeeId = ?`
      ).get(id);

      res.json({
        employee: user,
        metrics: {
          carsAdded: carsAdded?.count || 0,
          messagesSent: messagesSent?.count || 0,
          tasksTotal: tasksTotal?.count || 0,
          tasksCompleted: tasksCompleted?.count || 0,
          tasksPending: tasksPending?.count || 0,
          loginCount: user.loginCount || 0,
          totalLoginMinutes: user.totalLoginMinutes || 0,
          avgRating: avgRating?.avg ? Number(avgRating.avg).toFixed(1) : null,
        },
        recentActivities,
        reviews,
        since,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/employees/log-activity — log an employee action
  app.post("/api/admin/employees/log-activity", requireAdmin, (req: any, res) => {
    try {
      const { userId, action, details, category } = req.body;
      if (!action) return res.status(400).json({ error: "الإجراء مطلوب" });

      const logId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();
      const targetUser = userId || req.user.id;

      db.prepare(`
        INSERT INTO employee_activity_log (id, userId, action, details, category, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(logId, targetUser, action, details || '', category || 'general', now);

      // Update lastActiveAt
      db.prepare("UPDATE users SET lastActiveAt = ? WHERE id = ?").run(now, targetUser);

      res.json({ success: true, logId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: DASHBOARD OVERVIEW  (comprehensive KPIs + alerts + top lists)
  // ══════════════════════════════════════════════════════════════

  // ── AgentCollab integration status + manual ping ──────────────────────
  // GET → reports whether env vars are set; POST → fires a test event.
  app.get("/api/admin/agentcollab/status", requireAdmin, (_req, res) => {
    // [phase-5] Report the EFFECTIVE keys (from the bootstrap cache when
    // bootstrap succeeded, else the legacy env vars) so the panel reflects
    // reality instead of just whether the raw env vars are present.
    const keys = getAgentCollabKeys();
    const slug = process.env.AGENTCOLLAB_SLUG || process.env.AGENTCOLLAB_SITE_SLUG || 'site';
    res.json({
      enabled: agentCollabEnabled(),
      hasWebhookUrl: !!keys.webhook_url,
      hasApiKey: !!keys.api_key,
      hasHmacSecret: !!keys.hmac_secret,
      hasOutboundToken: !!keys.outbound_token,
      slug,
      webhookHost: keys.webhook_url ? (() => { try { return new URL(keys.webhook_url).host; } catch { return null; } })() : null,
    });
  });
  app.post("/api/admin/agentcollab/ping", requireAdmin, (req: any, res) => {
    agentcollab.track('custom', { source: 'admin_test_ping', triggeredBy: req.user?.email || 'unknown' });
    res.json({ success: true, sent: 'custom event ("admin_test_ping") fired' });
  });

  // [sync-now] Force a full push of every entity (customers, employees,
  // products, orders) + the stats snapshot to AgentCollab immediately,
  // instead of waiting for the 30-minute scheduler. Returns the per-entity
  // counts so the admin sees exactly what was sent. "Control from one place"
  // starts here: this makes the AutoPro data appear in AgentCollab on demand.
  app.post("/api/admin/agentcollab/sync-now", requireAdmin, async (_req, res) => {
    if (!agentCollabEnabled()) {
      return res.status(503).json({
        error: 'AgentCollab غير مُفعّل — تأكد من AGENTCOLLAB_ENABLED=true ووجود المفاتيح (bootstrap أو env).',
      });
    }
    try {
      const counts = await runFullEntitySync(db);
      try { await pushStatsSnapshot(db); } catch (e: any) {
        console.warn('[sync-now] stats push failed:', e?.message);
      }
      res.json({ success: true, counts });
    } catch (e: any) {
      console.error('[sync-now] failed:', e?.message);
      res.status(500).json({ error: 'فشلت المزامنة: ' + (e?.message || '') });
    }
  });

  app.get("/api/admin/dashboard-overview", requireAdmin, (_req, res) => {
    try {
      // ── Helper: safely get .val from a single-column aggregate ──
      const scalar = (sql: string, params: any[] = []): number => {
        const row: any = db.prepare(sql).get(...params);
        return row ? Number(row.val) || 0 : 0;
      };

      // ─────────────────────── KPIs ───────────────────────

      // Sales (closed cars) — today / week / month / last month
      const totalSalesToday = scalar(
        `SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND date(auctionEndDate) = date('now')`
      );
      const totalSalesWeek = scalar(
        `SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND auctionEndDate > datetime('now', '-7 days')`
      );
      const totalSalesMonth = scalar(
        `SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')`
      );
      const totalSalesLastMonth = scalar(
        `SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now', '-1 month')`
      );

      const salesChangePercent = totalSalesLastMonth > 0
        ? Math.round(((totalSalesMonth - totalSalesLastMonth) / totalSalesLastMonth) * 100)
        : (totalSalesMonth > 0 ? 100 : 0);

      // Active bids (bids on cars currently live or in offer_market)
      const activeBidsNow = scalar(
        `SELECT COUNT(*) AS val FROM bids b
         JOIN cars c ON b.carId = c.id
         WHERE c.status IN ('live', 'offer_market')`
      );

      // Average sale price (this month vs last month)
      const averageSalePrice = scalar(
        `SELECT COALESCE(AVG(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')`
      );
      const averageSalePriceLastMonth = scalar(
        `SELECT COALESCE(AVG(currentBid), 0) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now', '-1 month')`
      );

      // Conversion rate: sold / (sold + expired/unsold live auctions this month)
      const totalSoldMonth = scalar(
        `SELECT COUNT(*) AS val FROM cars
         WHERE status = 'closed' AND winnerId IS NOT NULL
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')`
      );
      const totalAuctionedMonth = scalar(
        `SELECT COUNT(*) AS val FROM cars
         WHERE status IN ('closed', 'offer_market', 'expired')
         AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')`
      );
      const conversionRate = totalAuctionedMonth > 0
        ? Math.round((totalSoldMonth / totalAuctionedMonth) * 100)
        : 0;

      // Commissions earned (from seller_transactions)
      const totalCommissions = scalar(
        `SELECT COALESCE(SUM(commission), 0) AS val FROM seller_transactions
         WHERE type = 'sale'`
      );

      // Users — count everyone (admins are real users too).
      const newUsersToday = scalar(
        `SELECT COUNT(*) AS val FROM users
         WHERE date(joinDate) = date('now')`
      );
      const newUsersWeek = scalar(
        `SELECT COUNT(*) AS val FROM users
         WHERE joinDate > datetime('now', '-7 days')`
      );
      const totalRegisteredUsers = scalar(
        `SELECT COUNT(*) AS val FROM users`
      );
      const activeUsersToday = scalar(
        `SELECT COUNT(*) AS val FROM users
         WHERE date(lastLogin) = date('now')`
      );

      // Cars
      const totalCarsListed = scalar(`SELECT COUNT(*) AS val FROM cars`);
      const totalCarsSold = scalar(
        `SELECT COUNT(*) AS val FROM cars WHERE status = 'closed' AND winnerId IS NOT NULL`
      );
      const totalCarsInAuction = scalar(
        `SELECT COUNT(*) AS val FROM cars WHERE status IN ('live', 'offer_market')`
      );

      // Pending approvals (cars with status 'pending' or 'pending_approval')
      const pendingApprovals = scalar(
        `SELECT COUNT(*) AS val FROM cars WHERE status IN ('pending', 'pending_approval')`
      );

      // Pending deposits (payment_requests with status 'pending' and type 'topup')
      const pendingDeposits = scalar(
        `SELECT COUNT(*) AS val FROM payment_requests WHERE status = 'pending' AND type = 'topup'`
      );

      // Overdue invoices (unpaid and dueDate < now)
      const overdueInvoices = scalar(
        `SELECT COUNT(*) AS val FROM invoices
         WHERE status = 'unpaid' AND dueDate IS NOT NULL AND dueDate < datetime('now')`
      );

      // Total deposits balance (sum of all buyer wallet balances)
      const totalDepositsBalance = scalar(
        `SELECT COALESCE(SUM(balance), 0) AS val FROM buyer_wallets`
      );

      const kpis = {
        totalSalesToday: Math.round(totalSalesToday),
        totalSalesWeek: Math.round(totalSalesWeek),
        totalSalesMonth: Math.round(totalSalesMonth),
        totalSalesLastMonth: Math.round(totalSalesLastMonth),
        salesChangePercent,
        activeBidsNow,
        averageSalePrice: Math.round(averageSalePrice),
        averageSalePriceLastMonth: Math.round(averageSalePriceLastMonth),
        conversionRate,
        totalCommissions: Math.round(totalCommissions),
        newUsersToday,
        newUsersWeek,
        totalRegisteredUsers,
        activeUsersToday,
        totalCarsListed,
        totalCarsSold,
        totalCarsInAuction,
        pendingApprovals,
        pendingDeposits,
        overdueInvoices,
        totalDepositsBalance: Math.round(totalDepositsBalance),
      };

      // ─────────────────────── Smart Alerts ───────────────────────

      const alerts: Array<{ type: string; icon: string; message: string; count: number; action: string }> = [];

      // 1. Overdue invoices (>48h past due)
      const overdueCount48h = scalar(
        `SELECT COUNT(*) AS val FROM invoices
         WHERE status = 'unpaid' AND dueDate IS NOT NULL
         AND dueDate < datetime('now', '-48 hours')`
      );
      if (overdueCount48h > 0) {
        alerts.push({
          type: 'danger', icon: 'invoice',
          message: `${overdueCount48h} فواتير متأخرة أكثر من 48 ساعة`,
          count: overdueCount48h, action: 'invoices'
        });
      }

      // 2. Offer-market cars ending within 6 hours
      const expiringOfferMarket = scalar(
        `SELECT COUNT(*) AS val FROM cars
         WHERE status = 'offer_market'
         AND offerMarketEndTime IS NOT NULL
         AND offerMarketEndTime > datetime('now')
         AND offerMarketEndTime < datetime('now', '+6 hours')`
      );
      if (expiringOfferMarket > 0) {
        alerts.push({
          type: 'warning', icon: 'clock',
          message: `${expiringOfferMarket} سيارات في سوق العروض تنتهي خلال 6 ساعات`,
          count: expiringOfferMarket, action: 'manage_live_auctions'
        });
      }

      // 3. Pending seller approvals (cars awaiting seller confirmation)
      const pendingSellerApprovals = scalar(
        `SELECT COUNT(*) AS val FROM cars WHERE status IN ('pending', 'pending_approval')`
      );
      if (pendingSellerApprovals > 0) {
        alerts.push({
          type: 'warning', icon: 'user',
          message: `${pendingSellerApprovals} سيارة بانتظار موافقة بائع`,
          count: pendingSellerApprovals, action: 'manage_live_auctions'
        });
      }

      // 4. New users who haven't deposited yet (joined in last 7 days, no wallet or zero balance)
      const noDepositUsers = scalar(
        `SELECT COUNT(*) AS val FROM users u
         LEFT JOIN buyer_wallets bw ON u.id = bw.userId
         WHERE u.role = 'buyer' AND u.joinDate > datetime('now', '-7 days')
         AND (bw.userId IS NULL OR bw.totalDeposited = 0)`
      );
      if (noDepositUsers > 0) {
        alerts.push({
          type: 'info', icon: 'users',
          message: `${noDepositUsers} مستخدم جديد لم يودعوا بعد`,
          count: noDepositUsers, action: 'users'
        });
      }

      // 5. Hot cars (>= 10 bids while still live)
      const hotCars = scalar(
        `SELECT COUNT(*) AS val FROM (
           SELECT b.carId, COUNT(*) AS cnt FROM bids b
           JOIN cars c ON b.carId = c.id
           WHERE c.status IN ('live', 'offer_market')
           GROUP BY b.carId HAVING cnt >= 10
         )`
      );
      if (hotCars > 0) {
        alerts.push({
          type: 'success', icon: 'trending',
          message: `${hotCars} سيارات حصلت على أكثر من 10 مزايدات`,
          count: hotCars, action: 'manage_live_auctions'
        });
      }

      // 6. Pending payment requests
      const pendingPaymentReqs = scalar(
        `SELECT COUNT(*) AS val FROM payment_requests WHERE status = 'pending'`
      );
      if (pendingPaymentReqs > 0) {
        alerts.push({
          type: 'warning', icon: 'wallet',
          message: `${pendingPaymentReqs} طلبات دفع بانتظار المراجعة`,
          count: pendingPaymentReqs, action: 'payment_requests'
        });
      }

      // 7. Live auctions ending within 1 hour
      const endingSoonLive = scalar(
        `SELECT COUNT(*) AS val FROM cars
         WHERE status = 'live'
         AND auctionEndDate > datetime('now')
         AND auctionEndDate < datetime('now', '+1 hour')`
      );
      if (endingSoonLive > 0) {
        alerts.push({
          type: 'info', icon: 'clock',
          message: `${endingSoonLive} مزادات حية تنتهي خلال ساعة`,
          count: endingSoonLive, action: 'manage_live_auctions'
        });
      }

      // ─────────────────────── Top Lists ───────────────────────

      // Top 5 most bid-on cars (currently active)
      const topCars: any[] = db.prepare(`
        SELECT c.id AS carId, c.make, c.model, c.year, c.currentBid,
               COUNT(b.id) AS bidCount
        FROM cars c
        JOIN bids b ON b.carId = c.id
        WHERE c.status IN ('live', 'offer_market', 'closed')
        GROUP BY c.id
        ORDER BY bidCount DESC
        LIMIT 5
      `).all();

      // Top 5 most active buyers (by bid count + total spent on won cars)
      const topBuyers: any[] = db.prepare(`
        SELECT u.id AS userId,
               (u.firstName || ' ' || u.lastName) AS name,
               COUNT(b.id) AS bidCount,
               COALESCE((SELECT SUM(c2.currentBid) FROM cars c2 WHERE c2.winnerId = u.id AND c2.status = 'closed'), 0) AS totalSpent
        FROM users u
        JOIN bids b ON b.userId = u.id
        WHERE u.role != 'admin'
        GROUP BY u.id
        ORDER BY bidCount DESC
        LIMIT 5
      `).all();

      // Last 5 sold cars
      const recentSales: any[] = db.prepare(`
        SELECT c.id AS carId, c.make, c.model, c.year, c.currentBid AS salePrice,
               (u.firstName || ' ' || u.lastName) AS buyerName, c.auctionEndDate AS soldAt
        FROM cars c
        LEFT JOIN users u ON c.winnerId = u.id
        WHERE c.status = 'closed' AND c.winnerId IS NOT NULL
        ORDER BY c.auctionEndDate DESC
        LIMIT 5
      `).all();

      // Bid count per hour of day (all time, for peak-hours chart)
      const peakHoursRaw: any[] = db.prepare(`
        SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour, COUNT(*) AS count
        FROM bids
        GROUP BY hour
        ORDER BY hour
      `).all();

      // Fill in all 24 hours (some may have 0)
      const peakHoursMap: Record<number, number> = {};
      for (const row of peakHoursRaw) {
        peakHoursMap[row.hour] = row.count;
      }
      const peakHours: Array<{ hour: number; count: number }> = [];
      for (let h = 0; h < 24; h++) {
        peakHours.push({ hour: h, count: peakHoursMap[h] || 0 });
      }

      // ─────────────────────── Response ───────────────────────

      res.json({
        // Frontend (EnhancedOverview) reads `json.kpi` (singular). The legacy
        // `kpis` key was a typo that made the entire dashboard show zeros.
        // Send both for backward compat with anything else that may consume this.
        kpi: kpis,
        kpis,
        alerts,
        topCars,
        topBuyers,
        recentSales,
        peakHours,
      });
    } catch (err: any) {
      console.error('[ADMIN DASHBOARD OVERVIEW ERROR]', err);
      res.status(500).json({ error: 'فشل تحميل بيانات لوحة التحكم', details: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  DEALER PACKAGES
  // ══════════════════════════════════════════════════════════════

  // Public — list active packages (for pricing page)
  app.get("/api/packages", (_req, res) => {
    try {
      const packages = db.prepare("SELECT * FROM dealer_packages WHERE isActive = 1 ORDER BY sortOrder ASC").all() as any[];
      const parsed = packages.map((p: any) => ({
        ...p,
        features: p.features ? JSON.parse(p.features) : [],
      }));
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: "فشل تحميل الباقات", details: err.message });
    }
  });

  // Admin — assign package to user
  app.post("/api/admin/packages/:userId/assign", requireAdmin, (req, res) => {
    try {
      const { userId } = req.params;
      const { packageId, expiresAt } = req.body;

      // Validate package exists
      const pkg = db.prepare("SELECT * FROM dealer_packages WHERE id = ?").get(packageId) as any;
      if (!pkg) {
        return res.status(404).json({ error: "الباقة غير موجودة" });
      }

      // Validate user exists
      const user = db.prepare("SELECT id, firstName, lastName FROM users WHERE id = ?").get(userId) as any;
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }

      // Calculate expiry: use provided or default 30 days from now
      const expiry = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare("UPDATE users SET packageId = ?, packageExpiresAt = ? WHERE id = ?").run(packageId, expiry, userId);

      res.json({
        success: true,
        message: `تم تعيين باقة "${pkg.nameAr}" للمستخدم ${user.firstName} ${user.lastName}`,
        user: { id: userId, packageId, packageExpiresAt: expiry },
      });
    } catch (err: any) {
      res.status(500).json({ error: "فشل تعيين الباقة", details: err.message });
    }
  });

  // Admin — list all packages (including inactive)
  app.get("/api/admin/packages", requireAdmin, (_req, res) => {
    try {
      const packages = db.prepare("SELECT * FROM dealer_packages ORDER BY sortOrder ASC").all() as any[];
      const parsed = packages.map((p: any) => ({
        ...p,
        features: p.features ? JSON.parse(p.features) : [],
      }));
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: "فشل تحميل الباقات", details: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  AGENCY APPLICATIONS
  // ══════════════════════════════════════════════════════════════

  // Public — submit agency application
  app.post("/api/agency-applications", (req, res) => {
    try {
      const { fullName, cityCountry, phone, whatsapp, showroomName, expectedCarsPerMonth, notes } = req.body;

      if (!fullName || !cityCountry || !phone) {
        return res.status(400).json({ error: "الاسم والمدينة ورقم الهاتف مطلوبة" });
      }

      const id = `agency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();

      db.prepare(`INSERT INTO agency_applications (id, fullName, cityCountry, phone, whatsapp, showroomName, expectedCarsPerMonth, notes, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
        id, fullName, cityCountry, phone, whatsapp || null, showroomName || null, expectedCarsPerMonth || null, notes || null, createdAt
      );

      res.json({ success: true, message: "تم استلام طلبك بنجاح. سنتواصل معك قريباً!", id });
    } catch (err: any) {
      res.status(500).json({ error: "فشل إرسال الطلب", details: err.message });
    }
  });

  // Admin — list agency applications
  app.get("/api/admin/agency-applications", requireAdmin, (_req, res) => {
    try {
      const apps = db.prepare("SELECT * FROM agency_applications ORDER BY createdAt DESC").all();
      res.json(apps);
    } catch (err: any) {
      res.status(500).json({ error: "فشل تحميل الطلبات", details: err.message });
    }
  });

  // Admin — update application status
  app.post("/api/admin/agency-applications/:id/status", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNote } = req.body;
      db.prepare("UPDATE agency_applications SET status = ?, adminNote = ? WHERE id = ?").run(status, adminNote || null, id);
      res.json({ success: true, message: "تم تحديث حالة الطلب" });
    } catch (err: any) {
      res.status(500).json({ error: "فشل تحديث الطلب", details: err.message });
    }
  });
}
