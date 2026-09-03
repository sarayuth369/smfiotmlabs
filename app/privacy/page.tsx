import type { Metadata } from "next";
import { SiteHeader } from "../_components/SiteHeader";
import { SiteFooter } from "../_components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | SMF IoT",
  description: "Privacy Policy and data handling practices for SMF IoT.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl sm:text-2xl font-bold text-brand-800">{title}</h2>
      <div className="mt-3 space-y-3 text-brand-900/80 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-bg py-14 sm:py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="chip">🔒 Privacy</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-brand-800 tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-2 text-lg text-brand-900/70">นโยบายความเป็นส่วนตัว</p>
            <p className="mt-4 text-sm text-brand-900/60">Last Updated: September 3, 2026</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-brand-900/80 leading-relaxed">
              SMF IoT (&ldquo;เรา&rdquo;) ให้บริการแพลตฟอร์ม Smart Farm IoT ซึ่งประกอบด้วยเว็บแดชบอร์ด
              แอปพลิเคชันมือถือ และอุปกรณ์ IoT นโยบายความเป็นส่วนตัวฉบับนี้อธิบายว่าเราเก็บรวบรวม ใช้
              จัดเก็บ และคุ้มครองข้อมูลของคุณอย่างไรเมื่อคุณใช้บริการของเรา
            </p>

            <Section title="1. ข้อมูลที่เราเก็บรวบรวม (Information We Collect)">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>ข้อมูลบัญชีผู้ใช้:</strong> ชื่อ อีเมล และรหัสผ่าน (จัดเก็บแบบเข้ารหัสผ่าน
                  ผู้ให้บริการ Authentication ของเรา) ที่ใช้สำหรับสมัครสมาชิกและเข้าสู่ระบบ
                </li>
                <li>
                  <strong>ข้อมูลอุปกรณ์และเซนเซอร์:</strong> ค่าที่วัดได้จากอุปกรณ์ IoT ของคุณ (เช่น
                  อุณหภูมิ ความชื้น ค่าดิน สถานะรีเลย์) รหัสอุปกรณ์ และประวัติคำสั่งควบคุมอุปกรณ์
                </li>
                <li>
                  <strong>ข้อมูลการชำระเงิน:</strong> เมื่อคุณอัปเกรดแพ็กเกจ การชำระเงินจะดำเนินการผ่าน
                  ผู้ให้บริการชำระเงินภายนอก เราไม่จัดเก็บเลขบัตรเครดิต/เดบิตของคุณเอง
                </li>
                <li>
                  <strong>โทเคนการแจ้งเตือน:</strong> Push notification token ของอุปกรณ์มือถือ (สำหรับส่ง
                  แจ้งเตือนผ่านแอป) และการเชื่อมต่อ LINE (หากคุณเปิดใช้งาน) เพื่อส่งแจ้งเตือนผ่าน LINE
                </li>
                <li>
                  <strong>ข้อมูลการใช้งานทั่วไป:</strong> log การเข้าใช้งาน, IP address, และข้อมูลอุปกรณ์/
                  เบราว์เซอร์ที่จำเป็นสำหรับความปลอดภัยและการแก้ไขปัญหาระบบ
                </li>
              </ul>
            </Section>

            <Section title="2. วัตถุประสงค์ในการใช้ข้อมูล (How We Use Information)">
              <ul className="list-disc pl-5 space-y-2">
                <li>เพื่อให้บริการแดชบอร์ด ควบคุมอุปกรณ์ และแสดงผลข้อมูลเซนเซอร์แบบเรียลไทม์</li>
                <li>เพื่อส่งการแจ้งเตือนที่เกี่ยวข้องกับบัญชีและอุปกรณ์ของคุณ (เว็บ, มือถือ, LINE)</li>
                <li>เพื่อดำเนินการเรื่องการสมัครสมาชิกและการต่ออายุแพ็กเกจ</li>
                <li>เพื่อรักษาความปลอดภัยของระบบ ป้องกันการใช้งานที่ผิดปกติ และแก้ไขปัญหาทางเทคนิค</li>
                <li>เพื่อปรับปรุงคุณภาพการให้บริการ</li>
              </ul>
            </Section>

            <Section title="3. การจัดเก็บและความปลอดภัยของข้อมูล (Data Storage &amp; Security)">
              <p>
                ข้อมูลของคุณจัดเก็บบนฐานข้อมูลบนคลาวด์ที่มีการควบคุมสิทธิ์การเข้าถึงระดับแถวข้อมูล
                (Row Level Security) เพื่อให้ผู้ใช้แต่ละคนเข้าถึงได้เฉพาะข้อมูลของตนเอง การสื่อสารระหว่าง
                อุปกรณ์ IoT กับระบบเข้ารหัสด้วย TLS และรหัสผ่านบัญชีผู้ใช้ถูกจัดเก็บแบบ hashed
                ไม่สามารถอ่านค่าจริงได้แม้แต่จากทีมงานของเรา
              </p>
            </Section>

            <Section title="4. การเปิดเผยข้อมูลต่อบุคคลที่สาม (Data Sharing)">
              <p>เราไม่ขายข้อมูลส่วนบุคคลของคุณ ข้อมูลอาจถูกส่งต่อไปยังผู้ให้บริการที่จำเป็นต่อการทำงานของระบบเท่านั้น เช่น:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>ผู้ให้บริการฐานข้อมูล/Authentication บนคลาวด์</li>
                <li>ผู้ให้บริการโฮสติ้งเว็บแอปพลิเคชัน</li>
                <li>ผู้ให้บริการ Push Notification (สำหรับแจ้งเตือนผ่านแอปมือถือ)</li>
                <li>LINE Platform (เฉพาะกรณีที่คุณเชื่อมต่อบัญชี LINE เพื่อรับแจ้งเตือน)</li>
                <li>ผู้ให้บริการประมวลผลการชำระเงิน (เฉพาะกรณีทำรายการชำระเงิน)</li>
              </ul>
            </Section>

            <Section title="5. คุกกี้ (Cookies)">
              <p>
                เว็บไซต์ใช้คุกกี้ที่จำเป็นสำหรับการเข้าสู่ระบบและคงสถานะการใช้งาน (session) เท่านั้น
                เราไม่ใช้คุกกี้เพื่อการโฆษณาติดตามพฤติกรรมข้ามเว็บไซต์
              </p>
            </Section>

            <Section title="6. สิทธิของคุณ (Your Rights)">
              <ul className="list-disc pl-5 space-y-2">
                <li>เข้าถึงและแก้ไขข้อมูลบัญชีของคุณได้ที่หน้า Dashboard &gt; Account</li>
                <li>ลบอุปกรณ์หรือฟาร์มของคุณออกจากระบบได้ด้วยตนเองผ่านแดชบอร์ด</li>
                <li>ขอลบบัญชีและข้อมูลที่เกี่ยวข้องได้โดยติดต่อทีมงาน</li>
                <li>ยกเลิกการรับแจ้งเตือน (มือถือ/LINE) ได้ตลอดเวลาผ่านการตั้งค่าในแอปหรือแดชบอร์ด</li>
              </ul>
            </Section>

            <Section title="7. การเก็บรักษาข้อมูล (Data Retention)">
              <p>
                เราเก็บข้อมูลบัญชีและข้อมูลอุปกรณ์ไว้ตราบเท่าที่บัญชีของคุณยังใช้งานอยู่ หากคุณขอลบบัญชี
                เราจะลบหรือทำให้ข้อมูลส่วนบุคคลไม่สามารถระบุตัวตนได้ภายในระยะเวลาที่เหมาะสม
                ยกเว้นข้อมูลที่จำเป็นต้องเก็บตามข้อผูกพันทางกฎหมายหรือบัญชี
              </p>
            </Section>

            <Section title="8. ข้อมูลเด็ก (Children&rsquo;s Privacy)">
              <p>บริการนี้ไม่ได้ออกแบบมาสำหรับผู้ใช้ที่มีอายุต่ำกว่า 18 ปี และเราไม่เก็บข้อมูลโดยเจตนาจากเด็กอายุต่ำกว่าเกณฑ์ดังกล่าว</p>
            </Section>

            <Section title="9. การเปลี่ยนแปลงนโยบาย (Changes to This Policy)">
              <p>
                เราอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราวเพื่อให้สอดคล้องกับการเปลี่ยนแปลงของบริการ
                วันที่อัปเดตล่าสุดจะแสดงไว้ด้านบนของหน้านี้เสมอ
              </p>
            </Section>

            <Section title="10. ติดต่อเรา (Contact Us)">
              <p>
                หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ สามารถติดต่อทีมงาน SMF IoT by M Labs ได้ผ่านช่องทาง
                Facebook (smfiotbymlabs) หรือ LINE (@smfiotmlabs) ที่แสดงในส่วนท้ายของเว็บไซต์
              </p>
            </Section>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
