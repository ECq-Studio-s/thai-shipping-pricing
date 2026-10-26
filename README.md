# thai-shipping-pricing

<p>
  <a href="https://www.npmjs.com/package/thai-shipping-pricing" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/thai-shipping-pricing.svg" />
  </a>
</p>

ราคาค่าส่งพัสดุของบริษัทขนส่งในไทยแบบคร่าว ๆ แยกตามขนาดกล่อง S ถึง XXL ใช้เทียบว่าเจ้าไหนถูกกว่า ใช้ผ่าน npm หรือโหลดไฟล์ JSON ไปใช้เองก็ได้

ราคาและเกณฑ์ขนาดทั้งหมดเป็นค่าประมาณ ตัวเลขอาจไม่ตรงกับราคาจริง 100% เพราะแต่ละเจ้าคิดราคาต่างกันทั้งน้ำหนัก ขนาดกล่อง ปลายทาง และโปรโมชัน ก่อนส่งของจริงควรเช็กราคากับบริษัทขนส่งอีกครั้ง

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

`quote()` คืนเฉพาะบริษัทที่รับขนาดนั้น เรียงจากถูกไปแพง
ส่งไปพื้นที่ห่างไกลให้ใส่ `{ remote: true }` แล้ว `total` จะบวกค่าพื้นที่ห่างไกลให้

ถ้าไม่รู้ว่าของเข้าขนาดไหน ใส่น้ำหนัก (กก.) กับผลรวม กว้าง+ยาว+สูง (ซม.) ให้ `sizeOf()` หาให้:

```js
const size = shipping.sizeOf(3, 70);   // 'M'
await shipping.quote(size);
```

### ขนาด

แต่ละขนส่งแบ่งขนาดไม่เหมือนกัน S ถึง XXL ในที่นี้เป็นค่ากลางที่ได้จากการเทียบเกณฑ์ของ KEX, Flash, J&T, SPX และกล่องไปรษณีย์ไทย
ดูทั้งน้ำหนักและผลรวม กว้าง+ยาว+สูง ถ้าอย่างใดอย่างหนึ่งเกินให้ขยับไปขนาดถัดไป

| ขนาด | น้ำหนัก | กว้าง+ยาว+สูง | ประมาณ |
|---|---|---|---|
| S | ไม่เกิน 2 กก. | ไม่เกิน 60 ซม. | ซองหรือกล่องไปรษณีย์เบอร์ A ถึง C |
| M | ไม่เกิน 10 กก. | ไม่เกิน 90 ซม. | กล่องไปรษณีย์เบอร์ D ถึง F |
| L | ไม่เกิน 20 กก. | ไม่เกิน 120 ซม. | กล่องใหญ่ที่ยังส่งเป็นพัสดุปกติได้ |
| XL | ไม่เกิน 50 กก. | ไม่เกิน 180 ซม. | บางเจ้าต้องใช้บริการพัสดุใหญ่ (Bulky) |
| XXL | เกิน 50 กก. | เกิน 180 ซม. | ของชิ้นใหญ่หรือเรียกรถ |

เกณฑ์ชุดนี้อยู่ใน `sizes` ของไฟล์ข้อมูล และใน `shipping.SIZE_INFO`

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
npx thai-shipping-pricing 3kg 70cm     # หนัก 3 กก. กว้าง+ยาว+สูง 70 ซม. (เว้นวรรคแบบ 3 kg ก็ได้)
npx thai-shipping-pricing 3kg -r       # บวกค่าพื้นที่ห่างไกล
npx thai-shipping-pricing kerry        # ราคาของเจ้าเดียว พิมพ์แค่บางส่วนของชื่อก็ได้
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

## ราคาและขนาดได้มาอย่างไร

ราคาเรากรอกเองจากอัตราที่แต่ละบริษัทประกาศ แล้วจัดเข้าขนาด S ถึง XXL ซึ่งเป็นค่ากลางที่ตั้งขึ้นจากการเทียบเกณฑ์ของหลายเจ้า ไม่ใช่ขนาดของบริษัทใดบริษัทหนึ่ง
ทุกวันระบบจะเช็กว่าเว็บของแต่ละเจ้ายังเปิดได้ แต่ไม่ได้อ่านราคาจากเว็บ ถ้าบริษัทปรับราคา ตัวเลขที่นี่จะเปลี่ยนตามหลังจากเราแก้ไฟล์เท่านั้น
ใครเจอราคาที่ไม่ตรง แจ้งได้ที่ [Issues](https://github.com/ECq-Studio-s/thai-shipping-pricing/issues)

## บริษัทที่มี

- ไปรษณีย์ไทย (EMS & Logispost)
- Flash Express & Flash Bulky
- J&T Express & J&T Bulky
- KEX (Kerry Express)
- NIM Express
- TP Logistics
- DHL Domestic
- Best Express
- Ninja Van
- บริการรถเหมาลำ On-Demand
- Grab Express
- LINEMAN Delivery
- Shopee Xpress (SPX)
- Lazada Logistics (LEX)
- Deliveree
- Lalamove
- FedEx Thailand
- CJ Logistics
- Skootar

NIM Express, TP Logistics และบริการรถเหมาลำไม่มีตารางราคาบนเว็บ ราคาของสามเจ้านี้หยาบกว่าเจ้าอื่น

## สำหรับผู้ดูแล repo

แก้ราคาที่ `data/courier_pricing_fallback.json` แล้ว commit ราคาใหม่จะเข้า `data/courier_pricing.json` ในรอบ crawl ถัดไป ถ้าไม่อยากรอ ให้กด Run workflow ที่ `Daily Crawl` ในแท็บ Actions
crawl ตั้งไว้ 00:00 UTC (07:00 น.) แต่ GitHub มักรันช้ากว่านั้นหลายชั่วโมง ปกติไฟล์จะอัปเดตราว 11 โมง

ออกเวอร์ชันใหม่บน npm: เพิ่มเลข `version` ใน `package.json` แล้ว push เข้า `main` workflow `publish npm` จะรัน test แล้ว publish ให้ ถ้าเลขนั้นมีบน npm แล้วก็จะข้ามไป

| ไฟล์ | ใช้ทำอะไร |
|------|---------|
| `data/courier_pricing_fallback.json` | ราคาและเกณฑ์ขนาดที่กรอกเอง |
| `data/courier_pricing.json` | ไฟล์ที่ crawler สร้าง หน้าเว็บ ecq-studio.com และแพ็กเกจ npm อ่านไฟล์นี้ |
| `crawler.js` | เช็กเว็บของแต่ละเจ้า แล้วสร้าง `courier_pricing.json` |
| `index.js`, `index.d.ts`, `bin/cli.js` | แพ็กเกจ npm และ command line |
| `server.js` | server สำหรับรันในเครื่อง มี `GET /api/pricing` กับ `GET /api/status` |
| `.github/workflows/` | crawl ทุกวัน, test, publish npm |
