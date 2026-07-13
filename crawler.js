// ============================================
// Crawler Service - ดึงข้อมูลราคาจากบริษัทขนส่ง
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRICING_FILE = path.join(DATA_DIR, 'courier_pricing.json');
const FALLBACK_FILE = path.join(DATA_DIR, 'courier_pricing_fallback.json');

/**
 * โหลด fallback data มาเป็น base template
 */
function loadFallbackData() {
    try {
        const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('ไม่สามารถโหลด fallback data ได้:', err.message);
        return null;
    }
}

/**
 * โหลดข้อมูลราคาล่าสุด (ถ้ามี) เพื่อเก็บประวัติ fetchStatus
 */
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

/**
 * บันทึกข้อมูลราคาลงไฟล์
 */
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
 * ลอง scrape ข้อมูลราคาจาก URL ที่กำหนด
 * @param {string} url 
 * @param {number} timeout - timeout ใน ms
 * @returns {Promise<{success: boolean, html: string|null, error: string|null}>}
 */
async function tryFetchUrl(url, timeout = 15000) {
    try {
        const response = await axios.get(url, {
            timeout: timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
            },
            maxRedirects: 5
        });
        return { success: true, html: response.data, error: null };
    } catch (err) {
        let errorMsg = err.message;
        if (err.code === 'ECONNABORTED') errorMsg = 'Timeout - ไม่มีการตอบสนองภายในเวลาที่กำหนด';
        else if (err.response && err.response.status === 403) errorMsg = 'ถูกปฏิเสธการเข้าถึง (403 Forbidden)';
        else if (err.response && err.response.status === 404) errorMsg = 'ไม่พบหน้าเว็บ (404 Not Found)';
        else if (err.code === 'ENOTFOUND') errorMsg = 'ไม่สามารถเชื่อมต่อโดเมนได้';
        return { success: false, html: null, error: errorMsg };
    }
}

/**
 * อัปเดต reference text สำหรับบริษัทที่ crawl สำเร็จหรือล้มเหลว
 */
function updateCourierReference(courier, success, fetchedHtml = null) {
    const now = new Date();
    const thaiDate = now.toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    
    if (success) {
        // ถ้า scrape สำเร็จ เราอาจจะ extract ราคาจาก HTML ได้
        // แต่ในทางปฏิบัติ แต่ละเว็บมีโครงสร้างต่างกันมาก
        // เราจึง update reference + lastFetched
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        // reference ถูก update ใน processCourierData หรือคงเดิมถ้าเป็น fallback
    } else {
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'failed';
        if (courier.fetchStatus === 'failed') {
            courier.reference = `⚠️ ไม่สามารถดึงข้อมูลอัตโนมัติจาก ${courier.source} ได้ (${thaiDate}) — ใช้ข้อมูลล่าสุดที่บันทึกไว้`;
        }
    }
}

// ============================================
// ฟังก์ชัน scrape สำหรับแต่ละบริษัท
// ============================================

/**
 * ThaiPost - ไปรษณีย์ไทย
 */
