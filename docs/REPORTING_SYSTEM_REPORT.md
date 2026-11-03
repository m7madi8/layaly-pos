# PHASE 3 — Daily Reports & Archive

## Delivered

- `closeBusinessDay` on shift 2 close: writes `businessDays` + `businessDaySummaries` with sales/expense aggregates for the cash day key.
- `DailyArchivePanel` in **التقارير** — lists archived summaries with drill-down JSON.
- `recordBusinessDayAdjustment` on order edits after save (adjustment row, no silent summary rewrite).

## Follow-up

- Dashboard can prefer `businessDaySummaries` over full order scans (Phase 6).
