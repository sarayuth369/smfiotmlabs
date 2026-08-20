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

## 19. Firmware + OTA + Automation Engine (Phase 10)

Foundation for firmware version management, OTA update jobs, device configuration overlay, and rule-based automation engine (sensor threshold + schedule).

**Design:**
- `firmwares` — versioned binaries (Supabase Storage bucket `firmwares`, path stored, admin-only write)
- `ota_jobs` — audit trail with state machine; server creates + worker/device updates status
- `device_configs` — key/value config sent to device via MQTT `config` topic
- `automation_rules` — declarative rule (trigger + condition + action + cooldown)
- `automation_logs` — every rule evaluation (executed / skipped / failed) with reason

Rule engine runs **inside `/api/telemetry/ingest`** after each reading batch — no separate cron for sensor triggers. Schedule triggers = daily cron scan of `next_run_at`.

```sql
-- ============================================================
-- 19.1  Extend iot_nodes with hardware_model for firmware compat
-- ============================================================
alter table public.iot_nodes
  add column if not exists hardware_model text;

create index if not exists iot_nodes_hardware_model_idx
  on public.iot_nodes(hardware_model) where hardware_model is not null;

-- ============================================================
-- 19.2  firmwares
-- ============================================================
create table if not exists public.firmwares (
  id uuid primary key default gen_random_uuid(),
  version text not null,                    -- semver: 1.2.3
  name text not null,
  hardware_model text not null,             -- must match iot_nodes.hardware_model
  hardware_revision text,
  file_path text not null,                  -- Supabase Storage path in bucket 'firmwares'
  file_size bigint not null check (file_size > 0),
  sha256 text not null check (length(sha256) = 64),
  release_notes text,
  status text not null default 'draft'
    check (status in ('draft','testing','published','deprecated','revoked')),
  is_latest boolean not null default false,
  channel text not null default 'stable' check (channel in ('stable','beta')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One version per (hardware_model, version) — no duplicates
create unique index if not exists firmwares_model_version_uniq
  on public.firmwares (hardware_model, version);

-- Only 1 is_latest=true per (hardware_model, channel)
create unique index if not exists firmwares_latest_per_channel_uniq
  on public.firmwares (hardware_model, channel)
  where is_latest = true;

create index if not exists firmwares_status_idx on public.firmwares(status);
create index if not exists firmwares_channel_idx on public.firmwares(channel);

drop trigger if exists firmwares_set_updated_at on public.firmwares;
create trigger firmwares_set_updated_at before update on public.firmwares
  for each row execute function public.set_updated_at();

alter table public.firmwares enable row level security;

-- User can SELECT published firmwares matching their devices' hardware_model
drop policy if exists "firmwares_select_published" on public.firmwares;
create policy "firmwares_select_published" on public.firmwares for select using (
  status in ('published','deprecated') and (
    hardware_model in (
      select distinct n.hardware_model
      from public.iot_nodes n
      join public.farms f on f.id = n.farm_id
      where f.user_id = auth.uid() and n.hardware_model is not null
    )
  )
);
-- INSERT/UPDATE/DELETE = service_role only (admin backend)

-- ============================================================
-- 19.3  ota_jobs
-- ============================================================
create table if not exists public.ota_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  firmware_id uuid not null references public.firmwares(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','downloading','installing','rebooting','verifying','completed','failed','timeout','cancelled')),
  from_version text,
  to_version text not null,
  progress smallint check (progress is null or (progress between 0 and 100)),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate active job per device
create unique index if not exists ota_jobs_active_uniq
  on public.ota_jobs (device_id)
  where status in ('pending','downloading','installing','rebooting','verifying');

create index if not exists ota_jobs_device_created_idx on public.ota_jobs(device_id, created_at desc);
create index if not exists ota_jobs_status_idx on public.ota_jobs(status);

drop trigger if exists ota_jobs_set_updated_at on public.ota_jobs;
create trigger ota_jobs_set_updated_at before update on public.ota_jobs
  for each row execute function public.set_updated_at();

alter table public.ota_jobs enable row level security;

drop policy if exists "ota_jobs_select_own" on public.ota_jobs;
create policy "ota_jobs_select_own" on public.ota_jobs for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = ota_jobs.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE = service_role only (created via server action, updated by worker)

-- ============================================================
-- 19.4  device_configs
-- ============================================================
create table if not exists public.device_configs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  key text not null,                        -- e.g. 'telemetry_interval', 'timezone', 'sensor.temp.threshold'
  value jsonb not null,
  applied_at timestamptz,                   -- set when device acks
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_configs_device_key_uniq
  on public.device_configs (device_id, key);
create index if not exists device_configs_device_idx on public.device_configs(device_id);

drop trigger if exists device_configs_set_updated_at on public.device_configs;
create trigger device_configs_set_updated_at before update on public.device_configs
  for each row execute function public.set_updated_at();

alter table public.device_configs enable row level security;

drop policy if exists "device_configs_select_own" on public.device_configs;
create policy "device_configs_select_own" on public.device_configs for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_configs.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE/DELETE = service_role only (via server action)

-- ============================================================
-- 19.5  automation_rules
-- ============================================================
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  device_id uuid references public.iot_nodes(id) on delete cascade,
  sensor_id uuid references public.sensors(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('sensor_value','schedule','device_status')),
  trigger_config jsonb not null,            -- {sensor_type,channel,operator,value} OR {cron,timezone}
  action_type text not null check (action_type in ('command','notification','both')),
  action_config jsonb not null,             -- {command,payload} OR {message,channel}
  cooldown_seconds integer not null default 300 check (cooldown_seconds >= 0),
  last_triggered_at timestamptz,
  next_run_at timestamptz,                  -- for schedule triggers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_user_idx on public.automation_rules(user_id);
create index if not exists automation_rules_device_enabled_idx
  on public.automation_rules(device_id, enabled) where enabled = true;
create index if not exists automation_rules_sensor_enabled_idx
  on public.automation_rules(sensor_id, enabled) where enabled = true and trigger_type = 'sensor_value';
create index if not exists automation_rules_next_run_idx
  on public.automation_rules(next_run_at) where enabled = true and next_run_at is not null;

drop trigger if exists automation_rules_set_updated_at on public.automation_rules;
create trigger automation_rules_set_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();

alter table public.automation_rules enable row level security;

drop policy if exists "automation_rules_select_own" on public.automation_rules;
create policy "automation_rules_select_own" on public.automation_rules for select
  using (user_id = auth.uid());

drop policy if exists "automation_rules_insert_own" on public.automation_rules;
create policy "automation_rules_insert_own" on public.automation_rules for insert
  with check (user_id = auth.uid());

drop policy if exists "automation_rules_update_own" on public.automation_rules;
create policy "automation_rules_update_own" on public.automation_rules for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "automation_rules_delete_own" on public.automation_rules;
create policy "automation_rules_delete_own" on public.automation_rules for delete
  using (user_id = auth.uid());

-- ============================================================
-- 19.6  automation_logs
-- ============================================================
create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  device_id uuid references public.iot_nodes(id) on delete set null,
  sensor_id uuid references public.sensors(id) on delete set null,
  status text not null check (status in ('triggered','executed','skipped','failed')),
  trigger_value jsonb,                      -- {value, unit, timestamp}
  action_result jsonb,                      -- {command_id,mqtt_ok,error}
  skip_reason text,                         -- 'cooldown','disabled','device_offline','plan_restriction','safety'
  error_message text,
  executed_at timestamptz not null default now()
);

create index if not exists automation_logs_rule_executed_idx
  on public.automation_logs(rule_id, executed_at desc);
create index if not exists automation_logs_device_executed_idx
  on public.automation_logs(device_id, executed_at desc) where device_id is not null;

alter table public.automation_logs enable row level security;

drop policy if exists "automation_logs_select_own" on public.automation_logs;
create policy "automation_logs_select_own" on public.automation_logs for select using (
  exists (
    select 1 from public.automation_rules r
    where r.id = automation_logs.rule_id and r.user_id = auth.uid()
  )
);
-- INSERT = service_role only (rule engine)
```

