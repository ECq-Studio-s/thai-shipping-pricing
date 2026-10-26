#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const shipping = require('..');

const HELP = `Usage: thai-shipping-pricing [ขนาด | น้ำหนัก ขนาดกล่อง | ชื่อบริษัท] [options]

Examples:
  thai-shipping-pricing              ราคาทุกบริษัท ทุกขนาด
  thai-shipping-pricing M            บริษัทที่ส่งขนาด M ได้ เรียงจากถูกไปแพง
  thai-shipping-pricing 3kg 70cm     หนัก 3 กก. กว้าง+ยาว+สูง 70 ซม.
  thai-shipping-pricing 3kg -r       หนัก 3 กก. ส่งพื้นที่ห่างไกล
  thai-shipping-pricing kerry        ราคาของบริษัทเดียว

Sizes:
${shipping.SIZES.map(size => {
    const info = shipping.SIZE_INFO[size];
    const limit = info.maxWeightKg === null ? 'ใหญ่กว่า XL' : `ไม่เกิน ${info.maxWeightKg} กก. และ ${info.maxDimensionSumCm} ซม.`;
    return `  ${size.padEnd(4)} ${limit}`;
}).join('\n')}

Options:
  -r, --remote   รวมค่าบริการพื้นที่ห่างไกล
  -o, --offline  ใช้ข้อมูลที่แนบมากับแพ็กเกจ ไม่ดึงข้อมูลสด
  -j, --json     แสดงผลเป็น JSON
  -h, --help     แสดงวิธีใช้`;

const WEIGHT = /^(\d+(?:\.\d+)?)(?:kg|กก\.?)?$/i;
const DIMENSION = /^(\d+(?:\.\d+)?)(?:cm|ซม\.?)$/i;

// อ่านคำที่พิมพ์มา: ขนาด (M), น้ำหนัก (3, 3kg), ขนาดกล่อง (70cm) หรือชื่อบริษัท
// ไม่ใช้ option แบบมีค่า เช่น --weight 3 เพราะ npx จะเอาไปเป็น option ของ npm เอง
function readWords(words) {
    const result = { size: null, weightKg: null, dimensionSumCm: null, name: [] };
    // รวมตัวเลขกับหน่วยที่พิมพ์แยกกัน เช่น "3 kg 70 cm" เป็น "3kg", "70cm"
    const joined = [];
    for (const word of words) {
        const prev = joined[joined.length - 1];
        if (prev && /^\d+(\.\d+)?$/.test(prev) && /^(kg|กก\.?|cm|ซม\.?)$/i.test(word)) {
            joined[joined.length - 1] = prev + word;
        } else {
            joined.push(word);
        }
    }
    for (const word of joined) {
        const upper = word.toUpperCase();
        let match;
        if (shipping.SIZES.includes(upper)) result.size = upper;
        else if ((match = word.match(DIMENSION))) result.dimensionSumCm = Number(match[1]);
        else if ((match = word.match(WEIGHT))) result.weightKg = Number(match[1]);
        else result.name.push(word);
    }
    return result;
}

function formatPrice(value) {
    if (typeof value === 'number') return `${value} บาท`;
    if (value === 'custom') return 'ตามจริง';
    return '-';
}

async function main() {
    let parsed;
    try {
        parsed = parseArgs({
            allowPositionals: true,
            options: {
                remote: { type: 'boolean', short: 'r' },
                offline: { type: 'boolean', short: 'o' },
                json: { type: 'boolean', short: 'j' },
                help: { type: 'boolean', short: 'h' }
            }
        });
    } catch (err) {
        console.error(`${err.message}\n\n${HELP}`);
        return 2;
    }
    const { values, positionals } = parsed;
    if (values.help) {
        console.log(HELP);
        return 0;
    }

    const words = readWords(positionals);
    const findName = words.name.join(' ');
    const wantsSize = words.size || words.weightKg !== null || words.dimensionSumCm !== null;
    if (findName && wantsSize) {
        console.error(`ไม่เข้าใจ "${findName}" ใส่ได้อย่างใดอย่างหนึ่ง: ขนาด, น้ำหนัก หรือชื่อบริษัท\n\n${HELP}`);
        return 2;
    }
    if (words.size && (words.weightKg !== null || words.dimensionSumCm !== null)) {
        console.error('ใส่ขนาด (เช่น M) หรือน้ำหนักกับขนาดกล่อง (เช่น 3kg 70cm) อย่างใดอย่างหนึ่ง');
        return 2;
    }
    const size = words.size || (wantsSize ? shipping.sizeOf(words.weightKg || 0, words.dimensionSumCm || 0) : null);

    const data = await shipping.getPricing({ offline: values.offline });
    const updated = `อัปเดตล่าสุด: ${new Date(data.lastUpdated).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}${data.live ? '' : ' (ใช้ข้อมูลในแพ็กเกจ อาจไม่ใช่ล่าสุด)'}`;

    if (findName) {
        const courier = await shipping.find(findName, { data });
        if (!courier) {
            console.error(`ไม่พบบริษัท "${findName}"`);
            return 1;
        }
        if (values.json) {
            console.log(JSON.stringify(courier, null, 2));
            return 0;
        }
        console.log(`${courier.name}\n`);
        for (const size of shipping.SIZES) {
            const text = courier.supported[size] ? formatPrice(courier.prices[size]) : 'ไม่รองรับ';
            console.log(`  ${size.padEnd(4)} ${text}`);
        }
        if (courier.customPriceText) console.log(`\n${courier.customPriceText}`);
        console.log(`\n${courier.reference}\n${updated}`);
        return 0;
    }

    if (size) {
        const quotes = await shipping.quote(size, { data, remote: values.remote });
        if (values.json) {
            console.log(JSON.stringify(quotes, null, 2));
            return 0;
        }
        console.log(`ขนาด ${size}: ${shipping.SIZE_INFO[size].description}${values.remote ? ' (พื้นที่ห่างไกล)' : ''}\n`);
        for (const q of quotes) {
            const text = q.total === null ? (q.priceText || 'ตามจริง') : `${q.total} บาท`;
            console.log(`  ${text.padEnd(24)} ${q.name}`);
        }
        console.log(`\n${updated}`);
        return 0;
    }

    if (values.json) {
        console.log(JSON.stringify(data, null, 2));
        return 0;
    }
    for (const courier of data.couriers) {
        const prices = shipping.SIZES
            .map(size => `${size} ${courier.supported[size] ? formatPrice(courier.prices[size]) : '-'}`)
            .join(' | ');
        console.log(`${courier.name}\n  ${prices}`);
    }
    console.log(`\n${updated}`);
    return 0;
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (err) => {
        console.error(err.message);
        process.exitCode = 1;
    }
);
