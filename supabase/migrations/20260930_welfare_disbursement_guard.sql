-- A request can produce at most one linked welfare expense, even when two
-- administrators submit the disbursement at nearly the same time.
-- If this index fails because historical duplicate rows exist, review those
-- rows manually before retrying; do not delete financial records blindly.
create unique index if not exists welfare_expenses_one_per_request_idx
  on public.welfare_expenses (family_id, linked_request_id)
  where linked_request_id is not null;
