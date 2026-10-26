'use strict';

// ============================================
// thai-shipping-pricing: ราคาค่าส่งพัสดุของบริษัทขนส่งในไทย
// Zero-dependency (ใช้ fetch ของ Node.js 18+)
// ============================================
const fs = require('fs');
const path = require('path');

// ข้อมูลล่าสุดที่ GitHub Actions อัปเดตทุกวัน
const DEFAULT_URL = 'https://raw.githubusercontent.com/ECq-Studio-s/thai-shipping-pricing/main/data/courier_pricing.json';
const SIZES = Object.freeze(['S', 'M', 'L', 'XL', 'XXL']);
const DEFAULTS = { timeout: 10000, url: DEFAULT_URL, offline: false, fallback: true };

function isValidData(data) {
    return Boolean(data && Array.isArray(data.couriers));
}

// ข้อมูลที่แนบมากับแพ็กเกจ (snapshot ตอน publish) ใช้เมื่อออฟไลน์หรือโหลดจาก GitHub ไม่ได้
// อ่านไฟล์ใหม่ทุกครั้ง เพื่อไม่ให้ผู้เรียกแก้ object แล้วไปกระทบการเรียกครั้งถัดไป
function getBundled() {
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'courier_pricing.json'), 'utf8');
    return { ...JSON.parse(raw), live: false };
}

async function fetchLive(url, timeout) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`ดึงข้อมูลราคาไม่สำเร็จ: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!isValidData(data)) {
        throw new Error('ข้อมูลราคาที่ได้รับไม่ถูกต้อง (ไม่มี couriers)');
    }
    return { ...data, live: true };
}

/**
 * ดึงข้อมูลราคาทั้งหมด
 * ลองดึงข้อมูลสดจาก GitHub ก่อน ถ้าไม่สำเร็จจะใช้ข้อมูลที่แนบมากับแพ็กเกจ (live: false)
 */
async function getPricing(options = {}) {
    const opts = { ...DEFAULTS, ...options };
    if (isValidData(opts.data)) return opts.data;
    if (opts.offline) return getBundled();
    try {
        return await fetchLive(opts.url, opts.timeout);
    } catch (err) {
        if (!opts.fallback) throw err;
        return getBundled();
    }
}

function normalizeSize(size) {
    const key = String(size || '').trim().toUpperCase();
    if (!SIZES.includes(key)) {
        throw new TypeError(`ขนาดไม่ถูกต้อง: "${size}" (ต้องเป็น ${SIZES.join(', ')})`);
    }
    return key;
}

/**
 * ราคาส่งพัสดุขนาด `size` ของทุกบริษัทที่รองรับ เรียงจากถูกไปแพง
 * บริษัทที่คิดราคาตามจริง (price: null) อยู่ท้ายสุด
 */
async function quote(size, options = {}) {
    const key = normalizeSize(size);
    const data = await getPricing(options);
    const remote = Boolean(options.remote);

    const quotes = [];
    for (const courier of data.couriers) {
        if (!courier.supported || !courier.supported[key]) continue;
        const raw = courier.prices ? courier.prices[key] : null;
        const price = typeof raw === 'number' ? raw : null;
        const surcharge = courier.remoteSurcharge && typeof courier.remoteSurcharge[key] === 'number'
            ? courier.remoteSurcharge[key]
            : 0;
        quotes.push({
            name: courier.name,
            size: key,
            price,
            remoteSurcharge: surcharge,
            total: price === null ? null : price + (remote ? surcharge : 0),
            priceText: courier.customPriceText || null,
            warning: courier.customWarning || null,
            reference: courier.reference || null,
            fetchStatus: courier.fetchStatus || null,
            lastFetched: courier.lastFetched || null
        });
    }

    return quotes.sort((a, b) => {
        if (a.total === null) return b.total === null ? 0 : 1;
        if (b.total === null) return -1;
        return a.total - b.total;
    });
}

/**
 * หาบริษัทขนส่งจากชื่อ (ไม่สนตัวพิมพ์เล็กใหญ่ และค้นหาบางส่วนของชื่อได้ เช่น "flash", "kerry")
 */
async function find(name, options = {}) {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    const data = await getPricing(options);
    return data.couriers.find(c => c.name.toLowerCase() === needle)
        || data.couriers.find(c => c.name.toLowerCase().includes(needle))
        || null;
}

module.exports = getPricing;
module.exports.getPricing = getPricing;
module.exports.quote = quote;
module.exports.find = find;
module.exports.getBundled = getBundled;
module.exports.SIZES = SIZES;
module.exports.DEFAULT_URL = DEFAULT_URL;