**KNOWN_FEATURES to extend** in [lib/plan-limits.ts](lib/plan-limits.ts):
```ts
{ key: "automation_advanced", label: "Advanced Automation (AND/OR + schedule)" },
{ key: "safety_controls", label: "Safety Runtime Limits" },
```
(entries `ota`, `automation` already exist)

**Rule config shape (jsonb)**

Sensor trigger:
```json
{
  "sensor_type": "soil_moisture",
  "channel": null,
  "operator": "<",
  "value": 30
}
```

Schedule trigger:
```json
{ "cron": "0 6 * * *", "timezone": "Asia/Bangkok" }
```

Command action:
```json
{ "command": "relay_on", "payload": { "channel": 1 }, "auto_off_seconds": 1800 }
```

Notification action:
```json
{ "message": "ดินแห้ง — ปั๊มทำงาน", "level": "warning" }
```

**Safety runtime enforcement** — actions with `auto_off_seconds` insert a follow-up `device_commands` row scheduled for `now() + N seconds`. Worker cron flushes ready commands. Manual override recorded via `device_commands.metadata.manual_override=true` — takes priority over automation triggers within N minutes.

**Conflict priority (in rule engine):**
```
Safety shutdown > Manual override > Automation > Schedule
```
Rule engine skips if any higher-priority command sent within cooldown window.

**Storage bucket** — create in Supabase Dashboard → Storage:
- Bucket name: `firmwares`
- Public: **NO**
- Policies: none (service_role only) — user downloads via signed URL from server action
- Max file size: 8 MB

**Rerun-safe:** all `if not exists` — run entire Section 19 anytime.

---

## 20. Analytics + Anomaly Detection + Recommendations (Phase 11)

Turn accumulated telemetry into actionable insights. Foundation only — UI + AI = Phase 11.2.

**Design:**
- `sensor_thresholds` — normal min/max per sensor (drives threshold analysis + anomaly detection)
- `sensor_anomalies` — statistical anomaly log (rate-of-change, sigma, stale, stuck)
- `recommendations` — smart hints for user (read/dismiss/resolve state)
- `sensor_readings_latest` — materialized cache of latest reading per sensor (fast dashboard load)
- `report_jobs` — scheduled/on-demand report metadata
- RPC `get_sensor_stats(sensor_id, from, to)` — aggregated min/max/avg/count in single call

