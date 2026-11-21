import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import express from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import QRCode from 'qrcode';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(currentDir, process.env.DATABASE_PATH ?? './data/opal.sqlite');
const paymentProofDirectory = path.resolve(currentDir, process.env.PAYMENT_PROOF_DIRECTORY ?? './data/payment-proofs');
const sessionSecret = process.env.SESSION_SECRET ?? 'local-development-session-secret-do-not-deploy';
const sessionCookie = 'opal_session';
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);

if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret.length < 32)) {
	throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		full_name TEXT NOT NULL,
		email TEXT NOT NULL COLLATE NOCASE UNIQUE,
		password_hash TEXT NOT NULL,
		password_salt TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
	CREATE TABLE IF NOT EXISTS newsletter_subscribers (
		email TEXT PRIMARY KEY COLLATE NOCASE,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS inquiries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		type TEXT NOT NULL,
		full_name TEXT NOT NULL,
		email TEXT NOT NULL COLLATE NOCASE,
		celebrity TEXT NOT NULL DEFAULT '',
		message TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'new',
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS celebrities (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		category TEXT NOT NULL,
		country TEXT NOT NULL,
		price TEXT NOT NULL,
		rating REAL NOT NULL DEFAULT 4.9,
		role TEXT NOT NULL DEFAULT '',
		image_url TEXT NOT NULL DEFAULT '',
		position INTEGER NOT NULL DEFAULT 0,
		featured INTEGER NOT NULL DEFAULT 1
	);
	CREATE TABLE IF NOT EXISTS booking_requests (
		id TEXT PRIMARY KEY,
		celebrity_id TEXT NOT NULL REFERENCES celebrities(id),
		celebrity_name TEXT NOT NULL,
		full_name TEXT NOT NULL,
		email TEXT NOT NULL DEFAULT '',
		phone TEXT NOT NULL,
		event_details_json TEXT NOT NULL,
		payment_method TEXT NOT NULL DEFAULT '',
		base_fee_cents INTEGER NOT NULL,
		service_fee_cents INTEGER,
		total_fee_cents INTEGER,
		proof_filename TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'request_received',
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS donation_requests (
		id TEXT PRIMARY KEY,
		celebrity_id TEXT NOT NULL REFERENCES celebrities(id),
		celebrity_name TEXT NOT NULL,
		full_name TEXT NOT NULL,
		email TEXT NOT NULL,
		amount_cents INTEGER NOT NULL,
		processing_fee_cents INTEGER NOT NULL,
		total_cents INTEGER NOT NULL,
		charity TEXT NOT NULL,
		personal_message TEXT NOT NULL DEFAULT '',
		payment_method TEXT NOT NULL,
		proof_filename TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'proof_received_pending_review',
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
`);

const celebrityColumns = new Set(db.prepare('PRAGMA table_info(celebrities)').all().map((column) => column.name));
const catalogMigrations = [
	['role', "TEXT NOT NULL DEFAULT ''"],
	['image_url', "TEXT NOT NULL DEFAULT ''"],
	['position', 'INTEGER NOT NULL DEFAULT 0'],
	['featured', 'INTEGER NOT NULL DEFAULT 1'],
];
for (const [column, definition] of catalogMigrations) {
	if (!celebrityColumns.has(column)) db.exec(`ALTER TABLE celebrities ADD COLUMN ${column} ${definition}`);
}

const seedCelebrities = [
	['ronan-keating', 'Ronan Patrick John Keating', 'music', 'Ireland', '$500,000', 'Singer, Songwriter, Actor, Television Presenter, Radio Host', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85'],
	['sam-heughan', 'Sam Roland Heughan', 'acting', 'United States', '$750,000', 'Actor, Producer, Author, Businessman', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=85'],
	['noah-fearnley', 'Noah Fearnley', 'acting', 'United States', '$200,000', 'Actor, Model', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=85'],
	['robert-downey-jr', 'Robert Downey Jr.', 'acting', 'United States', '$400,000', 'Actor, Producer', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=85'],
	['ariana-grande', 'Ariana Grande', 'music', 'United States', '$300,000', 'Singer, Songwriter, Actress', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85'],
	['charlize-theron', 'Charlize Theron', 'acting', 'South Africa', '$450,000', 'Actress, Producer', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=85'],
	['chris-hemsworth', 'Chris Hemsworth', 'acting', 'Australia', '$350,000', 'Actor', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=85'],
	['brad-pitt', 'William Bradley Pitt', 'acting', 'United States', '$500,000', 'Actor, Film Producer', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85'],
	['will-smith', 'Will Smith', 'acting', 'United States', '$400,000', 'Actor, Producer, Rapper', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=85'],
	['emma-watson', 'Emma Watson', 'acting', 'United Kingdom', '$350,000', 'Actress, Activist', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=85'],
	['tom-cruise', 'Tom Cruise', 'acting', 'United States', '$600,000', 'Actor, Producer', 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1000&q=85'],
	['scarlett-johansson', 'Scarlett Johansson', 'acting', 'United States', '$450,000', 'Actress, Singer', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1000&q=85'],
	['dwayne-johnson', 'Dwayne Johnson', 'acting', 'United States', '$500,000', 'Actor, Producer, Entrepreneur', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85'],
	['jennifer-lawrence', 'Jennifer Lawrence', 'acting', 'United States', '$400,000', 'Actress, Producer', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85'],
	['taylor-swift', 'Taylor Swift', 'music', 'United States', '$1,000,000', 'Singer, Songwriter', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=85'],
	['zendaya', 'Zendaya', 'acting', 'United States', '$350,000', 'Actress, Singer, Producer', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=85'],
	['leonardo-dicaprio', 'Leonardo DiCaprio', 'acting', 'United States', '$750,000', 'Actor, Producer, Environmentalist', 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1000&q=85'],
	['beyonce', 'Beyoncé', 'music', 'United States', '$900,000', 'Singer, Songwriter, Actress', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1000&q=85'],
	['keanu-reeves', 'Keanu Reeves', 'acting', 'Canada', '$400,000', 'Actor, Producer, Musician', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=85'],
	['rihanna', 'Rihanna', 'music', 'Barbados', '$850,000', 'Singer, Entrepreneur, Actress', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85'],
	['ryan-reynolds', 'Ryan Reynolds', 'acting', 'Canada', '$400,000', 'Actor, Producer, Entrepreneur', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=85'],
	['adele', 'Adele', 'music', 'United Kingdom', '$700,000', 'Singer, Songwriter', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=85'],
	['morgan-freeman', 'Morgan Freeman', 'acting', 'United States', '$450,000', 'Actor, Narrator, Producer', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85'],
	['selena-gomez', 'Selena Gomez', 'music', 'United States', '$350,000', 'Singer, Actress, Producer', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=85'],
	['hugh-jackman', 'Hugh Jackman', 'acting', 'Australia', '$400,000', 'Actor, Singer, Producer', 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1000&q=85'],
	['lady-gaga', 'Lady Gaga', 'music', 'United States', '$600,000', 'Singer, Songwriter, Actress', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85'],
	['daniel-craig', 'Daniel Craig', 'acting', 'United Kingdom', '$500,000', 'Actor, Producer', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=85'],
	['shakira', 'Shakira', 'music', 'Colombia', '$650,000', 'Singer, Songwriter, Dancer', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1000&q=85'],
	['ed-sheeran', 'Ed Sheeran', 'music', 'United Kingdom', '$550,000', 'Singer, Songwriter, Musician', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=85'],
];
const referenceOrder = [
	'ronan-keating', 'sam-heughan', 'noah-fearnley', 'ariana-grande',
	'robert-downey-jr', 'chris-hemsworth', 'brad-pitt', 'will-smith',
	'emma-watson', 'tom-cruise', 'scarlett-johansson', 'charlize-theron',
];
const referencePositions = new Map(referenceOrder.map((id, index) => [id, index]));
seedCelebrities.sort((first, second) => (referencePositions.get(first[0]) ?? referenceOrder.length) - (referencePositions.get(second[0]) ?? referenceOrder.length));
const insertCelebrity = db.prepare(`
	INSERT INTO celebrities (id, name, category, country, price, role, image_url, position, featured)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name, category = excluded.category, country = excluded.country,
		price = excluded.price, role = excluded.role, image_url = excluded.image_url,
		position = excluded.position, featured = excluded.featured
`);
db.transaction((celebrities) => celebrities.forEach((celebrity, index) => insertCelebrity.run(...celebrity, index + 1)))(seedCelebrities);

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });

app.disable('x-powered-by');
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			baseUri: ["'self'"],
			fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
			formAction: ["'self'", 'mailto:'],
			imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
			objectSrc: ["'none'"],
			scriptSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
			connectSrc: ["'self'"],
		},
	},
}));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use('/api', apiLimiter, (req, res, next) => {
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
	const origin = req.get('origin');
	if (origin && new URL(origin).host !== req.get('host')) {
		return res.status(403).json({ error: 'Request origin is not allowed.' });
	}
	next();
});

const paymentMethods = [
	{ id: 'bitcoin', label: 'Bitcoin', addressKey: 'BITCOIN_ADDRESS', qrScheme: 'bitcoin:' },
	{ id: 'ethereum', label: 'Ethereum', addressKey: 'ETHEREUM_ADDRESS', qrScheme: 'ethereum:' },
	{ id: 'litecoin', label: 'Litecoin', addressKey: 'LITECOIN_ADDRESS', qrScheme: 'litecoin:' },
	{ id: 'usdt', label: 'USDT', addressKey: 'USDT_ADDRESS', qrScheme: '', network: 'BEP20 / BNB Smart Chain' },
	{ id: 'busd', label: 'BUSD', addressKey: 'BUSD_ADDRESS', qrScheme: '' },
];

function parseServiceFeePercent() {
	const value = Number(process.env.BOOKING_SERVICE_FEE_PERCENT);
	return process.env.BOOKING_SERVICE_FEE_PERCENT?.trim() && Number.isFinite(value) && value >= 0 && value <= 100
		? value
		: null;
}

function parsePriceCents(value) {
	const numeric = Number(String(value).replace(/[^\d.]/g, ''));
	return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function getBankConfiguration() {
	const details = {
		bankName: process.env.BANK_NAME?.trim() || '',
		accountName: process.env.BANK_ACCOUNT_NAME?.trim() || '',
		accountNumber: process.env.BANK_ACCOUNT_NUMBER?.trim() || '',
		routingCode: process.env.BANK_ROUTING_OR_SORT_CODE?.trim() || '',
		branchCode: process.env.BANK_BRANCH_CODE?.trim() || '',
		swiftBic: process.env.BANK_SWIFT_BIC?.trim() || '',
		bankAddress: process.env.BANK_ADDRESS?.trim() || '',
		iban: process.env.BANK_IBAN?.trim() || '',
		referenceInstructions: process.env.BANK_REFERENCE_INSTRUCTIONS?.trim() || '',
	};
	const required = ['bankName', 'accountName', 'accountNumber', 'routingCode', 'swiftBic', 'referenceInstructions'];
	return { configured: required.every((key) => details[key]), details };
}

async function getPublicPaymentConfiguration() {
	const feePercent = parseServiceFeePercent();
	const feeConfigured = feePercent !== null;
	const methods = await Promise.all(paymentMethods.map(async (method) => {
		const address = process.env[method.addressKey]?.trim() || '';
		const configured = Boolean(address);
		const qrPayload = address ? `${method.qrScheme}${address}` : '';
		return {
			id: method.id,
			label: method.label,
			network: method.network ?? '',
			configured,
			disabledReason: !address ? 'Wallet details are not configured.' : '',
			address: configured ? address : '',
			qrDataUrl: configured ? await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 2, width: 256 }) : '',
		};
	}));
	const bank = getBankConfiguration();
	const bankTransfer = {
		id: 'bank_transfer',
		label: 'Bank Transfer',
		configured: bank.configured,
		disabledReason: !bank.configured ? 'Complete the bank details in the server environment.' : '',
		qrDataUrl: '',
	};
	return {
		serviceFeePercent: feePercent,
		feeConfigured,
		methods: [methods[0], methods[1], methods[2], bankTransfer, methods[3], methods[4]],
		bank,
	};
}

const paymentProofUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function normalizedEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hashSessionToken(token) {
	return crypto.createHmac('sha256', sessionSecret).update(token).digest('hex');
}

function isValidEmail(email) {
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asText(value, maxLength) {
	return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUser(user) {
	return { id: user.id, fullName: user.full_name, email: user.email };
}

function setSessionCookie(res, token) {
	res.cookie(sessionCookie, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/api',
		maxAge: sessionDurationMs,
	});
}

function clearSessionCookie(res) {
	res.clearCookie(sessionCookie, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/api',
	});
}

async function createSession(userId) {
	const token = crypto.randomBytes(32).toString('base64url');
	const expiresAt = Date.now() + sessionDurationMs;
	db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
		.run(hashSessionToken(token), userId, expiresAt);
	db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
	return token;
}

function getSessionUser(req) {
	const token = req.cookies[sessionCookie];
	if (!token) return null;
	const tokenHash = hashSessionToken(token);
	const row = db.prepare(`
		SELECT users.id, users.full_name, users.email
		FROM sessions JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?
	`).get(tokenHash, Date.now());
	return row ?? null;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/celebrities', (req, res) => {
	const search = asText(req.query.search, 100);
	const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
	const perPage = Math.min(24, Math.max(1, Number.parseInt(req.query.perPage, 10) || 12));
	const where = search ? 'WHERE instr(lower(name), lower(?)) > 0' : '';
	const parameters = search ? [search] : [];
	const total = db.prepare(`SELECT COUNT(*) AS count FROM celebrities ${where}`).get(...parameters).count;
	const rows = db.prepare(`
		SELECT id, name, category, country, price, rating, role, image_url, featured
		FROM celebrities ${where} ORDER BY position ASC LIMIT ? OFFSET ?
	`).all(...parameters, perPage, (page - 1) * perPage);
	res.json({ celebrities: rows, page, perPage, total, totalPages: Math.ceil(total / perPage) });
});

app.get('/api/celebrities/:id', (req, res) => {
	const celebrity = db.prepare(`
		SELECT id, name, category, country, price, rating, role, image_url, featured
		FROM celebrities WHERE id = ?
	`).get(asText(req.params.id, 100));
	if (!celebrity) return res.status(404).json({ error: 'Celebrity was not found.' });
	res.json({ celebrity, baseFeeCents: parsePriceCents(celebrity.price), serviceFeePercent: parseServiceFeePercent() });
});

app.get('/api/payment-config', async (_req, res, next) => {
	try {
		res.json(await getPublicPaymentConfiguration());
	} catch (error) {
		next(error);
	}
});

app.post('/api/bookings', paymentProofUpload.single('paymentProof'), async (req, res, next) => {
	let proofPath = '';
	try {
		const celebrityId = asText(req.body.celebrityId, 100);
		const fullName = asText(req.body.fullName, 100);
		const email = normalizedEmail(req.body.email);
		const phone = asText(req.body.phone, 40);
		const eventType = asText(req.body.eventType, 100);
		const eventLocation = asText(req.body.eventLocation, 250);
		const eventDate = asText(req.body.eventDate, 20);
		const eventTime = asText(req.body.eventTime, 20);
		const durationMinutes = Number.parseInt(req.body.durationMinutes, 10);
		const paymentMethod = asText(req.body.paymentMethod, 30);
		const requirements = asText(req.body.requirements, 3000);
		const acceptedTerms = req.body.acceptedTerms === 'true';
		const celebrity = db.prepare('SELECT id, name, price FROM celebrities WHERE id = ?').get(celebrityId);
		if (!celebrity) return res.status(404).json({ error: 'Celebrity was not found.' });
		if (fullName.length < 2 || !phone || !eventType || !eventLocation || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
			|| !eventTime || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || !acceptedTerms
			|| (email && !isValidEmail(email))) {
			return res.status(400).json({ error: 'Complete required event details and accept the booking terms. Email is optional.' });
		}

		const paymentConfiguration = await getPublicPaymentConfiguration();
		let selectedMethod = null;
		if (paymentMethod) {
			selectedMethod = paymentConfiguration.methods.find((method) => method.id === paymentMethod);
			if (!selectedMethod || !selectedMethod.configured) {
				return res.status(400).json({ error: 'That payment method is not configured yet. Submit a booking request without a payment method or contact support.' });
			}
			if (!req.file) return res.status(400).json({ error: 'Upload your payment receipt or proof for the selected manual payment method.' });
		}

		let proofFilename = '';
		if (req.file) {
			const detectedType = await fileTypeFromBuffer(req.file.buffer);
			const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'application/pdf']);
			if (!detectedType || !allowedTypes.has(detectedType.mime)) {
				return res.status(400).json({ error: 'Payment proof must be a PNG, JPG, GIF, or PDF file.' });
			}
			fs.mkdirSync(paymentProofDirectory, { recursive: true });
			proofFilename = `${crypto.randomUUID()}.${detectedType.ext}`;
			proofPath = path.join(paymentProofDirectory, proofFilename);
			fs.writeFileSync(proofPath, req.file.buffer, { flag: 'wx', mode: 0o600 });
		}

		const baseFeeCents = parsePriceCents(celebrity.price);
		const feePercent = parseServiceFeePercent();
		const serviceFeeCents = feePercent === null ? null : Math.round(baseFeeCents * feePercent / 100);
		const totalFeeCents = serviceFeeCents === null ? null : baseFeeCents + serviceFeeCents;
		const bookingId = crypto.randomUUID();
		const status = selectedMethod ? 'proof_received_pending_review' : 'booking_request_received';
		const eventDetails = {
			eventType,
			eventLocation,
			eventDate,
			eventTime,
			durationMinutes,
			gender: asText(req.body.gender, 30),
			requirements,
		};
		db.prepare(`
			INSERT INTO booking_requests (
				id, celebrity_id, celebrity_name, full_name, email, phone, event_details_json,
				payment_method, base_fee_cents, service_fee_cents, total_fee_cents, proof_filename, status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(bookingId, celebrity.id, celebrity.name, fullName, email, phone, JSON.stringify(eventDetails), paymentMethod,
			baseFeeCents, serviceFeeCents, totalFeeCents, proofFilename, status);
		res.status(201).json({ bookingId, status, paymentMethod, baseFeeCents, serviceFeeCents, totalFeeCents });
	} catch (error) {
		if (proofPath && fs.existsSync(proofPath)) fs.unlinkSync(proofPath);
		next(error);
	}
});

app.post('/api/donations', paymentProofUpload.single('paymentProof'), async (req, res, next) => {
	let proofPath = '';
	try {
		const celebrityId = asText(req.body.celebrityId, 100);
		const fullName = asText(req.body.fullName, 100);
		const email = normalizedEmail(req.body.email);
		const amount = Number(req.body.amount);
		const charity = asText(req.body.charity, 160);
		const personalMessage = asText(req.body.personalMessage, 1000);
		const paymentMethod = asText(req.body.paymentMethod, 30);
		const acceptedTerms = req.body.acceptedTerms === 'true';
		const celebrity = db.prepare('SELECT id, name FROM celebrities WHERE id = ?').get(celebrityId);
		if (!celebrity) return res.status(404).json({ error: 'Celebrity was not found.' });
		if (fullName.length < 2 || !isValidEmail(email) || !Number.isFinite(amount) || amount < 1 || amount > 1000000
			|| !charity || !acceptedTerms) {
			return res.status(400).json({ error: 'Enter valid donor details, a donation amount, a supported charity, and accept the donation terms.' });
		}

		const paymentConfiguration = await getPublicPaymentConfiguration();
		const selectedMethod = paymentConfiguration.methods.find((method) => method.id === paymentMethod && method.configured);
		if (!selectedMethod) return res.status(400).json({ error: 'Choose a configured payment method.' });
		const feePercent = parseServiceFeePercent();
		if (feePercent === null) return res.status(503).json({ error: 'Donation processing fee is not configured.' });
		if (!req.file) return res.status(400).json({ error: 'Upload your payment receipt or proof.' });

		const detectedType = await fileTypeFromBuffer(req.file.buffer);
		const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'application/pdf']);
		if (!detectedType || !allowedTypes.has(detectedType.mime)) {
			return res.status(400).json({ error: 'Payment proof must be a PNG, JPG, GIF, or PDF file.' });
		}
		fs.mkdirSync(paymentProofDirectory, { recursive: true });
		const proofFilename = `${crypto.randomUUID()}.${detectedType.ext}`;
		proofPath = path.join(paymentProofDirectory, proofFilename);
		fs.writeFileSync(proofPath, req.file.buffer, { flag: 'wx', mode: 0o600 });

		const amountCents = Math.round(amount * 100);
		const processingFeeCents = Math.round(amountCents * feePercent / 100);
		const totalCents = amountCents + processingFeeCents;
		const donationId = crypto.randomUUID();
		db.prepare(`
			INSERT INTO donation_requests (
				id, celebrity_id, celebrity_name, full_name, email, amount_cents, processing_fee_cents,
				total_cents, charity, personal_message, payment_method, proof_filename
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(donationId, celebrity.id, celebrity.name, fullName, email, amountCents, processingFeeCents,
			totalCents, charity, personalMessage, paymentMethod, proofFilename);
		res.status(201).json({ donationId, status: 'proof_received_pending_review', amountCents, processingFeeCents, totalCents });
	} catch (error) {
		if (proofPath && fs.existsSync(proofPath)) fs.unlinkSync(proofPath);
		next(error);
	}
});

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
	try {
		const fullName = asText(req.body.fullName, 100);
		const email = normalizedEmail(req.body.email);
		const password = typeof req.body.password === 'string' ? req.body.password : '';
		if (fullName.length < 2 || !isValidEmail(email) || password.length < 10 || password.length > 128) {
			return res.status(400).json({ error: 'Enter your name, a valid email, and a password between 10 and 128 characters.' });
		}
		const salt = crypto.randomBytes(16).toString('hex');
		const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
		let result;
		try {
			result = db.prepare('INSERT INTO users (full_name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
				.run(fullName, email, passwordHash, salt);
		} catch (error) {
			if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' });
			throw error;
		}
		const user = db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(result.lastInsertRowid);
		setSessionCookie(res, await createSession(user.id));
		res.status(201).json({ user: safeUser(user) });
	} catch (error) {
		next(error);
	}
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
	try {
		const email = normalizedEmail(req.body.email);
		const password = typeof req.body.password === 'string' ? req.body.password : '';
		const user = db.prepare('SELECT id, full_name, email, password_hash, password_salt FROM users WHERE email = ?').get(email);
		if (!user || password.length > 128) return res.status(401).json({ error: 'Email or password is incorrect.' });
		const candidate = await scrypt(password, user.password_salt, 64);
		const expected = Buffer.from(user.password_hash, 'hex');
		if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
			return res.status(401).json({ error: 'Email or password is incorrect.' });
		}
		setSessionCookie(res, await createSession(user.id));
		res.json({ user: safeUser(user) });
	} catch (error) {
		next(error);
	}
});

app.get('/api/auth/me', (req, res) => {
	const user = getSessionUser(req);
	if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
	res.json({ user: safeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
	const token = req.cookies[sessionCookie];
	if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
	clearSessionCookie(res);
	res.json({ status: 'signed_out' });
});

app.post('/api/newsletter', (req, res) => {
	const email = normalizedEmail(req.body.email);
	if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
	const result = db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(email);
	res.status(result.changes ? 201 : 200).json({ status: 'subscribed' });
});

app.post('/api/inquiries', (req, res) => {
	const type = asText(req.body.type, 30);
	const fullName = asText(req.body.fullName, 100);
	const email = normalizedEmail(req.body.email);
	const celebrity = asText(req.body.celebrity, 100);
	const message = asText(req.body.message, 3000);
	const validTypes = new Set(['booking', 'donation', 'fan_card', 'contact']);
	const emailIsValid = isValidEmail(email) || (type === 'booking' && email === '');
	if (!validTypes.has(type) || fullName.length < 2 || !emailIsValid || message.length < 10) {
		return res.status(400).json({ error: 'Complete your name, a valid email when required, and a message of at least 10 characters.' });
	}
	const result = db.prepare('INSERT INTO inquiries (type, full_name, email, celebrity, message) VALUES (?, ?, ?, ?, ?)')
		.run(type, fullName, email, celebrity, message);
	res.status(201).json({ status: 'received', inquiryId: result.lastInsertRowid });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use('/data', (_req, res) => res.sendStatus(404));
app.get('/book', (_req, res) => res.sendFile(path.join(currentDir, 'book.html')));
app.get('/booking', (_req, res) => res.sendFile(path.join(currentDir, 'booking.html')));
app.get('/booking.html', (_req, res) => res.redirect(302, '/book'));
app.get('/donate', (_req, res) => res.sendFile(path.join(currentDir, 'donate.html')));
app.use((req, res, next) => {
	const blockedPath = /^\/(?:node_modules|test|data)(?:\/|$)/.test(req.path)
		|| new Set(['/server.js', '/package.json', '/package-lock.json', '/README.md', '/.env.example']).has(req.path);
	if (blockedPath) return res.sendStatus(404);
	next();
});
app.use(express.static(currentDir, { dotfiles: 'deny', index: 'index.html' }));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(currentDir, 'index.html')));
app.use((error, _req, res, _next) => {
	console.error(error);
	if (res.headersSent) return;
	res.status(500).json({ error: 'The request could not be completed.' });
});

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
	const port = Number(process.env.PORT ?? 3000);
	app.listen(port, () => console.log(`Opal Stars API listening at http://localhost:${port}`));
}

export { app, db };