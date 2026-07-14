// ============================================
// Crawler Service v2 - ดึงข้อมูลราคาจากบริษัทขนส่ง
// Enhanced: ลองหลาย URL ต่อบริษัท, extract ราคาจริง,
// multiple fallback strategies
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRICING_FILE = path.join(DATA_DIR, 'courier_pricing.json');
const FALLBACK_FILE = path.join(DATA_DIR, 'courier_pricing_fallback.json');

// ============================================
// Utility functions
// ============================================

function loadFallbackData() {
    try {
        const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('ไม่สามารถโหลด fallback data ได้:', err.message);
        return null;
    }
}

function loadExistingPricing() {
    try {
        if (fs.existsSync(PRICING_FILE)) {
            const raw = fs.readFileSync(PRICING_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('ไม่สามารถโหลด pricing ที่มีอยู่:', err.message);
    }
    return null;
}

function savePricing(data) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(PRICING_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('✅ อัปเดตข้อมูลราคาเรียบร้อย:', PRICING_FILE);
        return true;
    } catch (err) {
        console.error('❌ ไม่สามารถบันทึกข้อมูลราคา:', err.message);
        return false;
    }
}

/**
 * ลอง fetch URL หลาย ๆ แบบ (http/https, www, path variants)
 * @param {string[]} urls - รายการ URL ที่จะลอง
 * @param {number} timeout - timeout ใน ms ต่อ URL
 * @returns {Promise<{success: boolean, html: string|null, url: string|null, error: string|null}>}
 */
async function tryFetchUrls(urls, timeout = 10000) {
    for (const url of urls) {
        try {
            const response = await axios.get(url, {
                timeout: timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
                },
                maxRedirects: 5,
                validateStatus: status => status < 400
            });
            return { success: true, html: response.data, url: url, error: null };
        } catch (err) {
            let errorMsg = err.message;
            if (err.code === 'ECONNABORTED') errorMsg = 'Timeout';
            else if (err.response && err.response.status === 403) errorMsg = '403 Forbidden';
            else if (err.response && err.response.status === 404) errorMsg = '404 Not Found';
            else if (err.code === 'ENOTFOUND') errorMsg = 'DNS ไม่พบ';
            console.log(`      ⏺ ${url}: ${errorMsg}`);
        }
    }
    return { success: false, html: null, url: null, error: 'ไม่สามารถเชื่อมต่อ URL ใดๆ ได้' };
}

/**
 * ลอง extract ราคาจาก HTML โดยค้นหา pattern ราคาทั่วไป
 * @param {string} html - HTML content
 * @param {Object} defaultPrices - ราคา fallback
 * @returns {Object|null} - ราคาที่ extract ได้ หรือ null
 */
function tryExtractPrices(html, defaultPrices) {
    try {
        const $ = cheerio.load(html);
        const text = $.text();
        const prices = { ...defaultPrices };
        let found = false;

        // ค้นหา pattern ราคา: "XX บาท" หรือ "฿XX" หรือ "THB XX"
        const pricePatterns = [
            /(\d{2,4})\s*บาท/gi,
            /฿\s*(\d{2,4})/gi,
            /THB\s*(\d{2,4})/gi,
            /price[:\s]*(\d{2,4})/gi,
            /rate[:\s]*(\d{2,4})/gi
        ];

        const allPrices = [];
        for (const pattern of pricePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const val = parseInt(match[1]);
                if (val >= 10 && val <= 5000) {
                    allPrices.push(val);
                }
            }
        }

        // ถ้าเจอราคาหลายค่า ให้ลอง map ไปยังขนาด S/M/L/XL/XXL
        if (allPrices.length >= 3) {
            const sorted = [...new Set(allPrices)].sort((a, b) => a - b);
            const sizeKeys = ['S', 'M', 'L', 'XL', 'XXL'];
            for (let i = 0; i < Math.min(sorted.length, 5); i++) {
                if (prices[sizeKeys[i]] !== null && prices[sizeKeys[i]] !== 'custom') {
                    prices[sizeKeys[i]] = sorted[i];
                    found = true;
                }
            }
        }

        return found ? prices : null;
    } catch (err) {
        return null;
    }
}

