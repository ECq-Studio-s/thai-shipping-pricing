# thai-shipping-pricing

<p>
  <a href="https://www.npmjs.com/package/thai-shipping-pricing" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/thai-shipping-pricing.svg" />
  </a>
</p>

ราคาค่าส่งพัสดุของบริษัทขนส่งในไทย เก็บเป็นไฟล์ JSON และอัปเดตทุกวันด้วย GitHub Actions ใช้ผ่าน npm ได้

## ติดตั้ง

ใช้ Node.js 18 ขึ้นไป ไม่มี dependency

```sh
npm install thai-shipping-pricing
```

## ใช้งาน

หาเจ้าที่ถูกที่สุดสำหรับกล่องขนาด M:

```js
const shipping = require('thai-shipping-pricing');

const quotes = await shipping.quote('M');
console.log(quotes[0]);
// { name: 'Skootar', size: 'M', price: 60, total: 60, ... }
```

`quote()` คืนเฉพาะบริษัทที่รับขนาดนั้น เรียงจากถูกไปแพง ขนาดมี `S`, `M`, `L`, `XL`, `XXL`
ส่งไปพื้นที่ห่างไกลให้ใส่ `{ remote: true }` แล้ว `total` จะบวกค่าพื้นที่ห่างไกลให้

ดูราคาของเจ้าเดียว หรือเอาข้อมูลทั้งหมด:

```js
const kerry = await shipping.find('kerry');   // พิมพ์แค่บางส่วนของชื่อก็ได้
console.log(kerry.prices);                     // { S: 40, M: 90, L: 260, XL: 450, XXL: null }

const data = await shipping();                 // { lastUpdated, couriers, live }
```

TypeScript หรือ ES modules:

```ts
import shipping from 'thai-shipping-pricing';

const [cheapest] = await shipping.quote('S');
```

### Command line

```sh
npx thai-shipping-pricing              # ราคาทุกเจ้า
npx thai-shipping-pricing M            # ขนาด M เรียงจากถูกไปแพง
npx thai-shipping-pricing M --remote   # บวกค่าพื้นที่ห่างไกล
npx thai-shipping-pricing --find flash
npx thai-shipping-pricing M --json
```

### ตัวเลือก

ใส่เป็น argument ตัวสุดท้ายของทุกฟังก์ชัน:

```js
await shipping.quote('M', {
    remote: false,   // บวกค่าพื้นที่ห่างไกล
    timeout: 10000,  // ms
    offline: false,  // true = ไม่โหลดจาก GitHub ใช้ข้อมูลในแพ็กเกจเลย
    fallback: true,  // false = โหลดไม่ได้ให้ throw แทน
    data: undefined  // ใส่ผลจาก shipping() ที่โหลดไว้แล้ว จะได้ไม่ต้องโหลดซ้ำ
});
```

แพ็กเกจโหลด `data/courier_pricing.json` ล่าสุดจาก GitHub ทุกครั้งที่เรียก ราคาจึงตามไฟล์ใน repo โดยไม่ต้องอัปเดตแพ็กเกจ
ถ้าโหลดไม่ได้ เช่นไม่มีเน็ต จะใช้ไฟล์ที่ติดมากับแพ็กเกจแทน และ `live` เป็น `false`

## ราคามาจากไหน

ราคาทั้งหมดอยู่ใน `data/courier_pricing_fallback.json` และเรากรอกเอง crawler ไม่ได้อ่านราคาจากเว็บ
ทุกเช้า GitHub Actions จะรัน `crawler.js` เพื่อเช็กว่าเว็บของแต่ละเจ้ายังเปิดได้ แล้วเขียนผลลง `data/courier_pricing.json` พร้อมสถานะ `fetchStatus` และ `lastFetched`
หน้าเว็บบน ecq-studio.com โหลดไฟล์นี้จาก `raw.githubusercontent.com`

cron ตั้งไว้ 00:00 UTC (07:00 น.) แต่ GitHub มักรันช้ากว่านั้นหลายชั่วโมง ปกติไฟล์จะอัปเดตราว 11 โมง

### แก้ราคา

แก้ `data/courier_pricing_fallback.json` แล้ว commit ราคาใหม่จะเข้า `data/courier_pricing.json` ในรอบ crawl ถัดไป
ถ้าไม่อยากรอ ให้กด Run workflow ที่ workflow `Daily Crawl` ในแท็บ Actions

### Publish เวอร์ชันใหม่

เพิ่มเลข `version` ใน `package.json` แล้ว push เข้า `main` workflow `publish npm` จะรัน test แล้ว publish ให้
ถ้าเลขนั้นมีบน npm แล้วก็จะข้ามไป
ก่อน publish ครั้งแรกต้องตั้ง [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) บน npmjs.com หรือใส่ secret `NPM_TOKEN` ใน repo

## ไฟล์

| ไฟล์ | ใช้ทำอะไร |
|------|---------|
| `data/courier_pricing_fallback.json` | ราคาที่กรอกเอง แก้ราคาที่ไฟล์นี้ |
| `data/courier_pricing.json` | ไฟล์ที่ crawler สร้าง หน้าเว็บและแพ็กเกจ npm อ่านไฟล์นี้ |
| `crawler.js` | เช็กเว็บของแต่ละเจ้า แล้วสร้าง `courier_pricing.json` |
| `index.js`, `index.d.ts`, `bin/cli.js` | แพ็กเกจ npm และ command line |
| `server.js` | server สำหรับรันในเครื่อง มี `GET /api/pricing` กับ `GET /api/status` |
| `.github/workflows/` | crawl ทุกวัน, test, publish npm |

## บริษัทที่มี

"เช็กเว็บ" คือ crawler เปิดเว็บของเจ้านั้นทุกวัน ส่วน "กรอกเอง" คือไม่มีเว็บให้เช็ก ราคาของทุกเจ้ากรอกเองเหมือนกันหมด

| บริษัท | ข้อมูล |
|--------|--------|
| ไปรษณีย์ไทย (EMS & Logispost) | เช็กเว็บ |
| Flash Express & Flash Bulky | เช็กเว็บ |
| J&T Express & J&T Bulky | เช็กเว็บ |
| KEX (Kerry Express) | เช็กเว็บ |
| NIM Express | กรอกเอง |
| TP Logistics | กรอกเอง |
| DHL Domestic | เช็กเว็บ |
| Best Express | เช็กเว็บ |
| Ninja Van | เช็กเว็บ |
| บริการรถเหมาลำ On-Demand | กรอกเอง |
| Grab Express | เช็กเว็บ |
| LINEMAN Delivery | เช็กเว็บ |
| Shopee Xpress (SPX) | เช็กเว็บ |
| Lazada Logistics (LEX) | เช็กเว็บ |
| Deliveree | เช็กเว็บ |
| Lalamove | เช็กเว็บ |
| FedEx Thailand | เช็กเว็บ |
| CJ Logistics | เช็กเว็บ |
| Skootar | เช็กเว็บ |
