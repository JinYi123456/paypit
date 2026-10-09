// Client-side PayPal Web SDK loader (@paypal/paypal-js, PayPal-maintained).

import { loadScript } from "@paypal/paypal-js";

export interface PayPalNamespace {
  Buttons: (cfg: {
    style?: Record<string, string>;
    createOrder: (data: unknown, actions: unknown) => Promise<string>;
    onApprove?: (data: { orderID: string }) => Promise<void> | void;
    onError?: (err: unknown) => void;
    onClick?: () => void;
  }) => { render: (el: HTMLElement) => Promise<void> };
}

let loading: Promise<unknown> | null = null;

export function loadPayPalSdk(clientId: string): Promise<unknown> {
  if (typeof window === "undefined") return Promise.reject(new Error("client only"));
  if (!clientId) return Promise.reject(new Error("no client id"));
  const existing = (window as unknown as { paypal?: PayPalNamespace }).paypal;
  if (existing) return Promise.resolve(existing);
  if (!loading) {
    loading = loadScript({
      clientId,
      currency: "USD",
      intent: "capture",
      components: "buttons",
      locale: "en_US",
    });
  }
  return loading;
}

export function paypalButtonsConfig(): { style: Record<string, string> } {
  return {
    style: {
      layout: "vertical",
      shape: "pill",
      color: "gold",
      label: "paypal",
      height: "42",
    },
  };
}
