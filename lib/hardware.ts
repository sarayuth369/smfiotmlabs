export type SKU = "starter_node" | "pro_node" | "complete_kit";

export const HARDWARE: Record<SKU, { name: string; price: number }> = {
  starter_node: { name: "SMF IoT Starter Node", price: 2990 },
  pro_node: { name: "SMF IoT Pro Node", price: 4990 },
  complete_kit: { name: "SMF IoT Complete Smart Farm Kit", price: 9900 },
};

export function isValidSku(x: string): x is SKU {
  return x === "starter_node" || x === "pro_node" || x === "complete_kit";
}