```sql
-- ============================================================
-- 20.1  sensor_thresholds — normal operating range per sensor
-- ============================================================
create table if not exists public.sensor_thresholds (
  sensor_id uuid primary key references public.sensors(id) on delete cascade,
  min_normal numeric,                       -- warn if reading < this
  max_normal numeric,                       -- warn if reading > this
  min_critical numeric,                     -- critical if reading < this
  max_critical numeric,                     -- critical if reading > this
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.sensor_thresholds enable row level security;

drop policy if exists "sensor_thresholds_select_own" on public.sensor_thresholds;
create policy "sensor_thresholds_select_own" on public.sensor_thresholds for select using (
  exists (
    select 1 from public.sensors s
    join public.iot_nodes n on n.id = s.device_id
    join public.farms f on f.id = n.farm_id
    where s.id = sensor_thresholds.sensor_id and f.user_id = auth.uid()
  )
);
-- User can UPSERT own via server action + service_role
drop policy if exists "sensor_thresholds_upsert_own" on public.sensor_thresholds;
create policy "sensor_thresholds_upsert_own" on public.sensor_thresholds for insert with check (
  exists (
    select 1 from public.sensors s
    join public.iot_nodes n on n.id = s.device_id
    join public.farms f on f.id = n.farm_id
    where s.id = sensor_thresholds.sensor_id and f.user_id = auth.uid()
  )
);
drop policy if exists "sensor_thresholds_update_own" on public.sensor_thresholds;
create policy "sensor_thresholds_update_own" on public.sensor_thresholds for update using (
  exists (
    select 1 from public.sensors s
    join public.iot_nodes n on n.id = s.device_id
    join public.farms f on f.id = n.farm_id
    where s.id = sensor_thresholds.sensor_id and f.user_id = auth.uid()
  )
);

-- ============================================================
-- 20.2  sensor_anomalies
-- ============================================================
create table if not exists public.sensor_anomalies (
  id uuid primary key default gen_random_uuid(),
  sensor_id uuid not null references public.sensors(id) on delete cascade,
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  detected_at timestamptz not null default now(),
  detection_method text not null check (detection_method in ('threshold','sigma','rate_of_change','stale','stuck')),
  severity text not null check (severity in ('info','warning','critical')),
  value numeric,
  expected_min numeric,
  expected_max numeric,
  reason text not null,
  metadata jsonb,
  status text not null default 'new' check (status in ('new','acknowledged','resolved','dismissed'))
);

create index if not exists sensor_anomalies_sensor_detected_idx
  on public.sensor_anomalies(sensor_id, detected_at desc);
create index if not exists sensor_anomalies_status_severity_idx
  on public.sensor_anomalies(status, severity) where status = 'new';
create index if not exists sensor_anomalies_device_idx
  on public.sensor_anomalies(device_id, detected_at desc);

alter table public.sensor_anomalies enable row level security;

drop policy if exists "sensor_anomalies_select_own" on public.sensor_anomalies;
create policy "sensor_anomalies_select_own" on public.sensor_anomalies for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensor_anomalies.device_id and f.user_id = auth.uid()
  )
);
-- User can update status of own anomaly (ack/resolve/dismiss)
drop policy if exists "sensor_anomalies_update_own" on public.sensor_anomalies;
create policy "sensor_anomalies_update_own" on public.sensor_anomalies for update using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensor_anomalies.device_id and f.user_id = auth.uid()
  )
);
-- INSERT = service_role only (detection cron/worker)

-- ============================================================
-- 20.3  recommendations
-- ============================================================
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  device_id uuid references public.iot_nodes(id) on delete cascade,
  sensor_id uuid references public.sensors(id) on delete cascade,
  category text not null,                   -- 'irrigation','ventilation','device_health','power','sensor_health'
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  description text not null,
  reason text,
  status text not null default 'new' check (status in ('new','read','dismissed','resolved')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz
);

create index if not exists recommendations_user_status_idx
  on public.recommendations(user_id, status, created_at desc);
create index if not exists recommendations_farm_idx
  on public.recommendations(farm_id, created_at desc) where farm_id is not null;
create index if not exists recommendations_new_severity_idx
  on public.recommendations(severity, created_at desc) where status = 'new';

alter table public.recommendations enable row level security;

drop policy if exists "recommendations_select_own" on public.recommendations;
create policy "recommendations_select_own" on public.recommendations for select
  using (user_id = auth.uid());

drop policy if exists "recommendations_update_own" on public.recommendations;
create policy "recommendations_update_own" on public.recommendations for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- INSERT/DELETE = service_role only (recommendation engine)

-- ============================================================
-- 20.4  sensor_readings_latest — fast latest-value lookup
-- ============================================================
-- Cache table maintained by trigger. Avoid `distinct on` scan of large history.
create table if not exists public.sensor_readings_latest (
  sensor_id uuid primary key references public.sensors(id) on delete cascade,
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  value numeric not null,
  unit text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table public.sensor_readings_latest enable row level security;

drop policy if exists "sensor_readings_latest_select_own" on public.sensor_readings_latest;
create policy "sensor_readings_latest_select_own" on public.sensor_readings_latest for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = sensor_readings_latest.device_id and f.user_id = auth.uid()
  )
);
-- Maintained via trigger (below) — no direct writes

-- Trigger: on sensor_readings INSERT, upsert into latest (only if newer)
create or replace function public.sync_sensor_readings_latest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sensor_readings_latest (sensor_id, device_id, value, unit, occurred_at, received_at)
  values (new.sensor_id, new.device_id, new.value, new.unit, new.occurred_at, new.received_at)
  on conflict (sensor_id) do update set
    value = excluded.value,
    unit = excluded.unit,
    occurred_at = excluded.occurred_at,
    received_at = excluded.received_at,
    device_id = excluded.device_id
  where sensor_readings_latest.occurred_at < excluded.occurred_at;
  return new;
end $$;

drop trigger if exists sensor_readings_sync_latest on public.sensor_readings;
create trigger sensor_readings_sync_latest
  after insert on public.sensor_readings
  for each row execute function public.sync_sensor_readings_latest();

-- ============================================================
-- 20.5  RPC: get_sensor_stats
-- ============================================================
-- Aggregate min/max/avg/count in a single RPC call — replaces 4 separate queries
create or replace function public.get_sensor_stats(
  p_sensor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sensor_id uuid,
  count bigint,
  min_value numeric,
  max_value numeric,
  avg_value numeric,
  latest_value numeric,
  latest_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    p_sensor_id as sensor_id,
    count(*)::bigint,
    min(value),
    max(value),
    round(avg(value)::numeric, 2),
    (select value from public.sensor_readings
       where sensor_id = p_sensor_id and occurred_at between p_from and p_to
       order by occurred_at desc limit 1) as latest_value,
    (select occurred_at from public.sensor_readings
       where sensor_id = p_sensor_id and occurred_at between p_from and p_to
       order by occurred_at desc limit 1) as latest_at
  from public.sensor_readings
  where sensor_id = p_sensor_id and occurred_at between p_from and p_to;
$$;

grant execute on function public.get_sensor_stats(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================================
-- 20.6  RPC: get_sensor_hourly_avg — for time-series chart
-- ============================================================
create or replace function public.get_sensor_hourly_avg(
  p_sensor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (bucket timestamptz, avg_value numeric, min_value numeric, max_value numeric, count bigint)
language sql stable security invoker set search_path = public as $$
  select
    date_trunc('hour', occurred_at) as bucket,
    round(avg(value)::numeric, 2) as avg_value,
    min(value) as min_value,
    max(value) as max_value,
    count(*)::bigint as count
  from public.sensor_readings
  where sensor_id = p_sensor_id and occurred_at between p_from and p_to
  group by bucket
  order by bucket asc;
$$;

grant execute on function public.get_sensor_hourly_avg(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================================
-- 20.7  report_jobs — scheduled + on-demand reports
-- ============================================================
create table if not exists public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete cascade,
  report_type text not null check (report_type in ('farm_daily','farm_weekly','farm_monthly','device_health','automation','anomaly')),
  format text not null default 'pdf' check (format in ('pdf','csv','json')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending','generating','completed','failed')),
  file_path text,                           -- Supabase Storage path
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists report_jobs_user_requested_idx
  on public.report_jobs(user_id, requested_at desc);
create index if not exists report_jobs_status_idx
  on public.report_jobs(status) where status in ('pending','generating');

alter table public.report_jobs enable row level security;

drop policy if exists "report_jobs_select_own" on public.report_jobs;
create policy "report_jobs_select_own" on public.report_jobs for select
  using (user_id = auth.uid());

drop policy if exists "report_jobs_insert_own" on public.report_jobs;
create policy "report_jobs_insert_own" on public.report_jobs for insert
  with check (user_id = auth.uid());
-- UPDATE = service_role only (generator worker)
```

