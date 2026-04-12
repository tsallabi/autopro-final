import type { Express } from 'express';
import type { Server as SocketServer } from 'socket.io';
import type Database from 'better-sqlite3';

/**
 * Shared application context passed to all route/socket modules.
 * This avoids global state and makes dependencies explicit.
 */
export interface AppContext {
  app: Express;
  io: SocketServer;
  db: Database.Database;
  sendEmail: (opts: { to: string; subject: string; html: string; from?: string }) => Promise<void>;
  sendInternalMessage: (senderId: string, receiverId: string, subject: string, content: string, category?: string) => void;
  sendNotification: (userId: string, title: string, message: string, type?: string, templateId?: string, templateVars?: Record<string, string>, actionUrl?: string) => void;
  walletCredit: (userId: string, amount: number, description: string, refId?: string) => number;
  walletDebit: (userId: string, amount: number, description: string, refId?: string) => number;
  createWinInvoices: (winnerId: string, carId: string, amount: number) => any;
  completeInvoicePayment: (invoiceId: string, timestamp: string, paidVia: string) => void;
  ensureSellerWallet: (sellerId: string) => void;
  settleSaleToSellerWallet: (sellerId: string, carId: string, soldAmount: number, commissionRate: number, carDescription: string) => any;
  JWT_SECRET: string;
  SITE_URL: string;
  SALT_ROUNDS: number;
  stripeClient: any;
  PLUTU_API_KEY: string;
  PLUTU_ACCESS_TOKEN: string;
  PLUTU_SECRET_KEY: string;
  PLUTU_BASE_URL: string;
  PLUTU_ENABLED: boolean;
  transporter: any;
}
