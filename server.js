// ============================================
// Shipping Calculator Server
// Zero-dependency - ใช้เฉพาะ built-in modules
// ============================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0';

const DATA_DIR = path.join(__dirname, 'data');
const PRICING_FILE = path.join(DATA_DIR, 'courier_pricing.json');
const FALLBACK_FILE = path.join(DATA_DIR, 'courier_pricing_fallback.json');

// MIME types สำหรับ static files
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8'
};

// ============================================
// ฟังก์ชันอ่านไฟล์ pricing
// ============================================
function loadPricingData() {
    try {
        if (fs.existsSync(PRICING_FILE)) {
            const raw = fs.readFileSync(PRICING_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading pricing file:', e.message);
    }

    try {
        if (fs.existsSync(FALLBACK_FILE)) {
            const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading fallback file:', e.message);
    }

    return null;
}

// ============================================
// ฟังก์ชันแปลง pricing data สำหรับ frontend
// ============================================
function formatPricingResponse(data) {
    if (!data || !data.couriers) return null;

    const couriers = data.couriers.map(c => ({
        name: c.name,
        icon: c.icon,
        logoFile: c.logoFile,
        prices: c.prices,
        remoteSurcharge: c.remoteSurcharge,
        supported: c.supported,
        unsupportedReason: c.unsupportedReason || null,
        customPriceText: c.customPriceText || null,
        customWarning: c.customWarning || null,
        reference: c.reference,
        source: c.source || null,
        fetchStatus: c.fetchStatus || 'pending',
        lastFetched: c.lastFetched || null
    }));

    return {
        success: true,
        lastUpdated: data.lastUpdated || null,
        note: data.note || null,
        couriers: couriers
    };
}

// ============================================
// ฟังก์ชันส่ง JSON response
// ============================================
function sendJSON(res, statusCode, data) {
    const json = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(json);
}

// ============================================
// ฟังก์ชัน serve static files
// ============================================
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // ถ้าไม่เจอ index.html ให้ redirect ไป /index.html
                if (filePath.endsWith(path.sep) || filePath.endsWith('/')) {
                    const indexPath = path.join(filePath, 'index.html');
                    fs.readFile(indexPath, (err2, content2) => {
                        if (err2) {
                            sendJSON(res, 404, { error: 'Not Found' });
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(content2);
                        }
                    });
                } else {
                    sendJSON(res, 404, { error: 'Not Found' });
                }
            } else {
                sendJSON(res, 500, { error: 'Internal Server Error' });
            }
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

// ============================================
// Request Router
// ============================================
function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // ==========================================
    // Routes
    // ==========================================

    // GET / - Health check
    if (pathname === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            app: 'shipping-calc',
            time: new Date().toISOString()
        }));
        return;
    }

    // GET /api/pricing
    if (pathname === '/api/pricing' && method === 'GET') {
        const data = loadPricingData();
        if (data) {
            const formatted = formatPricingResponse(data);
            sendJSON(res, 200, formatted);
        } else {
            sendJSON(res, 500, {
                success: false,
                error: 'ไม่พบข้อมูลราคา',
                message: 'กรุณาติดต่อผู้ดูแลระบบ'
            });
        }
        return;
    }

    // GET /api/status
    if (pathname === '/api/status' && method === 'GET') {
        const pricingExists = fs.existsSync(PRICING_FILE);
        const fallbackExists = fs.existsSync(FALLBACK_FILE);
        let lastUpdated = null;

        if (pricingExists) {
            try {
                const data = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
                lastUpdated = data.lastUpdated;
            } catch (e) { /* ignore */ }
        }

        sendJSON(res, 200, {
            success: true,
            serverTime: new Date().toISOString(),
            status: {
                courierPricingExists: pricingExists,
                fallbackExists: fallbackExists,
                lastUpdated: lastUpdated
            }
        });
        return;
    }

    // POST /api/crawl - Trigger crawl ด้วยตนเอง
    if (pathname === '/api/crawl' && method === 'POST') {
        // รัน crawler แบบ async (ไม่รอ)
        try {
            const { runCrawler } = require('./crawler');
            console.log('🔄 Trigger crawl ด้วยตนเอง...');
            runCrawler(true).then(result => {
                if (result) console.log('✅ Crawl ด้วยตนเองสำเร็จ');
            }).catch(err => {
                console.error('❌ Crawl ด้วยตนเองล้มเหลว:', err.message);
            });
        } catch (e) {
            console.error('❌ ไม่สามารถเรียก crawler:', e.message);
        }

        sendJSON(res, 200, {
            success: true,
            message: 'เริ่มต้นดึงข้อมูลราคาแล้ว กรุณารอสักครู่แล้วโหลดหน้าเว็บใหม่',
            triggeredAt: new Date().toISOString()
        });
        return;
    }

    // POST /api/pricing/update - อัปเดตราคาด้วยตนเอง
    if (pathname === '/api/pricing/update' && method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { couriers } = JSON.parse(body);
                if (!couriers || !Array.isArray(couriers)) {
                    sendJSON(res, 400, { error: 'ต้องส่ง couriers เป็น array' });
                    return;
                }

                let data = loadPricingData();
                if (!data) {
                    sendJSON(res, 500, { error: 'ไม่มีข้อมูล base ให้อัปเดต' });
                    return;
                }

                for (const update of couriers) {
                    const target = data.couriers.find(c => c.name === update.name);
                    if (target) {
                        if (update.prices) target.prices = update.prices;
                        if (update.remoteSurcharge) target.remoteSurcharge = update.remoteSurcharge;
                        if (update.supported) target.supported = update.supported;
                        if (update.unsupportedReason) target.unsupportedReason = update.unsupportedReason;
                        if (update.customPriceText) target.customPriceText = update.customPriceText;
                        if (update.customWarning) target.customWarning = update.customWarning;
                        if (update.reference) target.reference = update.reference;
                        target.fetchStatus = 'manual';
                        target.lastFetched = new Date().toISOString();
                    }
                }

                data.lastUpdated = new Date().toISOString();
                fs.writeFileSync(PRICING_FILE, JSON.stringify(data, null, 2), 'utf8');

                sendJSON(res, 200, {
                    success: true,
                    message: 'อัปเดตข้อมูลเรียบร้อย',
                    lastUpdated: data.lastUpdated
                });
            } catch (e) {
                sendJSON(res, 500, { error: e.message });
            }
        });
        return;
    }

    // ==========================================
    // Static files (fallback)
    // ==========================================
    // ถ้าไม่ตรง route ไหน ให้ลอง serve static file
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    serveStaticFile(res, filePath);
}

// ============================================
// Start Server
// ============================================
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
    console.log('============================================');
    console.log('🚀 Shipping Calculator Server');
    console.log('   Zero-dependency mode');
    console.log(`   Port: ${PORT}`);
    console.log(`   Static: ${__dirname}`);
    console.log(`   API: /api/pricing`);
    console.log('============================================');

    if (fs.existsSync(PRICING_FILE)) {
        console.log('📦 พบข้อมูลราคาที่มีอยู่แล้ว');
    } else if (fs.existsSync(FALLBACK_FILE)) {
        console.log('📦 ใช้ข้อมูล fallback (ยังไม่มี courier_pricing.json)');
    } else {
        console.log('⚠️ ไม่พบไฟล์ข้อมูลราคาใดๆ');
    }
    console.log('============================================');
});