**KNOWN_FEATURES to extend** in [lib/plan-limits.ts](lib/plan-limits.ts):
```ts
{ key: "ai_assistant", label: "AI Farm Assistant" },
{ key: "advanced_analytics", label: "Advanced Analytics + Trends" },
{ key: "scheduled_reports", label: "Scheduled Reports (Daily/Weekly)" },
{ key: "anomaly_detection", label: "Anomaly Detection" },
```
(entries `reports`, `ai`, `automation` already exist)

**Anomaly detection algorithms** (lib/anomaly.ts):

| Method | Trigger | Severity |
|---|---|---|
| `threshold` | Reading outside `sensor_thresholds.min/max_normal` | warning |
| `threshold` | Reading outside `min/max_critical` | critical |
| `sigma` | Reading > 3σ from 24h rolling avg | warning |
| `rate_of_change` | Δvalue/Δtime > 20%/min | warning |
| `stale` | No reading > 3× reporting interval | warning |
| `stuck` | Same value for 20+ consecutive readings | info |

**Recommendation engine** — triggered by:
- Repeat threshold violations (3+ times in 24h) → irrigation/ventilation category
- Anomaly critical + no automation to fix → device_health category
- Device offline > 1 hour → device_health critical
- Automation failed 5+ times → automation category

Cron `/api/cron/analytics-scan` (add to vercel.json, daily 04:00 UTC) runs anomaly + recommendation generation.

**Farm Health Score formula:**
```
score = 100
  - 10 × (offline_devices / total_devices)
  - 15 × (new_critical_anomalies / max(1, sensor_count))
  - 5  × (new_warning_anomalies / max(1, sensor_count))
  - 10 × (automation_failures_24h / max(1, active_automations))
clamp 0..100
```
0-39 Critical / 40-59 Poor / 60-79 Good / 80-100 Excellent

**AI architecture (Phase 11.2 spec — not implemented):**
- User query → `/api/ai/chat` → LLM (Claude via Anthropic API — env `ANTHROPIC_API_KEY`)
- Tool-use pattern: LLM calls whitelisted tools `get_farm_summary`, `get_sensor_stats`, `list_active_anomalies` — each tool runs under user's Supabase RLS context
- **AI cannot** publish MQTT / mutate DB / access other users' data
- Plan gate: `hasFeature(plan, 'ai_assistant')` before route runs
- Rate limit: 10 queries/day (Starter), 100/day (Pro), unlimited (Business+) via `ai_query_log` table

**Rerun-safe:** all `if not exists`, `or replace`, `on conflict` — run entire Section 20 anytime.

---

## 21. Legacy Flutter/ESP32 Protocol Adapter (Special Phase ESP32-Test)

Bridge existing Flutter app's MQTT protocol (`farm/*` topics, single-tenant, `broker.emqx.io` default) to SMF Web (`smfiot/{uid}/*`, multi-tenant, HiveMQ).

**See:** [docs/existing-app-mqtt-analysis.md](docs/existing-app-mqtt-analysis.md) + [docs/mqtt-integration-gap-analysis.md](docs/mqtt-integration-gap-analysis.md) for source-verified findings.

