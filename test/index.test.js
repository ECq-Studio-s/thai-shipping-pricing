'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shipping = require('..');
const fallback = require('../data/courier_pricing_fallback.json');

const realFetch = global.fetch;

function mockFetch(response) {
    const calls = [];
    global.fetch = async (url) => {
        calls.push(url);
        if (response instanceof Error) throw response;
        return { ok: response.status === 200, status: response.status, json: async () => response.body };
    };
    return calls;
}

test.afterEach(() => {
    global.fetch = realFetch;
});

const sizes = (value) => ({ S: value, M: value, L: value, XL: value, XXL: value });

const courier = (name, prices, extra = {}) => ({
    name,
    prices,
    remoteSurcharge: sizes(0),
    supported: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v !== null])),
    reference: `ref ${name}`,
    source: `https://example.com/${name}`,
    fetchStatus: 'success',
    lastFetched: '2026-10-26T00:00:00.000Z',
    ...extra
});

const DATA = {
    lastUpdated: '2026-10-26T00:00:00.000Z',
    couriers: [
        courier('Expensive Co', { S: 60, M: 120, L: null, XL: null, XXL: null }),
        courier('Cheap Express', { S: 30, M: 70, L: 200, XL: null, XXL: null }, {
            remoteSurcharge: { S: 50, M: 50, L: 100, XL: null, XXL: null }
        }),
        courier('Truck On-Demand', { S: null, M: 'custom', L: null, XL: null, XXL: null }, {
            customPriceText: 'เริ่มต้นประมาณ 300 บาท'
        })
    ]
};

test('getPricing returns live data from GitHub', async () => {
    const calls = mockFetch({ status: 200, body: DATA });
    const data = await shipping.getPricing();
    assert.equal(calls[0], shipping.DEFAULT_URL);
    assert.equal(data.live, true);
    assert.equal(data.couriers.length, 3);
});

test('the default export is getPricing', () => {
    assert.equal(shipping, shipping.getPricing);
});

test('falls back to bundled data when the network fails', async () => {
    mockFetch(new Error('offline'));
    const data = await shipping.getPricing();
    assert.equal(data.live, false);
    assert.ok(data.couriers.length > 0);
});

test('falls back to bundled data on HTTP errors and bad JSON', async () => {
    mockFetch({ status: 500, body: null });
    assert.equal((await shipping.getPricing()).live, false);
    mockFetch({ status: 200, body: { hello: 'world' } });
    assert.equal((await shipping.getPricing()).live, false);
});

test('fallback: false rejects instead', async () => {
    mockFetch({ status: 404, body: null });
    await assert.rejects(shipping.getPricing({ fallback: false }), /HTTP 404/);
});

test('offline: true never calls fetch', async () => {
    const calls = mockFetch({ status: 200, body: DATA });
    const data = await shipping.getPricing({ offline: true });
    assert.equal(calls.length, 0);
    assert.equal(data.live, false);
});

test('getBundled returns a fresh copy each time', () => {
    const a = shipping.getBundled();
    a.couriers.length = 0;
    assert.ok(shipping.getBundled().couriers.length > 0);
});

test('quote sorts by price and skips unsupported couriers', async () => {
    const quotes = await shipping.quote('m', { data: DATA });
    assert.deepEqual(quotes.map(q => q.name), ['Cheap Express', 'Expensive Co', 'Truck On-Demand']);
    assert.equal(quotes[0].size, 'M');
    assert.equal(quotes[0].total, 70);
    assert.equal(quotes[2].price, null);
    assert.equal(quotes[2].priceText, 'เริ่มต้นประมาณ 300 บาท');

    const large = await shipping.quote('L', { data: DATA });
    assert.deepEqual(large.map(q => q.name), ['Cheap Express']);
});

test('quote adds the remote surcharge only when asked', async () => {
    const normal = await shipping.quote('S', { data: DATA });
    const remote = await shipping.quote('S', { data: DATA, remote: true });
    assert.deepEqual(normal.map(q => [q.name, q.total]), [['Cheap Express', 30], ['Expensive Co', 60]]);
    // ค่าพื้นที่ห่างไกล 50 บาททำให้ Cheap Express (30 + 50) แพงกว่า Expensive Co (60)
    assert.deepEqual(remote.map(q => [q.name, q.total]), [['Expensive Co', 60], ['Cheap Express', 80]]);
    assert.equal(remote[1].remoteSurcharge, 50);
});

test('quote rejects unknown sizes', async () => {
    await assert.rejects(shipping.quote('XS', { data: DATA }), TypeError);
});

test('sizeOf picks the smallest size that fits both weight and dimensions', () => {
    assert.equal(shipping.sizeOf(0.5), 'S');
    assert.equal(shipping.sizeOf(2, 60), 'S');
    assert.equal(shipping.sizeOf(1, 61), 'M');
    assert.equal(shipping.sizeOf(8, 50), 'M');
    assert.equal(shipping.sizeOf(15), 'L');
    assert.equal(shipping.sizeOf(30, 150), 'XL');
    assert.equal(shipping.sizeOf(60), 'XXL');
    assert.equal(shipping.sizeOf(1, 200), 'XXL');
    assert.throws(() => shipping.sizeOf(-1), TypeError);
    assert.throws(() => shipping.sizeOf('3'), TypeError);
});

test('find matches names case-insensitively and by part of the name', async () => {
    assert.equal((await shipping.find('cheap', { data: DATA })).name, 'Cheap Express');
    assert.equal((await shipping.find('EXPENSIVE CO', { data: DATA })).name, 'Expensive Co');
    assert.equal(await shipping.find('nope', { data: DATA }), null);
    assert.equal(await shipping.find('', { data: DATA }), null);
});

// ตรวจไฟล์ข้อมูลจริง ให้แน่ใจว่าแก้ราคาด้วยมือแล้ว format ยังถูกต้อง
for (const file of ['courier_pricing.json', 'courier_pricing_fallback.json']) {
    test(`data/${file} is well-formed`, () => {
        const data = require(`../data/${file}`);
        let lastWeight = 0;
        for (const size of shipping.SIZES) {
            const info = data.sizes[size];
            assert.ok(info && info.description, `ไม่มีเกณฑ์ของขนาด ${size}`);
            if (size !== 'XXL') {
                assert.ok(info.maxWeightKg > lastWeight, `น้ำหนักของ ${size} ต้องมากกว่าขนาดก่อนหน้า`);
                lastWeight = info.maxWeightKg;
            }
        }
        const names = new Set();
        for (const c of data.couriers) {
            assert.ok(!names.has(c.name), `ชื่อซ้ำ: ${c.name}`);
            names.add(c.name);
            for (const size of shipping.SIZES) {
                assert.equal(typeof c.supported[size], 'boolean', `${c.name} supported.${size}`);
                const price = c.prices[size];
                assert.ok(price === null || price === 'custom' || (Number.isFinite(price) && price > 0), `${c.name} prices.${size} = ${price}`);
                if (c.supported[size]) assert.notEqual(price, null, `${c.name} รองรับ ${size} แต่ไม่มีราคา`);
            }
        }
    });
}

test('current data has the same couriers as the fallback', () => {
    const current = require('../data/courier_pricing.json');
    assert.deepEqual(current.couriers.map(c => c.name), fallback.couriers.map(c => c.name));
});
