/**
 * قياسُ الاستعمال — محدودٌ بالتصميم، لا بالحذر.
 *
 * ### الشرطُ الذي وُلد منه هذا الملف
 *
 * صفحاتُنا تقول للزائر نصّاً: «بياناتك لا تُرفع لأي خادم». وهذا وعدٌ عن
 * **بيانات الفاتورة** ويبقى صحيحاً بعد إضافة القياس — لكنّ الصمت عنه
 * ادّعاء، والاعتمادُ على انتباه من يكتب الكود ليس ضماناً.
 *
 * فالمنعُ هنا **بنيويّ**: لا يوجد في هذا الملف طريقٌ يُخرج نصّاً حرّاً.
 *
 *   1. لا حدثَ خارج `SCHEMA` يُرسَل. الاسمُ المجهول يُسقَط صامتاً.
 *   2. **كلُّ قيمةٍ إمّا رقمٌ أو منطقيّ أو نصٌّ من قائمةٍ معلومة.** لا نوعَ
 *      «نصّ حرّ» في المخطَّط أصلاً — فاسمُ منشأةٍ أو رقمٌ ضريبيّ أو سلسلةُ
 *      Base64 لا تجد شكلاً تُرسَل به، مهما أخطأ المُستدعي.
 *   3. العنوانُ المُرسَل `pathname` وحده — بلا `search` ولا `hash`.
 *   4. المُحيلُ يُرسَل **أصلاً فقط** (`origin`)، فلا تعبر معاملاتُ موقعٍ آخر.
 *   5. لا `document.title` — ثابتٌ في مصدرنا اليوم، لكنّه سطحُ تسريبٍ لو
 *      كتبه سكربتٌ غداً. والمسارُ يكفي للتمييز.
 *   6. لا كوكيز ولا تخزين. ونحترم `doNotTrack` و`globalPrivacyControl`.
 *
 * ولا شيء يُرسَل ما لم يُضبط `ENDPOINT` و`WEBSITE` — فالملفُّ خاملٌ حتى
 * يُوصَل، ولا يُحدث طلباً واحداً قبل ذلك.
 *
 * الوجهة: Umami (`POST {ENDPOINT}/api/send`). واختيرت لأنها مفتوحة المصدر،
 * وتُستضاف عندنا على نطاقنا، وتقبل أحداثاً مخصّصة — وهي موضعُ القيمة: لا
 * «زارَ أحدٌ الصفحة» بل **هل استعمل الأداة؟ وهل أخفق؟ وفي أيّ حقل؟**
 *
 * ### واسمُ الملف اختيارٌ لا صدفة
 *
 * `mtq.js` لا `track.js` ولا `analytics.js`: قوائمُ حجب الإعلانات تحمل
 * قواعد عامّة على تلك الأسماء، فتُسقط القياس عند شريحةٍ من الزوّار — وهي
 * شريحةٌ تميل إلى المطوّرين، أي جمهورنا بالذات. واستضافتُه على نطاقنا
 * تُكمل ذلك: لا مضيفَ خارجيّ يُطابَق بالاسم.
 *
 * **وهذا مكسبٌ متوقَّعٌ لا مقيس** — يُقاس بعد التشغيل بمقارنة عدّاد الخادم
 * بعدّاد المتصفّح، ولا يُدّعى قبله.
 *
 * ### ولا تُركَّب في أداة الشيكات
 *
 * `/cheque/dist/mutawafiq-cheque.html` ملفٌّ واحد وعدُه أنه **يعمل بلا
 * إنترنت**. وحدثٌ شبكيٌّ فيه ينقض وعده حتى لو لم يحمل بياناً. فتبقى خارج
 * القياس عمداً، ونقبل أن نجهل استعمالها.
 */

