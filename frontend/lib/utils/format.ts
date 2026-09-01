export function formatCurrency(amount: number, currency: string = "INR"): string {
  if (currency === "INR" || !currency) {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
