# Thai Shipping Pricing — ข้อมูลราคาค่าจัดส่งจากบริษัทขนส่งไทย

อัปเดตข้อมูลราคาค่าจัดส่งจากบริษัทขนส่งในประเทศไทยโดยอัตโนมัติทุกวัน ด้วย GitHub Actions

## วิธีการทำงาน

1. **GitHub Actions** รัน `crawler.js` ทุกวันเวลา 00:00 UTC (07:00 น. ตามเวลาไทย)
2. Crawler พยายามดึงข้อมูลราคาจากหน้าเว็บของแต่ละบริษัทขนส่ง
3. ผลลัพธ์ถูกบันทึกใน `data/courier_pricing.json`
4. Frontend (บน ecq-studio.com) โหลด JSON นี้ผ่าน `raw.githubusercontent.com`

## ไฟล์ใน repo นี้

| ไฟล์ | คำอธิบาย |
|------|---------|
| `crawler.js` | Script สำหรับดึงข้อมูลราคาจากบริษัทขนส่ง |
| `data/courier_pricing_fallback.json` | ข้อมูลสำรองเมื่อ crawler ยังไม่ทำงาน |
| `data/courier_pricing.json` | ข้อมูลล่าสุด (ถูกอัปเดตโดย GitHub Actions) |
| `.github/workflows/crawl.yml` | ตั้งค่า GitHub Actions ให้รัน crawler ทุกวัน |

## บริษัทขนส่งที่รองรับ

| บริษัท | สถานะ |
|--------|--------|
| ไปรษณีย์ไทย (EMS & Logispost) | ✅ Crawl อัตโนมัติ |
| Flash Express & Flash Bulky | ✅ Crawl อัตโนมัติ |
| J&T Express & J&T Bulky | ✅ Crawl อัตโนมัติ |
| KEX (Kerry Express) | ✅ Crawl อัตโนมัติ |
| NIM Express | 📝 ข้อมูล manual |
| TP Logistics | 📝 ข้อมูล manual |
| DHL Domestic | ✅ Crawl อัตโนมัติ |
| SCG Express | ✅ Crawl อัตโนมัติ |
| Best Express | ✅ Crawl อัตโนมัติ |
| Ninja Van | ✅ Crawl อัตโนมัติ |
| บริการรถเหมาลำ On-Demand | 📝 ข้อมูล manual |
| Alpha Fast | ✅ Crawl อัตโนมัติ |
| Grab Express | ✅ Crawl อัตโนมัติ |
| LINEMAN Delivery | ✅ Crawl อัตโนมัติ |
| Shopee Xpress (SPX) | ✅ Crawl อัตโนมัติ |
| Lazada Logistics (LEX) | ✅ Crawl อัตโนมัติ |
| Deliveree | ✅ Crawl อัตโนมัติ |
| Lalamove | ✅ Crawl อัตโนมัติ |
| FedEx Thailand | ✅ Crawl อัตโนมัติ |
| CJ Logistics | ✅ Crawl อัตโนมัติ |
| Skootar | ✅ Crawl อัตโนมัติ |