```sql
-- ============================================================
-- 21.1  Expand sensors.sensor_type check for legacy compat
-- ============================================================
-- Legacy Flutter/ESP32 sends voltage/current/power (INA226) — needs new types
alter table public.sensors drop constraint if exists sensors_sensor_type_check;
alter table public.sensors add constraint sensors_sensor_type_check
  check (sensor_type in (
    'temperature','humidity','soil_moisture','light','npk','ph','ec','co2',
    'voltage','current','power','rssi'
  ));

-- ============================================================
-- 21.2  legacy_device_mappings — bridge `farm/*` topics to SMF device
-- ============================================================
-- Legacy ESP32 firmware uses hardcoded `farm/*` topics (single-tenant).
-- This table maps 1 legacy topic namespace → 1 SMF device.id.
--
-- Test mode: exactly 1 ESP32 per broker until firmware adds device prefix.
-- Multi-device: firmware must publish `{prefix}/temp` where prefix is unique.
create table if not exists public.legacy_device_mappings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid unique not null references public.iot_nodes(id) on delete cascade,
  legacy_topic_prefix text not null default 'farm',   -- 'farm' for stock firmware; can be per-device UID if firmware modified
  mac_address text,                                    -- ESP32 MAC (colon-hex) for correlation
  chip_id text,                                        -- ESP.getChipId() if firmware publishes it
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legacy_device_mappings_prefix_uniq
  on public.legacy_device_mappings(legacy_topic_prefix);

alter table public.legacy_device_mappings enable row level security;

-- User can SELECT own mapping via device→farm chain
drop policy if exists "legacy_device_mappings_select_own" on public.legacy_device_mappings;
create policy "legacy_device_mappings_select_own" on public.legacy_device_mappings for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = legacy_device_mappings.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE/DELETE = service_role only (admin creates mapping when provisioning ESP32)

drop trigger if exists legacy_device_mappings_set_updated_at on public.legacy_device_mappings;
create trigger legacy_device_mappings_set_updated_at
  before update on public.legacy_device_mappings
  for each row execute function public.set_updated_at();

-- ============================================================
-- 21.3  RPC: resolve_legacy_device — worker uses this to look up SMF device from legacy topic
-- ============================================================
create or replace function public.resolve_legacy_device(p_topic_prefix text)
returns table (
  device_id uuid,
  device_uid text,
  farm_id uuid,
  is_disabled boolean,
  archived_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.device_uid, n.farm_id, n.is_disabled, n.archived_at
  from public.legacy_device_mappings m
  join public.iot_nodes n on n.id = m.device_id
  where m.legacy_topic_prefix = p_topic_prefix;
$$;

-- Only service_role calls this (worker) — no grant to authenticated
```

**Worker adapter spec** — subscribe **both** patterns:
```
smfiot/+/telemetry        # new devices (Phase 9 spec)
smfiot/+/status
farm/#                    # legacy (all farm/* topics)
```

**Legacy topic → SMF transform** (implement in worker):

```typescript
// Pseudo-code — actual impl in worker repo
async function handleLegacyMessage(topic: string, payload: string) {
  const parts = topic.split('/');  // ['farm', 'temp'] or ['farm', 'device', 'status'] or ['farm', 'relay', '1', 'status']
  if (parts[0] !== 'farm') return;
  const prefix = parts[0];  // 'farm' — future: `parts[0]` will be per-device

  const { data } = await admin.rpc('resolve_legacy_device', { p_topic_prefix: prefix });
  if (!data || data.length === 0) return;  // unknown legacy device
  const device = data[0];
  if (device.is_disabled || device.archived_at) return;

  const json = JSON.parse(payload);

  // Route by sub-topic
  if (parts[1] === 'device' && parts[2] === 'status') {
    await admin.from('iot_nodes').update({
      status: json.online ? 'online' : 'offline',
      last_seen: new Date().toISOString(),
    }).eq('id', device.device_id);
    await admin.from('device_events').insert({
      device_id: device.device_id,
      event_type: json.online ? 'connected' : 'disconnected',
      payload: { rssi: json.rssi, device_time: json.time },
    });
    return;
  }

  if (parts[1] === 'relay' && parts[3] === 'status') {
    // Update matching pending device_commands for this relay channel
    const channel = parseInt(parts[2]);
    await admin
      .from('device_commands')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString(), response: json })
      .eq('device_id', device.device_id)
      .in('status', ['sent'])
      .contains('payload', { channel });
    await admin.from('device_events').insert({
      device_id: device.device_id,
      event_type: 'relay_changed',
      payload: { channel, state: json.state },
    });
    return;
  }

  // Sensor reading — map topic → sensor_type + extract value
  const mapping: Record<string, { sensor_type: string; field: string; unit: string }[]> = {
    'farm/temp':     [{ sensor_type: 'temperature', field: 'temperature', unit: '°C' }],
    'farm/humidity': [{ sensor_type: 'humidity',    field: 'humidity',    unit: '%' }],
    'farm/light':    [{ sensor_type: 'light',       field: 'lux',         unit: 'lux' }],
    'farm/soil':     [
      { sensor_type: 'ph',           field: 'ph',       unit: 'pH' },
      { sensor_type: 'ec',           field: 'ec',       unit: 'µS/cm' },
      { sensor_type: 'npk',          field: 'n',        unit: 'mg/kg' },  // stored as 3 separate readings if channels set up
      { sensor_type: 'soil_moisture',field: 'moisture', unit: '%' },
    ],
    'farm/power':    [
      { sensor_type: 'voltage', field: 'v', unit: 'V' },
      { sensor_type: 'current', field: 'a', unit: 'A' },
      { sensor_type: 'power',   field: 'w', unit: 'W' },
    ],
  };
  const targets = mapping[topic];
  if (!targets) return;

  const readings = targets
    .filter((t) => typeof json[t.field] === 'number')
    .map((t) => ({ sensor_type: t.sensor_type, channel: null, value: json[t.field], unit: t.unit }));

  if (readings.length === 0) return;

  // Reuse existing /api/telemetry/ingest — call locally within worker
  await ingestBatch({
    device_uid: device.device_uid,
    occurred_at: new Date().toISOString(),
    readings,
  });
}
```

**Command routing (SMF → legacy ESP32)** — worker subscribes `smfiot/+/command`:
```typescript
// When user clicks Relay ON in Web:
// 1. API inserts device_commands(command='relay_on', payload={channel:1})
// 2. Worker sees new command, looks up legacy mapping
// 3. Worker publishes `farm/relay/1/set` with `{"state": true}` — legacy protocol
// 4. ESP32 receives, switches relay, publishes `farm/relay/1/status` `{"state":true}`
// 5. Worker maps back → updates device_commands.status='acknowledged'
```

**Provisioning workflow (Admin):**
1. User adds SMF device via Web UI → gets `device_uid` (e.g. `SMF-A1B2C3D4`)
2. Admin runs SQL:
   ```sql
   insert into public.legacy_device_mappings (device_id, legacy_topic_prefix, mac_address, notes)
   values ('YOUR_DEVICE_UUID', 'farm', '24:6F:28:AA:BB:CC', 'Test unit ESP32 in workshop');
   ```
3. Reflash ESP32 firmware with HiveMQ credentials (see docs/esp32-mqtt-integration-spec.md)
4. Power ESP32 → publishes `farm/device/status` → worker resolves → SMF device goes online

**Rerun-safe:** all `if not exists`, `drop constraint if exists` — Section 21 runnable anytime.

---

## 22. Customer MQTT Provisioning + Claim Codes (Special Phase 4)

**Reuse:** `device_credentials` (Section 18.2) — already stores per-device MQTT username + bcrypt hash. Add `mqtt_topic_prefix` + `mqtt_password_last4` for display.

**New:** `device_claim_codes` — one-time provisioning tokens (factory-flashed device → user claims via code).

```sql
-- ============================================================
-- 22.1  Extend device_credentials for customer provisioning
-- ============================================================
alter table public.device_credentials
  add column if not exists mqtt_topic_prefix text,
  add column if not exists mqtt_password_last4 text;
-- password stored as bcrypt hash — plaintext returned ONCE at regeneration time only

-- ============================================================
-- 22.2  device_claim_codes — one-time claim tokens
-- ============================================================
create table if not exists public.device_claim_codes (
  code text primary key,                       -- e.g. 'SMF-A1B2-C3D4-E5F6' (16-char hyphenated)
  device_id uuid unique references public.iot_nodes(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,  -- null = factory-generated by admin
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz,                       -- optional TTL
  status text not null default 'unclaimed'
    check (status in ('unclaimed','claimed','revoked','expired')),
  created_at timestamptz not null default now()
);

create index if not exists device_claim_codes_status_idx
  on public.device_claim_codes(status) where status = 'unclaimed';

alter table public.device_claim_codes enable row level security;

-- Anyone authenticated can SELECT to check if code exists (needed for claim UI)
-- but only exposed fields via RPC — table-level = no direct read
-- INSERT/UPDATE/DELETE = service_role only (admin generates, server action claims)

-- ============================================================
-- 22.3  RPC: claim_device_by_code — atomic ownership transfer
-- ============================================================
create or replace function public.claim_device_by_code(
  p_code text,
  p_farm_id uuid,
  p_zone_id uuid default null
)
returns table (device_id uuid, device_uid text)
language plpgsql security definer set search_path = public as $$
declare
  v_claim record;
  v_farm record;
  v_now timestamptz := now();
begin
  -- Verify code + status
  select * into v_claim from public.device_claim_codes
    where code = p_code and status = 'unclaimed'
    for update;
  if not found then
    raise exception 'claim code invalid or already used' using errcode = '22023';
  end if;
  if v_claim.expires_at is not null and v_claim.expires_at < v_now then
    update public.device_claim_codes set status = 'expired' where code = p_code;
    raise exception 'claim code expired' using errcode = '22023';
  end if;

  -- Verify farm belongs to caller
  select * into v_farm from public.farms
    where id = p_farm_id and user_id = auth.uid();
  if not found then
    raise exception 'farm not found or not owned by caller' using errcode = '42501';
  end if;

  -- Reassign device to caller's farm
  update public.iot_nodes
    set farm_id = p_farm_id,
        zone_id = p_zone_id,
        updated_at = v_now
    where id = v_claim.device_id;

  -- Mark claim used
  update public.device_claim_codes
    set status = 'claimed', claimed_by = auth.uid(), claimed_at = v_now
    where code = p_code;

  return query
    select n.id, n.device_uid from public.iot_nodes n where n.id = v_claim.device_id;
end $$;

grant execute on function public.claim_device_by_code(text, uuid, uuid) to authenticated;
```

**Provisioning flow (admin generates factory codes):**
```sql
-- Admin creates device + claim code, ship device with printed code on sticker
insert into public.iot_nodes (device_uid, device_name, farm_id, status)
  values ('SMF002', 'Factory Unit', '<placeholder-farm-uuid>', 'never_connected')
  returning id;
-- Copy the returned id, then:
insert into public.device_claim_codes (code, device_id)
  values ('SMF-A1B2-C3D4-E5F6', '<returned-uuid>');
```

**Customer claim flow:**
```
User: Dashboard → "อ้างสิทธิ์อุปกรณ์" → กรอก code + เลือกฟาร์ม/แปลง
Server action: claim_device_by_code(code, farm_id, zone_id) → device_id moved to user's farm
```

**HiveMQ credential provisioning — 2 paths depending on tier:**

**Path A — Free tier (manual):**
1. Admin creates HiveMQ credential in Dashboard (username = device_uid, random password)
2. Copy plaintext password to clipboard
3. Server action `storeDeviceCredential(deviceId, plaintext)` bcrypt-hashes + stores in `device_credentials`
4. Return plaintext ONCE to admin UI for flashing to firmware
5. Plaintext discarded after — regenerate = create new HiveMQ credential + repeat

**Path B — Starter tier (automated):**
1. Server action `regenerateDeviceCredential(deviceId)`:
   - Generates random 32-char password
   - Calls HiveMQ REST API `POST /api/v1/authentication/users` — create credential + ACL
   - bcrypt hash → `device_credentials`
   - Returns plaintext ONCE
2. ACL enforced at broker — device X **cannot** publish to device Y topics

**MQTT topic namespace (spec — implement when firmware supports prefix):**
```
smf/{customer_identity_id}/{device_uid}/telemetry
smf/{customer_identity_id}/{device_uid}/status
smf/{customer_identity_id}/{device_uid}/command
smf/{customer_identity_id}/{device_uid}/relay/{ch}/set
smf/{customer_identity_id}/{device_uid}/relay/{ch}/status
```

**Legacy compat:** `legacy_device_mappings` (Section 21) unchanged. Legacy `farm/*` topics keep working for existing SMF001. New devices default to legacy prefix `farm` **until firmware supports namespace** — then admin sets `legacy_topic_prefix = 'smf/{customer_id}/{device_uid}'` per device.
```

**Rerun-safe:** all `if not exists`, `or replace`, `on conflict` — Section 22 runnable anytime.

---

## 23. HiveMQ Starter Readiness (Special Phase 4.4)

Prepare `device_credentials` for automated provisioning lifecycle when HiveMQ Cloud Starter tier is enabled. Backward-compatible with Free/manual mode (existing SMF001 unaffected).

```sql
-- ============================================================
-- 23.1  Extend device_credentials for provisioning lifecycle
-- ============================================================
alter table public.device_credentials
  add column if not exists provisioning_status text not null default 'active'
    check (provisioning_status in ('pending','active','failed','revoked')),
  add column if not exists hivemq_credential_id text,   -- broker-side ID (populated by adapter in automatic mode)
  add column if not exists provisioning_error text,
  add column if not exists last_used_at timestamptz;    -- future — track credential activity

create index if not exists device_credentials_provisioning_status_idx
  on public.device_credentials(provisioning_status)
  where provisioning_status in ('pending','failed');

-- Update the partial UNIQUE index to consider status (active + non-revoked only)
drop index if exists device_credentials_active_uniq;
create unique index if not exists device_credentials_active_uniq
  on public.device_credentials(device_id)
  where revoked_at is null and provisioning_status in ('pending','active');
```

**Status machine:**
```
create → 'pending' (manual mode: immediately 'active' after DB write;
                    automatic mode: 'active' after HiveMQ REST 200, else 'failed')
active → revoke → 'revoked' + revoked_at=now()
active → rotate → new row 'active', old row 'revoked'
pending → API 5xx retry → 'active' or 'failed'
failed → manual delete or retry
```

**Backward compat:** existing rows default `provisioning_status='active'` — Phase 4.1-4.3 rows continue working. No production disruption.

**Rerun-safe:** `if not exists` + `drop index if exists` — Section 23 runnable anytime.

---

## 24. Firmware Management (Special Phase 5.0)

Firmware release registry + OTA job tracking. Files hosted in Supabase Storage bucket `firmware` (private, service-role write, signed-URL read).

```sql
-- ============================================================
-- 24.1  firmware_releases — versioned firmware artifacts (admin-created)
-- ============================================================
create table if not exists public.firmware_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,                     -- semver: 1.2.3
  build text,                                 -- optional build tag: 20260819
  board text not null,                        -- e.g. ESP32-S3
  hardware_model text not null,               -- e.g. SMF-MAIN-V1
  release_channel text not null default 'test'
    check (release_channel in ('test','stable','deprecated','revoked')),

  -- Storage: individual artifacts stored separately (bootloader/partitions/firmware/optional others)
  bootloader_path text,                       -- storage://firmware/{id}/bootloader.bin
  bootloader_offset int not null default 0,   -- 0x0 for ESP32-S3
  partitions_path text,                       -- storage://firmware/{id}/partitions.bin
  partitions_offset int not null default 32768,   -- 0x8000
  app_path text not null,                     -- storage://firmware/{id}/firmware.bin  — REQUIRED
  app_offset int not null default 65536,      -- 0x10000

  file_size bigint not null check (file_size > 0),   -- total sum of artifacts
  sha256_app text not null check (length(sha256_app) = 64),
  sha256_manifest text,                       -- optional composite hash

  min_firmware_version text,                  -- OTA compatibility floor
  release_notes text,
  is_latest boolean not null default false,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists firmware_releases_version_board_uniq
  on public.firmware_releases (version, board, hardware_model);

-- Only 1 is_latest=true per (hardware_model, channel)
create unique index if not exists firmware_releases_latest_uniq
  on public.firmware_releases (hardware_model, release_channel)
  where is_latest = true;

create index if not exists firmware_releases_channel_idx on public.firmware_releases(release_channel);
create index if not exists firmware_releases_model_idx on public.firmware_releases(hardware_model);

drop trigger if exists firmware_releases_set_updated_at on public.firmware_releases;
create trigger firmware_releases_set_updated_at
  before update on public.firmware_releases
  for each row execute function public.set_updated_at();

alter table public.firmware_releases enable row level security;

-- User (authenticated) can SELECT approved releases matching their device hardware
drop policy if exists "firmware_releases_select_approved" on public.firmware_releases;
create policy "firmware_releases_select_approved" on public.firmware_releases for select using (
  release_channel in ('test','stable','deprecated') and approved_at is not null and (
    hardware_model in (
      select distinct n.hardware_model
      from public.iot_nodes n
      join public.farms f on f.id = n.farm_id
      where f.user_id = auth.uid() and n.hardware_model is not null
    )
    OR
    hardware_model = 'ESP32-S3'   -- fallback: allow generic S3 releases visible to all
  )
);
-- INSERT/UPDATE/DELETE = service_role only (admin backend)

-- ============================================================
-- 24.2  firmware_update_jobs — per-device OTA state machine
-- ============================================================
create table if not exists public.firmware_update_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  firmware_release_id uuid not null references public.firmware_releases(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  method text not null default 'ota' check (method in ('ota','usb')),
  state text not null default 'requested'
    check (state in (
      'requested','downloading','verifying','installing','rebooting',
      'health_check','success','failed','rolled_back','cancelled','timeout'
    )),
  from_version text,
  to_version text not null,
  progress smallint check (progress is null or (progress between 0 and 100)),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate active job per device
create unique index if not exists firmware_update_jobs_active_uniq
  on public.firmware_update_jobs (device_id)
  where state in ('requested','downloading','verifying','installing','rebooting','health_check');

create index if not exists firmware_update_jobs_device_created_idx
  on public.firmware_update_jobs(device_id, created_at desc);
create index if not exists firmware_update_jobs_state_idx
  on public.firmware_update_jobs(state);

drop trigger if exists firmware_update_jobs_set_updated_at on public.firmware_update_jobs;
create trigger firmware_update_jobs_set_updated_at
  before update on public.firmware_update_jobs
  for each row execute function public.set_updated_at();

alter table public.firmware_update_jobs enable row level security;

drop policy if exists "firmware_update_jobs_select_own" on public.firmware_update_jobs;
create policy "firmware_update_jobs_select_own" on public.firmware_update_jobs for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = firmware_update_jobs.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE = service_role only (server action + worker acks)

-- ============================================================
-- 24.3  Extend firmware_releases with per-artifact SHA + boot_app0 (Phase 5.1)
-- ============================================================
alter table public.firmware_releases
  add column if not exists sha256_bootloader text,
  add column if not exists sha256_partitions text,
  add column if not exists boot_app0_path text,
  add column if not exists boot_app0_offset int not null default 57344,   -- 0xe000
  add column if not exists sha256_boot_app0 text;

-- Optional integrity constraint (nullable — legacy rows may lack them)
alter table public.firmware_releases
  drop constraint if exists firmware_releases_sha_lengths_chk;
alter table public.firmware_releases
  add constraint firmware_releases_sha_lengths_chk check (
    (sha256_bootloader is null or length(sha256_bootloader) = 64) and
    (sha256_partitions is null or length(sha256_partitions) = 64) and
    (sha256_boot_app0  is null or length(sha256_boot_app0)  = 64)
  );

-- ============================================================
-- 24.4  Extend firmware_update_jobs.method for USB flashing (Phase 5.1)
-- ============================================================
-- (`method` column already exists in Section 24.2; ensure default + check accepts 'usb')
-- No schema change needed — Section 24.2 already declares:
--   method text not null default 'ota' check (method in ('ota','usb'))

-- ============================================================
-- 24.5  Storage bucket 'firmware' — MANUAL step in Supabase Dashboard
-- ============================================================
-- Dashboard → Storage → New bucket
--   Name:              firmware
--   Public bucket:     NO   ← MUST BE PRIVATE
--   File size limit:   16 MB
--   Allowed MIME:      application/octet-stream
--
-- Then in Dashboard → Storage → firmware → Policies:
--   Leave EMPTY. No user-facing policy needed.
--   All read/write goes through service_role via server actions:
--     - createSignedUploadUrl()  → admin upload
--     - createSignedUrl(60)      → user download (USB flash / OTA)
--
-- Security invariant:
--   - Bucket is private (never public).
--   - Client NEVER receives service_role key.
--   - Every signed URL expires ≤ 60 seconds.
--   - Path pattern is immutable per release: firmware/{release_id}/{filename}.
```

**Rerun-safe:** all `if not exists`, `if exists`, `drop constraint if exists` — Section 24.3 / 24.4 runnable anytime.

**Firmware manifest** — stored inline in `firmware_releases` row, exposed as JSON via server action:
```json
{
  "release_id": "uuid",
  "version": "0.1.0",
  "build": "20260819",
  "board": "ESP32-S3",
  "hardware_model": "SMF-MAIN-V1",
  "channel": "test",
  "artifacts": [
    { "role": "bootloader", "offset": 0,       "url": "signed_url", "size": 15104, "sha256": "..." },
    { "role": "partitions", "offset": 32768,   "url": "signed_url", "size": 3072,  "sha256": "..." },
    { "role": "app",        "offset": 65536,   "url": "signed_url", "size": 1048576,"sha256": "..." }
  ],
  "sha256_app": "...",
  "min_firmware_version": null,
  "release_notes": "..."
}
```

**Flash addresses (ESP32-S3 default Arduino partitions, verified from user's `.pio/build/esp32-s3-devkitc-1/`):**
- `0x0000` bootloader.bin
- `0x8000` partitions.bin
- `0xe000` boot_app0.bin (optional — OTA data init)
- `0x10000` firmware.bin (app slot 0)

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