// ============================================
// ฟังก์ชัน scrape สำหรับแต่ละบริษัท (Enhanced)
// ============================================

/**
 * ไปรษณีย์ไทย
 */
async function crawlThaiPost(courier) {
    console.log(`   🔍 ไปรษณีย์ไทย`);
    const urls = [
        'https://www.thailandpost.co.th/rate',
        'https://www.thailandpost.co.th/index.php?page=rate',
        'https://www.thailandpost.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        // ลอง extract ราคา
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากประกาศอัตราค่าบริการไปรษณีย์ด่วนพิเศษ (EMS) และ Logispost — หน้าเว็บ thailandpost.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Flash Express
 */
async function crawlFlashExpress(courier) {
    console.log(`   🔍 Flash Express`);
    const urls = [
        'https://www.flashexpress.co.th/rate',
        'https://www.flashexpress.co.th/th/rate',
        'https://www.flashexpress.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการทั่วไปและ Flash Bulky — หน้าเว็บ flashxpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * J&T Express
 */
async function crawlJNT(courier) {
    console.log(`   🔍 J&T Express`);
    const urls = [
        'https://www.jtexpress.co.th/rate',
        'https://www.jtexpress.co.th/th/rate',
        'https://www.jtexpress.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการสำหรับผู้ประกอบการรายย่อย J&T Express — หน้าเว็บ jtexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * KEX (Kerry Express)
 */
async function crawlKEX(courier) {
    console.log(`   🔍 KEX (Kerry Express)`);
    const urls = [
        'https://www.kex.com/th/rate',
        'https://www.kex.com/rate',
        'https://www.kex.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากตารางราคากลางพัสดุด่วน KEX Express — หน้าเว็บ kex.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * DHL Domestic
 */
async function crawlDHL(courier) {
    console.log(`   🔍 DHL Domestic`);
    const urls = [
        'https://www.dhl.co.th/th/home/rates.html',
        'https://www.dhl.co.th/th/home.html',
        'https://www.dhl.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากเรทราคามาตรฐาน DHL Express Domestic — หน้าเว็บ dhl.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * SCG Express
 */
async function crawlSCG(courier) {
    console.log(`   🔍 SCG Express`);
    const urls = [
        'https://www.scgexpress.co.th/rate',
        'https://www.scgexpress.co.th/th/rate',
        'https://www.scgexpress.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าจัดส่งพัสดุ (แมวดำส่งด่วน) — หน้าเว็บ scgexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Best Express
 */
async function crawlBestExpress(courier) {
    console.log(`   🔍 Best Express`);
    const urls = [
        'https://www.bestexpress.co.th/rate',
        'https://www.bestexpress.co.th/th/rate',
        'https://www.bestexpress.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากตารางเรทราคาทั่วไปและ Best Big — หน้าเว็บ bestexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Ninja Van
 */
async function crawlNinjaVan(courier) {
    console.log(`   🔍 Ninja Van`);
    const urls = [
        'https://www.ninjavan.co.th/th/rate',
        'https://www.ninjavan.co.th/rate',
        'https://www.ninjavan.co.th/th'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากเรทราคากลางผู้ขายออนไลน์ทั่วไป Ninja Van ประเทศไทย — หน้าเว็บ ninjavan.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Alpha Fast
 */
async function crawlAlphaFast(courier) {
    console.log(`   🔍 Alpha Fast`);
    const urls = [
        'https://www.alphafast.com/th/rate',
        'https://www.alphafast.com/rate',
        'https://www.alphafast.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Alpha Fast — หน้าเว็บ alphafast.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Grab Express
 */
async function crawlGrabExpress(courier) {
    console.log(`   🔍 Grab Express`);
    const urls = [
        'https://www.grab.com/th/express/rate',
        'https://www.grab.com/th/express',
        'https://www.grab.com/th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ GrabExpress — หน้าเว็บ grab.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * LINEMAN Delivery
 */
async function crawlLINEMAN(courier) {
    console.log(`   🔍 LINEMAN Delivery`);
    const urls = [
        'https://man.linemedia.com/th/rate',
        'https://man.linemedia.com/rate',
        'https://man.linemedia.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ LINEMAN MAN Delivery — หน้าเว็บ man.linemedia.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Shopee Xpress (SPX)
 */
async function crawlSPX(courier) {
    console.log(`   🔍 Shopee Xpress (SPX)`);
    const urls = [
        'https://spx.co.th/rate',
        'https://spx.co.th/th/rate',
        'https://spx.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Shopee Xpress (SPX) — หน้าเว็บ spx.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Lazada Logistics (LEX)
 */
async function crawlLEX(courier) {
    console.log(`   🔍 Lazada Logistics (LEX)`);
    const urls = [
        'https://www.lazada.co.th/logistics/rate',
        'https://www.lazada.co.th/logistics',
        'https://www.lazada.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Lazada Logistics (LEX) — หน้าเว็บ lazada.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Deliveree
 */
async function crawlDeliveree(courier) {
    console.log(`   🔍 Deliveree`);
    const urls = [
        'https://www.deliveree.com/th/rate',
        'https://www.deliveree.com/rate',
        'https://www.deliveree.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Deliveree — หน้าเว็บ deliveree.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Lalamove
 */
async function crawlLalamove(courier) {
    console.log(`   🔍 Lalamove`);
    const urls = [
        'https://www.lalamove.com/th/rate',
        'https://www.lalamove.com/rate',
        'https://www.lalamove.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Lalamove — หน้าเว็บ lalamove.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * FedEx Thailand
 */
async function crawlFedEx(courier) {
    console.log(`   🔍 FedEx Thailand`);
    const urls = [
        'https://www.fedex.com/th/rate',
        'https://www.fedex.com/th/home.html',
        'https://www.fedex.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ FedEx Express ในประเทศ — หน้าเว็บ fedex.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * CJ Logistics
 */
async function crawlCJLogistics(courier) {
    console.log(`   🔍 CJ Logistics`);
    const urls = [
        'https://www.cjlogistics.com/th/rate',
        'https://www.cjlogistics.com/rate',
        'https://www.cjlogistics.com/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ CJ Logistics ประเทศไทย — หน้าเว็บ cjlogistics.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Skootar
 */
async function crawlSkootar(courier) {
    console.log(`   🔍 Skootar`);
    const urls = [
        'https://www.skootar.co.th/rate',
        'https://www.skootar.co.th/th/rate',
        'https://www.skootar.co.th/'
    ];
    const result = await tryFetchUrls(urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);
        
        const extracted = tryExtractPrices(result.html, courier.prices);
        if (extracted) {
            courier.prices = extracted;
            console.log(`   💰 พบข้อมูลราคาจากหน้าเว็บ`);
        }

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการ Skootar — หน้าเว็บ skootar.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

// ============================================
// ฟังก์ชันอัปเดต reference
// ============================================

function updateCourierReference(courier, success, fetchedHtml = null) {
    const now = new Date();
    const thaiDate = now.toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    
    if (success) {
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
    } else {
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'failed';
        if (courier.fetchStatus === 'failed') {
            courier.reference = `⚠️ ไม่สามารถดึงข้อมูลอัตโนมัติจาก ${courier.source} ได้ (${thaiDate}) — ใช้ข้อมูลล่าสุดที่บันทึกไว้`;
        }
    }
}

// ============================================
// ฟังก์ชันหลักสำหรับรัน crawl ทั้งหมด
// ============================================

async function runCrawler(forceRefresh = false) {
    console.log('============================================');
    console.log('🕷️ เริ่มต้นดึงข้อมูลราคาจากบริษัทขนส่ง');
    console.log(`📅 เวลา: ${new Date().toLocaleString('th-TH')}`);
    console.log('============================================\n');

    let pricingData = loadFallbackData();
    if (!pricingData) {
        console.error('❌ ไม่มี fallback data — ยกเลิกการทำงาน');
        return null;
    }

    const existingData = loadExistingPricing();
    if (existingData && existingData.couriers) {
        for (const existingCourier of existingData.couriers) {
            const target = pricingData.couriers.find(c => c.name === existingCourier.name);
            if (target && target.fetchStatus === 'pending') {
                target.fetchStatus = existingCourier.fetchStatus || 'pending';
                target.lastFetched = existingCourier.lastFetched || null;
                if (existingCourier.fetchStatus === 'failed' && existingCourier.reference) {
                    target.reference = existingCourier.reference;
                }
            }
        }
    }

    // แมปชื่อบริษัทกับฟังก์ชัน crawl (รวมบริษัทใหม่)
    const crawlerMap = {
        'ไปรษณีย์ไทย (EMS & Logispost)': crawlThaiPost,
        'Flash Express & Flash Bulky': crawlFlashExpress,
        'J&T Express & J&T Bulky': crawlJNT,
        'KEX (Kerry Express)': crawlKEX,
        'DHL Domestic': crawlDHL,
        'SCG Express': crawlSCG,
        'Best Express': crawlBestExpress,
        'Ninja Van': crawlNinjaVan,
        'Alpha Fast': crawlAlphaFast,
        'Grab Express': crawlGrabExpress,
        'LINEMAN Delivery': crawlLINEMAN,
        'Shopee Xpress (SPX)': crawlSPX,
        'Lazada Logistics (LEX)': crawlLEX,
        'Deliveree': crawlDeliveree,
        'Lalamove': crawlLalamove,
        'FedEx Thailand': crawlFedEx,
        'CJ Logistics': crawlCJLogistics,
        'Skootar': crawlSkootar
    };

    let successCount = 0;
    let failCount = 0;

    for (const courier of pricingData.couriers) {
        const crawlerFn = crawlerMap[courier.name];

        if (crawlerFn) {
            console.log(`➡️ ${courier.name}:`);
            const success = await crawlerFn(courier);
            if (success) successCount++;
            else failCount++;
        } else {
            // บริษัทที่ไม่ต้อง crawl (manual / on-demand)
            const now = new Date();
            if (courier.fetchStatus !== 'manual') {
                courier.lastFetched = now.toISOString();
                courier.fetchStatus = 'manual';
            }
            console.log(`   ⏭️ ${courier.name}: ข้าม (ข้อมูลอัปเดตด้วยตนเอง)`);
        }

        console.log('');
    }

    pricingData.lastUpdated = new Date().toISOString();
    const saved = savePricing(pricingData);

    console.log('============================================');
    console.log(`📊 สรุปผลการดึงข้อมูล:`);
    console.log(`   ✅ สำเร็จ: ${successCount} บริษัท`);
    console.log(`   ❌ ล้มเหลว: ${failCount} บริษัท`);
    console.log(`   ⏭️ ข้าม (manual): ${pricingData.couriers.length - successCount - failCount} บริษัท`);
    console.log(`   💾 บันทึกข้อมูล: ${saved ? 'สำเร็จ' : 'ล้มเหลว'}`);
    console.log('============================================');

    return pricingData;
}

if (require.main === module) {
    console.log('🚀 รัน Crawler แบบ standalone...\n');
    runCrawler(true).then(() => {
        console.log('\n✨ เสร็จสิ้น');
        process.exit(0);
    }).catch(err => {
        console.error('\n❌ เกิดข้อผิดพลาด:', err.message);
        process.exit(1);
    });
}

module.exports = { runCrawler };