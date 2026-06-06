export type CurrencyBasket = Record<string, number>;

export function addCurrency(basket: CurrencyBasket, currency: string, amount = 1): CurrencyBasket {
  return { ...basket, [currency]: (basket[currency] ?? 0) + amount };
}

export function mergeCurrency(a: CurrencyBasket, b: CurrencyBasket): CurrencyBasket {
  const out: CurrencyBasket = { ...a };
  for (const [currency, amount] of Object.entries(b)) {
    out[currency] = (out[currency] ?? 0) + amount;
  }
  return out;
}
