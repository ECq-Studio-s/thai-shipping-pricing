#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const shipping = require('..');

const HELP = `Usage: thai-shipping-pricing [options] [size]

Examples:
  thai-shipping-pricing            ราคาทุกบริษัท ทุกขนาด
  thai-shipping-pricing M          บริษัทที่ส่งขนาด M ได้ เรียงจากถูกไปแพง
  thai-shipping-pricing M --remote รวมค่าบริการพื้นที่ห่างไกล
  thai-shipping-pricing --find flash

Sizes: ${shipping.SIZES.join(', ')}

Options:
  -f, --find <name>  แสดงข้อมูลของบริษัทเดียว
  -r, --remote       รวมค่าบริการพื้นที่ห่างไกล
  -o, --offline      ใช้ข้อมูลที่แนบมากับแพ็กเกจ ไม่ดึงข้อมูลสด
  -j, --json         แสดงผลเป็น JSON
  -h, --help         แสดงวิธีใช้`;

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
                find: { type: 'string', short: 'f' },
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
    if (positionals.length > 1) {
        console.error(HELP);
        return 2;
    }

    const data = await shipping.getPricing({ offline: values.offline });
    const updated = `อัปเดตล่าสุด: ${new Date(data.lastUpdated).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}${data.live ? '' : ' (ใช้ข้อมูลในแพ็กเกจ อาจไม่ใช่ล่าสุด)'}`;

    if (values.find) {
        const courier = await shipping.find(values.find, { data });
        if (!courier) {
            console.error(`ไม่พบบริษัท "${values.find}"`);
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

    if (positionals.length === 1) {
        let quotes;
        try {
            quotes = await shipping.quote(positionals[0], { data, remote: values.remote });
        } catch (err) {
            if (!(err instanceof TypeError)) throw err;
            console.error(err.message);
            return 2;
        }
        if (values.json) {
            console.log(JSON.stringify(quotes, null, 2));
            return 0;
        }
        console.log(`ขนาด ${quotes.length ? quotes[0].size : positionals[0]}${values.remote ? ' (พื้นที่ห่างไกล)' : ''}\n`);
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
