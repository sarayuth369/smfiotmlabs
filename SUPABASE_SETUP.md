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

## 6. `.env.local`

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
