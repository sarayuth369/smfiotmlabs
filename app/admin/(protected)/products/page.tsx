import { requireModule } from "@/lib/admin/current";
import { getProducts } from "@/lib/catalog";
import { updateProduct } from "./actions";

export default async function AdminProductsPage() {
  await requireModule("products");
  const products = await getProducts();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">IoT Node Prices</h1>
        <p className="text-sm text-brand-900/60 mt-0.5">
          ราคาอุปกรณ์แต่ละรุ่น — บันทึกแล้วจะแสดงในหน้า{" "}
          <a className="text-brand-700 underline" href="/iot-nodes" target="_blank">/iot-nodes</a>{" "}
          และเรียกเก็บใน Stripe อัตโนมัติ
        </p>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        {products.map((p) => (
          <form
            key={p.sku}
            action={updateProduct.bind(null, p.sku)}
            className="card p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-brand-700">
                  {p.sku}
                </div>
                <h2 className="text-lg font-bold text-brand-800">{p.name}</h2>
              </div>
              <label className="flex items-center gap-2 text-sm text-brand-900/75">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={p.is_active}
                  className="rounded border-border text-brand-600 focus:ring-brand-500/30"
                />
                Active
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อสินค้า">
                <input type="text" name="name" defaultValue={p.name} required className={input()} />
              </Field>
              <Field label="Sort Order">
                <input type="number" name="sort_order" defaultValue={p.sort_order} className={input()} />
              </Field>
              <Field label="ราคา (บาท)">
                <input type="number" step="0.01" name="price" defaultValue={p.price} required className={input()} />
              </Field>
              <Field label="Badge">
                <input type="text" name="badge" defaultValue={p.badge ?? ""} className={input()} />
              </Field>
              <Field label="Badge Tier" className="col-span-2">
                <select name="badge_tier" defaultValue={p.badge_tier ?? "starter"} className={input()}>
                  <option value="starter">starter (เทา)</option>
                  <option value="best">best (เหลือง)</option>
                  <option value="pro">pro (เขียว)</option>
                  <option value="enterprise">enterprise (ดำ)</option>
                </select>
              </Field>
            </div>

            <Field label="เหมาะสำหรับ (บรรทัดละหนึ่งรายการ)">
              <textarea
                name="audience"
                rows={3}
                defaultValue={p.audience.join("\n")}
                className={textarea()}
              />
            </Field>

            <Field label="Specifications (บรรทัดละหนึ่งรายการ)">
              <textarea
                name="specs"
                rows={8}
                defaultValue={p.specs.join("\n")}
                className={textarea()}
              />
            </Field>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                บันทึก
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-brand-900/70">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const input = () =>
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition";
const textarea = () =>
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition";
