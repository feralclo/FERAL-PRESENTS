"use client";

import { useState, useEffect, useCallback } from "react";
import type { Customer } from "@/types/orders";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);

    const res = await fetch(`/api/customers?${params}`);
    const json = await res.json();

    if (json.data) {
      setCustomers(json.data);
      setTotal(json.total || json.data.length);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(loadCustomers, 300);
    return () => clearTimeout(debounce);
  }, [loadCustomers]);

  return (
    <div>
      <h1 className="admin-title">Customers</h1>

      {/* Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-card__value">{total}</div>
          <div className="admin-stat-card__label">Total Customers</div>
        </div>
      </div>

      {/* Search */}
      <div className="admin-filters">
        <input
          type="text"
          className="admin-form__input admin-filter__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="admin-loading">Loading customers...</div>
      ) : customers.length === 0 ? (
        <div className="admin-empty">
          <p>{search ? "No customers match your search." : "No customers yet."}</p>
        </div>
      ) : (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>First Order</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((cust) => (
                <tr key={cust.id}>
                  <td>
                    {cust.first_name} {cust.last_name}
                  </td>
                  <td>{cust.email}</td>
                  <td>{cust.phone || "—"}</td>
                  <td className="admin-table__mono">{cust.total_orders}</td>
                  <td className="admin-table__mono admin-table__price">
                    £{Number(cust.total_spent).toFixed(2)}
                  </td>
                  <td className="admin-table__mono">
                    {cust.first_order_at
                      ? new Date(cust.first_order_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="admin-table__mono">
                    {cust.last_order_at
                      ? new Date(cust.last_order_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
