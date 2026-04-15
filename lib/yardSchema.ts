/**
 * Yard Management System — Database Schema
 * All tables for the yard management system.
 * Called from server.ts after main DB init.
 */
import type Database from 'better-sqlite3';

export function createYardSchema(db: Database.Database) {
  // ═══════════════════════════════════════════════════════════
  //  STATUSES (Reference table)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_statuses (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      nameAr TEXT NOT NULL,
      nameEn TEXT,
      color TEXT DEFAULT '#94a3b8',
      sortOrder INTEGER DEFAULT 0,
      isTerminal INTEGER DEFAULT 0,
      category TEXT
    );
  `);

  // Seed statuses
  const statuses = [
    { code: 'in_transit',            nameAr: 'في الطريق',               color: '#64748b', sortOrder: 1,  category: 'pre_arrival' },
    { code: 'arrived_port',          nameAr: 'وصلت الميناء',            color: '#0891b2', sortOrder: 2,  category: 'pre_arrival' },
    { code: 'entered_yard',          nameAr: 'دخلت الحضيرة',            color: '#2563eb', sortOrder: 3,  category: 'in_yard' },
    { code: 'listed_for_sale',       nameAr: 'معروضة للبيع',            color: '#16a34a', sortOrder: 4,  category: 'in_yard' },
    { code: 'reserved',              nameAr: 'محجوزة',                  color: '#ca8a04', sortOrder: 5,  category: 'in_yard' },
    { code: 'sold_pending_delivery', nameAr: 'مباعة — في انتظار التسليم', color: '#ea580c', sortOrder: 6,  category: 'in_yard' },
    { code: 'delivered_to_buyer',    nameAr: 'تم التسليم للمشتري',       color: '#059669', sortOrder: 7,  category: 'terminal', isTerminal: 1 },
    { code: 'withdrawn_by_dealer',   nameAr: 'جاهزة للاستلام من التاجر', color: '#c026d3', sortOrder: 8,  category: 'in_yard' },
    { code: 'delivered_to_dealer',   nameAr: 'تم التسليم للتاجر',        color: '#059669', sortOrder: 9,  category: 'terminal', isTerminal: 1 },
    { code: 'damaged',               nameAr: 'تالفة',                   color: '#dc2626', sortOrder: 10, category: 'special' },
    { code: 'pending_decision',      nameAr: 'بانتظار قرار',            color: '#f59e0b', sortOrder: 11, category: 'special' },
    { code: 'archived',              nameAr: 'مؤرشفة',                  color: '#6b7280', sortOrder: 99, category: 'terminal', isTerminal: 1 },
  ];

  const insertStatus = db.prepare(`INSERT OR IGNORE INTO yard_statuses (id, code, nameAr, color, sortOrder, isTerminal, category) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  statuses.forEach(s => insertStatus.run(`ys-${s.code}`, s.code, s.nameAr, s.color, s.sortOrder, s.isTerminal ? 1 : 0, s.category));

  // ═══════════════════════════════════════════════════════════
  //  YARD LOCATIONS (Physical spots in the yard)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_locations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      zone TEXT,
      rowNum INTEGER,
      slotNum INTEGER,
      isOccupied INTEGER DEFAULT 0,
      currentVehicleId TEXT,
      maxVehicleSize TEXT DEFAULT 'medium',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed 40 sample locations (A1-A10, B1-B10, C1-C10, D1-D10)
  const locCount = (db.prepare("SELECT COUNT(*) as c FROM yard_locations").get() as any).c;
  if (locCount === 0) {
    const insertLoc = db.prepare(`INSERT INTO yard_locations (id, code, zone, rowNum, slotNum) VALUES (?, ?, ?, ?, ?)`);
    ['A', 'B', 'C', 'D'].forEach((zone, zi) => {
      for (let i = 1; i <= 10; i++) {
        insertLoc.run(`yloc-${zone}${i}`, `${zone}-${String(i).padStart(2, '0')}`, zone, zi + 1, i);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  YARD VEHICLES (Central vehicle registry)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_vehicles (
      id TEXT PRIMARY KEY,
      vin TEXT UNIQUE NOT NULL,
      make TEXT,
      model TEXT,
      year INTEGER,
      color TEXT,
      mileage INTEGER,
      arrivalDate TEXT,
      containerNumber TEXT,
      yardLocationId TEXT,
      currentStatusId TEXT NOT NULL DEFAULT 'ys-entered_yard',

      -- Source info
      source TEXT DEFAULT 'other',
      sourceLotNumber TEXT,
      sourceUrl TEXT,
      purchasePrice REAL DEFAULT 0,
      purchaseDate TEXT,
      purchaseInvoice TEXT,

      -- Ownership (CRITICAL)
      ownershipType TEXT NOT NULL DEFAULT 'stock',
      ownerDealerId TEXT,
      depositAmount REAL DEFAULT 0,
      depositDate TEXT,
      depositReceipt TEXT,
      availableForSale INTEGER DEFAULT 1,

      -- Metadata
      notes TEXT,
      tags TEXT,
      linkedCarId TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      archivedAt TEXT,
      archivedReason TEXT,

      FOREIGN KEY (yardLocationId) REFERENCES yard_locations(id),
      FOREIGN KEY (currentStatusId) REFERENCES yard_statuses(id)
    );

    CREATE INDEX IF NOT EXISTS idx_yv_vin ON yard_vehicles(vin);
    CREATE INDEX IF NOT EXISTS idx_yv_status ON yard_vehicles(currentStatusId);
    CREATE INDEX IF NOT EXISTS idx_yv_ownership ON yard_vehicles(ownershipType);
    CREATE INDEX IF NOT EXISTS idx_yv_dealer ON yard_vehicles(ownerDealerId);
    CREATE INDEX IF NOT EXISTS idx_yv_source ON yard_vehicles(source);
    CREATE INDEX IF NOT EXISTS idx_yv_arrival ON yard_vehicles(arrivalDate);
  `);

  // ═══════════════════════════════════════════════════════════
  //  VEHICLE PHOTOS (Entry/Exit proof)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_vehicle_photos (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      photoType TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      uploadedBy TEXT,
      uploadedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_yvp_vehicle ON yard_vehicle_photos(vehicleId);
  `);

  // ═══════════════════════════════════════════════════════════
  //  DEALERS (Expanded from users for yard-specific info)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_dealers (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      whatsapp TEXT,
      email TEXT,
      idNumber TEXT,
      idPhoto TEXT,
      addressFull TEXT,
      city TEXT,
      trustRating INTEGER DEFAULT 3,
      totalVehiclesEver INTEGER DEFAULT 0,
      activeVehicles INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);

  // ═══════════════════════════════════════════════════════════
  //  STATUS CHANGE LOG (Full audit trail)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_status_log (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      fromStatusId TEXT,
      toStatusId TEXT NOT NULL,
      reason TEXT NOT NULL,
      changedBy TEXT NOT NULL,
      changedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      ipHash TEXT,
      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ysl_vehicle ON yard_status_log(vehicleId);
    CREATE INDEX IF NOT EXISTS idx_ysl_date ON yard_status_log(changedAt);
  `);

  // ═══════════════════════════════════════════════════════════
  //  GATE MOVEMENTS (In/Out records)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_gate_movements (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      movementType TEXT NOT NULL,
      gatePassNumber TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      gatekeeperId TEXT NOT NULL,

      -- Receiver (for OUT movements)
      receiverName TEXT,
      receiverPhone TEXT,
      receiverIdNumber TEXT,
      receiverIdPhoto TEXT,
      receiverSignature TEXT,
      authorizedFor TEXT,

      -- Proof
      photosJson TEXT,
      notes TEXT,

      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ygm_vehicle ON yard_gate_movements(vehicleId);
    CREATE INDEX IF NOT EXISTS idx_ygm_timestamp ON yard_gate_movements(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ygm_type ON yard_gate_movements(movementType);
  `);

  // ═══════════════════════════════════════════════════════════
  //  PARTNERSHIPS
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_partnerships (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      partnerDealerId TEXT NOT NULL,
      percentage REAL NOT NULL,
      investedAmount REAL DEFAULT 0,
      profitShare REAL DEFAULT 0,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vehicleId, partnerDealerId),
      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (partnerDealerId) REFERENCES yard_dealers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_yp_vehicle ON yard_partnerships(vehicleId);
  `);

  // ═══════════════════════════════════════════════════════════
  //  OWNERSHIP CHANGE LOG (CRITICAL SECURITY TABLE)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_ownership_change_log (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      oldOwnershipType TEXT,
      newOwnershipType TEXT,
      oldDealerId TEXT,
      newDealerId TEXT,
      reason TEXT NOT NULL,
      changedBy TEXT NOT NULL,
      approvedBy TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      ipHash TEXT,
      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id)
    );
  `);

  // ═══════════════════════════════════════════════════════════
  //  SECURITY INCIDENTS (Failed unauthorized attempts)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_security_incidents (
      id TEXT PRIMARY KEY,
      incidentType TEXT NOT NULL,
      vehicleId TEXT,
      userId TEXT,
      details TEXT,
      severity TEXT DEFAULT 'medium',
      ipHash TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved INTEGER DEFAULT 0,
      resolutionNotes TEXT
    );
  `);

  // ═══════════════════════════════════════════════════════════
  //  DAILY REPORTS (Auto-generated)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_daily_reports (
      id TEXT PRIMARY KEY,
      reportDate TEXT UNIQUE NOT NULL,
      openingBalance INTEGER DEFAULT 0,
      entriesCount INTEGER DEFAULT 0,
      salesCount INTEGER DEFAULT 0,
      withdrawalsCount INTEGER DEFAULT 0,
      closingBalance INTEGER DEFAULT 0,
      staleVehiclesJson TEXT,
      byStatusJson TEXT,
      byOwnershipJson TEXT,
      bySourceJson TEXT,
      movementsJson TEXT,
      generatedBySystem INTEGER DEFAULT 1,
      generatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ═══════════════════════════════════════════════════════════
  //  PHYSICAL AUDIT (Periodic yard inventory)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_audits (
      id TEXT PRIMARY KEY,
      startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      completedAt TEXT,
      auditorId TEXT NOT NULL,
      zone TEXT,
      expectedCount INTEGER,
      actualCount INTEGER,
      status TEXT DEFAULT 'in_progress',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS yard_audit_scans (
      id TEXT PRIMARY KEY,
      auditId TEXT NOT NULL,
      vin TEXT NOT NULL,
      vehicleId TEXT,
      scannedLocation TEXT,
      expectedLocation TEXT,
      isMatch INTEGER DEFAULT 0,
      scannedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (auditId) REFERENCES yard_audits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS yard_audit_discrepancies (
      id TEXT PRIMARY KEY,
      auditId TEXT NOT NULL,
      vehicleId TEXT,
      discrepancyType TEXT NOT NULL,
      expectedValue TEXT,
      actualValue TEXT,
      resolved INTEGER DEFAULT 0,
      resolutionNotes TEXT,
      resolvedBy TEXT,
      resolvedAt TEXT,
      FOREIGN KEY (auditId) REFERENCES yard_audits(id) ON DELETE CASCADE
    );
  `);

  // ═══════════════════════════════════════════════════════════
  //  STALE VEHICLE ALERTS (Notifications tracking)
  // ═══════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS yard_stale_alerts (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      daysStale INTEGER,
      alertType TEXT,
      notifiedUsers TEXT,
      sentAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicleId) REFERENCES yard_vehicles(id) ON DELETE CASCADE
    );
  `);

  console.log('[BOOT] Yard Management System schema ready — 12 tables.');
}
