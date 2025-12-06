
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB
const dbPath = path.join(__dirname, '../../users.db');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    customer_id TEXT UNIQUE,
    subscription_id TEXT,
    plan TEXT DEFAULT 'free',
    api_key TEXT UNIQUE,
    usage_count INTEGER DEFAULT 0,
    reset_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface User {
    id: number;
    email: string;
    customer_id?: string;
    subscription_id?: string;
    plan: 'free' | 'pro' | 'team' | 'enterprise';
    api_key: string;
    usage_count: number;
    reset_date: string;
    created_at: string;
}

export const userRepo = {
    create: (email: string, apiKey: string, plan: string = 'free') => {
        const stmt = db.prepare(`
      INSERT INTO users (email, api_key, plan, reset_date)
      VALUES (?, ?, ?, datetime('now', '+1 month'))
    `);
        const info = stmt.run(email, apiKey, plan);
        return info.lastInsertRowid;
    },

    findByApiKey: (apiKey: string): User | undefined => {
        const stmt = db.prepare('SELECT * FROM users WHERE api_key = ?');
        return stmt.get(apiKey) as User;
    },

    findByEmail: (email: string): User | undefined => {
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email) as User;
    },

    updateSubscription: (customerId: string, subscriptionId: string, plan: string, email: string) => {
        // Try to find by customer_id, if not, find by email and update customer_id
        const user = db.prepare('SELECT * FROM users WHERE customer_id = ?').get(customerId) as User;

        if (user) {
            db.prepare(`
        UPDATE users 
        SET subscription_id = ?, plan = ? 
        WHERE customer_id = ?
        `).run(subscriptionId, plan, customerId);
        } else {
            // Find by email or create new?
            // Usually Paddle gives email in webhook
            db.prepare(`
        UPDATE users 
        SET customer_id = ?, subscription_id = ?, plan = ? 
        WHERE email = ?
        `).run(customerId, subscriptionId, plan, email);
        }
    },

    incrementUsage: (apiKey: string) => {
        db.prepare('UPDATE users SET usage_count = usage_count + 1 WHERE api_key = ?').run(apiKey);
    }
};
