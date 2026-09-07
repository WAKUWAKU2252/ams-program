// เรขาคณิตของขอบเขตห้องบนผัง - พิกัดทุกตัวเป็น "สัดส่วนของภาพ" 0–1 ไม่ใช่ pixel

export type Point = [number, number];

/**
 * จุดอยู่ในรูปหลายเหลี่ยมไหม (ray casting)
 *
 * ★ ต้องเทียบกับรูปจริง ไม่ใช่กรอบสี่เหลี่ยมหุ้ม - ห้องที่ไม่ใช่สี่เหลี่ยม (โซนผลิตที่เว้ามุม,
 *   ห้องรูปตัว L) กรอบหุ้มจะกินพื้นที่ห้องข้างเคียงไปด้วย แล้วหมุดจะปักลงในที่ที่มองด้วยตา
 *   เห็นชัดว่าไม่ใช่ห้องนั้น
 *
 * จุดที่อยู่บนเส้นขอบพอดีถือว่า "อยู่ใน" หรือ "อยู่นอก" ไม่แน่นอนตามสูตร ray casting
 * มาตรฐาน - ยอมรับได้เพราะพิกัดมาจากการคลิกจริงซึ่งแทบไม่มีทางตกบนเส้นเป๊ะ
 */
export function pointInPolygon(polygon: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    // ตัดขอบบน/ล่างด้วย yi > y !== yj > y ก่อน แล้วค่อยหาจุดตัดในแนวนอน
    // (หารด้วย yj - yi ปลอดภัยเพราะเงื่อนไขแรกกันกรณีเส้นขนานแกน x ออกไปแล้ว)
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** กรอบสี่เหลี่ยมหุ้ม + จุดกึ่งกลาง - ใช้ตอนซูมไปหาห้องและวางป้ายชื่อ */
export function polygonBounds(polygon: Point[]) {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const [x, y] of polygon) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
