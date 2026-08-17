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

-- Fields for admin Plan Upgrade / Renew Orders report
alter table public.payment_requests
  add column if not exists order_number text unique,
  add column if not exists months integer default 1,
  add column if not exists user_name text,
  add column if not exists is_renew boolean default false;

create index if not exists payment_requests_stripe_pi_idx
  on public.payment_requests(stripe_payment_intent_id);
create index if not exists payment_requests_order_number_idx
  on public.payment_requests(order_number);

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
  - Prod: `https://smfiot.bkknex.com/api/stripe/webhook`
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

-- คอลัมน์เพิ่มเติมสำหรับ order number, quantity, ที่อยู่จัดส่ง, tracking
alter table public.hardware_orders
  add column if not exists order_number text,
  add column if not exists quantity int not null default 1 check (quantity between 1 and 100),
  add column if not exists unit_price numeric(10,2),
  add column if not exists ship_name text,
  add column if not exists ship_phone text,
  add column if not exists ship_address text,
  add column if not exists ship_city text,
  add column if not exists ship_postal text,
  add column if not exists ship_note text,
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text;

create unique index if not exists hardware_orders_order_number_uidx
  on public.hardware_orders(order_number) where order_number is not null;
create unique index if not exists hardware_orders_stripe_pi_uidx
  on public.hardware_orders(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
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

- ระบบไม่บันทึกออเดอร์ลง DB จนกว่าลูกค้าจะชำระเงินสำเร็จ (data buffered ใน Stripe PaymentIntent metadata)
- Stripe webhook (`payment_intent.succeeded` metadata `type=hardware`) จะ **INSERT** ออเดอร์ใหม่ (idempotent by `stripe_payment_intent_id`) พร้อมข้อมูลจัดส่ง สถานะเริ่มต้น `paid`
- ทีมงานตรวจ order → อัปเดตสถานะจัดส่ง + tracking:
  ```sql
  update public.hardware_orders
    set status = 'shipped',
        tracking_number = 'TH1234567890',
        tracking_carrier = 'Kerry Express'
    where order_number = 'PN-20260813-4KZ2';
  ```
- อัปเดตเป็น `delivered` เมื่อส่งมอบสำเร็จ

### Order number format
- `SN-YYYYMMDD-XXXX` — Starter Node
- `PN-YYYYMMDD-XXXX` — Pro Node
- `CK-YYYYMMDD-XXXX` — Complete Kit

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

## 9. ระบบฟาร์ม (My Farms — Phase 1)

```sql
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  province text,
  district text,
  subdistrict text,
  area numeric(12,2),
  area_unit text default 'ไร่' check (area_unit in ('ไร่','งาน','ตร.ว.','ตร.ม.')),
  farm_type text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists farms_user_id_idx on public.farms(user_id);
create index if not exists farms_created_at_idx on public.farms(created_at desc);

-- updated_at auto trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at before update on public.farms
  for each row execute function public.set_updated_at();

-- RLS: user เห็น/แก้/ลบ ได้เฉพาะฟาร์มของตัวเอง
alter table public.farms enable row level security;

drop policy if exists "farms_select_own" on public.farms;
create policy "farms_select_own" on public.farms
  for select using (auth.uid() = user_id);

drop policy if exists "farms_insert_own" on public.farms;
create policy "farms_insert_own" on public.farms
  for insert with check (auth.uid() = user_id);

drop policy if exists "farms_update_own" on public.farms;
create policy "farms_update_own" on public.farms
  for update using (auth.uid() = user_id);

drop policy if exists "farms_delete_own" on public.farms;
create policy "farms_delete_own" on public.farms
  for delete using (auth.uid() = user_id);
```

---

## 10. Plan Limits (Phase 1.5)

เพิ่ม column max_farms / max_nodes / max_sensors ให้ตาราง `subscription_plans` (สร้างไว้แล้วใน section 7)

**Convention:** `NULL = unlimited`

```sql
alter table public.subscription_plans
  add column if not exists max_farms integer,
  add column if not exists max_nodes integer,
  add column if not exists max_sensors integer;

-- Seed / update limits per plan
update public.subscription_plans set max_farms = 1,    max_nodes = 1,    max_sensors = 1    where plan_id = 'starter';
update public.subscription_plans set max_farms = 5,    max_nodes = 10,   max_sensors = 50   where plan_id = 'pro';
update public.subscription_plans set max_farms = 20,   max_nodes = 50,   max_sensors = 200  where plan_id = 'business';
update public.subscription_plans set max_farms = null, max_nodes = null, max_sensors = null where plan_id = 'enterprise';
```

**Security note** — RLS ของ `subscription_plans` เดิม (section 7) เปิด SELECT ให้ทุกคนอ่านได้ (จำเป็นเพราะหน้า `/pricing` public) แต่ INSERT/UPDATE/DELETE ไม่มี policy → มีเฉพาะ service_role (admin backend) เขียนได้ ผู้ใช้ปกติแก้ max_* ไม่ได้

---

## 11. Zones (Phase 3)

### Add `max_zones` column + seed limits

```sql
alter table public.subscription_plans
  add column if not exists max_zones integer;

update public.subscription_plans set max_zones = 2    where plan_id = 'starter';
update public.subscription_plans set max_zones = 10   where plan_id = 'pro';
update public.subscription_plans set max_zones = 50   where plan_id = 'business';
update public.subscription_plans set max_zones = null where plan_id = 'enterprise';
```

### Create `zones` table + RLS (owner-scoped via parent farm)

```sql
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  description text,
  area numeric(12,2),
  area_unit text default 'ไร่' check (area_unit in ('ไร่','งาน','ตร.ว.','ตร.ม.')),
  crop_type text,
  planting_date date,
  expected_harvest_date date,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists zones_farm_id_idx on public.zones(farm_id);
create index if not exists zones_farm_active_idx on public.zones(farm_id) where archived_at is null;

drop trigger if exists zones_set_updated_at on public.zones;
create trigger zones_set_updated_at before update on public.zones
  for each row execute function public.set_updated_at();

alter table public.zones enable row level security;

-- RLS: user เห็น/แก้/ลบ zone ได้เฉพาะฟาร์มของตัวเอง (ownership เช็คผ่าน farms table)
drop policy if exists "zones_select_own" on public.zones;
create policy "zones_select_own" on public.zones
  for select using (
    exists (select 1 from public.farms f where f.id = zones.farm_id and f.user_id = auth.uid())
  );

drop policy if exists "zones_insert_own" on public.zones;
create policy "zones_insert_own" on public.zones
  for insert with check (
    exists (select 1 from public.farms f where f.id = zones.farm_id and f.user_id = auth.uid())
  );

drop policy if exists "zones_update_own" on public.zones;
create policy "zones_update_own" on public.zones
  for update using (
    exists (select 1 from public.farms f where f.id = zones.farm_id and f.user_id = auth.uid())
  );

drop policy if exists "zones_delete_own" on public.zones;
create policy "zones_delete_own" on public.zones
  for delete using (
    exists (select 1 from public.farms f where f.id = zones.farm_id and f.user_id = auth.uid())
  );
```

**Cascade:** ลบ farm → zones หายอัตโนมัติ (`on delete cascade`)
**Convention:** `archived_at IS NULL` = active

---

## 12. IoT Nodes (Phase 4)

### Bump `max_nodes` limit for STARTER

Phase 1.5 seeded starter=1. Phase 4 spec = 2:

```sql
update public.subscription_plans set max_nodes = 2 where plan_id = 'starter';
-- pro=10, business=50, enterprise=null are already correct from Phase 1.5
```

### Create `iot_nodes` table + RLS

```sql
create table if not exists public.iot_nodes (
  id uuid primary key default gen_random_uuid(),
  device_uid text unique not null,
  device_name text not null,
  farm_id uuid not null references public.farms(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  device_type text,
  model text,
  status text not null default 'offline' check (status in ('online','offline','warning')),
  firmware_version text,
  last_seen timestamptz,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists iot_nodes_farm_id_idx on public.iot_nodes(farm_id);
create index if not exists iot_nodes_zone_id_idx on public.iot_nodes(zone_id);
create index if not exists iot_nodes_farm_active_idx on public.iot_nodes(farm_id) where archived_at is null;
create index if not exists iot_nodes_device_uid_idx on public.iot_nodes(device_uid);

drop trigger if exists iot_nodes_set_updated_at on public.iot_nodes;
create trigger iot_nodes_set_updated_at before update on public.iot_nodes
  for each row execute function public.set_updated_at();

alter table public.iot_nodes enable row level security;

-- RLS: ownership via parent farm (both USING for old-row and WITH CHECK for new-row on UPDATE
-- to block moving a device into another user's farm)

drop policy if exists "iot_nodes_select_own" on public.iot_nodes;
create policy "iot_nodes_select_own" on public.iot_nodes for select using (
  exists (select 1 from public.farms f where f.id = iot_nodes.farm_id and f.user_id = auth.uid())
);

drop policy if exists "iot_nodes_insert_own" on public.iot_nodes;
create policy "iot_nodes_insert_own" on public.iot_nodes for insert with check (
  exists (select 1 from public.farms f where f.id = iot_nodes.farm_id and f.user_id = auth.uid())
);

drop policy if exists "iot_nodes_update_own" on public.iot_nodes;
create policy "iot_nodes_update_own" on public.iot_nodes for update
  using (
    exists (select 1 from public.farms f where f.id = iot_nodes.farm_id and f.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.farms f where f.id = iot_nodes.farm_id and f.user_id = auth.uid())
  );

drop policy if exists "iot_nodes_delete_own" on public.iot_nodes;
create policy "iot_nodes_delete_own" on public.iot_nodes for delete using (
  exists (select 1 from public.farms f where f.id = iot_nodes.farm_id and f.user_id = auth.uid())
);
```

**Cascades:** ลบ farm → devices หายอัตโนมัติ (`on delete cascade`) — ลบ zone → device.zone_id ถูก set null (`on delete set null`)

**MQTT convention (พร้อมใช้อนาคต):** `smfiot/{device_uid}/telemetry` | `.../status` | `.../command` — ยังไม่ connect ในเฟสนี้

---

## 13. Sensors (Phase 5)

### Bump `max_sensors` per plan spec

Phase 1.5 seeded starter=1, business=200. Phase 5 spec = 10 / 50 / 250 / unlimited:

```sql
update public.subscription_plans set max_sensors = 10   where plan_id = 'starter';
update public.subscription_plans set max_sensors = 50   where plan_id = 'pro';
update public.subscription_plans set max_sensors = 250  where plan_id = 'business';
update public.subscription_plans set max_sensors = null where plan_id = 'enterprise';
```

### Create `sensors` table + RLS

```sql
create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  name text not null,
  sensor_type text not null check (sensor_type in ('temperature','humidity','soil_moisture','light','npk','ph','ec','co2')),
  unit text,
  description text,
  channel text,
  status text not null default 'active' check (status in ('active','inactive')),
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sensors_device_id_idx on public.sensors(device_id);
create index if not exists sensors_device_active_idx on public.sensors(device_id) where archived_at is null;

-- Duplicate guard: prevent 2 ACTIVE sensors of same type+channel on same device.
-- Allows same type on different channels (e.g. multi-channel soil moisture probe)
-- and allows a new one after the old is archived.
create unique index if not exists sensors_device_type_channel_unique
  on public.sensors (device_id, sensor_type, coalesce(channel, ''))
  where archived_at is null;

drop trigger if exists sensors_set_updated_at on public.sensors;
create trigger sensors_set_updated_at before update on public.sensors
  for each row execute function public.set_updated_at();

alter table public.sensors enable row level security;

-- RLS via device → farm → user chain
drop policy if exists "sensors_select_own" on public.sensors;
create policy "sensors_select_own" on public.sensors for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensors.device_id and f.user_id = auth.uid()
  )
);

drop policy if exists "sensors_insert_own" on public.sensors;
create policy "sensors_insert_own" on public.sensors for insert with check (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensors.device_id and f.user_id = auth.uid()
  )
);

drop policy if exists "sensors_update_own" on public.sensors;
create policy "sensors_update_own" on public.sensors for update
  using (
    exists (
      select 1 from public.iot_nodes n
      join public.farms f on f.id = n.farm_id
      where n.id = sensors.device_id and f.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.iot_nodes n
      join public.farms f on f.id = n.farm_id
      where n.id = sensors.device_id and f.user_id = auth.uid()
    )
  );

drop policy if exists "sensors_delete_own" on public.sensors;
create policy "sensors_delete_own" on public.sensors for delete using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensors.device_id and f.user_id = auth.uid()
  )
);
```

**Cascade:** ลบ device → sensors หายอัตโนมัติ  
**Duplicate:** ป้องกันสร้าง sensor type + channel เดียวกันซ้ำใน device เดียว (Active เท่านั้น — archived ไม่นับ)

---

## 14. Plan Limits &amp; Features (Admin config)

เพิ่ม column `sensor_history_days` + `entitlements jsonb` ลงในตาราง `subscription_plans` (สร้างไว้ก่อนหน้าแล้ว) + seed ค่าเริ่มต้นตามสเปก

```sql
alter table public.subscription_plans
  add column if not exists sensor_history_days integer,
  add column if not exists entitlements jsonb default '{}'::jsonb;

-- Refresh default limits + sensor_history + entitlements per plan spec
update public.subscription_plans set
  max_farms = 1, max_zones = 2, max_nodes = 1, max_sensors = 5,
  sensor_history_days = 7,
  entitlements = '{}'::jsonb
where plan_id = 'starter';

update public.subscription_plans set
  max_farms = 5, max_zones = 20, max_nodes = 30, max_sensors = null,
  sensor_history_days = 90,
  entitlements = jsonb_build_object('mqtt', true, 'line_notify', true, 'reports', true)
where plan_id = 'pro';

update public.subscription_plans set
  max_farms = 20, max_zones = 100, max_nodes = 200, max_sensors = null,
  sensor_history_days = 365,
  entitlements = jsonb_build_object('mqtt', true, 'line_notify', true, 'reports', true, 'ota', true, 'api', true, 'automation', true)
where plan_id = 'business';

update public.subscription_plans set
  max_farms = null, max_zones = null, max_nodes = null, max_sensors = null,
  sensor_history_days = null,
  entitlements = jsonb_build_object('mqtt', true, 'line_notify', true, 'reports', true, 'ota', true, 'api', true, 'automation', true, 'ai', true, 'priority_support', true)
where plan_id = 'enterprise';
```

**Convention:** `NULL = Unlimited` (ทุก max_* + sensor_history_days)  
**Entitlements:** jsonb map — key/bool อิสระ, ไม่มี key = false อัตโนมัติ, เพิ่ม key ใหม่ได้โดยไม่ต้อง migrate

**RLS:** ใช้ policy เดิมของ `subscription_plans` — SELECT public (จำเป็นสำหรับ /pricing), INSERT/UPDATE/DELETE เฉพาะ service_role (admin backend เท่านั้น) → user แก้ limit เองไม่ได้

---

## 15. Customer Identity & Entitlements (Special Phase 2.1)

Abstraction layer เหนือ `profiles` เพื่อรองรับ 1 ผู้ใช้จริง = หลาย `auth.users` account ในอนาคต + สิทธิ์ Starter ฟรี 1 สิทธิ์ต่อ 1 ตัวตนจริง (anti-abuse)

**สำคัญ:** section นี้เพิ่ม schema + RLS เท่านั้น — **ยังไม่** เปลี่ยน signup / auto-grant / UI (จะทำใน 2.2+). Migration idempotent — รันซ้ำได้ปลอดภัย

```sql
-- ============================================================
-- 15.1  customer_identities
-- ============================================================
-- 1 identity = 1 ตัวตนจริง (ผูก email เดียว, 1 primary user).
-- profiles ยังคงเป็น per-account record; identity เป็น abstraction เหนือ.
create table if not exists public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  email_verified boolean not null default false,
  phone text,
  phone_verified boolean not null default false,
  status text not null default 'active' check (status in ('active','suspended','merged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Email เป็น natural key ของ identity (case-insensitive) — 1 identity ต่อ 1 email
create unique index if not exists customer_identities_email_lower_uniq
  on public.customer_identities (lower(email));

create index if not exists customer_identities_status_idx
  on public.customer_identities (status);

drop trigger if exists customer_identities_set_updated_at on public.customer_identities;
create trigger customer_identities_set_updated_at
  before update on public.customer_identities
  for each row execute function public.set_updated_at();

-- ============================================================
-- 15.2  profiles.customer_identity_id (link column)
-- ============================================================
alter table public.profiles
  add column if not exists customer_identity_id uuid
  references public.customer_identities(id) on delete set null;

create index if not exists profiles_customer_identity_id_idx
  on public.profiles (customer_identity_id);

-- ============================================================
-- 15.3  customer_entitlements
-- ============================================================
-- Starter (และ entitlement อื่น ๆ ในอนาคต) unique ต่อ identity เมื่อ status='active'.
-- Partial unique index กัน race condition ระดับ DB (concurrent claim → 23505).
create table if not exists public.customer_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('starter')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Race-safe uniqueness: 1 active entitlement per (identity, type)
create unique index if not exists customer_entitlements_active_uniq
  on public.customer_entitlements (customer_identity_id, entitlement_type)
  where status = 'active';

create index if not exists customer_entitlements_identity_idx
  on public.customer_entitlements (customer_identity_id);
create index if not exists customer_entitlements_type_status_idx
  on public.customer_entitlements (entitlement_type, status);

drop trigger if exists customer_entitlements_set_updated_at on public.customer_entitlements;
create trigger customer_entitlements_set_updated_at
  before update on public.customer_entitlements
  for each row execute function public.set_updated_at();

-- ============================================================
-- 15.4  RLS — customer_identities
-- ============================================================
alter table public.customer_identities enable row level security;

-- User อ่านได้เฉพาะ identity ของตัวเอง (ผ่าน profiles.customer_identity_id)
drop policy if exists "customer_identities_select_own" on public.customer_identities;
create policy "customer_identities_select_own"
  on public.customer_identities for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.customer_identity_id = public.customer_identities.id
    )
  );

-- ห้าม user INSERT / UPDATE / DELETE โดยตรง (service_role bypass ทั้งหมด)
-- ไม่มี policy = ไม่มีสิทธิ์ (RLS default deny)

-- ============================================================
-- 15.5  RLS — customer_entitlements
-- ============================================================
alter table public.customer_entitlements enable row level security;

-- User อ่านได้เฉพาะ entitlement ที่ผูกกับ identity ของตัวเอง
drop policy if exists "customer_entitlements_select_own" on public.customer_entitlements;
create policy "customer_entitlements_select_own"
  on public.customer_entitlements for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.customer_identity_id = public.customer_entitlements.customer_identity_id
    )
  );

-- ห้าม user INSERT / UPDATE / DELETE โดยตรง — Claim ทำผ่าน server action + service_role เท่านั้น
-- ไม่มี policy = ไม่มีสิทธิ์ (RLS default deny)

-- ============================================================
-- 15.6  Backfill — existing users (idempotent, safe)
-- ============================================================
-- (a) สร้าง identity 1 ตัวต่อ profile ที่ยังไม่มี identity, email = profile.email
insert into public.customer_identities (primary_user_id, email, email_verified, phone, status)
select
  p.id,
  p.email,
  coalesce(au.email_confirmed_at is not null, false),
  p.phone,
  'active'
from public.profiles p
join auth.users au on au.id = p.id
where p.customer_identity_id is null
  and p.email is not null
on conflict (primary_user_id) do nothing;

-- (b) Link profile.customer_identity_id (จับคู่ผ่าน primary_user_id)
update public.profiles p
set customer_identity_id = ci.id
from public.customer_identities ci
where p.customer_identity_id is null
  and ci.primary_user_id = p.id;

-- (c) Seed Starter entitlement สำหรับ profile ที่มี plan='starter' อยู่แล้ว
--     (Pro/Business/Enterprise ไม่ต้องเพราะไม่ใช้ Starter entitlement — เก็บสิทธิ์เดิมทั้งหมด)
insert into public.customer_entitlements (customer_identity_id, entitlement_type, status, claimed_at, metadata)
select
  p.customer_identity_id,
  'starter',
  'active',
  coalesce(p.created_at, now()),
  jsonb_build_object('source', 'backfill_2_1', 'legacy_plan', p.plan)
from public.profiles p
where p.customer_identity_id is not null
  and p.plan = 'starter'
on conflict do nothing;
-- ↑ ถูก block โดย partial unique index หากมี active starter อยู่แล้ว = idempotent
```

**Schema summary**

| Table | Columns | Key constraints |
|-------|---------|-----------------|
| `customer_identities` | id, primary_user_id, email, email_verified, phone, phone_verified, status, timestamps | UNIQUE `primary_user_id`, UNIQUE `lower(email)` |
| `profiles.customer_identity_id` | (new nullable FK) | ON DELETE SET NULL |
| `customer_entitlements` | id, customer_identity_id, entitlement_type, status, claimed_at, expires_at, metadata, timestamps | Partial UNIQUE `(identity, type) WHERE status='active'` |

**RLS summary**

- `customer_identities` — SELECT own only (via profiles link). INSERT/UPDATE/DELETE = service_role only
- `customer_entitlements` — SELECT own only (via identity → profile chain). INSERT/UPDATE/DELETE = service_role only
- Client จะไม่สามารถ claim starter ด้วย SQL ตรง — ต้องผ่าน server action (Phase 2.2)

**Preserved**

- `subscription_plans` / `profiles.plan` / Stripe flow / `canCreate*` gates / farms / zones / iot_nodes / sensors — **ไม่แตะทั้งหมด**
- Auto-grant starter (default `profiles.plan='starter'`) — **ยังคงเดิม**, จะเปลี่ยนใน Phase 2.2

**Rerun-safe:** `if not exists` + `on conflict do nothing` + partial unique — รันซ้ำได้ ไม่สร้าง duplicate

---

## 16. Subscription Lifecycle (Phase 8)

Extend `profiles` with grace period + auto-renew flag, add `subscription_events` audit log. Reuses existing `profiles.plan` + `plan_expires_at` as active subscription state (no duplicate `subscriptions` table).

```sql
-- 16.1 Extend profiles for lifecycle
alter table public.profiles
  add column if not exists grace_period_end timestamptz,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists sub_notified_expiring_7 timestamptz,
  add column if not exists sub_notified_expiring_1 timestamptz,
  add column if not exists sub_notified_expired timestamptz;

-- Index for the cron scan (only rows that can transition)
create index if not exists profiles_plan_expires_active_idx
  on public.profiles (plan_expires_at)
  where plan_expires_at is not null and plan <> 'starter';

-- 16.2 Audit log for subscription lifecycle events
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'created','activated','renewed','upgraded','downgraded',
    'cancelled','expired','grace_started','grace_ended',
    'payment_paid','payment_failed','admin_grant','admin_extend'
  )),
  from_plan text,
  to_plan text,
  actor_type text not null default 'system' check (actor_type in ('system','user','admin','stripe')),
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, created_at desc);
create index if not exists subscription_events_type_idx
  on public.subscription_events (event_type, created_at desc);

alter table public.subscription_events enable row level security;

-- User sees own events
drop policy if exists "subscription_events_select_own" on public.subscription_events;
create policy "subscription_events_select_own"
  on public.subscription_events for select
  using (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE = service_role only (no policy = default deny)
```

**Grace period policy:** 7 days after `plan_expires_at`. Configurable via `SUBSCRIPTION_GRACE_DAYS` env (default 7).

**Cron endpoint:** `POST /api/cron/subscription-check` (Vercel Cron runs daily). Protected by `CRON_SECRET` header.

**Lifecycle transitions handled by cron:**
- `plan_expires_at - now() ≤ 7 days` AND not notified → send `subscription_expiring` notification + mark `sub_notified_expiring_7`
- `plan_expires_at - now() ≤ 1 day` AND not notified → send urgent notification + mark `sub_notified_expiring_1`
- `plan_expires_at < now()` AND `grace_period_end IS NULL` → set `grace_period_end = plan_expires_at + 7d`, notify `subscription_expired`, log `grace_started`
- `grace_period_end < now()` → set `plan = 'starter'`, clear `plan_expires_at` + `grace_period_end`, notify + log `downgraded`

**Effective plan resolution** (see `lib/subscription.ts`):
- `active` = `plan_expires_at IS NULL` (starter/enterprise) OR `plan_expires_at > now()`
- `grace` = `plan_expires_at < now() ≤ grace_period_end`
- `expired` = `grace_period_end < now()` → returns `starter` limits (server-enforced via `canCreate*`)

**RLS:** users cannot modify `profiles.plan` or `plan_expires_at` (existing `profiles_update_own` policy WITH CHECK enforcement — those columns should never be updatable client-side; Stripe webhook uses service_role bypass). Verify with:

```sql
-- Existing profiles_update_own allows column-level anything. Restrict:
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- plan and plan_expires_at are set by stripe webhook (service_role bypass) or admin actions only
    -- but Postgres RLS can't restrict column-level here; guard in server actions instead
  );
```
Note: column-level restrict on user UPDATE requires a trigger. Server actions never expose plan-mutation from client — enforced by app code.

---

## 18. Device Telemetry & Commands (Phase 9)

MQTT + telemetry ingestion + command dispatch schema. Reuse `iot_nodes` (Phase 4). Add per-device MQTT credentials (hashed), time-series `sensor_readings`, `device_commands` audit, `device_events`.

**Prereq — HiveMQ Cloud broker** (or equivalent MQTT broker). Ingestion happens through a **separate worker service** (not Vercel — serverless lifecycle wrong for persistent MQTT). Worker POSTs validated batches to `/api/telemetry/ingest` (HMAC-signed). Command dispatch: web API inserts `device_commands` row + optionally publishes via HiveMQ HTTP REST API (short-lived request-scoped).

```sql
-- ============================================================
-- 18.1  Extend iot_nodes for MQTT identity
-- ============================================================
alter table public.iot_nodes
  add column if not exists mqtt_client_id text
    generated always as ('smf_device_' || device_uid) stored,
  add column if not exists hardware_version text,
  add column if not exists is_disabled boolean not null default false;

create unique index if not exists iot_nodes_mqtt_client_id_uniq
  on public.iot_nodes (mqtt_client_id);

-- ============================================================
-- 18.2  device_credentials — per-device MQTT username/password (hashed)
-- ============================================================
create table if not exists public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  mqtt_username text not null unique,
  mqtt_password_hash text not null,          -- bcrypt/argon2 hash — never plaintext
  mqtt_password_prefix text,                 -- first 4 chars for display "abcd****"
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists device_credentials_device_idx on public.device_credentials(device_id);
create unique index if not exists device_credentials_active_uniq
  on public.device_credentials(device_id)
  where revoked_at is null;

alter table public.device_credentials enable row level security;

-- User can SEE credential metadata (username/prefix/dates) for own devices — NEVER hash
drop policy if exists "device_credentials_select_own" on public.device_credentials;
create policy "device_credentials_select_own" on public.device_credentials for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_credentials.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE/DELETE = service_role only (server actions via createAdminClient)

-- ============================================================
-- 18.3  sensor_readings — time-series telemetry
-- ============================================================
create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  sensor_id uuid not null references public.sensors(id) on delete cascade,
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  value numeric not null,
  unit text,
  occurred_at timestamptz not null,          -- device-reported time
  received_at timestamptz not null default now(),
  quality text not null default 'good' check (quality in ('good','bad','estimated')),
  message_id text,                            -- optional idempotency key from device
  metadata jsonb
);

-- Query indexes: latest-N per sensor, per-device range scan
create index if not exists sensor_readings_sensor_occurred_idx
  on public.sensor_readings(sensor_id, occurred_at desc);
create index if not exists sensor_readings_device_occurred_idx
  on public.sensor_readings(device_id, occurred_at desc);

-- Idempotency: if worker resends same (sensor_id, message_id) skip via ON CONFLICT
create unique index if not exists sensor_readings_msg_uniq
  on public.sensor_readings(sensor_id, message_id)
  where message_id is not null;

alter table public.sensor_readings enable row level security;

drop policy if exists "sensor_readings_select_own" on public.sensor_readings;
create policy "sensor_readings_select_own" on public.sensor_readings for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensor_readings.device_id and f.user_id = auth.uid()
  )
);
-- INSERT = service_role only (worker via /api/telemetry/ingest)

-- ============================================================
-- 18.4  device_commands — command audit trail
-- ============================================================
create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  command text not null,                     -- e.g. 'ping','relay_on','relay_off','ota_update'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sent','acknowledged','failed','timeout')),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  response jsonb,
  error_message text
);

create index if not exists device_commands_device_requested_idx
  on public.device_commands(device_id, requested_at desc);
create index if not exists device_commands_status_idx
  on public.device_commands(status) where status in ('pending','sent');

alter table public.device_commands enable row level security;

drop policy if exists "device_commands_select_own" on public.device_commands;
create policy "device_commands_select_own" on public.device_commands for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_commands.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE = service_role only (server action + worker ack updates)

-- ============================================================
-- 18.5  device_events — connect/disconnect/error audit
-- ============================================================
create table if not exists public.device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  event_type text not null,                  -- 'connected','disconnected','error','firmware_report','low_battery','relay_changed'
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists device_events_device_occurred_idx
  on public.device_events(device_id, occurred_at desc);
create index if not exists device_events_type_idx on public.device_events(event_type);

alter table public.device_events enable row level security;

drop policy if exists "device_events_select_own" on public.device_events;
create policy "device_events_select_own" on public.device_events for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_events.device_id and f.user_id = auth.uid()
  )
);
-- INSERT = service_role only (worker)
```

**Ingestion contract** — worker POSTs to `/api/telemetry/ingest`:

```
POST /api/telemetry/ingest
X-Ingest-Signature: hex(hmac-sha256(TELEMETRY_INGEST_SECRET, body))
Content-Type: application/json

{
  "device_uid": "SMF-A1B2C3D4",
  "occurred_at": "2026-08-17T10:00:00Z",
  "readings": [
    { "sensor_type": "temperature", "channel": null, "value": 28.5, "unit": "°C", "message_id": "uuid-1" },
    { "sensor_type": "soil_moisture", "channel": "ch1", "value": 45, "unit": "%", "message_id": "uuid-2" }
  ]
}
```

Server: resolve device_uid → iot_nodes.id, resolve `(sensor_type, channel)` → sensors.id, insert `sensor_readings` (idempotent via message_id), update `iot_nodes.last_seen + status='online'`.

**Command contract** — web POSTs to `/api/devices/[deviceId]/command`:

```
POST /api/devices/{id}/command
Cookie: (Supabase auth session)

{ "command": "ping", "payload": {} }
```

Server: verify user owns device via farm chain, insert `device_commands(status='pending')`, publish MQTT `smfiot/{device_uid}/command` via HiveMQ HTTP REST or defer to worker to poll.

**Environment variables (Vercel + Worker):**

```
# Vercel Web
TELEMETRY_INGEST_SECRET=<random 64 hex>     # HMAC key shared with worker
HIVEMQ_HTTP_API_URL=https://<cluster>.hivemq.cloud/rest
HIVEMQ_HTTP_API_TOKEN=<hivemq api token>    # for command publish

# Worker (Railway/Render — separate deploy)
SUPABASE_URL=<same as web>
SUPABASE_SERVICE_ROLE_KEY=<same as web>
HIVEMQ_BROKER_URL=tls://<cluster>.hivemq.cloud:8883
HIVEMQ_WORKER_USERNAME=<worker credential>
HIVEMQ_WORKER_PASSWORD=<worker credential>
TELEMETRY_INGEST_URL=https://smfiot.bkknex.com/api/telemetry/ingest
TELEMETRY_INGEST_SECRET=<same as web>
```

**Rerun-safe:** all `if not exists`, `on conflict` — run entire Section 18 anytime.

---

## 17. `.env.local`

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

# Phase 8 — subscription lifecycle cron
CRON_SECRET=<random 32+ chars, protects /api/cron/*>
SUBSCRIPTION_GRACE_DAYS=7
```

**Vercel** — เพิ่ม env vars ทั้งหมดข้างต้นที่ Project → Settings → Environment Variables (ครบทั้ง Production + Preview + Development) แล้ว Redeploy

**ห้าม commit `.env.local` เข้า git** — ไฟล์นี้อยู่ใน `.gitignore` โดยเจตนา `SUPABASE_SERVICE_ROLE_KEY` และ `STRIPE_SECRET_KEY` เป็นความลับสูงสุด รั่วแล้วเสียหายทันที

รีสตาร์ท `npm run dev` ทุกครั้งหลังแก้ `.env.local`
