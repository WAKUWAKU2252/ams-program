
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# ★★ ห้ามลบบรรทัดนี้ - .dockerignore ตัด .env ออกจาก build context (ถูกต้องแล้ว)
#    แต่ Vite อ่านค่าจาก .env เท่านั้น ไม่อ่าน .env.example พอไม่มีไฟล์ ค่าจะเป็น
#    undefined แล้วตกไปใช้ fallback ใน httpClient.ts คือ 'http://localhost:4000'
#    = เบราว์เซอร์ของทุกคนยิงไปหาเครื่องตัวเอง ไม่ใช่เซิร์ฟเวอร์ และพังเงียบ
#    (build ผ่าน ไม่มี error หน้าเว็บขึ้นปกติ แต่ทุก request ตาย)
#
#    '/api' เป็น path สัมพัทธ์ = โดเมนเดียวกับหน้าที่เปิดอยู่ ย้าย IP/พอร์ต/โดเมน
#    กี่ครั้งก็ไม่ต้อง build ใหม่ (nginx.conf เป็นคนตัด /api ส่งต่อ backend)
ENV VITE_API_BASE_URL=/api

RUN bun run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4001
