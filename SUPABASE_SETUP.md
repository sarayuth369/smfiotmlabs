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
  created_at timestamptz default now(),
  verified_at timestamptz
);

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

### ตั้งค่า PromptPay ID

แก้ค่าตัวแปรใน [.env.local](.env.local) เพื่อกำหนดผู้รับเงิน:

```
NEXT_PUBLIC_PROMPTPAY_ID=0812345678
NEXT_PUBLIC_PROMPTPAY_NAME=M Labs Co., Ltd.
```

- `NEXT_PUBLIC_PROMPTPAY_ID` — เบอร์โทร (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก) ของบัญชี PromptPay
- ไม่ตั้งค่า → ระบบใช้ค่า placeholder `0000000000` (QR ใช้ทดสอบไม่ได้จริง)

### การ verify การชำระเงิน

- ระบบปัจจุบัน (**demo mode**): ผู้ใช้กด "ฉันชำระเงินแล้ว" → อัปเกรดทันที + บันทึก `payment_requests` เป็น `pending`
- Production: ควรทำ verify ด้วยหนึ่งใน:
  - Payment gateway จริง (Omise, 2C2P, Stripe TH) แล้ว webhook อัปเดต `status = 'verified'` และ `profiles.plan`
  - ตรวจสอบ statement ธนาคาร → SQL manual:
    ```sql
    -- ยืนยันการชำระของ user + อัปเดต plan
    update public.payment_requests
      set status = 'verified', verified_at = now()
      where id = '<request-id>';

    update public.profiles
      set plan = 'pro'  -- หรือ 'business'
      where id = '<user-id>';
    ```

---

## 6. `.env.local`

ต้องมีคีย์เหล่านี้ (มีอยู่แล้วในโปรเจกต์):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
```

รีสตาร์ท `npm run dev` ทุกครั้งหลังแก้ `.env.local`
