export function fmtUS(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function plate(listingId: string): string {
  return listingId.replace(/^l/, "»");
}

export function countOf(listingId: string): string {
  return String(listingId.length);
}
