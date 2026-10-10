# Code Dojo บน Vercel

โครงสร้าง (ต้องอยู่ที่ราก repository บน GitHub):
- public/index.html — หน้าเว็บทั้งหมด
- api/handler.js — API สมัคร/ล็อกอิน/บันทึกความคืบหน้า (Vercel Serverless Function)
- vercel.json — ตั้งค่า (โฟลเดอร์ public + เส้นทาง /api/...)

## ขั้นตอน
1. แตก zip แล้วอัปโหลด "เนื้อใน" โฟลเดอร์นี้ขึ้น GitHub repository ใหม่ (เปิด repo > Add file > Upload files > ลากโฟลเดอร์ api, public และไฟล์ที่เหลือลงไป) ต้องเห็น api/ public/ vercel.json ที่หน้าแรกของ repo ไม่ใช่ซ้อนอยู่ในโฟลเดอร์อีกชั้น
2. vercel.com > Add New > Project > Import repo นั้น > Framework Preset เลือก Other > Deploy
3. เปิดโปรเจกต์ใน Vercel > แท็บ Storage (หรือ Marketplace) > สร้างฐานข้อมูล Upstash Redis (มีแพ็กเกจฟรี) > Connect to Project ระบบจะเติมตัวแปรสภาพแวดล้อมให้เอง
4. Settings > Environment Variables > เพิ่ม SECRET เป็นข้อความสุ่มยาว 32 ตัวขึ้นไป (สร้างได้ด้วย node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") ติ๊กทุก Environment
5. แท็บ Deployments > เลือกอันล่าสุด > Redeploy เพื่อให้ตัวแปรมีผล แล้วเปิดลิงก์ .vercel.app

ถ้ายังไม่ทำข้อ 3-4 เว็บยังเล่นได้ตามปกติแบบไม่ล็อกอิน (ความคืบหน้าเก็บในเบราว์เซอร์) แต่จะยังไม่มีปุ่มเข้าสู่ระบบ

## ข้อจำกัด
- ยังไม่มียืนยันอีเมลและรีเซ็ตรหัสผ่าน
- ความคืบหน้าส่งมาจากเบราว์เซอร์ จึงมีคนแก้ XP ตัวเองได้ถ้าตั้งใจ
- ชื่อเมนูและเงื่อนไขแพ็กเกจของ Vercel/Upstash อาจเปลี่ยนได้ ตรวจที่หน้าของผู้ให้บริการ
