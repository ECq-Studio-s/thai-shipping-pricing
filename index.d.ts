declare namespace getPricing {
    type Size = 'S' | 'M' | 'L' | 'XL' | 'XXL';
    type SizeMap<T> = Record<Size, T>;

    interface Courier {
        name: string;
        icon: string;
        logoFile: string;
        /** ราคา (บาท) ต่อขนาด, null = ไม่มีราคา, 'custom' = คิดราคาตามจริง */
        prices: SizeMap<number | 'custom' | null>;
        /** ค่าบริการเพิ่มสำหรับพื้นที่ห่างไกล (บาท) */
        remoteSurcharge: SizeMap<number | null>;
        supported: SizeMap<boolean>;
        unsupportedReason?: string;
        customPriceText?: string;
        customWarning?: string;
        /** ข้อความอ้างอิงที่มาของราคา */
        reference: string;
        /** URL หน้าเว็บของบริษัท หรือข้อความ "manual: ..." */
        source: string;
        fetchStatus: 'success' | 'failed' | 'manual' | 'pending';
        /** ISO 8601 */
        lastFetched: string | null;
    }

    interface SizeInfo {
        /** น้ำหนักสูงสุด (กก.) หรือ null = ไม่จำกัด */
        maxWeightKg: number | null;
        /** ผลรวม กว้าง+ยาว+สูง สูงสุด (ซม.) หรือ null = ไม่จำกัด */
        maxDimensionSumCm: number | null;
        description: string;
    }

    interface PricingData {
        /** ISO 8601 */
        lastUpdated: string;
        /** ข้อความแจ้งว่าราคาและขนาดเป็นค่าประมาณ */
        note?: string;
        sizeNote?: string;
        sizes?: SizeMap<SizeInfo>;
        couriers: Courier[];
        /** true = ข้อมูลสดจาก GitHub, false = ข้อมูลที่แนบมากับแพ็กเกจ */
        live: boolean;
    }

    interface Options {
        /** Timeout ของการดึงข้อมูล (ms) ค่าเริ่มต้น 10000 */
        timeout?: number;
        /** URL ของไฟล์ JSON ค่าเริ่มต้นคือ DEFAULT_URL */
        url?: string;
        /** true = ไม่ดึงข้อมูลสด ใช้ข้อมูลที่แนบมากับแพ็กเกจเลย */
        offline?: boolean;
        /** false = ถ้าดึงข้อมูลสดไม่ได้ให้ throw แทนการใช้ข้อมูลที่แนบมา ค่าเริ่มต้น true */
        fallback?: boolean;
        /** ข้อมูลที่ได้จาก getPricing() ก่อนหน้า ส่งมาเพื่อไม่ต้องโหลดซ้ำ */
        data?: PricingData;
    }

    interface QuoteOptions extends Options {
        /** true = รวมค่าบริการพื้นที่ห่างไกลใน total */
        remote?: boolean;
    }

    interface Quote {
        name: string;
        size: Size;
        /** ราคา (บาท) หรือ null เมื่อคิดราคาตามจริง (ดู priceText) */
        price: number | null;
        remoteSurcharge: number;
        /** price + remoteSurcharge (เมื่อ remote: true) หรือ null */
        total: number | null;
        priceText: string | null;
        warning: string | null;
        reference: string | null;
        fetchStatus: Courier['fetchStatus'] | null;
        lastFetched: string | null;
    }

    function getPricing(options?: Options): Promise<PricingData>;
    function quote(size: Size | Lowercase<Size>, options?: QuoteOptions): Promise<Quote[]>;
    function find(name: string, options?: Options): Promise<Courier | null>;
    function getBundled(): PricingData;
    /** หาขนาดจากน้ำหนัก (กก.) และผลรวม กว้าง+ยาว+สูง (ซม.) */
    function sizeOf(weightKg: number, dimensionSumCm?: number): Size;

    const SIZES: readonly Size[];
    const SIZE_INFO: Readonly<SizeMap<SizeInfo>>;
    const DEFAULT_URL: string;
}

declare function getPricing(options?: getPricing.Options): Promise<getPricing.PricingData>;

export = getPricing;
