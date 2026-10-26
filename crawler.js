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
 * วันที่/เวลาแบบไทย โดยล็อกเขตเวลาเป็น Asia/Bangkok
 * (runner ของ GitHub Actions ใช้ UTC — ถ้าไม่ล็อกจะได้เวลาคลาดไป 7 ชม.)
 */
function formatThaiDate(date, withTime = false) {
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
    if (withTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return date.toLocaleDateString('th-TH', options);
}

// ============================================
// ตั้งค่าบริษัทที่ crawl อัตโนมัติ
// key = ชื่อบริษัทใน courier_pricing_fallback.json
//
// หมายเหตุ: crawler ตรวจสอบเพียงว่าหน้าเว็บของบริษัทเข้าถึงได้
// ราคา (prices) มาจาก courier_pricing_fallback.json เสมอ —
// เดิมเคยเดาราคาจากตัวเลข "XX บาท" ในหน้าเว็บ แต่ได้ค่าที่ผิด
// (เช่น Flash Express L = 35 บาท) จึงเลิกใช้ ถ้าต้องการดึงราคาจริง
// ให้เขียน parser เฉพาะของแต่ละบริษัทแทน
// ============================================
const COURIER_SOURCES = {
    'ไปรษณีย์ไทย (EMS & Logispost)': {
        label: 'ไปรษณีย์ไทย',
        site: 'thailandpost.co.th',
        description: 'ข้อมูลจากประกาศอัตราค่าบริการไปรษณีย์ด่วนพิเศษ (EMS) และ Logispost',
        urls: [
            'https://www.thailandpost.co.th/rate',
            'https://www.thailandpost.co.th/index.php?page=rate',
            'https://www.thailandpost.co.th/'
        ]
    },
    'Flash Express & Flash Bulky': {
        label: 'Flash Express',
        site: 'flashexpress.co.th',
        description: 'ข้อมูลจากอัตราค่าบริการทั่วไปและ Flash Bulky',
        urls: [
            'https://www.flashexpress.co.th/rate',
            'https://www.flashexpress.co.th/th/rate',
            'https://www.flashexpress.co.th/'
        ]
    },
    'J&T Express & J&T Bulky': {
        label: 'J&T Express',
        site: 'jtexpress.co.th',
        description: 'ข้อมูลจากอัตราค่าบริการสำหรับผู้ประกอบการรายย่อย J&T Express',
        urls: [
            'https://www.jtexpress.co.th/rate',
            'https://www.jtexpress.co.th/th/rate',
            'https://www.jtexpress.co.th/'
        ]
    },
    'KEX (Kerry Express)': {
        label: 'KEX (Kerry Express)',
        site: 'kex.com',
        description: 'ข้อมูลจากตารางราคากลางพัสดุด่วน KEX Express',
        urls: [
            'https://www.kex.com/th/rate',
            'https://www.kex.com/rate',
            'https://www.kex.com/'
        ]
    },
    'DHL Domestic': {
        label: 'DHL Domestic',
        site: 'dhl.co.th',
        description: 'ข้อมูลจากเรทราคามาตรฐาน DHL Express Domestic',
        urls: [
            'https://www.dhl.co.th/th/home/rates.html',
            'https://www.dhl.co.th/th/home.html',
            'https://www.dhl.co.th/'
        ]
    },
    'SCG Express': {
        label: 'SCG Express',
        site: 'scgexpress.co.th',
        description: 'ข้อมูลจากอัตราค่าจัดส่งพัสดุ (แมวดำส่งด่วน)',
        urls: [
            'https://www.scgexpress.co.th/rate',
            'https://www.scgexpress.co.th/th/rate',
            'https://www.scgexpress.co.th/'
        ]
    },
    'Best Express': {
        label: 'Best Express',
        site: 'bestexpress.co.th',
        description: 'ข้อมูลจากตารางเรทราคาทั่วไปและ Best Big',
        urls: [
            'https://www.bestexpress.co.th/rate',
            'https://www.bestexpress.co.th/th/rate',
            'https://www.bestexpress.co.th/'
        ]
    },
    'Ninja Van': {
        label: 'Ninja Van',
        site: 'ninjavan.co.th',
        description: 'ข้อมูลจากเรทราคากลางผู้ขายออนไลน์ทั่วไป Ninja Van ประเทศไทย',
        urls: [
            'https://www.ninjavan.co.th/th/rate',
            'https://www.ninjavan.co.th/rate',
            'https://www.ninjavan.co.th/th'
        ]
    },
    'Alpha Fast': {
        label: 'Alpha Fast',
        site: 'alphafast.com',
        description: 'ข้อมูลจากอัตราค่าบริการ Alpha Fast',
        urls: [
            'https://www.alphafast.com/th/rate',
            'https://www.alphafast.com/rate',
            'https://www.alphafast.com/'
        ]
    },
    'Grab Express': {
        label: 'Grab Express',
        site: 'grab.com',
        description: 'ข้อมูลจากอัตราค่าบริการ GrabExpress',
        urls: [
            'https://www.grab.com/th/express/rate',
            'https://www.grab.com/th/express',
            'https://www.grab.com/th/'
        ]
    },
    'LINEMAN Delivery': {
        label: 'LINEMAN Delivery',
        site: 'man.linemedia.com',
        description: 'ข้อมูลจากอัตราค่าบริการ LINEMAN MAN Delivery',
        urls: [
            'https://man.linemedia.com/th/rate',
            'https://man.linemedia.com/rate',
            'https://man.linemedia.com/'
        ]
    },
    'Shopee Xpress (SPX)': {
        label: 'Shopee Xpress (SPX)',
        site: 'spx.co.th',
        description: 'ข้อมูลจากอัตราค่าบริการ Shopee Xpress (SPX)',
        urls: [
            'https://spx.co.th/rate',
            'https://spx.co.th/th/rate',
            'https://spx.co.th/'
        ]
    },
    'Lazada Logistics (LEX)': {
        label: 'Lazada Logistics (LEX)',
        site: 'lazada.co.th',
        description: 'ข้อมูลจากอัตราค่าบริการ Lazada Logistics (LEX)',
        urls: [
            'https://www.lazada.co.th/logistics/rate',
            'https://www.lazada.co.th/logistics',
            'https://www.lazada.co.th/'
        ]
    },
    'Deliveree': {
        label: 'Deliveree',
        site: 'deliveree.com',
        description: 'ข้อมูลจากอัตราค่าบริการ Deliveree',
        urls: [
            'https://www.deliveree.com/th/rate',
            'https://www.deliveree.com/rate',
            'https://www.deliveree.com/'
        ]
    },
    'Lalamove': {
        label: 'Lalamove',
        site: 'lalamove.com',
        description: 'ข้อมูลจากอัตราค่าบริการ Lalamove',
        urls: [
            'https://www.lalamove.com/th/rate',
            'https://www.lalamove.com/rate',
            'https://www.lalamove.com/'
        ]
    },
    'FedEx Thailand': {
        label: 'FedEx Thailand',
        site: 'fedex.com',
        description: 'ข้อมูลจากอัตราค่าบริการ FedEx Express ในประเทศ',
        urls: [
            'https://www.fedex.com/th/rate',
            'https://www.fedex.com/th/home.html',
            'https://www.fedex.com/'
        ]
    },
    'CJ Logistics': {
        label: 'CJ Logistics',
        site: 'cjlogistics.com',
        description: 'ข้อมูลจากอัตราค่าบริการ CJ Logistics ประเทศไทย',
        urls: [
            'https://www.cjlogistics.com/th/rate',
            'https://www.cjlogistics.com/rate',
            'https://www.cjlogistics.com/'
        ]
    },
    'Skootar': {
        label: 'Skootar',
        site: 'skootar.co.th',
        description: 'ข้อมูลจากอัตราค่าบริการ Skootar',
        urls: [
            'https://www.skootar.co.th/rate',
            'https://www.skootar.co.th/th/rate',
            'https://www.skootar.co.th/'
        ]
    }
};

// ============================================
// ฟังก์ชัน crawl (ใช้ร่วมกันทุกบริษัท)
// ============================================

async function crawlCourier(courier, config) {
    console.log(`   🔍 ${config.label}`);
    const result = await tryFetchUrls(config.urls);
    if (result.success) {
        const $ = cheerio.load(result.html);
        const pageTitle = $('title').text().trim();
        console.log(`   📄 โหลดสำเร็จ: ${result.url} (${pageTitle ? pageTitle.substring(0, 50) : 'OK'})`);

        const now = new Date();
        courier.reference = `${config.description} — ตรวจสอบหน้าเว็บ ${config.site} ล่าสุดเมื่อ ${formatThaiDate(now)} (ราคาอ้างอิงจากข้อมูลที่ผู้ดูแลระบบบันทึกไว้)`;
        courier.lastFetched = now.toISOString();
        courier.fetchStatus = 'success';
        return true;
    } else {
        console.log(`   ❌ ${result.error}`);
        markCourierFailed(courier);
        return false;
    }
}

function markCourierFailed(courier) {
    const now = new Date();
    courier.lastFetched = now.toISOString();
    courier.fetchStatus = 'failed';
    courier.reference = `⚠️ ไม่สามารถดึงข้อมูลอัตโนมัติจาก ${courier.source} ได้ (${formatThaiDate(now, true)}) — ใช้ข้อมูลล่าสุดที่บันทึกไว้`;
}

// ============================================
// ฟังก์ชันหลักสำหรับรัน crawl ทั้งหมด
// ============================================

async function runCrawler(forceRefresh = false) {
    console.log('============================================');
    console.log('🕷️ เริ่มต้นดึงข้อมูลราคาจากบริษัทขนส่ง');
    console.log(`📅 เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
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


    let successCount = 0;
    let failCount = 0;

    for (const courier of pricingData.couriers) {
        const config = COURIER_SOURCES[courier.name];

        if (config) {
            console.log(`➡️ ${courier.name}:`);
            const success = await crawlCourier(courier, config);
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