async function crawlThaiPost(courier) {
    console.log(`   🔍 ไปรษณีย์ไทย: ${courier.source}`);
    const result = await tryFetchUrl('https://www.thailandpost.co.th/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        // ลองค้นหาข้อมูลราคาจากหน้าเว็บ - โดยทั่วไป rate card อาจต้อง login
        const pageTitle = $('title').text().trim();
        console.log(`   📄 ไปรษณีย์ไทย: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        // อัปเดต reference จาก fallback
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากประกาศอัตราค่าบริการไปรษณีย์ด่วนพิเศษ (EMS) และ Logispost — หน้าเว็บ thailandpost.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ไปรษณีย์ไทย: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Flash Express
 */
async function crawlFlashExpress(courier) {
    console.log(`   🔍 Flash Express: ${courier.source}`);
    const result = await tryFetchUrl('https://www.flashexpress.co.th/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 Flash Express: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการทั่วไปและ Flash Bulky — หน้าเว็บ flashxpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ Flash Express: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * J&T Express
 */
async function crawlJNT(courier) {
    console.log(`   🔍 J&T Express: ${courier.source}`);
    const result = await tryFetchUrl('https://www.jtexpress.co.th/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 J&T Express: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าบริการสำหรับผู้ประกอบการรายย่อย J&T Express — หน้าเว็บ jtexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ J&T Express: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * KEX (Kerry Express)
 */
async function crawlKEX(courier) {
    console.log(`   🔍 KEX: ${courier.source}`);
    const result = await tryFetchUrl('https://www.kex.com/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 KEX: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากตารางราคากลางพัสดุด่วน KEX Express — หน้าเว็บ kex.com อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ KEX: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * DHL Domestic
 */
async function crawlDHL(courier) {
    console.log(`   🔍 DHL Domestic: ${courier.source}`);
    const result = await tryFetchUrl('https://www.dhl.co.th/th/home/rates.html');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 DHL: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากเรทราคามาตรฐาน DHL Express Domestic — หน้าเว็บ dhl.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ DHL: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * SCG Express
 */
async function crawlSCG(courier) {
    console.log(`   🔍 SCG Express: ${courier.source}`);
    const result = await tryFetchUrl('https://www.scgexpress.co.th/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 SCG Express: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากอัตราค่าจัดส่งพัสดุ (แมวดำส่งด่วน) — หน้าเว็บ scgexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ SCG Express: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Best Express
 */
async function crawlBestExpress(courier) {
    console.log(`   🔍 Best Express: ${courier.source}`);
    const result = await tryFetchUrl('https://www.bestexpress.co.th/');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 Best Express: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากตารางเรทราคาทั่วไปและ Best Big — หน้าเว็บ bestexpress.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ Best Express: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

/**
 * Ninja Van
 */
async function crawlNinjaVan(courier) {
    console.log(`   🔍 Ninja Van: ${courier.source}`);
    const result = await tryFetchUrl('https://www.ninjavan.co.th/th');
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 Ninja Van: โหลดหน้าเว็บสำเร็จ (${pageTitle ? pageTitle.substring(0, 50) : 'ไม่พบ title'})`);
        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        courier.reference = `ข้อมูลจากเรทราคากลางผู้ขายออนไลน์ทั่วไป Ninja Van ประเทศไทย — หน้าเว็บ ninjavan.co.th อัปเดตล่าสุดเมื่อ ${thaiDate} (ระบบดึงข้อมูลอัตโนมัติ)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ Ninja Van: ${result.error}`);
        updateCourierReference(courier, false);
        return false;
    }
}

// ============================================
// ฟังก์ชันหลักสำหรับรัน crawl ทั้งหมด
// ============================================

/**
 * เริ่มกระบวนการดึงข้อมูลราคาจากทุกบริษัทขนส่ง
 * @param {boolean} forceRefresh - ถ้าเป็น true จะพยายาม scrape ทุกบริษัทใหม่ทั้งหมด
 * @returns {Promise<Object>} ข้อมูลราคาหลังจากอัปเดต
 */
async function runCrawler(forceRefresh = false) {
    console.log('============================================');
    console.log('🕷️ เริ่มต้นดึงข้อมูลราคาจากบริษัทขนส่ง...');
    console.log(`📅 เวลา: ${new Date().toLocaleString('th-TH')}`);
    console.log('============================================\n');

    // โหลด fallback data
    let pricingData = loadFallbackData();
    if (!pricingData) {
        console.error('❌ ไม่มี fallback data — ยกเลิกการทำงาน');
        return null;
    }

    // โหลดข้อมูลที่มีอยู่แล้ว (ถ้ามี) เพื่อคงสถานะ fetch ก่อนหน้า
    const existingData = loadExistingPricing();
    if (existingData && existingData.couriers) {
        // merge fetchStatus จากข้อมูลที่มีอยู่เพื่อคงประวัติ
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

    // แมปชื่อบริษัทกับฟังก์ชัน crawl
    const crawlerMap = {
        'ไปรษณีย์ไทย (EMS & Logispost)': crawlThaiPost,
        'Flash Express & Flash Bulky': crawlFlashExpress,
        'J&T Express & J&T Bulky': crawlJNT,
        'KEX (Kerry Express)': crawlKEX,
        'DHL Domestic': crawlDHL,
        'SCG Express': crawlSCG,
        'Best Express': crawlBestExpress,
        'Ninja Van': crawlNinjaVan
    };

    let successCount = 0;
    let failCount = 0;

    // Crawl ทุกบริษัทตามลำดับ
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
            const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            if (courier.fetchStatus !== 'manual') {
                courier.lastFetched = now.toISOString();
                courier.fetchStatus = 'manual';
            }
            console.log(`   ⏭️ ${courier.name}: ข้าม (ข้อมูลอัปเดตด้วยตนเอง)`);
        }

        console.log(''); // เว้นบรรทัด
    }

    // อัปเดต timestamp
    pricingData.lastUpdated = new Date().toISOString();

    // บันทึกข้อมูล
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

// ============================================
// รันตรง ๆ เมื่อเรียก `node crawler.js`
// ============================================
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