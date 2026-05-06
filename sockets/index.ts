import jwt from 'jsonwebtoken';
import type { AppContext } from '../lib/types.ts';
import { assertCanBid } from '../lib/buyerGuard.ts';

export function registerSocketHandlers(ctx: AppContext) {
  const { io, db, sendNotification, sendInternalMessage, createWinInvoices, JWT_SECRET } = ctx;

  // Socket.io JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      // Allow unauthenticated connections for public auction viewing
      (socket as any).user = null;
      return next();
    }
    try {
      const decoded: any = jwt.verify(token as string, JWT_SECRET);
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // Socket.io for Bidding
  io.on("connection", (socket) => {
    const socketUser = (socket as any).user;
    console.log("User connected:", socket.id, socketUser ? `(${socketUser.email})` : '(anonymous)');

    socket.on("join_auction", (data) => {
      const carId = typeof data === 'string' ? data : data?.carId;
      if (!carId) return;
      socket.join(carId);
      console.log(`User joined auction: ${carId}`);

      // The frontend uses car.auctionEndDate directly, no need for active timer sync
      const car: any = db.prepare("SELECT status, auctionEndDate FROM cars WHERE id = ?").get(carId);
      if (car && car.status === 'live') {
        socket.emit("timer_update", { carId });
      }
    });

    socket.on("join_user_room", (userId) => {
      // Only allow joining your own room
      if (socketUser && socketUser.id !== userId) return;
      socket.join(`user_${userId}`);
      console.log(`User joined personal room: user_${userId}`);
    });

    socket.on("send_message", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول" });
      const { receiverId, subject, content, category = 'general' } = data;
      const senderId = socketUser.id; // Use authenticated user, not client-supplied
      try {
        const id = sendInternalMessage(senderId, receiverId, subject, content, category);

        const sender: any = db.prepare("SELECT firstName, lastName FROM users WHERE id = ?").get(senderId);
        const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'النظام';
        sendNotification(receiverId, `رسالة جديدة: ${subject}`, `لديك رسالة جديدة من ${senderName}`, 'info');

      } catch (err) {
        console.error("Socket message error:", err);
      }
    });

    socket.on("place_bid", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول للمزايدة" });
      const { carId, amount, type } = data;
      const userId = socketUser.id; // Use authenticated user from JWT
      const timestamp = new Date().toISOString();
      const bidId = Date.now().toString();

      // Wrap all bid validation + placement in a transaction for atomicity
      let car: any, user: any, prevWinnerId: string | null;
      try {
        const bidResult = db.transaction(() => {
          const c: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
          const u: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

          if (!c || (c.status !== 'live' && c.status !== 'upcoming' && c.status !== 'ultimo')) {
            throw new Error("المزاد غير متاح حالياً");
          }
          if (c.status === 'ultimo' && userId !== c.winnerId) {
            throw new Error("نافذة Ultimo متاحة فقط لأعلى مزايد حالياً");
          }
          if (amount <= c.currentBid) {
            throw new Error("يجب أن تكون المزايدة أعلى من القيمة الحالية");
          }
          if (!u) {
            throw new Error("المستخدم غير موجود");
          }

          // 🔐 SECURITY: Block bids from non-active or non-deposited accounts.
          // Without this check, any registered user (incl. fresh OAuth signups
          // before admin approval) could bid as long as buyingPower > 0.
          assertCanBid(u);

          // Calculate total exposure atomically inside transaction
          const totalLeadingBids: any = (db.prepare("SELECT SUM(currentBid) as total FROM cars WHERE winnerId = ? AND status IN ('live', 'upcoming') AND id != ?").get(userId, carId) as any)?.total || 0;
          const totalExposurePlusNewBid = totalLeadingBids + amount;

          if (totalExposurePlusNewBid > u.buyingPower) {
            throw new Error(`إجمالي التزاماتك($${totalLeadingBids.toLocaleString()} + $${amount.toLocaleString()}) يتجاوز سقفك المالي($${u.buyingPower.toLocaleString()})`);
          }

          const prev = c.winnerId;
          db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(amount, userId, carId);
          db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, ?)").run(bidId, carId, userId, amount, timestamp, type || 'manual');

          return { car: c, user: u, prevWinnerId: prev };
        })();

        car = bidResult.car;
        user = bidResult.user;
        prevWinnerId = bidResult.prevWinnerId;
      } catch (err: any) {
        socket.emit("bid_error", { message: err.message });
        return;
      }

      // From here on, bid is committed — do non-transactional side effects
      console.log(`[BID] $${amount} by ${userId} for ${carId}`);

      // Anti-sniping: ensure at least 15 seconds remain after each bid
      if (car.status === 'live' && car.auctionEndDate) {
          const currentEndDate = new Date(car.auctionEndDate).getTime();
          const now = Date.now();
          const remaining = currentEndDate - now;
          const ANTI_SNIPE_MS = 15000; // 15 seconds

          if (remaining < ANTI_SNIPE_MS) {
            const newEndDate = new Date(now + ANTI_SNIPE_MS).toISOString();
            const addedMs = (now + ANTI_SNIPE_MS) - currentEndDate;
            db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, carId);
            io.to(carId).emit("car_updated", { id: carId, auctionEndDate: newEndDate });

            const addedSec = Math.ceil(addedMs / 1000);
            db.prepare(`
                UPDATE cars
                SET auctionEndDate = datetime(auctionEndDate, '+' || ? || ' seconds'),
                    auctionStartTime = datetime(auctionStartTime, '+' || ? || ' seconds')
                WHERE status = 'upcoming'
            `).run(addedSec, addedSec);

            io.emit("upcoming_cars_shifted", { shiftMs: addedMs });
          }
      }

      // INSTANT OUTBID NOTIFICATION (prevWinnerId comes from transaction)
      if (prevWinnerId && prevWinnerId !== userId) {
        sendNotification(prevWinnerId, "⚠️ تم تجاوز مزايدتك!", `قام شخص آخر بالمزايدة على ${car.make} ${car.model} بمبلغ $${amount.toLocaleString()}. زايد الآن لاستعادة الصدارة!`, 'warning', 'general_notification', {}, `/cars/${carId}`);
        io.to(`user_${prevWinnerId}`).emit("outbid", { carId, newBid: amount, make: car.make, model: car.model });
      }

      // If Ultimo bid meets reserve, close immediately
      if (car.status === 'ultimo' && amount >= car.reservePrice) {
        db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(carId);

        // Create invoices and shipment correctly
        createWinInvoices(userId, carId, amount);

        io.to(carId).emit("auction_closed", { carId, winnerId: userId, status: 'sold' });
      }

      // Bid already inserted in the transaction above

      const logEntry = {
        type: 'bid',
        amount,
        timestamp,
        firstName: user.firstName,
        lastName: user.lastName,
        make: car.make,
        model: car.model,
        lotNumber: car.lotNumber
      };
      // Broadcast bid and timer
      io.to(carId).emit("bid_updated", { carId, currentBid: amount, userId, timestamp, country: user.country, city: (user as any).city || null });
      io.emit("global_bid_update", { carId, currentBid: amount });
      io.emit("new_log", logEntry);

      // Broadcast wallet balance update to the user
      io.to(`user_${userId}`).emit("user_update", {
        id: userId,
        buyingPower: user.buyingPower,
        deposit: user.deposit
      });

      // PROXY BIDDING TRIGGER
      checkProxyBids(carId, userId, amount);
    });

    // Helper for automated proxy bidding
    const checkProxyBids = (carId: string, lastBidderId: string, currentAmount: number) => {
      // Find the highest proxy bid that isn't from the current top bidder
      const proxies: any = db.prepare("SELECT * FROM proxy_bids WHERE carId = ? AND userId != ? AND maxAmount > ? ORDER BY maxAmount DESC LIMIT 1").get(carId, lastBidderId, currentAmount);

      if (proxies) {
        // 🔐 SECURITY: Re-validate the proxy bidder. Their account may have been
        // suspended or had its deposit refunded since they set the proxy bid.
        const proxyOwner: any = db.prepare("SELECT * FROM users WHERE id = ?").get(proxies.userId);
        try {
          assertCanBid(proxyOwner);
        } catch {
          // Skip this proxy and remove it so it doesn't keep firing.
          db.prepare("DELETE FROM proxy_bids WHERE userId = ? AND carId = ?").run(proxies.userId, carId);
          return;
        }

        const nextAmount = currentAmount + 100; // Standard increment $100
        if (nextAmount <= proxies.maxAmount) {
          // System places bid automatically
          const timestamp = new Date().toISOString();
          const bidId = `proxy - ${Date.now()} `;

          db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(nextAmount, proxies.userId, carId);
          db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, 'proxy')").run(bidId, carId, proxies.userId, nextAmount, timestamp);

          console.log(`Proxy bid triggered for user ${proxies.userId}: $${nextAmount} `);

          const proxyUser: any = db.prepare("SELECT country, city FROM users WHERE id = ?").get(proxies.userId);
          io.to(carId).emit("bid_updated", { carId, currentBid: nextAmount, userId: proxies.userId, timestamp, country: proxyUser?.country, city: proxyUser?.city || null });
          io.emit("global_bid_update", { carId, currentBid: nextAmount });

          // Recursively check if another proxy triggers
          checkProxyBids(carId, proxies.userId, nextAmount);
        }
      }
    };

    socket.on("set_proxy_bid", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول" });
      const { carId, maxAmount } = data;
      const userId = socketUser.id; // Use authenticated user
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

      // 🔐 SECURITY: Same eligibility check as place_bid — reject proxies
      // from non-active / no-deposit accounts so they can't accumulate while
      // waiting for someone else to bid first.
      try {
        assertCanBid(user);
      } catch (err: any) {
        socket.emit("bid_error", { message: err.message });
        return;
      }

      if (!user || maxAmount > user.buyingPower) {
        socket.emit("bid_error", { message: "الحد الأقصى يتجاوز رصيدك المتاح" });
        return;
      }

      db.prepare("INSERT OR REPLACE INTO proxy_bids (userId, carId, maxAmount) VALUES (?, ?, ?)").run(userId, carId, maxAmount);
      socket.emit("proxy_bid_set", { carId, maxAmount });
      console.log(`Proxy bid set for user ${userId} on ${carId}: $${maxAmount} `);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });
}
