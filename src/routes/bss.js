// TM Forum Open API subset: TMF620, TMF629, TMF637, TMF635, TMF678.
import { Router } from 'express';
import { OFFERINGS } from '../data/catalog.js';
import {
  BASE, compareFilter, sendList, sendOne, tmfError,
  toBillingRate, toCustomer, toCustomerBill, toProduct, toProductOffering, toUsage,
} from './tmf.js';

export function bssRouter(store) {
  const r = Router();
  const customerOf = (id) => store.customerById.get(id);
  const partyFilter = (req) => req.query['relatedParty.id'];

  // TMF620 Product Catalog
  r.get(`${BASE.catalog}/productOffering`, (req, res) => {
    const items = OFFERINGS
      .filter((o) => !req.query['category.id'] || o.kind === req.query['category.id'])
      .map(toProductOffering);
    sendList(req, res, items);
  });
  r.get(`${BASE.catalog}/productOffering/:id`, (req, res) => {
    const o = OFFERINGS.find((x) => x.id === req.params.id);
    if (!o) return tmfError(res, 404, 'Not found', `ProductOffering ${req.params.id} not found`);
    sendOne(req, res, toProductOffering(o));
  });

  // TMF629 Customer
  r.get(`${BASE.customer}/customer`, (req, res) => {
    const { segment, taxRegion } = req.query;
    const items = store.customers
      .filter((c) => (!segment || c.segment === segment) && (!taxRegion || c.region === taxRegion))
      .map(toCustomer);
    sendList(req, res, items);
  });
  r.get(`${BASE.customer}/customer/:id`, (req, res) => {
    const c = customerOf(req.params.id);
    if (!c) return tmfError(res, 404, 'Not found', `Customer ${req.params.id} not found`);
    sendOne(req, res, toCustomer(c));
  });

  // TMF637 Product Inventory
  r.get(`${BASE.inventory}/product`, (req, res) => {
    const party = partyFilter(req);
    const rows = party ? store.productsByCustomer.get(party) ?? [] : store.products;
    const items = rows
      .map((p) => toProduct(p, customerOf(p.customerId)))
      .filter((p) => (!req.query.status || p.status === req.query.status)
        && (!req.query['productOffering.id'] || p.productOffering.id === req.query['productOffering.id']));
    sendList(req, res, items);
  });
  r.get(`${BASE.inventory}/product/:id`, (req, res) => {
    const p = store.productById.get(req.params.id);
    if (!p) return tmfError(res, 404, 'Not found', `Product ${req.params.id} not found`);
    sendOne(req, res, toProduct(p, customerOf(p.customerId)));
  });

  // TMF635 Usage
  r.get(`${BASE.usage}/usage`, (req, res) => {
    const party = partyFilter(req);
    if (!party) return tmfError(res, 400, 'Missing filter', 'relatedParty.id is required: the usage collection is too large to list unfiltered');
    const items = (store.usageByCustomer.get(party) ?? [])
      .map(toUsage)
      .filter((u) => compareFilter(req.query, 'usageDate', u.usageDate)
        && (!req.query.usageType || u.usageType === req.query.usageType));
    sendList(req, res, items);
  });
  r.get(`${BASE.usage}/usage/:id`, (req, res) => {
    const u = store.usageById.get(req.params.id);
    if (!u) return tmfError(res, 404, 'Not found', `Usage ${req.params.id} not found`);
    sendOne(req, res, toUsage(u));
  });

  // TMF678 Customer Bill
  r.get(`${BASE.bill}/customerBill`, (req, res) => {
    const party = partyFilter(req);
    const rows = party ? store.billsByCustomer.get(party) ?? [] : store.bills;
    const items = rows
      .filter((b) => (!req.query.state || b.state === req.query.state))
      .map((b) => toCustomerBill(b, customerOf(b.customerId)))
      .filter((b) => compareFilter(req.query, 'billDate', b.billDate));
    sendList(req, res, items);
  });
  r.get(`${BASE.bill}/customerBill/:id`, (req, res) => {
    const b = store.billById.get(req.params.id);
    if (!b) return tmfError(res, 404, 'Not found', `CustomerBill ${req.params.id} not found`);
    sendOne(req, res, toCustomerBill(b, customerOf(b.customerId)));
  });
  r.get(`${BASE.bill}/appliedCustomerBillingRate`, (req, res) => {
    const billId = req.query['bill.id'];
    if (!billId) return tmfError(res, 400, 'Missing filter', 'bill.id is required');
    const bill = store.billById.get(billId);
    if (!bill) return tmfError(res, 404, 'Not found', `CustomerBill ${billId} not found`);
    sendList(req, res, (store.linesByBill.get(billId) ?? []).map((l) => toBillingRate(l, bill)));
  });
  r.get(`${BASE.bill}/appliedCustomerBillingRate/:id`, (req, res) => {
    const l = store.lineById.get(req.params.id);
    if (!l) return tmfError(res, 404, 'Not found', `AppliedCustomerBillingRate ${req.params.id} not found`);
    sendOne(req, res, toBillingRate(l, store.billById.get(l.billId)));
  });

  return r;
}
