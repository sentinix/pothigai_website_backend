import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminToken, app, createProduct, prisma, resetDb } from "./helpers.js";

let token: string;
const customer = {
  customerName: "Test Customer",
  phone: "98765 43210",
  addressLine1: "1 Test Street",
  city: "Tirunelveli",
  state: "Tamil Nadu",
  pincode: "627001",
  locale: "en",
};

describe("checkout", () => {
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
  });

  it("prices orders from the database and decrements stock", async () => {
    const p = await createProduct(token, { price: 200, salePrice: 180, stockQuantity: 5 });
    await prisma.siteSettings.update({ where: { id: "default" }, data: { flatShippingFee: 40 } });
    const res = await request(app)
      .post("/api/public/orders")
      .send({ ...customer, items: [{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: res.body.token }, include: { items: true } });
    expect(order.items).toHaveLength(1);
    expect(Number(order.subtotal)).toBe(540);
    expect(Number(order.total)).toBe(580);
    expect(order.phone).toBe("9876543210");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(2);

    const confirmation = await request(app).get(`/api/public/orders/${res.body.token}`);
    expect(confirmation.body.total).toBe("580.00");
    expect(confirmation.body).not.toHaveProperty("phone");
    expect(confirmation.body).not.toHaveProperty("addressLine1");
  });

  it("rejects client-supplied prices", async () => {
    const p = await createProduct(token);
    const res = await request(app)
      .post("/api/public/orders")
      .send({ ...customer, items: [{ productId: p.id, quantity: 1, price: 1 }] });
    expect(res.status).toBe(400);
  });

  it("prevents overselling and ordering unpublished products", async () => {
    const p = await createProduct(token, { stockQuantity: 1 });
    const hidden = await createProduct(token, { isPublished: false });
    const over = await request(app).post("/api/public/orders").send({ ...customer, items: [{ productId: p.id, quantity: 2 }] });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe("out_of_stock");
    const unpublished = await request(app).post("/api/public/orders").send({ ...customer, items: [{ productId: hidden.id, quantity: 1 }] });
    expect(unpublished.status).toBe(409);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(1);
    expect(await prisma.order.count()).toBe(0);
  });

  it("validates customer details", async () => {
    const p = await createProduct(token);
    const res = await request(app)
      .post("/api/public/orders")
      .send({ ...customer, phone: "123", pincode: "abc", customerName: "", items: [{ productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { path: string }) => f.path).sort()).toEqual(["customerName", "phone", "pincode"]);
  });

  it("lets the purchase analytics event be claimed only once", async () => {
    const p = await createProduct(token);
    const order = await request(app).post("/api/public/orders").send({ ...customer, items: [{ productId: p.id, quantity: 1 }] });
    const first = await request(app).post(`/api/public/orders/${order.body.token}/analytics`);
    const second = await request(app).post(`/api/public/orders/${order.body.token}/analytics`);
    expect(first.body.shouldTrack).toBe(true);
    expect(second.body.shouldTrack).toBe(false);
  });

  it("restocks once when an order is cancelled", async () => {
    const p = await createProduct(token, { stockQuantity: 3 });
    const res = await request(app).post("/api/public/orders").send({ ...customer, items: [{ productId: p.id, quantity: 2 }] });
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: res.body.token } });
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).patch(`/api/admin/orders/${order.id}`).set(auth).send({ status: "CANCELLED" }).expect(200);
    await request(app).patch(`/api/admin/orders/${order.id}`).set(auth).send({ status: "CANCELLED" }).expect(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(3);
    await request(app).patch(`/api/admin/orders/${order.id}`).set(auth).send({ status: "CONFIRMED" }).expect(400);
  });
});