(function () {
  "use strict";

  // وُصلا في 3 سبتمبر 2026. فارغان ⇒ الوحدةُ خاملةٌ تماماً.
  //
  // والمعرّفُ ليس سرّاً: يظهر في مصدر الصفحة عند كل زائر، وهو معرّفُ *موقع*
  // لا مفتاحُ وصول. الكتابةُ وحدها مسموحةٌ به — والقراءةُ تحتاج دخولاً.
  var ENDPOINT = "https://stats.opus-studio.pro";
  var WEBSITE = "f701a104-f7e5-4112-a979-ef04ce8a8f60";

  // ───────────────────────────────────────────────────────────────
  // المخطَّط: اسمُ الحدث ⇒ مفاتيحُه وأنواعُها.
  //
  // `n(a,b)`  عددٌ صحيح بين a و b شاملَين.
  // `b()`     منطقيّ.
  // `e(...)`  نصٌّ من هذه القائمة حصراً.
  // `tags()`  مجموعةُ أرقام حقول ZATCA مرتَّبة، مثل "24" ⇒ الحقلان 2 و4.
  //
  // ولا يوجد نوعٌ خامسٌ يقبل نصّاً حرّاً. هذا هو الضمان.
  // ───────────────────────────────────────────────────────────────
  // كلُّ مُتحقِّقٍ يحمل `kind` — والاختبار يؤكّد أن الأنواع لا تتجاوز هذه
  // الأربعة. فنوعٌ خامسٌ يقبل نصّاً حرّاً لا يمرّ صامتاً: يُسقط السويتة.
  function n(min, max) {
    var f = function (v) {
      return typeof v === "number" && isFinite(v) && v === Math.trunc(v) && v >= min && v <= max;
    };
    f.kind = "int"; f.domain = max - min + 1;
    return f;
  }
  function b() {
    var f = function (v) { return v === true || v === false; };
    f.kind = "bool"; f.domain = 2;
    return f;
  }
  function e() {
    var allowed = Array.prototype.slice.call(arguments);
    var f = function (v) { return allowed.indexOf(v) !== -1; };
    f.kind = "enum"; f.domain = allowed.length;
    return f;
  }
  function tags() {
    // مجموعةٌ منتهية: 5^0 + … + 5^5 = 3906 سلسلةً ممكنة، أطولُها خمسة محارف
    var f = function (v) { return typeof v === "string" && /^[1-5]{0,5}$/.test(v); };
    f.kind = "tags"; f.domain = 3906;
    return f;
  }

  var KINDS = ["int", "bool", "enum", "tags"];

  var SCHEMA = {
    // كل صفحة
    scroll_depth: { depth: e(25, 50, 75, 100) },
    engaged: { seconds: e(10, 30, 60, 120, 300, 600) },
    outbound: { host: e("github", "npm", "zatca", "discourse", "mail", "other") },
    copy_command: { what: e("npm-install", "git-clone", "rerun", "other") },

    // فاحص QR — وهذا أثمنُ ما نقيسه: ما الذي يُخفق في الواقع
    qr_check: { score: n(0, 5), failed: tags(), fatal: b() },
    qr_demo: { which: e("valid", "bad-vat", "bad-ts") },

    // الفحص الجماعي
    batch_check: { n: e("1-10", "11-50", "51-200", "200+"), failpct: e(0, 25, 50, 75, 100) },
    report_print: {},

    // أداة الفاتورة
    invoice_made: { buyer: b(), lines: e("1", "2-5", "6-20", "20+") },
    invoice_pdf: {},

    // المقاييس — الفهرسُ لا الاسم: رقمٌ لا يحمل شيئاً
    engine_expand: { i: n(0, 40) },
    rule_expand: { i: n(0, 40) },
  };

  // ───────────────────────────────────────────────────────────────

  var nav = typeof navigator !== "undefined" ? navigator : {};
  var optedOut =
    nav.doNotTrack === "1" || nav.doNotTrack === "yes" ||
    (typeof window !== "undefined" && window.doNotTrack === "1") ||
    nav.globalPrivacyControl === true;

  var live = !!(ENDPOINT && WEBSITE) && !optedOut;

  /** المُحيل: أصلُه وحده، وفارغٌ إن كان منّا أو غيرَ صالح. */
  function referrerOrigin() {
    try {
      var r = document.referrer;
      if (!r) return "";
      var u = new URL(r);
      if (u.hostname === location.hostname) return "";
      return u.origin;
    } catch (_) {
      return "";
    }
  }

  /** يُبقي المفاتيحَ المعروفةَ بقيمٍ صالحة، ويُسقط ما عداها بلا ضجيج. */
  function sift(name, data) {
    var spec = SCHEMA[name];
    if (!spec) return null;
    var out = {};
    for (var k in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, k)) continue;
      if (data && Object.prototype.hasOwnProperty.call(data, k) && spec[k](data[k])) {
        out[k] = data[k];
      }
    }
    return out;
  }

  function send(name, data) {
    if (!live) return;
    var payload = {
      website: WEBSITE,
      hostname: location.hostname,
      screen: (screen.width || 0) + "x" + (screen.height || 0),
      language: (nav.language || "").slice(0, 12),
      url: location.pathname,        // بلا search ولا hash — عمداً
      referrer: referrerOrigin(),
    };
    if (name) {
      payload.name = name;
      payload.data = data;
    }
    var body = JSON.stringify({ type: "event", payload: payload });
    try {
      // `keepalive` يُنجي الحدثَ الأخير عند مغادرة الصفحة
      fetch(ENDPOINT + "/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit",
        mode: "cors",
      }).catch(function () {});
    } catch (_) {}
  }

  /** الواجهة. الحدثُ المجهول والقيمةُ المرفوضة يُسقطان صامتَين. */
  function track(name, data) {
    var clean = sift(name, data);
    if (clean === null) return false;
    send(name, clean);
    return true;
  }

  // ── تلقائيّ: مشاهدةٌ، وعمقُ قراءة، وزمنُ انشغال ────────────────
  function autoInstrument() {
    send(null, null); // مشاهدة

    var marks = [25, 50, 75, 100];
    var hit = {};
    function onScroll() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      if (max <= 0) return;
      var pct = ((h.scrollTop || document.body.scrollTop) / max) * 100;
      for (var i = 0; i < marks.length; i++) {
        if (pct >= marks[i] && !hit[marks[i]]) {
          hit[marks[i]] = 1;
          track("scroll_depth", { depth: marks[i] });
        }
      }
    }
    addEventListener("scroll", onScroll, { passive: true });

    // الزمنُ المنشغل: لا يُحسب والصفحةُ مخفيّة
    var buckets = [10, 30, 60, 120, 300, 600];
    var secs = 0, bi = 0, timer = null;
    function tick() {
      secs += 5;
      while (bi < buckets.length && secs >= buckets[bi]) {
        track("engaged", { seconds: buckets[bi] });
        bi++;
      }
    }
    function resume() { if (!timer) timer = setInterval(tick, 5000); }
    function pause() { if (timer) { clearInterval(timer); timer = null; } }
    document.addEventListener("visibilitychange", function () {
      document.hidden ? pause() : resume();
    });
    if (!document.hidden) resume();

    // نقراتٌ خارجة — المضيفُ من قائمةٍ معلومة، لا العنوان
    var HOSTS = [
      [/(^|\.)github\.com$/, "github"],
      [/(^|\.)npmjs\.com$/, "npm"],
      [/(^|\.)zatca\.gov\.sa$/, "zatca"],
      [/(^|\.)discourse\.group$/, "discourse"],
    ];
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.indexOf("mailto:") === 0) { track("outbound", { host: "mail" }); return; }
      var u;
      try { u = new URL(a.href); } catch (_) { return; }
      if (u.hostname === location.hostname) return;
      var label = "other";
      for (var i = 0; i < HOSTS.length; i++) {
        if (HOSTS[i][0].test(u.hostname)) { label = HOSTS[i][1]; break; }
      }
      track("outbound", { host: label });
    }, true);
  }

  if (typeof window !== "undefined") {
    window.mtrack = track;
    if (live) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", autoInstrument);
      } else {
        autoInstrument();
      }
    }
  }

  // للاختبار وحده — يكشف الداخلَ بلا شبكة
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SCHEMA: SCHEMA, KINDS: KINDS, sift: sift, track: track };
  }
})();
