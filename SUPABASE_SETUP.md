# Supabase setup — SMF IoT

ขั้นตอนนี้ทำครั้งเดียวใน Supabase Dashboard ก่อนใช้งานระบบ login/signup

---

## 1. ตาราง `profiles`

ไปที่ **SQL Editor** ใน Supabase Dashboard แล้วรัน:

```sql
-- ตารางโปรไฟล์ (ผูก 1:1 กับ auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone text,
  avatar_url text,
  provider text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;

-- นโยบาย: ผู้ใช้อ่าน/แก้ไขได้เฉพาะโปรไฟล์ของตัวเอง
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);
```

## 2. Trigger — สร้าง profile อัตโนมัติเมื่อสมัครใหม่

รองรับทั้งสมัครด้วยอีเมลและด้วย Google

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, avatar_url, provider)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'phone',
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    coalesce(new.raw_app_meta_data->>'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## 3. Google OAuth

ที่ Supabase Dashboard:

1. **Authentication → Providers → Google** เปิด Enable
2. สร้าง OAuth Client ที่ [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Type: Web application
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
3. คัดลอก **Client ID** และ **Client Secret** ใส่ในหน้า Google provider ของ Supabase
4. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (ตอน dev) หรือ URL production
   - Redirect URLs (whitelist): ต้องมี `http://localhost:3000/auth/callback` และของ production

## 4. Confirm email

**Authentication → Sign In / Providers → Email**

- ถ้าอยากให้ผู้ใช้ยืนยันอีเมลก่อนใช้ → เปิด "Confirm email"
- ถ้าไม่ต้องการ → ปิด (dev สะดวกกว่า)

หมายเหตุ: การเช็ค "email ซ้ำ" ในหน้า signup อาศัยพฤติกรรมของ Supabase — เมื่อเปิด Confirm email ระบบจะคืน `identities: []` แทนที่จะแจ้ง error เพื่อกัน user enumeration โค้ดฝั่ง client ตรวจสอบเงื่อนไขนี้แล้วแจ้งผู้ใช้ว่า "อีเมลนี้ถูกใช้งานแล้ว"

## 5. ระบบ Plan + PromptPay Payment

รัน SQL นี้เพื่อเพิ่ม column `plan` ในตาราง profiles และสร้างตาราง `payment_requests` สำหรับรับแจ้งชำระเงิน

```sql
-- เพิ่มคอลัมน์ plan ให้ profiles (default = starter สำหรับ user ใหม่ทั้งหมด)
alter table public.profiles
  add column if not exists plan text not null default 'starter'
    check (plan in ('starter','pro','business','enterprise'));

-- วันหมดอายุแพ็กเกจ — set ตอนอัปเกรด/ต่ออายุสำเร็จ (1 เดือน)
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

-- ตารางบันทึกคำขอชำระเงิน / อัปเกรดแพ็กเกจ
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro','business')),
  amount numeric(10,2) not null,
  method text not null default 'promptpay',
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  ref_note text,
  stripe_payment_intent_id text,
  created_at timestamptz default now(),
  verified_at timestamptz
);

-- กันกรณีตารางถูกสร้างไว้ก่อนหน้าโดยไม่มี column นี้
alter table public.payment_requests
  add column if not exists stripe_payment_intent_id text;

create index if not exists payment_requests_stripe_pi_idx
  on public.payment_requests(stripe_payment_intent_id);

alter table public.payment_requests enable row level security;

drop policy if exists "payment_requests_select_own" on public.payment_requests;
create policy "payment_requests_select_own"
  on public.payment_requests for select
  using (auth.uid() = user_id);

drop policy if exists "payment_requests_insert_own" on public.payment_requests;
create policy "payment_requests_insert_own"
  on public.payment_requests for insert
  with check (auth.uid() = user_id);
```

### Stripe PromptPay Integration

ระบบใช้ Stripe สร้าง QR PromptPay และ verify การชำระเงินอัตโนมัติผ่าน webhook ไม่ใช่ demo mode อีกต่อไป

**1. หา API keys จาก Stripe Dashboard**

- Login https://dashboard.stripe.com → เลือก mode **Test** (ระหว่าง dev) หรือ **Live** (production)
- **Developers → API keys** → คัดค่า:
  - `Publishable key` (ขึ้นต้น `pk_test_...` / `pk_live_...`)
  - `Secret key` (ขึ้นต้น `sk_test_...` / `sk_live_...`) — คลิก "Reveal"

**2. ตั้ง Webhook endpoint**

- **Developers → Webhooks → Add endpoint**
- Endpoint URL:
  - Dev (ใช้ Stripe CLI): `stripe listen --forward-to localhost:3000/api/stripe/webhook` (CLI จะให้ `whsec_...` โดยตรง)
  - Prod: `https://smfiotmlabs.vercel.app/api/stripe/webhook`
- Events to send:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `payment_intent.canceled`
- หลัง create แล้ว → คัด **Signing secret** (`whsec_...`)

**3. เปิดใช้ PromptPay ใน Stripe**

- **Settings → Payment methods** → เปิด **PromptPay** (ต้องมีบัญชี Stripe TH + KYC ผ่านแล้ว)
- Test mode ใช้ได้ทันที (จำลองการจ่ายผ่าน Stripe CLI/Dashboard)

**4. หา Supabase Service Role Key** — webhook ต้อง bypass RLS

- Supabase Dashboard → Settings → API → คัด **service_role secret** ⚠️ ห้ามใส่ `NEXT_PUBLIC_` prefix ห้ามอัปโหลด GitHub

**Flow**:
1. User กด "Upgrade to Pro" → server action `createStripePromptPay(plan)` สร้าง PaymentIntent + confirm ด้วย PromptPay
2. Modal แสดง QR (`next_action.promptpay_display_qr_code.image_url_svg` จาก Stripe)
3. Client poll status ทุก 3 วิ ที่ `pollStripePayment(pi.id)` — ถ้า succeeded → อัปเกรดผ่าน user session (RLS ผ่าน)
4. Stripe webhook `/api/stripe/webhook` เป็น backup ใช้ service role อัปเกรด plan + verify payment_requests (กรณี user ปิด modal ก่อน poll เจอ)

**Test mode**: จ่ายผ่าน Stripe CLI:
```bash
stripe payment_intents confirm pi_xxx --payment-method-data type=promptpay
# หรือคลิก "Simulate payment" ในหน้า PaymentIntent ใน Dashboard
```

---

## 6. ตารางสั่งซื้ออุปกรณ์ (hardware_orders)

รัน SQL นี้เพื่อสร้างตารางสั่งซื้อ IoT Node — ระบบใช้ Stripe PromptPay เดียวกับการอัปเกรดแพ็กเกจ:

```sql
create table if not exists public.hardware_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null check (sku in ('starter_node','pro_node','complete_kit')),
  product_name text not null,
  amount numeric(10,2) not null,
  status text not null default 'pending'
    check (status in ('pending','paid','shipped','delivered','canceled')),
  stripe_payment_intent_id text,
  ref_note text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists hardware_orders_user_idx
  on public.hardware_orders(user_id);
create index if not exists hardware_orders_stripe_pi_idx
  on public.hardware_orders(stripe_payment_intent_id);

alter table public.hardware_orders enable row level security;

drop policy if exists "hardware_orders_select_own" on public.hardware_orders;
create policy "hardware_orders_select_own"
  on public.hardware_orders for select
  using (auth.uid() = user_id);

drop policy if exists "hardware_orders_insert_own" on public.hardware_orders;
create policy "hardware_orders_insert_own"
  on public.hardware_orders for insert
  with check (auth.uid() = user_id);
```

### หลังชำระเงินสำเร็จ

- Stripe webhook (`payment_intent.succeeded` metadata `type=hardware`) จะอัปเดต `status = 'paid'` และ `paid_at` อัตโนมัติ
- ทีมงานตรวจ order → เปลี่ยน status เป็น `shipped` / `delivered` ตามความคืบหน้าจัดส่ง:
  ```sql
  update public.hardware_orders
    set status = 'shipped'
    where id = '<order-id>';
  ```

---

## 7. Admin Backend (users + dynamic pricing)

รัน SQL นี้เพื่อสร้างระบบ admin — ผู้ดูแลระบบ + ตารางแพ็กเกจ/สินค้าที่แก้ราคาได้จากหน้าจอ admin โดยตรง (หน้าเว็บอ่านราคาจาก DB):

```sql
-- === Admin users ===
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'admin'
    check (role in ('super_admin','admin','support','sales','technician','content')),
  is_active boolean default true,
  last_login_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists admin_users_username_idx on public.admin_users(username);

-- ตารางนี้เข้าถึงจาก service_role เท่านั้น (ไม่ต้อง RLS policy สำหรับ user ทั่วไป)
alter table public.admin_users enable row level security;

-- === Subscription Plans (Admin แก้ราคา/ฟีเจอร์ได้) ===
create table if not exists public.subscription_plans (
  plan_id text primary key
    check (plan_id in ('starter','pro','business','enterprise')),
  name text not null,
  price numeric(10,2) not null default 0,
  price_note text,
  badge text,
  audience text[] not null default '{}',
  features text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz default now()
);

-- อ่านได้จาก public (แสดงในหน้า /pricing), แก้ได้เฉพาะ service_role
alter table public.subscription_plans enable row level security;
drop policy if exists "plans_public_read" on public.subscription_plans;
create policy "plans_public_read" on public.subscription_plans for select using (true);

-- Seed default plans (รันซ้ำได้ ไม่ทับข้อมูลที่แก้แล้ว)
insert into public.subscription_plans (plan_id, name, price, price_note, badge, audience, features, sort_order) values
  ('starter', 'Starter', 0, null, 'Recommended for Beginners',
    array['ทดลองใช้งาน','สวนขนาดเล็ก','ผู้เริ่มต้น'],
    array['1 Farm','1 IoT Device','Dashboard','Realtime Monitoring','Sensor History 3 Days','Mobile App','Community Support'], 1),
  ('pro', 'Pro', 499, '/ เดือน', 'Most Popular',
    array['เกษตรกรทั่วไป','ฟาร์มขนาดเล็กถึงกลาง'],
    array['5 Farms','30 IoT Devices','Unlimited Sensors','Dashboard','Realtime','Charts','Sensor History 1 Year','LINE Notification','Export Excel','AI Basic Recommendation','Priority Support'], 2),
  ('business', 'Business', 899, '/ เดือน', null,
    array['ฟาร์มขนาดใหญ่','บริษัทเกษตร'],
    array['20 Farms','200 IoT Devices','Unlimited Sensors','Multi User','User Permission','Dashboard','Advanced Analytics','Automation','API Access','AI Recommendation','Export PDF','Export Excel','Priority Support'], 3),
  ('enterprise', 'Enterprise', 0, 'Contact Sales', null,
    array['โรงงาน','Smart Farm Project','OEM','Government','University'],
    array['Unlimited Farms','Unlimited Devices','Unlimited Users','White Label','Private Server','Custom Dashboard','Custom Domain','SLA Support','Dedicated Engineer','On-site Training','API Integration'], 4)
on conflict (plan_id) do nothing;

-- === Products (IoT Node — Admin แก้ราคา/สเปคได้) ===
create table if not exists public.products (
  sku text primary key check (sku in ('starter_node','pro_node','complete_kit')),
  name text not null,
  price numeric(10,2) not null,
  badge text,
  badge_tier text check (badge_tier in ('starter','best','pro','enterprise')),
  audience text[] not null default '{}',
  specs text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz default now()
);

alter table public.products enable row level security;
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products for select using (true);

insert into public.products (sku, name, price, badge, badge_tier, audience, specs, sort_order) values
  ('starter_node', 'Starter Node', 2990, 'Starter', 'starter',
    array['ทดลองระบบ','โรงเรือน','ฟาร์มขนาดเล็ก'],
    array['ESP32 Controller','WiFi','Temperature Sensor','Humidity Sensor','Relay 2 Channel','Ready to use','Cloud Ready'], 1),
  ('pro_node', 'Pro Node', 4990, 'Best Seller', 'best',
    array['ฟาร์มทั่วไป','Smart Farm'],
    array['ESP32','Temperature','Humidity','Soil Moisture','Light Sensor','Relay 4 Channel','OTA Update','Cloud Ready','Mobile App'], 2),
  ('complete_kit', 'Complete Smart Farm Kit', 9900, 'Professional', 'pro',
    array['ฟาร์มจริง','ติดตั้งพร้อมใช้งาน'],
    array['ESP32 Pro','Soil Moisture','Temperature','Humidity','Light','Water Level','Power Supply','Waterproof Box','Relay','Ready Install'], 3)
on conflict (sku) do nothing;
```

### เข้าใช้งาน Admin

- URL: `/admin/login` — ครั้งแรกใช้ **`admin` / `11223344`** ระบบสร้าง Super Admin อัตโนมัติ
- หลัง login ครั้งแรก **เปลี่ยนรหัสผ่านทันที** (Admin Users → Reset)
- เพิ่มผู้ใช้ + role อื่นได้จากหน้า Admin Users

### Env vars ใหม่ (ต้องเพิ่มใน Vercel)

```
ADMIN_SESSION_SECRET=<random string ≥32 chars>
```

สร้างด้วย: `openssl rand -base64 48` หรือใช้ [random.org](https://www.random.org/strings/) — ห้ามใช้ค่า default ใน production

---

## 8. ระบบแจ้งเตือน (Announcements + Web Notifications + LINE)

รัน SQL นี้เพื่อสร้างตาราง `announcements`, `notifications`, `system_settings`:

```sql
-- ประกาศ (Admin สร้าง)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_plans text[] not null default '{}',
  channels text[] not null default '{}',
  status text not null default 'sent' check (status in ('draft','sent','failed','partial')),
  line_error text,
  web_recipients_count int default 0,
  created_by uuid,
  created_at timestamptz default now()
);

alter table public.announcements enable row level security;
-- ไม่มี policy = client อ่าน/เขียนไม่ได้ (admin เท่านั้น ผ่าน service_role)

-- แจ้งเตือนราย user (fanout จากประกาศ)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id);

-- System settings (key/value) — เก็บ LINE config และ system config อื่น ๆ
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid
);

alter table public.system_settings enable row level security;
-- ไม่มี policy = admin เท่านั้น

-- Seed default LINE config row (ค่าว่าง — admin กรอกใน UI)
insert into public.system_settings (key, value) values
  ('line', jsonb_build_object(
    'channel_access_token', '',
    'mode', 'broadcast',
    'target_id', '',
    'enabled', false
  ))
on conflict (key) do nothing;
```

### วิธีตั้ง LINE Official Account (@smfiotmlabs)

**ใช้โหมด Broadcast** — ส่งประกาศให้ทุกคนที่เพิ่ม OA เป็นเพื่อนโดยตรง ไม่ต้องมี target ID

1. เข้า https://developers.line.biz/console → login ด้วย Business Account ที่ผูก OA `@smfiotmlabs`
2. เลือก Provider → เข้า channel **Messaging API** ของ OA (ถ้ายังไม่มี → กด Create channel → เลือก Messaging API + link เข้า OA)
3. tab **Basic settings** → เลื่อนหา **Response settings** → เปิด **Allow bot to join group chats** (ถ้าจะใช้ group ด้วย)
4. tab **Messaging API** → **Channel access token (long-lived)** → กด Issue → คัด token
5. LINE Official Account Manager (https://manager.line.biz/) → เข้า OA → **Settings → Response settings**
   - **Chat**: Off
   - **Webhooks**: On
   - **Auto-response messages**: Off (ป้องกันตอบทับ broadcast)
   - **Greeting messages**: On/Off ตามต้องการ
6. Admin → **Settings → LINE** ในเว็บ
   - วาง Channel Access Token
   - โหมด: **Broadcast**
   - Target ID: ปล่อยว่าง
   - ติ๊ก Enabled → บันทึก → กดทดสอบ

### ข้อจำกัดของ Broadcast

- **Free tier**: 300 ข้อความ/เดือน (นับรวม broadcast + push + multicast/แต่ละ recipient นับ 1)
- **Light tier**: 15,000/เดือน
- **Standard tier**: 45,000/เดือน (+ overage)
- ตรวจโควตาที่ https://manager.line.biz/ → OA → Analytics → Messages

### ทางเลือก: โหมด Group / User

หากอยากส่งเข้ากลุ่ม LINE เฉพาะ (ไม่ใช่ OA broadcast):
- โหมด **Group** — bot ต้องเป็นสมาชิกกลุ่มก่อน + ใส่ `groupId` (ขึ้นต้น C) ใน Target ID
- โหมด **User** — bot ต้องเป็นเพื่อนของ user นั้น + ใส่ `userId` (ขึ้นต้น U)
- หา ID ได้จาก webhook event เมื่อ user ส่งข้อความหา bot

---

## 9. `.env.local`

ต้องมีคีย์เหล่านี้:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Vercel** — เพิ่ม env vars ทั้งหมดข้างต้นที่ Project → Settings → Environment Variables (ครบทั้ง Production + Preview + Development) แล้ว Redeploy

**ห้าม commit `.env.local` เข้า git** — ไฟล์นี้อยู่ใน `.gitignore` โดยเจตนา `SUPABASE_SERVICE_ROLE_KEY` และ `STRIPE_SECRET_KEY` เป็นความลับสูงสุด รั่วแล้วเสียหายทันที

รีสตาร์ท `npm run dev` ทุกครั้งหลังแก้ `.env.local`
