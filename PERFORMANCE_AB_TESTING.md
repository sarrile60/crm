# 🧪 PERFORMANCE OPTIMIZATION A/B TESTING GUIDE

## 📊 **Test Options**

### **OPTION A: Original + Basic Optimizations (SAFER)**
- **What it is:** Original LeadsTable with pagination, sticky headers, React.memo optimization
- **How to enable:** Set `REACT_APP_PERF_MODE=false` in `/app/frontend/.env`
- **Rebuild:** `cd /app/frontend && yarn build && sudo supervisorctl restart frontend`
- **Features:**
  - ✅ Server-side pagination (200 leads/page)
  - ✅ Sticky toolbar & headers
  - ✅ React.memo for 50% faster Select All
  - ✅ All existing modals, import/export, click-to-call
  - ✅ Dense table layout
  - ✅ Mobile responsive (card view)
- **Limitations:**
  - No React Query caching (refetches on every navigation)
  - No virtualization (renders all 200 rows)
  - Inline Select components in table (heavier)

### **OPTION B: Full Optimization (FASTEST)**  
- **What it is:** Completely optimized with React Query, caching, virtualization
- **How to enable:** Set `REACT_APP_PERF_MODE=true` in `/app/frontend/.env`
- **Rebuild:** `cd /app/frontend && yarn build && sudo supervisorctl restart frontend`
- **Features:**
  - ✅ React Query with aggressive caching (60s stale, 30min cache)
  - ✅ keepPreviousData (no blank screen between pages)
  - ✅ Virtualization (renders only visible rows - 60fps scrolling)
  - ✅ Server-side "Select All" (no client-side ID array)
  - ✅ Prefetching next page
  - ✅ Lightweight row components (no inline Select)
  - ✅ Debounced search (350ms)
- **Limitations:**
  - ⚠️ Simplified modals (detail modal is basic - needs full implementation)
  - ⚠️ Some features temporarily removed for performance testing
  - ⚠️ Needs more testing before production

---

## 🔑 **Test Credentials**

**Admin (Full Access):**
- Username: `admin_f87450ce5d66`
- Password: `zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_`
- Can: View all leads, edit, delete, mass update, import/export, 500 rows/page

**Supervisor:**
- Username: `maurizio1` 
- Password: `12345`
- Note: Account may be inactive - use admin for testing

**Agent:**
- Username: `nicolo`
- Password: `password`
- Can: View assigned leads only, limited permissions

---

## ✅ **Acceptance Test Checklist**

**Both options should support:**

**1. Lead List Operations:**
- [ ] First load (measure time)
- [ ] Switch pages (Prev/Next buttons)
- [ ] Change page size (50/100/200/500)
- [ ] Apply status filter
- [ ] Apply priority filter
- [ ] Search leads (should debounce ~300-400ms)
- [ ] Clear filters

**2. Lead Detail:**
- [ ] Click lead name → opens detail modal
- [ ] Click Eye icon → opens detail modal
- [ ] Modal shows full lead info
- [ ] Navigate between leads with arrows

**3. Edit Operations:**
- [ ] Click Edit → opens edit modal
- [ ] Modify fields → Save
- [ ] Option B only: Check for optimistic UI update
- [ ] Verify changes persist after save

**4. Bulk Operations:**
- [ ] Select individual leads (checkboxes)
- [ ] Select All button (header checkbox)
- [ ] Option B only: "Select All X Results" button for server-side selection
- [ ] Mass Update modal appears with count
- [ ] Bulk actions don't freeze UI

**5. Performance/UX:**
- [ ] No stale data when rapidly changing filters
- [ ] No blank screens between pages
- [ ] Smooth scrolling (no jank)
- [ ] Error states handled gracefully
- [ ] Loading indicators appear

**6. Existing Features (Option A only - full implementation):**
- [ ] Import CSV
- [ ] Export CSV  
- [ ] Click-to-Call (Phone button)
- [ ] Add notes to lead
- [ ] Inline status change

---

## 📊 **Expected Benchmarks**

### **Option A (Original + Basic Optimizations):**
```
Lead list first load:     ~800-1200ms
Page navigation:          ~100-200ms  
Payload (200 leads):      ~73KB
Select All (200):         ~700ms
API response time:        ~50-60ms
DB query time:            ~15-20ms
```

### **Option B (Full Optimization):**
```
Lead list first load:     ~100-300ms ⚡ (cached)
                          ~600-800ms (uncached first time)
Page navigation:          <50ms ⚡ (cached)
                          ~100ms (cache miss)
Payload (200 leads):      ~50KB (projected fields only)
Select All:               ~100ms ⚡ (server-side)
Scroll FPS:               60fps (virtualized)
API response time:        ~40-50ms
Subsequent page loads:    instant (prefetched)
```

---

## 📝 **Logs to Monitor**

**Backend Logs:**
```bash
tail -f /var/log/supervisor/backend.out.log | grep -E "\[DB QUERY\]|\[API\]"
```

**Frontend Console:**
- Open browser DevTools → Console
- Look for: `[PERF]`, `[API]`, errors
- Option B shows: "⚡ PERF MODE" badge in bottom-right

**Performance Metrics:**
- Option B logs query timings in console
- Backend logs show DB query times

---

## 🧪 **How to Switch Between Options**

**To Test Option A:**
```bash
# Edit .env
echo "REACT_APP_PERF_MODE=false" >> /app/frontend/.env (or edit manually)
cd /app/frontend && yarn build
sudo supervisorctl restart frontend
# Wait 15 seconds, then refresh browser
```

**To Test Option B:**
```bash
# Edit .env
echo "REACT_APP_PERF_MODE=true" >> /app/frontend/.env (or edit manually)
cd /app/frontend && yarn build  
sudo supervisorctl restart frontend
# Wait 15 seconds, then refresh browser
```

---

## 🎯 **What to Report**

For each option, please report:

1. **Performance:**
   - Lead list initial load time (use stopwatch or browser DevTools)
   - Page navigation speed (clicking Next/Prev)
   - Search responsiveness (type → results appear)
   - Select All speed
   - Scroll smoothness (janky? smooth?)

2. **Stability:**
   - Any errors in console?
   - Any broken features?
   - Data accuracy (same leads shown?)
   - Filters working correctly?

3. **UX:**
   - Which feels faster/smoother?
   - Any loading states needed?
   - Any bugs or glitches?

4. **Preference:**
   - Which option should we adopt as baseline?
   - What specific improvements needed?

---

## 🔄 **Current Status**

**Default:** Option A is currently active (`PERF_MODE=false`)
**URL:** Your CRM dashboard → Leads tab
**Dataset:** 1009 leads total

**Ready for your testing!** Report back which option works better and I'll proceed accordingly.
