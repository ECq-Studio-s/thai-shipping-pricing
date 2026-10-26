# Thai Shipping Pricing — ข้อมูลราคาค่าจัดส่งจากบริษัทขนส่งไทย

อัปเดตข้อมูลราคาค่าจัดส่งจากบริษัทขนส่งในประเทศไทยโดยอัตโนมัติทุกวัน ด้วย GitHub Actions

## วิธีการทำงาน

1. **GitHub Actions** รัน `crawler.js` ทุกวันเวลา 00:00 UTC (07:00 น. ตามเวลาไทย)
2. Crawler ตรวจสอบว่าหน้าเว็บของแต่ละบริษัทขนส่งยังเข้าถึงได้ และบันทึกสถานะ (`fetchStatus`, `lastFetched`)
3. ราคา (`prices`) มาจาก `data/courier_pricing_fallback.json` ซึ่งผู้ดูแลระบบอัปเดตเอง — ผลลัพธ์ถูกบันทึกใน `data/courier_pricing.json`
4. Frontend (บน ecq-studio.com) โหลด JSON นี้ผ่าน `raw.githubusercontent.com`

## ไฟล์ใน repo นี้

| ไฟล์ | คำอธิบาย |
|------|---------|
| `crawler.js` | Script สำหรับดึงข้อมูลราคาจากบริษัทขนส่ง |
| `data/courier_pricing_fallback.json` | ข้อมูลสำรองเมื่อ crawler ยังไม่ทำงาน |
| `data/courier_pricing.json` | ข้อมูลล่าสุด (ถูกอัปเดตโดย GitHub Actions) |
| `.github/workflows/crawl.yml` | ตั้งค่า GitHub Actions ให้รัน crawler ทุกวัน |
| `server.js` | Server (ไม่มี dependency) สำหรับรันในเครื่อง — `GET /api/pricing`, `GET /api/status` |

## การอัปเดตราคา

แก้ราคาใน `data/courier_pricing_fallback.json` แล้ว commit — รอบ crawl ถัดไป (หรือกด *Run workflow* ใน GitHub Actions) จะนำราคาใหม่ไปใส่ใน `data/courier_pricing.json` ให้เอง

> **หมายเหตุ:** GitHub Actions แบบ schedule มักดีเลย์ในช่วงต้นชั่วโมง ข้อมูลจึงอาจอัปเดตช้ากว่า 07:00 น. หลายชั่วโมง

## บริษัทขนส่งที่รองรับ

สถานะ ✅ หมายถึง crawler ตรวจสอบหน้าเว็บอัตโนมัติ (ราคายังมาจากข้อมูลที่ผู้ดูแลบันทึกไว้)

| บริษัท | สถานะ |
|--------|--------|
| ไปรษณีย์ไทย (EMS & Logispost) | ✅ Crawl อัตโนมัติ |
| Flash Express & Flash Bulky | ✅ Crawl อัตโนมัติ |
| J&T Express & J&T Bulky | ✅ Crawl อัตโนมัติ |
| KEX (Kerry Express) | ✅ Crawl อัตโนมัติ |
| NIM Express | 📝 ข้อมูล manual |
| TP Logistics | 📝 ข้อมูล manual |
| DHL Domestic | ✅ Crawl อัตโนมัติ |
| Best Express | ✅ Crawl อัตโนมัติ |
| Ninja Van | ✅ Crawl อัตโนมัติ |
| บริการรถเหมาลำ On-Demand | 📝 ข้อมูล manual |
| Grab Express | ✅ Crawl อัตโนมัติ |
| LINEMAN Delivery | ✅ Crawl อัตโนมัติ |
| Shopee Xpress (SPX) | ✅ Crawl อัตโนมัติ |
| Lazada Logistics (LEX) | ✅ Crawl อัตโนมัติ |
| Deliveree | ✅ Crawl อัตโนมัติ |
| Lalamove | ✅ Crawl อัตโนมัติ |
| FedEx Thailand | ✅ Crawl อัตโนมัติ |
| CJ Logistics | ✅ Crawl อัตโนมัติ |
| Skootar | ✅ Crawl อัตโนมัติ |
