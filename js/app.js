/* ============================================================
   管家智脑 · 交互层
   纯前端演示：路由、渲染、模拟 AI 研判、台账、考核、预警
   ============================================================ */
(function () {
  "use strict";

  var db = DB.load();
  var view = document.getElementById("view");
  var modalRoot = document.getElementById("modalRoot");
  var toastRoot = document.getElementById("toastRoot");

  var state = {
    page: "dashboard",
    kbType: "全部",
    kbStatus: "全部",
    kbQ: "",
    kbTrash: false,
    trainee: "t1",
    exam: null,
    examAnswers: {},
    qaResult: null,
    qaBusy: false,
    reviewId: null,
    ledgerStatus: "全部",
    ledgerProject: "全部",
    ledgerQ: "",
    alertTab: "待处理",
    alertType: "全部"
  };

  /* ---------------------------------------------------------- 工具 */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtMoney() { return ""; }  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function nowText() {
    var d = new Date();
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function todayCn() {
    var d = new Date();
    var w = ["日", "一", "二", "三", "四", "五", "六"];
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 周" + w[d.getDay()]
      + "　" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function save() { DB.save(); paintBadges(); }
  function entryById(id) {
    for (var i = 0; i < db.entries.length; i++) if (db.entries[i].id === id) return db.entries[i];
    return null;
  }
  function typeClass(t) {
    return t === "制度规范" ? "navy" : t === "操作SOP" ? "info" : t === "典型案例" ? "warn" : "ok";
  }
  function statusClass(s) {
    return s === "已上架" || s === "已采纳" || s === "已处理" ? "ok"
      : s === "待复核" || s === "待处理" || s === "转人工" ? "warn" : "";
  }
  function badge(text, cls) { return '<span class="badge ' + (cls || "") + '">' + esc(text) + "</span>"; }
  function typeBadge(t) { return badge(t, typeClass(t)); }
  function statusBadge(s) { return badge(s, statusClass(s)); }

  function toast(msg, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.innerHTML = '<span>' + (kind === "warn" ? "!" : "✓") + "</span><span>" + esc(msg) + "</span>";
    toastRoot.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .25s,transform .25s";
      el.style.opacity = "0"; el.style.transform = "translateX(10px)";
      setTimeout(function () { el.remove(); }, 260);
    }, 2400);
  }

  function openModal(opts) {
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML =
      '<div class="modal ' + (opts.wide ? "wide" : "") + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + esc(opts.title) + '</h3><button class="x" data-close="1">✕</button></div>' +
        '<div class="modal-body">' + opts.body + '</div>' +
        (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : "") +
      "</div>";
    mask.addEventListener("click", function (e) {
      if (e.target === mask || e.target.getAttribute("data-close")) closeModal();
    });
    modalRoot.appendChild(mask);
    document.body.style.overflow = "hidden";
    var first = mask.querySelector("input,select,textarea");
    if (first) setTimeout(function () { first.focus(); }, 60);
    return mask;
  }
  function closeModal() {
    modalRoot.innerHTML = "";
    document.body.style.overflow = "";
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalRoot.children.length) closeModal();
  });

  /* ---------------------------------------------------------- 徽标 */
  function pendingReviews() {
    var n = 0;
    db.qa.forEach(function (q) { if (q.status === "待复核") n++; });
    db.entries.forEach(function (e) { if (e.status === "待复核") n++; });
    return n;
  }
  function pendingAlerts() {
    return db.alerts.filter(function (a) { return a.status === "待处理"; }).length;
  }
  function paintBadges() {
    document.getElementById("badgeReview").textContent = pendingReviews();
    document.getElementById("badgeAlerts").textContent = pendingAlerts();
  }

  /* ---------------------------------------------------------- 指标 */
  function stats() {
    var live = db.entries.filter(function (e) { return e.status === "已上架"; });
    var adopted = db.qa.filter(function (q) { return q.status === "已采纳"; }).length;
    var manual = db.qa.filter(function (q) { return q.status === "转人工"; }).length;
    var pending = pendingReviews();
    var avgConf = db.qa.length
      ? Math.round(db.qa.reduce(function (s, q) { return s + (q.confidence || 0); }, 0) / db.qa.length)
      : 0;
    return {
      entries: live.length,
      allEntries: db.entries.length,
      projects: db.projects.length,
      qa: db.qa.length,
      adopted: adopted,
      manual: manual,
      pending: pending,
      adoptRate: pct(adopted, db.qa.length),
      avgConf: avgConf
    };
  }

  /* ============================================================
     页面：综合总览
     ============================================================ */
  function renderDashboard() {
    var s = stats();
    var typeCount = {};
    db.entries.forEach(function (e) { typeCount[e.type] = (typeCount[e.type] || 0) + 1; });
    var types = ["制度规范", "操作SOP", "典型案例", "高频问答"];
    var maxType = Math.max.apply(null, types.map(function (t) { return typeCount[t] || 0; }));

    var alerts = db.alerts.filter(function (a) { return a.status === "待处理"; }).slice(0, 3);
    var recent = db.qa.slice().sort(function (a, b) { return a.time < b.time ? 1 : -1; }).slice(0, 6);

    // 高频：按问答引用统计
    var cite = {};
    db.qa.forEach(function (q) { (q.sources || []).forEach(function (id) { cite[id] = (cite[id] || 0) + 1; }); });
    var hot = db.entries
      .map(function (e) { return { e: e, n: cite[e.id] || 0 }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 5);
    var maxHot = hot.length ? hot[0].n : 1;

    var examAvg = db.exams.length
      ? Math.round(db.exams.reduce(function (a, b) { return a + b.score; }, 0) / db.exams.length)
      : 0;

    var html =
      heroBlock() +
      '<div class="grid grid-4">' +
        kpiCard("知识条目", s.entries, "条", "在架可用 · 共 " + s.allEntries + " 条", "") +
        kpiCard("覆盖项目", s.projects, "个", "礼嘉事业部住宅赛道", "") +
        kpiCard("本月问答", s.qa, "次", "采纳率 " + s.adoptRate + "%", "up") +
        kpiCard("平均置信度", s.avgConf, "%", "低于 70% 自动转复核", s.avgConf >= 80 ? "up" : "warn") +
      "</div>" +

      '<div class="split mt16">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">高频知识引用 · Top 5</h3>' +
            '<p class="card-sub">按问答中实际引用的知识条目统计，反映一线真实需求</p></div>' +
            '<a class="card-link" href="#ledger">进入问答台账 →</a></div>' +
            '<div class="card-body">' +
              (hot.length ? hot.map(function (x) {
                return '<div class="bar-row"><span class="lab">' + esc(x.e.type.replace("操作", "")) + "</span>" +
                  '<span class="bar"><i style="width:' + Math.max(8, pct(x.n, maxHot)) + '%"></i></span>' +
                  '<span class="val">' + x.n + " 次</span></div>";
              }).join("") : emptyBlock("暂无引用记录", "发起一次岗位问答后自动统计")) +
              '<div class="note" style="margin-top:12px">引用最多的条目往往是<b>口径最容易出错</b>的条目，建议优先进入季度修订。</div>' +
            "</div>" +
          "</div>" +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">最近问答台账</h3>' +
            '<p class="card-sub">自动记录提问、引用来源与处置结果</p></div>' +
            '<a class="card-link" href="#ledger">查看全部 →</a></div>' +
            '<div class="card-body tight"><div class="table-wrap"><table class="tbl">' +
              "<thead><tr><th>提问</th><th>项目</th><th>引用来源</th><th>置信度</th><th>状态</th></tr></thead><tbody>" +
              (recent.length ? recent.map(function (q) {
                var src = (q.sources || []).map(function (id) { var e = entryById(id); return e ? e.title : ""; }).filter(Boolean);
                return "<tr><td class='td-strong'>" + esc(q.question) + "<span class='td-sub'>" + esc(q.time) + " · " + esc(q.owner) + "</span></td>" +
                  "<td>" + esc(q.project) + "</td>" +
                  "<td>" + esc(src[0] || "—") + (src.length > 1 ? "<span class='td-sub'>等 " + src.length + " 条</span>" : "") + "</td>" +
                  "<td class='td-num'>" + q.confidence + "%</td>" +
                  "<td>" + statusBadge(q.status) + "</td></tr>";
              }).join("") : "<tr><td colspan='5'>" + emptyBlock("暂无问答记录", "从「岗位问答」发起第一次提问") + "</td></tr>") +
            "</tbody></table></div></div>" +
          "</div>" +
        "</div>" +

        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">重点预警</h3>' +
            '<p class="card-sub">优先关注低置信度与知识缺口</p></div>' +
            '<a class="card-link" href="#alerts">全部 →</a></div>' +
            '<div class="card-body">' +
              (alerts.length ? alerts.map(function (a) {
                var cls = a.type === "低置信度" || a.type === "超期未复核" ? "red" : a.type === "知识缺口" ? "" : "blue";
                return '<div class="alert-item" style="margin-bottom:9px">' +
                  '<div class="alert-ico ' + cls + '">' + (cls === "red" ? "!" : cls === "blue" ? "↻" : "?") + "</div>" +
                  '<div class="body"><strong>' + esc(a.title) + "</strong><p>" + esc(a.desc) + "</p></div></div>";
              }).join("") : emptyBlock("暂无待处理预警", "系统会在出现低置信度或知识缺口时提醒")) +
            "</div>" +
          "</div>" +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">知识结构</h3>' +
            '<p class="card-sub">四类知识构成，制度与 SOP 是底座</p></div></div>' +
            '<div class="card-body">' +
              types.map(function (t) {
                return '<div class="bar-row"><span class="lab">' + esc(t) + '</span><span class="bar"><i style="width:' +
                  pct(typeCount[t] || 0, maxType) + '%"></i></span><span class="val">' + (typeCount[t] || 0) + " 条</span></div>";
              }).join("") +
            "</div>" +
          "</div>" +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">培养进展</h3>' +
            '<p class="card-sub">新人学习与考核情况</p></div>' +
            '<a class="card-link" href="#training">培训 →</a></div>' +
            '<div class="card-body">' +
              '<div class="kv"><span>在培新管家</span><strong>' + db.trainees.filter(function (t) { return t.months <= 3; }).length + " 人</strong></div>" +
              '<div class="kv"><span>已完成课程</span><strong>' + db.trainees.reduce(function (a, t) { return a + t.done.length; }, 0) + " 门</strong></div>" +
              '<div class="kv"><span>考核平均分</span><strong>' + examAvg + " 分</strong></div>" +
              '<div class="kv"><span>待复核项</span><strong>' + s.pending + " 项</strong></div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";

    return html;
  }

  function heroBlock() {
    return '<section class="hero">' +
      '<span class="hero-badge"><span class="dot"></span>综合总览 · 知识驱动的管家培养</span>' +
      "<h1>智融知识，赋能管家</h1>" +
      "<p>把制度、SOP、典型案例与高频问答沉淀成管家专属知识库，依托大模型 RAG 只基于本库作答，实现「按标签培养、随时可问、答必有据、答不了转人」的闭环，让新人成长不再依赖口传心授。</p>" +
      '<div class="hero-steps">' +
        '<div class="hero-step"><b>01</b><strong>沉淀知识</strong>制度 / SOP / 案例入库</div>' +
        '<div class="hero-step"><b>02</b><strong>认得出人</strong>人力标签推送路径</div>' +
        '<div class="hero-step"><b>03</b><strong>答得清楚</strong>带出处、带置信度</div>' +
        '<div class="hero-step"><b>04</b><strong>回流迭代</strong>复核后更新知识库</div>' +
      "</div>" +
    "</section>";
  }

  function kpiCard(label, value, unit, note, noteCls) {
    return '<div class="card kpi"><div class="kpi-label">' + esc(label) + "</div>" +
      '<div class="kpi-value">' + value + "<small>" + esc(unit) + "</small></div>" +
      '<div class="kpi-note ' + (noteCls || "") + '">' + esc(note) + "</div></div>";
  }

  function emptyBlock(title, sub) {
    return '<div class="empty"><div class="sign">◌</div><p>' + esc(title) + "</p><p>" + esc(sub || "") + "</p></div>";
  }

  /* ============================================================
     页面：知识库档案
     ============================================================ */
  function rowsKB() {
    var q = (state.kbQ || "").trim();
    return db.entries.filter(function (e) {
      if (state.kbType !== "全部" && e.type !== state.kbType) return false;
      if (state.kbStatus !== "全部" && e.status !== state.kbStatus) return false;
      if (q && (e.title + e.summary + e.source + e.owner + (e.keywords || []).join("")).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
      return true;
    });
  }

  function renderKnowledge() {
    var rows = rowsKB();
    var counts = { "全部": db.entries.length };
    ["制度规范", "操作SOP", "典型案例", "高频问答"].forEach(function (t) {
      counts[t] = db.entries.filter(function (e) { return e.type === t; }).length;
    });

    return pageHead("03 / 方案总览 · 知识库档案", "知识库档案",
        "每条知识都有类型、来源、责任人与状态；未经审核的条目不会进入问答检索。",
        '<button class="btn" data-act="kb-trash">回收站 ' + db.trash.length + "</button>" +
        '<button class="btn btn-primary" data-act="kb-add">＋ 新增知识条目</button>') +

      '<div class="card">' +
        '<div class="card-body" style="padding:14px 16px">' +
          '<div class="toolbar">' +
            ["全部", "制度规范", "操作SOP", "典型案例", "高频问答"].map(function (t) {
              return '<button class="chip ' + (state.kbType === t ? "active" : "") + '" data-act="kb-type" data-v="' + t + '">' +
                esc(t === "操作SOP" ? "SOP 流程" : t) + " " + (counts[t] || 0) + "</button>";
            }).join("") +
            '<span class="grow"></span>' +
            '<select class="select" style="width:130px" data-act="kb-status">' +
              ["全部", "已上架", "待复核"].map(function (v) {
                return '<option value="' + v + '"' + (state.kbStatus === v ? " selected" : "") + ">" + v + "状态</option>";
              }).join("") +
            "</select>" +
            '<div class="search"><span>⌕</span><input id="kbSearch" placeholder="搜索标题、责任人或关键词" value="' + esc(state.kbQ || "") + '"></div>' +
          "</div>" +
        "</div>" +
        '<div class="table-wrap" style="border-top:1px solid var(--line)">' +
          '<table class="tbl"><thead><tr>' +
            "<th style='width:96px'>知识类型</th><th>标题与摘要</th><th style='width:96px'>适用范围</th>" +
            "<th style='width:126px'>来源 / 责任人</th><th style='width:70px'>版本</th><th style='width:108px'>更新时间</th>" +
            "<th style='width:82px'>状态</th><th style='width:132px'>操作</th>" +
          '</tr></thead><tbody id="kbBody">' +
            (rows.length ? rows.map(kbRow).join("") : "<tr><td colspan='8'>" + emptyBlock("没有匹配的知识条目", "调整筛选条件，或新增一条") + "</td></tr>") +
          "</tbody></table>" +
        "</div>" +
      "</div>" +

      '<div class="note mt16">规则：待复核条目<b>不会进入问答检索</b>；每条知识必须绑定责任人，避免出现「三不管」内容。删除的知识进入回收站，历史问答记录仍保留。</div>';
  }

  function kbRow(e) {
    return "<tr data-text='" + esc((e.title + e.summary + e.source + e.owner).toLowerCase()) + "'>" +
      "<td>" + typeBadge(e.type) + "</td>" +
      "<td><span class='td-strong' style='cursor:pointer' data-act='kb-view' data-id='" + e.id + "'>" + esc(e.title) + "</span>" +
        "<span class='td-sub'>" + esc(e.summary).slice(0, 62) + (e.summary.length > 62 ? "…" : "") + "</span></td>" +
      "<td>" + esc(e.scope) + "</td>" +
      "<td>" + esc(e.source) + "<span class='td-sub'>" + esc(e.owner) + "</span></td>" +
      "<td class='td-num nowrap'>" + esc(e.version) + "</td>" +
      "<td class='nowrap'>" + esc(e.updated) + "</td>" +
      "<td>" + statusBadge(e.status) + "</td>" +
      "<td><div class='td-actions'>" +
        "<button class='btn btn-sm' data-act='kb-edit' data-id='" + e.id + "'>编辑</button>" +
        "<button class='btn btn-sm btn-danger' data-act='kb-del' data-id='" + e.id + "'>删除</button>" +
      "</div></td></tr>";
  }

  function kbForm(e) {
    var isNew = !e;
    e = e || { type: "制度规范", title: "", scope: "全部项目", source: "", owner: "", version: "V1.0", summary: "", steps: [], tips: "", keywords: [], sensitive: false, status: "待复核" };
    return '<form id="kbForm" class="form-grid">' +
      '<div class="field"><label>知识类型<span class="req">*</span></label><select class="select" name="type">' +
        ["制度规范", "操作SOP", "典型案例", "高频问答"].map(function (t) {
          return '<option' + (e.type === t ? " selected" : "") + ">" + t + "</option>";
        }).join("") + "</select></div>" +
      '<div class="field"><label>适用范围</label><select class="select" name="scope">' +
        ["全部项目"].concat(db.projects.map(function (p) { return p.name; })).map(function (p) {
          return '<option' + (e.scope === p ? " selected" : "") + ">" + p + "</option>";
        }).join("") + "</select></div>" +
      '<div class="field full"><label>条目标题<span class="req">*</span></label>' +
        '<input class="input" name="title" required maxlength="60" value="' + esc(e.title) + '" placeholder="例如：业主装修需要提前几天报备？"></div>' +
      '<div class="field full"><label>一句话摘要<span class="req">*</span></label>' +
        '<textarea class="textarea" name="summary" required style="min-height:64px" placeholder="用于 AI 作答的第一段口径说明">' + esc(e.summary) + "</textarea></div>" +
      '<div class="field full"><label>处置要点（每行一条，将按顺序展示为步骤）</label>' +
        '<textarea class="textarea" name="steps" style="min-height:96px" placeholder="受理：……&#10;处置：……">' + esc((e.steps || []).join("\n")) + "</textarea></div>" +
      '<div class="field full"><label>注意事项</label>' +
        '<input class="input" name="tips" value="' + esc(e.tips || "") + '" placeholder="例如：不得以停水停电方式催缴"></div>' +
      '<div class="field"><label>来源条线</label><input class="input" name="source" value="' + esc(e.source) + '" placeholder="客服条线 / 工程条线"></div>' +
      '<div class="field"><label>责任人<span class="req">*</span></label><input class="input" name="owner" required value="' + esc(e.owner) + '" placeholder="姓名"></div>' +
      '<div class="field"><label>版本号</label><input class="input" name="version" value="' + esc(e.version) + '"></div>' +
      '<div class="field"><label>状态</label><select class="select" name="status">' +
        ["已上架", "待复核"].map(function (s) { return '<option' + (e.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="field full"><label>检索关键词（逗号分隔，用于模拟 AI 匹配）</label>' +
        '<input class="input" name="keywords" value="' + esc((e.keywords || []).join("，")) + '" placeholder="装修，报备，图纸"></div>' +
      '<div class="field full"><label style="display:flex;gap:8px;align-items:center;font-weight:500">' +
        '<input type="checkbox" name="sensitive"' + (e.sensitive ? " checked" : "") + '> 敏感业务（涉及赔付、投诉、安全事件，作答时强制提示转人工）</label></div>' +
      '<input type="hidden" name="id" value="' + esc(e.id || "") + '">' +
      "</form>";
  }

  function openKbForm(id) {
    var e = id ? entryById(id) : null;
    if (modalRoot.children.length) closeModal();
    openModal({
      title: e ? "编辑知识条目" : "新增知识条目",
      wide: true,
      body: kbForm(e),
      foot: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" data-act="kb-save">' +
        (e ? "保存修改" : "保存并提交审核") + "</button>"
    });
  }

  function saveKbForm() {
    var form = document.getElementById("kbForm");
    if (!form || !form.reportValidity()) return;
    var fd = new FormData(form);
    var id = fd.get("id");
    var data = {
      type: fd.get("type"), title: fd.get("title").trim(), scope: fd.get("scope"),
      summary: fd.get("summary").trim(),
      steps: String(fd.get("steps") || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean),
      tips: String(fd.get("tips") || "").trim(),
      source: String(fd.get("source") || "").trim() || "未标注条线",
      owner: fd.get("owner").trim(), version: fd.get("version").trim() || "V1.0",
      status: fd.get("status"),
      keywords: String(fd.get("keywords") || "").split(/[，,、\s]+/).filter(Boolean),
      sensitive: !!fd.get("sensitive"),
      updated: new Date().toISOString().slice(0, 10)
    };
    if (id) {
      var target = entryById(id);
      if (target) {
        Object.keys(data).forEach(function (k) { target[k] = data[k]; });
        toast("条目已更新：" + data.title.slice(0, 14), "ok");
      }
    } else {
      data.id = DB.uid("k");
      db.entries.unshift(data);
      toast("已提交审核，条目进入待复核", "ok");
      db.alerts.unshift({
        id: DB.uid("a"), type: "超期未复核", title: "新提交条目待审核：" + data.title.slice(0, 16),
        desc: "由 " + data.owner + " 提交的「" + data.type + "」条目待客服主管审核，未通过前不进入检索。",
        level: "中", time: nowText(), status: "待处理", entry: data.id
      });
    }
    save(); closeModal(); render();
  }

  function openTrash() {
    openModal({
      title: "回收站",
      body: db.trash.length
        ? '<div class="note" style="margin-bottom:12px">删除的条目会保留在回收站，恢复后重新出现在知识库档案中。</div>' +
          db.trash.map(function (e) {
            return '<div class="alert-item" style="margin-bottom:9px"><div class="alert-ico blue">▤</div>' +
              '<div class="body"><strong>' + esc(e.title) + "</strong><p>" + esc(e.type) + " · " + esc(e.owner) + " · " + esc(e.updated) + "</p></div>" +
              "<div class='side'><button class='btn btn-sm' data-act='kb-restore' data-id='" + e.id + "'>恢复</button></div></div>";
          }).join("")
        : emptyBlock("回收站是空的", "删除的知识条目会先进入这里"),
      foot: '<button class="btn" data-close="1">关闭</button>'
    });
  }

  /* ============================================================
     页面：岗位问答
     ============================================================ */
  function renderQA() {
    return pageHead("03 / 方案总览 · 岗位问答", "岗位问答",
        "答案必须带出处、带置信度；答不了就转人工，不猜测、不编造。",
        '<button class="btn" data-act="qa-sample">载入示例问题</button>') +

      '<div class="qa-layout">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">发起提问</h3>' +
            '<p class="card-sub">系统将只基于「已上架」条目作答，并给出引用来源</p></div></div>' +
            '<div class="card-body">' +
              '<form id="qaForm" class="grid grid-2" style="gap:14px">' +
                '<div class="field"><label>物业项目<span class="req">*</span></label><select class="select" name="project">' +
                  db.projects.map(function (p) { return "<option>" + esc(p.name) + "</option>"; }).join("") + "</select></div>" +
                '<div class="field"><label>提问人岗位<span class="req">*</span></label><select class="select" name="role">' +
                  ["新管家", "管家", "客服主管"].map(function (r) { return "<option>" + r + "</option>"; }).join("") + "</select></div>" +
                '<div class="field"><label>问题类型</label><select class="select" name="type">' +
                  ["装修管理", "收费管理", "报修服务", "渗漏处置", "应急处置", "车位管理", "公共事务", "其他"].map(function (t) {
                    return "<option>" + t + "</option>";
                  }).join("") + "</select></div>" +
                '<div class="field"><label>提问人</label><input class="input" name="owner" value="李思远" maxlength="8"></div>' +
                '<div class="field" style="grid-column:1/-1"><label>问题描述<span class="req">*</span></label>' +
                  '<textarea class="textarea" name="question" id="qaQuestion" required placeholder="用一句话描述业主的问题，例如：业主装修需要提前几天报备？材料有哪些？"></textarea></div>' +
                '<div class="field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:10px">' +
                  '<button class="btn btn-primary" type="submit">提交并启动 AI 研判</button>' +
                  '<span class="hint">演示环境不调用真实模型，答案由本地知识库匹配生成</span></div>' +
              "</form>" +
            "</div>" +
          "</div>" +
          '<div id="qaOutput">' + (state.qaResult ? qaResultBlock(state.qaResult) : qaIdleBlock()) + "</div>" +
        "</div>" +

        '<div class="stack">' +
          '<div class="pipeline">' +
            "<h4>AI 研判四步</h4>" +
            '<div class="pipe-step"><span class="n">01</span><div><strong>听懂问题</strong><p>识别问题类型：装修 / 收费 / 报修 / 投诉</p></div></div>' +
            '<div class="pipe-step"><span class="n">02</span><div><strong>检索本库</strong><p>按关键词与语义召回，只取已上架条目</p></div></div>' +
            '<div class="pipe-step"><span class="n">03</span><div><strong>组织答案</strong><p>按「定性 — 动作 — 提醒」顺序作答，标注出处</p></div></div>' +
            '<div class="pipe-step"><span class="n">04</span><div><strong>判断边界</strong><p>置信度不足或高风险业务，直接转人工</p></div></div>' +
            '<div class="foot">答错一次，比答慢十次更伤信任。</div>' +
          "</div>" +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">最近问答</h3><p class="card-sub">点击可直接进入台账</p></div>' +
            '<a class="card-link" href="#ledger">台账 →</a></div>' +
            '<div class="card-body tight"><div class="table-wrap"><table class="tbl" style="min-width:auto"><tbody>' +
              (db.qa.slice(0, 5).map(function (q) {
                return "<tr><td><span class='td-strong' style='font-size:12px'>" + esc(q.question) + "</span>" +
                  "<span class='td-sub'>" + esc(q.project) + " · " + esc(q.owner) + "</span></td>" +
                  "<td style='width:78px;text-align:right'>" + statusBadge(q.status) + "</td></tr>";
              }).join("") || "") +
            "</tbody></table></div></div>" +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function qaIdleBlock() {
    var samples = [
      { q: "业主装修需要提前几天报备？需要哪些材料？", hint: "将命中《住宅项目装修管理实施细则》" },
      { q: "业主家阳台渗水到楼下，责任怎么界定？", hint: "将命中案例「阳台渗水责任界定」" },
      { q: "空置房物业费能不能打七折？", hint: "将命中「空置房物业费」收费口径" },
      { q: "车位被占能把对方车锁了吗？", hint: "将命中案例「车位被占处理」" }
    ];
    return '<div class="card"><div class="card-head"><div><h3 class="card-title">试试这样问</h3>' +
      '<p class="card-sub">点击问题直接填入，再点「提交并启动 AI 研判」</p></div>' +
      '<span class="badge info">演示问题</span></div>' +
      '<div class="card-body"><div class="grid grid-2" style="gap:10px">' +
        samples.map(function (s) {
          return '<div class="course-card" style="cursor:pointer" data-act="qa-fill" data-q="' + esc(s.q) + '">' +
            '<div class="course-icon">?</div><div style="flex:1;min-width:0"><h5 style="font-size:12.5px;line-height:1.6">' + esc(s.q) + "</h5>" +
            '<p style="margin-top:4px">' + esc(s.hint) + "</p></div></div>";
        }).join("") +
      "</div>" +
      '<div class="note" style="margin-top:14px">作答规则：只检索<b>已上架</b>条目；<b>置信度低于 70%</b> 或命中敏感业务时，AI 不直接下结论，转为待复核或人工处理。</div>' +
      "</div></div>";
  }

  function qaResultBlock(r) {
    var sources = (r.sources || []).map(entryById).filter(Boolean);
    var conf = r.confidence;
    var confColor = conf >= 80 ? "var(--green)" : conf >= 60 ? "var(--amber)" : "var(--red)";

    return '<div class="card"><div class="card-body">' +
      '<div class="bubble-user"><div class="who">' + esc(r.role + " · " + r.owner + " · " + r.project) + "</div><p>" + esc(r.question) + "</p></div>" +
      '<div class="answer">' +
        '<div class="answer-head"><span class="ai-tag">AI</span><small>管家智脑 · ' +
          (r.matched ? "已基于本库作答" : "未匹配到已上架条目") + "</small></div>" +
        (r.matched
          ? '<div class="answer-block"><h5>① 定性</h5><p>' + esc(r.summary) + "</p></div>" +
            (r.steps && r.steps.length ? '<div class="answer-block"><h5>② 处置动作</h5><ol>' +
              r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div>" : "") +
            (r.tips ? '<div class="answer-block"><h5>③ 注意</h5><p>' + esc(r.tips) + "</p></div>" : "")
          : '<div class="answer-block"><p>' + esc(r.summary) + "</p></div>") +
        (sources.length
          ? '<div class="answer-block"><h5>引用来源</h5><div class="sources">' +
              sources.map(function (e) {
                return '<span class="source-chip"><b>' + esc(e.title) + "</b>" + esc(e.type + " · " + e.version) + "</span>";
              }).join("") + "</div></div>"
          : "") +
        '<div class="confidence"><span class="hint">置信度</span><span class="bar"><i style="width:' + conf + "%;background:" + confColor + '"></i></span>' +
          '<span class="num" style="color:' + confColor + '">' + conf + "%</span></div>" +
        (r.guard ? '<div class="guard"><b>边界提示：</b>' + esc(r.guard) + "</div>" : "") +
        '<div class="answer-actions">' +
          (r.saved
            ? '<span class="badge ok">已记录到台账</span>'
            : '<button class="btn btn-primary btn-sm" data-act="qa-adopt">采纳并沉淀</button>' +
              '<button class="btn btn-sm" data-act="qa-manual">转人工复核</button>') +
          '<button class="btn btn-sm btn-ghost" data-act="qa-again">重新提问</button>' +
        "</div>" +
      "</div></div></div>";
  }

  function matchEntries(question) {
    var q = String(question).toLowerCase();
    var scored = db.entries.filter(function (e) { return e.status === "已上架"; }).map(function (e) {
      var s = 0, hit = [];
      (e.keywords || []).forEach(function (k) {
        if (k && q.indexOf(String(k).toLowerCase()) >= 0) { s += 3; hit.push(k); }
      });
      var titleWords = e.title.replace(/[《》「」（）()，。？?、]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 2; });
      titleWords.forEach(function (w) { if (q.indexOf(w) >= 0) s += 1; });
      return { e: e, s: s, hit: hit };
    }).filter(function (x) { return x.s > 0; });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored;
  }

  function buildAnswer(form) {
    var question = String(form.question || "").trim();
    var hits = matchEntries(question);
    var sensitiveQ = /赔付|赔偿|投诉|安全|停水|停电|报警|群租|跳闸|伤亡/.test(question);

    if (!hits.length) {
      var res = {
        question: question, project: form.project, owner: form.owner || "当前用户", role: form.role,
        type: form.type, matched: false, confidence: 26, sources: [],
        summary: "当前知识库中没有与该问题匹配的已上架条目。系统不做推测，建议转资深管家或值班经理处理，并将该问题记录为知识缺口。",
        steps: [], tips: "", guard: "该问题涉及知识库未覆盖的领域，AI 不作答；提交后会自动生成一条「知识缺口」预警，由客服主管安排供稿。",
        time: nowText()
      };
      return res;
    }

    var best = hits[0].e;
    var conf = Math.min(96, 58 + hits[0].s * 4 + (hits[1] ? 4 : 0));
    if (sensitiveQ || best.sensitive) conf = Math.min(conf, 84);
    // 只保留与首选条目强度接近的引用，避免弱匹配（例如仅命中「业主」）混进来源
    var related = hits.filter(function (x) { return x.s >= Math.max(3, hits[0].s * 0.5); }).slice(0, 3);
    var guard = "";
    if (best.sensitive || sensitiveQ) {
      guard = "该问题涉及赔付、投诉或安全等敏感业务，AI 只提供口径与动作建议，不得作出金额、时限或责任承诺；重大情形请强制转人工。";
    } else if (conf < 70) {
      guard = "匹配置信度偏低，建议转人工复核后再答复业主。";
    }

    return {
      question: question, project: form.project, owner: form.owner || "当前用户", role: form.role,
      type: form.type, matched: true, confidence: conf,
      sources: related.map(function (x) { return x.e.id; }),
      summary: best.summary, steps: best.steps, tips: best.tips,
      guard: guard, time: nowText(), saved: false
    };
  }

  function submitQA(form) {
    if (state.qaBusy) return;
    state.qaBusy = true;
    var output = document.getElementById("qaOutput");
    output.innerHTML =
      '<div class="card"><div class="analyzing">' +
        '<div class="spinner"></div>' +
        "<h4>AI 正在研判</h4>" +
        "<p>以管家专属知识库为标准，检索已上架条目</p>" +
        "<ol>" +
          '<li data-step="0"><span class="tick">✓</span>识别问题类型与关键实体</li>' +
          '<li data-step="1"><span class="tick">✓</span>检索制度、SOP、案例与问答</li>' +
          '<li data-step="2"><span class="tick">✓</span>组织答案并标注引用来源</li>' +
          '<li data-step="3"><span class="tick">✓</span>评估置信度与业务边界</li>' +
        "</ol>" +
      "</div></div>";
    var lis = output.querySelectorAll("li");
    lis.forEach(function (li, i) {
      setTimeout(function () { li.classList.add("on"); }, 320 * (i + 1));
    });
    setTimeout(function () {
      state.qaBusy = false;
      var res = buildAnswer(form);
      state.qaResult = res;
      output.innerHTML = qaResultBlock(res);
      if (!res.matched) {
        db.alerts.unshift({
          id: DB.uid("a"), type: "知识缺口", title: "「" + res.question.slice(0, 16) + "」无匹配条目",
          desc: "由 " + res.owner + " 在 " + res.project + " 提问，知识库暂无对应口径，建议补充条目。",
          level: "中", time: nowText(), status: "待处理", entry: ""
        });
        save();
      }
      output.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 1500);
  }

  function adoptQA() {
    var r = state.qaResult;
    if (!r || r.saved) return;
    var rec = {
      id: DB.uid("q"), time: nowText(), question: r.question, project: r.project, owner: r.owner,
      type: r.type, confidence: r.confidence, status: "已采纳", sources: r.sources,
      answer: r.summary
    };
    db.qa.unshift(rec);
    if (r.matched) {
      var newEntry = {
        id: DB.uid("k"), type: "高频问答", title: r.question, summary: r.summary,
        steps: r.steps || [], tips: r.tips || "", source: "一线回流", owner: r.owner,
        version: "V1.0", updated: new Date().toISOString().slice(0, 10), status: "待复核",
        scope: r.project, sensitive: false,
        keywords: String(r.question).replace(/[，。？?、]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 2; }).slice(0, 6)
      };
      db.entries.unshift(newEntry);
      db.alerts.unshift({
        id: DB.uid("a"), type: "超期未复核", title: "一线回流条目待审核：" + r.question.slice(0, 16),
        desc: "由 " + r.owner + " 采纳 AI 答复后自动生成，待客服主管审核后上架。",
        level: "低", time: nowText(), status: "待处理", entry: newEntry.id
      });
      toast("已沉淀为知识条目，进入待复核", "ok");
    } else {
      toast("已记录为知识缺口，建议补充条目", "warn");
    }
    r.saved = true;
    save();
    render();
  }

  function manualQA() {
    var r = state.qaResult;
    if (!r) return;
    db.qa.unshift({
      id: DB.uid("q"), time: nowText(), question: r.question, project: r.project, owner: r.owner,
      type: r.type, confidence: r.confidence, status: "待复核", sources: r.sources,
      answer: r.summary
    });
    db.alerts.unshift({
      id: DB.uid("a"), type: "低置信度", title: "「" + r.question.slice(0, 14) + "」已转人工",
      desc: "置信度 " + r.confidence + "%，AI 未直接给出结论，等待客服主管校准。",
      level: "中", time: nowText(), status: "待处理", entry: (r.sources || [])[0] || ""
    });
    state.qaResult.saved = true;
    save();
    toast("已转人工，进入待复核中心", "warn");
    render();
  }

  /* ============================================================
     页面：新人培训
     ============================================================ */
  var STAGES = [
    { key: "s1", stage: "STAGE 01", name: "制度与红线", range: "入职 0–1 月", type: "制度规范", desc: "先知道什么能做、什么不能做" },
    { key: "s2", stage: "STAGE 02", name: "SOP 实操", range: "第 1–3 月", type: "操作SOP", desc: "按流程把手上的事做对" },
    { key: "s3", stage: "STAGE 03", name: "案例研判", range: "第 3–6 月", type: "典型案例", desc: "看别人怎么处理复杂问题" },
    { key: "s4", stage: "STAGE 04", name: "问答与考核", range: "持续", type: "高频问答", desc: "高频口径与能力评级" }
  ];

  function currentTrainee() {
    for (var i = 0; i < db.trainees.length; i++) if (db.trainees[i].id === state.trainee) return db.trainees[i];
    return db.trainees[0];
  }

  function renderTraining() {
    var t = currentTrainee();
    var totalCourses = 0, doneAll = 0;
    STAGES.forEach(function (st) {
      var list = db.entries.filter(function (e) { return e.type === st.type; });
      totalCourses += list.length;
      doneAll += list.filter(function (e) { return t.done.indexOf(e.id) >= 0; }).length;
    });
    var progress = pct(doneAll, totalCourses);

    return pageHead("03 / 方案总览 · 新人培训", "新人培训",
        "按人力系统标签（岗位、职级、入司时长、项目）自动生成学习路径，学到哪一步一目了然。") +

      '<div class="split">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">' + esc(t.name) + " 的学习路径</h3>" +
            '<p class="card-sub">' + esc(t.project + " · " + t.level + " · 入司 " + t.months + " 个月") + "</p></div>" +
            '<span class="badge info">标签：' + esc(t.tags.join(" / ")) + "</span></div>" +
            '<div class="card-body">' +
              '<div class="path">' +
                STAGES.map(function (st) {
                  var list = db.entries.filter(function (e) { return e.type === st.type; });
                  var done = list.filter(function (e) { return t.done.indexOf(e.id) >= 0; }).length;
                  var full = list.length && done >= list.length;
                  return '<div class="path-step ' + (full ? "done" : "") + '">' +
                    '<span class="stage">' + st.stage + " · " + esc(st.range) + "</span>" +
                    "<h5>" + esc(st.name) + "</h5>" +
                    "<p>" + esc(st.desc) + "</p>" +
                    '<div class="progress"><i style="width:' + pct(done, list.length || 1) + '%"></i></div>' +
                    '<p style="margin-top:6px">' + done + " / " + list.length + " 门</p>" +
                  "</div>";
                }).join("") +
              "</div>" +
              '<div class="note" style="margin-top:16px">路径规则：<b>入司 0–1 月</b>先过制度红线，<b>1–3 月</b>练 SOP，<b>3–6 月</b>看案例，之后进入高频问答与考核。完成一门即在知识库对应条目上打勾。</div>' +
            "</div>" +
          "</div>" +

          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">课程清单</h3>' +
            '<p class="card-sub">课程即知识条目，学完可回到问答页直接提问</p></div></div>' +
            '<div class="card-body">' +
              STAGES.map(function (st) {
                var list = db.entries.filter(function (e) { return e.type === st.type; });
                return '<div class="section-title" style="margin-top:6px">' + esc(st.name) + " · " + esc(st.range) + "</div>" +
                  '<div class="stack" style="gap:8px">' +
                    list.slice(0, 4).map(function (e) {
                      var done = t.done.indexOf(e.id) >= 0;
                      return '<div class="course-card">' +
                        '<div class="course-icon">' + esc(e.type.replace("操作", "").slice(0, 1)) + "</div>" +
                        '<div style="flex:1;min-width:0"><h5>' + esc(e.title) + "</h5><p>" + esc(e.summary).slice(0, 46) + "…</p>" +
                          '<div class="meta"><span>' + esc(e.source) + "</span><span>" + esc(e.version) + "</span><span>约 " + (6 + (e.steps || []).length * 3) + " 分钟</span></div></div>" +
                        "<div>" + (done
                          ? '<button class="btn btn-sm" data-act="train-toggle" data-id="' + e.id + '">已完成 ✓</button>'
                          : '<button class="btn btn-sm btn-primary" data-act="train-toggle" data-id="' + e.id + '">标记完成</button>') +
                        "</div></div>";
                    }).join("") +
                  "</div>";
              }).join("") +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">学员</h3><p class="card-sub">来自人力系统管家标签</p></div></div>' +
            '<div class="card-body"><div class="trainee-list">' +
              db.trainees.map(function (x) {
                return '<div class="trainee ' + (x.id === t.id ? "active" : "") + '" data-act="train-pick" data-id="' + x.id + '">' +
                  '<span class="ava">' + esc(x.name.slice(0, 1)) + "</span>" +
                  '<span class="who"><strong>' + esc(x.name) + "</strong><span>" + esc(x.project + " · " + x.level + " · 入司 " + x.months + " 个月") + "</span></span>" +
                  '<span class="badge ' + (x.months <= 3 ? "warn" : "ok") + '">' + (x.months <= 3 ? "在培" : "已独立") + "</span></div>";
              }).join("") +
            "</div></div>" +
          "</div>" +
          '<div class="card">' +
            '<div class="card-head"><div><h3 class="card-title">学习档案</h3><p class="card-sub">学习进度与考核成绩</p></div></div>' +
            '<div class="card-body">' +
              '<div class="kv"><span>课程完成度</span><strong>' + progress + "%（" + doneAll + "/" + totalCourses + "）</strong></div>" +
              '<div class="progress" style="margin:10px 0 14px"><i style="width:' + progress + '%"></i></div>' +
              (db.exams.filter(function (e) { return e.trainee === t.name; }).map(function (e) {
                return '<div class="kv"><span>' + esc(e.time) + "</span><strong>" + e.score + " 分 · " + esc(e.level) + "</strong></div>";
              }).join("") || '<div class="kv"><span>最近考核</span><strong class="muted">暂无记录</strong></div>') +
              '<button class="btn btn-navy" style="width:100%;margin-top:14px" data-act="train-exam">去参加岗位考核</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function toggleCourse(id) {
    var t = currentTrainee();
    var i = t.done.indexOf(id);
    if (i >= 0) { t.done.splice(i, 1); toast("已取消完成标记", "warn"); }
    else { t.done.push(id); toast("已完成《" + (entryById(id) || {}).title + "》", "ok"); }
    save(); render();
  }

  /* ============================================================
     页面：岗位考核
     ============================================================ */
  function buildExam(n, trainee) {
    var pool = shuffle(db.entries.filter(function (e) { return e.status === "已上架"; })).slice(0, n);
    return pool.map(function (e) {
      var correct = (e.steps && e.steps[0]) || e.summary;
      var others = db.entries
        .filter(function (x) { return x.id !== e.id && x.steps && x.steps[0]; })
        .map(function (x) { return x.steps[0]; })
        .filter(function (s) { return s !== correct; });
      others = shuffle(others).slice(0, 3);
      var options = shuffle([{ text: correct, ok: true }].concat(others.map(function (s) { return { text: s, ok: false }; })));
      return {
        id: e.id, entryId: e.id, title: e.title,
        q: "关于「" + e.title + "」，以下处置要点正确的是？",
        options: options,
        explain: e.summary + (e.tips ? "（注意：" + e.tips + "）" : "")
      };
    });
  }

  function renderExam() {
    var head = pageHead("03 / 方案总览 · 岗位考核", "岗位考核",
      "从知识库自动组卷，答完即时出分；错题直接回链到对应条目，形成「学—考—补」闭环。",
      state.exam ? '<button class="btn" data-act="exam-cancel">退出本次考核</button>' : "");

    if (!state.exam) {
      var avg = db.exams.length ? Math.round(db.exams.reduce(function (a, b) { return a + b.score; }, 0) / db.exams.length) : 0;
      return head +
        '<div class="split">' +
          '<div class="card"><div class="card-head"><div><h3 class="card-title">组卷设置</h3>' +
          '<p class="card-sub">题目与答案均来自知识库，可选择参考学员</p></div></div>' +
          '<div class="card-body">' +
            '<div class="form-grid">' +
              '<div class="field"><label>参考学员</label><select class="select" id="examTrainee">' +
                db.trainees.map(function (t) {
                  return '<option value="' + t.id + '"' + (t.id === state.trainee ? " selected" : "") + ">" + esc(t.name + " · " + t.project) + "</option>";
                }).join("") + "</select></div>" +
              '<div class="field"><label>题目数量</label><select class="select" id="examCount"><option>10</option><option>8</option><option>6</option></select></div>' +
            "</div>" +
            '<div class="note" style="margin:16px 0">组卷规则：从<b>已上架</b>条目中随机抽取，选项由其他条目的处置要点构成干扰项；提交后自动评分并记录到能力档案。</div>' +
            '<button class="btn btn-primary" data-act="exam-start">开始组卷</button>' +
          "</div></div>" +
          '<div class="card"><div class="card-head"><div><h3 class="card-title">最近成绩</h3>' +
          '<p class="card-sub">平均分 ' + avg + " 分 · 共 " + db.exams.length + " 次</p></div></div>" +
          '<div class="card-body tight"><div class="table-wrap"><table class="tbl" style="min-width:auto"><tbody>' +
            (db.exams.length ? db.exams.map(function (e) {
              return "<tr><td><span class='td-strong'>" + esc(e.trainee) + "</span><span class='td-sub'>" + esc(e.project) + " · " + esc(e.time) + "</span></td>" +
                "<td class='td-num' style='width:64px'>" + e.score + " 分</td>" +
                "<td style='width:70px'>" + badge(e.level, e.score >= 85 ? "ok" : e.score >= 70 ? "info" : "warn") + "</td></tr>";
            }).join("") : "") +
          "</tbody></table></div></div></div>" +
        "</div>" +

        '<div class="grid grid-2 mt16">' +
          '<div class="card"><div class="card-head"><div><h3 class="card-title">评级标准</h3>' +
          '<p class="card-sub">成绩进入能力档案，作为带教与晋升依据</p></div></div>' +
          '<div class="card-body">' +
            '<div class="kv"><span>优秀（≥ 85 分）</span><strong>可独立值班，进入骨干培养</strong></div>' +
            '<div class="kv"><span>良好（70 – 84 分）</span><strong>可独立值班，薄弱项限期补学</strong></div>' +
            '<div class="kv"><span>需补考（&lt; 70 分）</span><strong>回到学习路径重学，7 天后补考</strong></div>' +
          "</div></div>" +
          '<div class="card"><div class="card-head"><div><h3 class="card-title">怎么用这份成绩</h3></div></div>' +
          '<div class="card-body">' +
            '<div class="timeline">' +
              '<div class="tl-item done"><h5>错题回流</h5><p>答错的题自动关联对应知识条目，可直接跳转复习。</p></div>' +
              '<div class="tl-item"><h5>补齐路径</h5><p>薄弱条目自动排进学习路径，客服主管在周会上跟进。</p></div>' +
              '<div class="tl-item"><h5>能力留痕</h5><p>成绩与条目版本绑定，换项目、换岗位时可追溯。</p></div>' +
            "</div>" +
          "</div></div>" +
        "</div>";
    }

    var exam = state.exam;
    var answered = Object.keys(state.examAnswers).length;
    if (exam.submitted) {
      var right = exam.questions.filter(function (q, i) { return state.examAnswers[i] === q.options.findIndex(function (o) { return o.ok; }); }).length;
      var score = Math.round((right / exam.questions.length) * 100);
      var level = score >= 85 ? "优秀" : score >= 70 ? "良好" : "需补考";
      return head +
        '<div class="split">' +
          '<div class="card"><div class="card-body">' +
            '<div class="score-ring" style="--p:' + score + '"><div>' + score + "<small>得分</small></div></div>" +
            '<h3 style="text-align:center;margin:0 0 4px">' + esc(exam.trainee) + " · " + esc(level) + "</h3>" +
            '<p style="text-align:center;color:var(--muted);font-size:12px;margin:0 0 18px">答对 ' + right + " / " + exam.questions.length + " 题 · " + esc(exam.time) + "</p>" +
            '<div class="kv"><span>题型</span><strong>单选 · 知识库组卷</strong></div>' +
            '<div class="kv"><span>薄弱环节</span><strong>' + esc(exam.questions.filter(function (q, i) { return state.examAnswers[i] !== q.options.findIndex(function (o) { return o.ok; }); }).slice(0, 2).map(function (q) { return q.title.slice(0, 12); }).join("、") || "无明显薄弱项") + "</strong></div>" +
            '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn btn-primary" data-act="exam-again">再考一次</button>' +
            '<button class="btn" data-act="exam-cancel">返回</button></div>' +
          "</div></div>" +
          '<div class="card"><div class="card-head"><div><h3 class="card-title">错题解析</h3><p class="card-sub">点击条目可查看完整知识</p></div></div>' +
          '<div class="card-body">' +
            (exam.questions.map(function (q, i) {
              var pick = state.examAnswers[i];
              var correctIdx = q.options.findIndex(function (o) { return o.ok; });
              if (pick === correctIdx) return "";
              var picked = (pick != null && q.options[pick]) ? q.options[pick].text : "";
              return '<div style="margin-bottom:16px"><div class="badge danger" style="margin-bottom:6px">第 ' + (i + 1) + " 题</div>" +
                '<div style="font-size:12.5px;color:var(--text);margin-bottom:6px">' + esc(q.q) + "</div>" +
                (picked ? '<div class="opt wrong" style="pointer-events:none"><kbd>✕</kbd><span>' + esc(picked) + "</span></div>" : "") +
                '<div class="opt right" style="pointer-events:none"><kbd>✓</kbd><span>' + esc(q.options[correctIdx].text) + "</span></div>" +
                '<div class="note" style="margin-top:6px">' + esc(q.explain) + "</div></div>";
            }).join("") || emptyBlock("全部答对", "本轮考核没有错题")) +
          "</div></div>" +
        "</div>";
    }

    return head +
      '<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        "<div style='font-size:12.5px;color:var(--muted)'>" + esc(exam.trainee) + " · " + esc(exam.project) + " · 共 " + exam.questions.length + " 题</div>" +
        '<div class="progress" style="flex:1;min-width:160px;margin:0"><i style="width:' + pct(answered, exam.questions.length) + '%"></i></div>' +
        "<div style='font-size:12px;color:var(--muted)'>已答 " + answered + " / " + exam.questions.length + "</div>" +
        '<button class="btn btn-primary" data-act="exam-submit">提交试卷</button>' +
      "</div></div>" +
      exam.questions.map(function (q, i) {
        return '<div class="exam-q"><h5><span class="idx">' + (i + 1) + ".</span>" + esc(q.q) + "</h5>" +
          q.options.map(function (o, oi) {
            var sel = state.examAnswers[i] === oi;
            return '<div class="opt ' + (sel ? "selected" : "") + '" data-act="exam-pick" data-q="' + i + '" data-o="' + oi + '">' +
              "<kbd>" + "ABCD"[oi] + "</kbd><span>" + esc(o.text) + "</span></div>";
          }).join("") +
        "</div>";
      }).join("");
  }

  function startExam() {
    var tSel = document.getElementById("examTrainee");
    var cSel = document.getElementById("examCount");
    var trainee = db.trainees.filter(function (x) { return x.id === (tSel ? tSel.value : state.trainee); })[0] || db.trainees[0];
    var n = cSel ? parseInt(cSel.value, 10) : 10;
    state.trainee = trainee.id;
    state.exam = {
      trainee: trainee.name, project: trainee.project, questions: buildExam(n, trainee),
      submitted: false, time: nowText()
    };
    state.examAnswers = {};
    render();
    toast("已从知识库抽取 " + n + " 道题", "ok");
  }

  function submitExam() {
    if (!state.exam) return;
    var unanswered = state.exam.questions.length - Object.keys(state.examAnswers).length;
    if (unanswered > 0 && !window.confirm("还有 " + unanswered + " 题未作答，确定提交吗？")) return;
    state.exam.submitted = true;
    var right = state.exam.questions.filter(function (q, i) {
      return state.examAnswers[i] === q.options.findIndex(function (o) { return o.ok; });
    }).length;
    var score = Math.round((right / state.exam.questions.length) * 100);
    db.exams.unshift({
      id: DB.uid("e"), trainee: state.exam.trainee, project: state.exam.project,
      score: score, total: state.exam.questions.length, right: right, time: nowText(),
      level: score >= 85 ? "优秀" : score >= 70 ? "良好" : "需补考"
    });
    save(); render();
    toast("已提交，成绩 " + score + " 分", score >= 70 ? "ok" : "warn");
  }

  /* ============================================================
     页面：待复核中心
     ============================================================ */
  function renderReview() {
    var qaPending = db.qa.filter(function (q) { return q.status === "待复核"; });
    var entryPending = db.entries.filter(function (e) { return e.status === "待复核"; });

    return pageHead("04 / 闭环与落地 · 待复核中心", "待复核中心",
        "AI 拿不准的、涉及敏感业务的、新回流的条目都在这里；人工校准后才能进入问答检索。",
        '<span class="badge warn">待处理 ' + (qaPending.length + entryPending.length) + " 项</span>") +

      '<div class="grid grid-3" style="margin-bottom:16px">' +
        kpiCard("待复核问答", qaPending.length, "条", "置信度低于阈值或敏感业务", qaPending.length ? "warn" : "") +
        kpiCard("待审核条目", entryPending.length, "条", "未上架，不参与检索", entryPending.length ? "warn" : "") +
        kpiCard("已采纳答复", db.qa.filter(function (q) { return q.status === "已采纳"; }).length, "条", "校准后可复用于问答", "up") +
      "</div>" +

      '<div class="split">' +
        '<div class="card"><div class="card-head"><div><h3 class="card-title">待复核问答</h3>' +
        '<p class="card-sub">校准后可直接采纳并更新知识库</p></div></div><div class="card-body">' +
          (qaPending.length ? qaPending.map(function (q) {
            return '<div class="alert-item" style="margin-bottom:10px"><div class="alert-ico blue">?</div>' +
              '<div class="body"><strong>' + esc(q.question) + "</strong>" +
              "<p>" + esc(q.project + " · " + q.owner + " · " + q.time + " · 置信度 " + q.confidence + "%") + "</p>" +
              '<p style="color:var(--text-2);margin-top:6px">AI 原始答复：' + esc(q.answer) + "</p></div>" +
              "<div class='side'><button class='btn btn-sm btn-primary' data-act='review-open' data-id='" + q.id + "'>校准</button>" +
              "<button class='btn btn-sm btn-danger' data-act='review-reject' data-id='" + q.id + "'>驳回</button></div></div>";
          }).join("") : emptyBlock("没有待复核问答", "AI 答复置信度均达标")) +
        "</div></div>" +

        '<div class="card"><div class="card-head"><div><h3 class="card-title">待审核条目</h3>' +
        '<p class="card-sub">审核通过才会上架</p></div></div><div class="card-body">' +
          (entryPending.length ? entryPending.map(function (e) {
            return '<div class="alert-item" style="margin-bottom:10px"><div class="alert-ico">▤</div>' +
              '<div class="body"><strong>' + esc(e.title) + "</strong><p>" + esc(e.type + " · " + e.source + " · " + e.owner + " · " + e.updated) + "</p></div>" +
              "<div class='side'><button class='btn btn-sm btn-primary' data-act='entry-approve' data-id='" + e.id + "'>通过</button>" +
              "<button class='btn btn-sm' data-act='kb-edit' data-id='" + e.id + "'>修订</button></div></div>";
          }).join("") : emptyBlock("没有待审核条目", "知识库条目均已上架")) +
        "</div></div>" +
      "</div>" +
      '<div class="note mt16">复核规则：<b>置信度低于 70%</b>、命中敏感业务、或由一线采纳回流的新条目，都必须人工校准；校准通过后版本号 +0.1，并同步更新知识库与台账状态。</div>';
  }

  function openReview(id) {
    var q = db.qa.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    var opts = db.entries.map(function (e) {
      return '<option value="' + e.id + '"' + ((q.sources || [])[0] === e.id ? " selected" : "") + ">" + esc(e.type + " · " + e.title) + "</option>";
    }).join("");
    openModal({
      title: "校准 AI 答复",
      wide: true,
      body: '<div class="note" style="margin-bottom:14px"><b>提问：</b>' + esc(q.question) + "<br><b>AI 原始答复：</b>" + esc(q.answer) + "（置信度 " + q.confidence + "%）</div>" +
        '<div class="form-grid">' +
          '<div class="field full"><label>校准后的标准答复<span class="req">*</span></label>' +
          '<textarea class="textarea" id="reviewAnswer" style="min-height:96px">' + esc(q.answer) + "</textarea></div>" +
          '<div class="field"><label>关联知识条目</label><select class="select" id="reviewEntry">' + opts + "</select></div>" +
          '<div class="field"><label>处理人</label><input class="input" id="reviewOwner" value="王巧洪"></div>' +
          '<div class="field full"><label style="display:flex;gap:8px;align-items:center;font-weight:500">' +
            '<input type="checkbox" id="reviewPush" checked> 同步把校准内容写入知识库（版本号 +0.1）</label></div>' +
        "</div>",
      foot: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" data-act="review-save" data-id="' + id + '">通过并采纳</button>'
    });
  }

  function saveReview(id) {
    var q = db.qa.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    var ans = document.getElementById("reviewAnswer").value.trim();
    var entryId = document.getElementById("reviewEntry").value;
    var push = document.getElementById("reviewPush").checked;
    if (!ans) { toast("请填写校准后的答复", "warn"); return; }
    q.answer = ans;
    q.status = "已采纳";
    q.confidence = 95;
    if (!q.sources || !q.sources.length) q.sources = [entryId];
    if (push) {
      var e = entryById(entryId);
      if (e) {
        var ver = parseFloat(String(e.version).replace(/[^\d.]/g, "")) || 1;
        e.version = "V" + (Math.round(ver * 10 + 1) / 10).toFixed(1);
        e.updated = new Date().toISOString().slice(0, 10);
      }
    }
    db.alerts.forEach(function (a) {
      if (a.status === "待处理" && (a.type === "低置信度" || a.type === "超期未复核")) {
        if ((a.title || "").indexOf(q.question.slice(0, 8)) >= 0) a.status = "已处理";
      }
    });
    save(); closeModal(); render();
    toast("已校准并采纳，知识库版本已更新", "ok");
  }

  function rejectReview(id) {
    var q = db.qa.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    q.status = "转人工";
    save(); render();
    toast("已驳回，转资深管家线下处理", "warn");
  }

  function approveEntry(id) {
    var e = entryById(id);
    if (!e) return;
    e.status = "已上架";
    e.updated = new Date().toISOString().slice(0, 10);
    db.alerts.forEach(function (a) { if (a.entry === id) a.status = "已处理"; });
    save(); render();
    toast("条目已上架：" + e.title.slice(0, 14), "ok");
  }

  /* ============================================================
     页面：问答台账
     ============================================================ */
  function ledgerRows() {
    var q = (state.ledgerQ || "").trim().toLowerCase();
    return db.qa.filter(function (x) {
      if (state.ledgerStatus !== "全部" && x.status !== state.ledgerStatus) return false;
      if (state.ledgerProject !== "全部" && x.project !== state.ledgerProject) return false;
      if (q && (x.question + x.owner + x.project).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderLedger() {
    var rows = ledgerRows();
    var s = stats();
    return pageHead("04 / 闭环与落地 · 问答台账", "问答台账",
        "沉淀每一次提问、引用来源与处置结果，可追溯、可考核、可交接。",
        '<button class="btn" data-act="ledger-csv">导出 CSV</button>' +
        '<button class="btn" data-act="ledger-print">打印台账</button>') +

      '<div class="grid grid-4" style="margin-bottom:16px">' +
        kpiCard("总提问量", s.qa, "条", "含采纳、转人工与待复核", "") +
        kpiCard("采纳率", s.adoptRate, "%", "已采纳 / 总提问", s.adoptRate >= 60 ? "up" : "warn") +
        kpiCard("转人工率", pct(s.manual, s.qa), "%", "AI 主动交回人工", "") +
        kpiCard("平均置信度", s.avgConf, "%", "低于 70% 进入复核", s.avgConf >= 80 ? "up" : "warn") +
      "</div>" +

      '<div class="card">' +
        '<div class="card-body" style="padding:14px 16px">' +
          '<div class="toolbar">' +
            ["全部", "已采纳", "待复核", "转人工"].map(function (v) {
              return '<button class="chip ' + (state.ledgerStatus === v ? "active" : "") + '" data-act="ledger-status" data-v="' + v + '">' + v +
                " " + (v === "全部" ? db.qa.length : db.qa.filter(function (q) { return q.status === v; }).length) + "</button>";
            }).join("") +
            '<span class="grow"></span>' +
            '<select class="select" style="width:180px" data-act="ledger-project">' +
              ["全部"].concat(db.projects.map(function (p) { return p.name; })).map(function (p) {
                return '<option' + (state.ledgerProject === p ? " selected" : "") + ">" + esc(p) + "</option>";
              }).join("") +
            "</select>" +
            '<div class="search"><span>⌕</span><input id="ledgerSearch" placeholder="搜索问题或提问人" value="' + esc(state.ledgerQ || "") + '"></div>' +
          "</div>" +
        "</div>" +
        '<div class="table-wrap" style="border-top:1px solid var(--line)">' +
          "<table class=\"tbl\"><thead><tr><th style='width:118px'>时间</th><th>提问</th><th style='width:126px'>项目 / 提问人</th>" +
          "<th style='width:96px'>类型</th><th style='width:150px'>引用来源</th><th style='width:82px'>置信度</th><th style='width:88px'>状态</th><th style='width:76px'>操作</th></tr></thead><tbody id='ledgerBody'>" +
            (rows.length ? rows.map(function (q) {
              var src = (q.sources || []).map(function (id) { var e = entryById(id); return e ? e.title : ""; }).filter(Boolean);
              return "<tr data-text='" + esc((q.question + q.owner + q.project).toLowerCase()) + "'>" +
                "<td class='td-num'>" + esc(q.time) + "</td>" +
                "<td><span class='td-strong'>" + esc(q.question) + "</span><span class='td-sub'>" + esc(q.answer).slice(0, 40) + "…</span></td>" +
                "<td>" + esc(q.project) + "<span class='td-sub'>" + esc(q.owner) + "</span></td>" +
                "<td>" + esc(q.type) + "</td>" +
                "<td>" + esc((src[0] || "—").slice(0, 14)) + (src[0] && src[0].length > 14 ? "…" : "") +
                  (src.length > 1 ? "<span class='td-sub'>共 " + src.length + " 条</span>" : "") + "</td>" +
                "<td class='td-num'>" + q.confidence + "%</td>" +
                "<td>" + statusBadge(q.status) + "</td>" +
                "<td>" + (q.status === "待复核"
                  ? "<button class='btn btn-sm' data-act='review-open' data-id='" + q.id + "'>校准</button>"
                  : "<button class='btn btn-sm' data-act='qa-replay' data-id='" + q.id + "'>详情</button>") + "</td></tr>";
            }).join("") : "<tr><td colspan='8'>" + emptyBlock("暂无记录", "调整筛选条件试试") + "</td></tr>") +
          "</tbody></table>" +
        "</div>" +
      "</div>";
  }

  function exportCSV() {
    var rows = ledgerRows();
    var head = ["时间", "问题", "项目", "提问人", "类型", "引用来源", "置信度", "状态", "AI答复"];
    var lines = [head.join(",")];
    rows.forEach(function (q) {
      var src = (q.sources || []).map(function (id) { var e = entryById(id); return e ? e.title : ""; }).filter(Boolean).join(" / ");
      var cells = [q.time, q.question, q.project, q.owner, q.type, src, q.confidence + "%", q.status, q.answer];
      lines.push(cells.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "管家智脑-问答台账-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast("已导出 " + rows.length + " 条台账记录", "ok");
  }

  /* ============================================================
     页面：风险预警中心
     ============================================================ */
  function renderAlerts() {
    var types = ["全部", "低置信度", "超期未复核", "知识缺口", "高频重复提问"];
    var list = db.alerts.filter(function (a) {
      if (state.alertTab !== "全部" && a.status !== state.alertTab) return false;
      if (state.alertType !== "全部" && a.type !== state.alertType) return false;
      return true;
    });
    var countBy = function (t) { return db.alerts.filter(function (a) { return a.type === t && a.status === "待处理"; }).length; };

    return pageHead("04 / 闭环与落地 · 风险预警中心", "风险预警中心",
        "把「答不准、没人审、没人补」的问题前置暴露，避免错误口径流向一线。",
        '<button class="btn" data-act="alerts-all-read">全部标记已处理</button>') +

      '<div class="grid grid-4" style="margin-bottom:16px">' +
        kpiCard("待处理", pendingAlerts(), "条", "需人工跟进", "warn") +
        kpiCard("低置信度", countBy("低置信度"), "条", "AI 主动交回人工", "") +
        kpiCard("知识缺口", countBy("知识缺口"), "条", "无条目可答，需供稿", "") +
        kpiCard("超期未复核", countBy("超期未复核"), "条", "超过 72 小时未审核", "") +
      "</div>" +

      '<div class="card"><div class="card-body">' +
        '<div class="tab-row">' +
          ["待处理", "已处理", "全部"].map(function (t) {
            var n = t === "全部" ? db.alerts.length : db.alerts.filter(function (a) { return a.status === t; }).length;
            return '<button class="tab ' + (state.alertTab === t ? "active" : "") + '" data-act="alert-tab" data-v="' + t + '">' + t + "<span class='n'>" + n + "</span></button>";
          }).join("") +
        "</div>" +
        '<div class="toolbar" style="margin-bottom:14px">' +
          types.map(function (t) {
            return '<button class="chip ' + (state.alertType === t ? "active" : "") + '" data-act="alert-type" data-v="' + t + '">' + t + "</button>";
          }).join("") +
        "</div>" +
        (list.length ? list.map(function (a) {
          var cls = a.type === "低置信度" || a.type === "超期未复核" ? "red" : a.type === "知识缺口" ? "" : "blue";
          var sign = cls === "red" ? "!" : cls === "blue" ? "↻" : "?";
          return '<div class="alert-item ' + (a.status === "已处理" ? "handled" : "") + '">' +
            '<div class="alert-ico ' + cls + '">' + sign + "</div>" +
            '<div class="body"><strong>' + esc(a.title) + "</strong><p>" + esc(a.desc) + "</p>" +
              "<p style='margin-top:5px;color:var(--muted-2)'>" + esc(a.type + " · " + a.level + "风险 · " + a.time) + "</p></div>" +
            '<div class="side">' + (a.status === "待处理"
              ? '<button class="btn btn-sm btn-primary" data-act="alert-handle" data-id="' + a.id + '">标记处理</button>'
              : '<span class="badge ok">已处理</span>') +
              (a.entry ? '<button class="btn btn-sm" data-act="kb-view" data-id="' + a.entry + '">查看条目</button>' : "") +
            "</div></div>";
        }).join("") : emptyBlock("没有符合条件的预警", "切换上方筛选试试")) +
      "</div></div>" +

      '<div class="note mt16">预警规则：置信度低于 70% 或命中敏感业务 → <b>低置信度</b>；条目提交后 72 小时未审核 → <b>超期未复核</b>；同一问题 7 天内 5 次无匹配 → <b>知识缺口</b>；同一问题被反复询问 → <b>高频重复提问</b>。</div>';
  }

  /* ============================================================
     公共片段
     ============================================================ */
  function pageHead(kicker, title, sub, tools) {
    return '<div class="page-head"><div class="page-kicker">' + esc(kicker) + "</div>" +
      '<h2 class="page-title">' + esc(title) + "</h2>" +
      '<p class="page-sub">' + esc(sub) + "</p>" +
      (tools ? '<div class="page-tools">' + tools + "</div>" : "") +
      "</div>";
  }

  /* ============================================================
     路由与事件
     ============================================================ */
  var ROUTES = {
    dashboard: renderDashboard,
    knowledge: renderKnowledge,
    qa: renderQA,
    training: renderTraining,
    exam: renderExam,
    review: renderReview,
    ledger: renderLedger,
    alerts: renderAlerts
  };

  function render() {
    var fn = ROUTES[state.page] || renderDashboard;
    view.innerHTML = fn();
    paintBadges();
    var el = document.querySelector('.nav-item[data-page="' + state.page + '"]');
    document.querySelectorAll(".nav-item").forEach(function (n) { n.classList.remove("active"); });
    if (el) el.classList.add("active");
  }

  function goto(page) {
    if (!ROUTES[page]) page = "dashboard";
    state.page = page;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("nav").addEventListener("click", function (e) {
    var a = e.target.closest(".nav-item");
    if (!a) return;
    e.preventDefault();
    var page = a.getAttribute("data-page");
    var sb = document.getElementById("sidebar");
    if (sb) sb.classList.remove("open");
    if (location.hash === "#" + page) goto(page);
    else location.hash = page; // hashchange 负责渲染，避免重复绘制
  });

  var menuBtn = document.getElementById("btnMenu");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      document.getElementById("sidebar").classList.toggle("open");
    });
  }

  window.addEventListener("hashchange", function () {
    var page = (location.hash || "#dashboard").replace("#", "");
    if (page !== state.page) goto(page);
  });

  document.getElementById("btnRefresh").addEventListener("click", function () {
    db = DB.load();
    state.qaResult = null;
    render();
    toast("数据已刷新", "ok");
  });

  /* 全局事件委托 */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    var id = t.getAttribute("data-id");

    switch (act) {
      /* 知识库 */
      case "kb-type": state.kbType = t.getAttribute("data-v"); render(); break;
      case "kb-add": openKbForm(null); break;
      case "kb-edit": openKbForm(id); break;
      case "kb-view": viewEntry(id); break;
      case "kb-save": saveKbForm(); break;
      case "kb-del": {
        var e1 = entryById(id);
        if (e1 && window.confirm("确定删除「" + e1.title + "」吗？删除后可在回收站恢复。")) {
          db.entries = db.entries.filter(function (x) { return x.id !== id; });
          db.trash.unshift(e1);
          save(); render();
          toast("已移入回收站", "warn");
        }
        break;
      }
      case "kb-trash": openTrash(); break;
      case "kb-restore": {
        var idx = db.trash.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) {
          db.entries.unshift(db.trash[idx]);
          db.trash.splice(idx, 1);
          save(); closeModal(); render();
          toast("条目已恢复", "ok");
        }
        break;
      }
      /* 问答 */
      case "qa-sample": {
        var qEl = document.getElementById("qaQuestion");
        if (qEl) {
          qEl.value = "业主家阳台渗水到楼下，责任怎么界定？我应该先联系谁？";
          qEl.focus();
        }
        break;
      }
      case "qa-adopt": adoptQA(); break;
      case "qa-manual": manualQA(); break;
      case "qa-fill": {
        var qf = document.getElementById("qaQuestion");
        if (qf) { qf.value = t.getAttribute("data-q") || ""; qf.focus(); qf.scrollIntoView({ behavior: "smooth", block: "center" }); }
        break;
      }
      case "qa-again": state.qaResult = null; render(); break;
      case "qa-replay": {
        var q0 = db.qa.filter(function (x) { return x.id === id; })[0];
        if (q0) {
          openModal({
            title: "问答详情",
            body: '<div class="note" style="margin-bottom:12px"><b>提问：</b>' + esc(q0.question) + "<br><b>项目：</b>" + esc(q0.project) +
              " · " + esc(q0.owner) + " · " + esc(q0.time) + "<br><b>状态：</b>" + esc(q0.status) + " · 置信度 " + q0.confidence + "%</div>" +
              '<div class="answer"><div class="answer-head"><span class="ai-tag">AI</span><small>答复记录</small></div>' +
              "<p style='font-size:13px;line-height:1.9;color:var(--text-2)'>" + esc(q0.answer) + "</p>" +
              '<div class="answer-block" style="margin-top:12px"><h5>引用来源</h5><div class="sources">' +
              ((q0.sources || []).map(function (sid) {
                var ent = entryById(sid);
                return ent ? '<span class="source-chip"><b>' + esc(ent.title) + "</b>" + esc(ent.type + " · " + ent.version) + "</span>" : "";
              }).join("") || "<span class='hint'>无</span>") +
              "</div></div></div>",
            foot: '<button class="btn" data-close="1">关闭</button>'
          });
        }
        break;
      }
      /* 培训 */
      case "train-pick": state.trainee = id; render(); break;
      case "train-toggle": toggleCourse(id); break;
      case "train-exam": goto("exam"); break;
      /* 考核 */
      case "exam-start": startExam(); break;
      case "exam-pick": {
        var qi = parseInt(t.getAttribute("data-q"), 10);
        var oi = parseInt(t.getAttribute("data-o"), 10);
        state.examAnswers[qi] = oi;
        render();
        break;
      }
      case "exam-submit": submitExam(); break;
      case "exam-again": state.exam = null; state.examAnswers = {}; render(); break;
      case "exam-cancel": state.exam = null; state.examAnswers = {}; render(); break;
      /* 复核 */
      case "review-open": openReview(id); break;
      case "review-save": saveReview(id); break;
      case "review-reject": rejectReview(id); break;
      case "entry-approve": approveEntry(id); break;
      /* 台账 */
      case "ledger-status": state.ledgerStatus = t.getAttribute("data-v"); render(); break;
      case "ledger-csv": exportCSV(); break;
      case "ledger-print": window.print(); break;
      /* 预警 */
      case "alert-tab": state.alertTab = t.getAttribute("data-v"); render(); break;
      case "alert-type": state.alertType = t.getAttribute("data-v"); render(); break;
      case "alert-handle": {
        db.alerts.forEach(function (a) { if (a.id === id) a.status = "已处理"; });
        save(); render();
        toast("预警已标记处理", "ok");
        break;
      }
      case "alerts-all-read": {
        var n = 0;
        db.alerts.forEach(function (a) { if (a.status === "待处理") { a.status = "已处理"; n++; } });
        save(); render();
        toast("已处理 " + n + " 条预警", "ok");
        break;
      }
      case "reset-db": {
        if (window.confirm("确定重置演示数据吗？将清空新增的条目、问答、考核与预警，恢复初始示例数据。")) {
          db = DB.reset();
          state.qaResult = null;
          state.exam = null;
          state.examAnswers = {};
          state.kbQ = state.ledgerQ = "";
          state.kbType = state.kbStatus = state.ledgerStatus = state.ledgerProject = "全部";
          render();
          toast("演示数据已重置", "ok");
        }
        break;
      }
      default: break;
    }
  });

  /* 表单提交 */
  document.addEventListener("submit", function (e) {
    if (e.target.id === "qaForm") {
      e.preventDefault();
      var f = new FormData(e.target);
      var form = {
        question: f.get("question"), project: f.get("project"), role: f.get("role"),
        type: f.get("type"), owner: f.get("owner")
      };
      if (!String(form.question || "").trim()) { toast("请先填写问题描述", "warn"); return; }
      submitQA(form);
    }
  });

  /* 下拉与开关 */
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.getAttribute("data-act") === "kb-status") { state.kbStatus = t.value; render(); }
    if (t.getAttribute("data-act") === "ledger-project") { state.ledgerProject = t.value; render(); }
  });

  /* 搜索：本地过滤，不重绘以保持输入焦点 */
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "kbSearch" || t.id === "ledgerSearch") {
      var body = document.getElementById(t.id === "kbSearch" ? "kbBody" : "ledgerBody");
      if (!body) return;
      var q = t.value.trim().toLowerCase();
      if (t.id === "kbSearch") state.kbQ = t.value;
      else state.ledgerQ = t.value;
      Array.prototype.forEach.call(body.querySelectorAll("tr[data-text]"), function (tr) {
        tr.style.display = !q || tr.getAttribute("data-text").indexOf(q) >= 0 ? "" : "none";
      });
    }
  });

  function viewEntry(id) {
    var e = entryById(id);
    if (!e) return;
    openModal({
      title: e.title,
      wide: true,
      body:
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
          typeBadge(e.type) + statusBadge(e.status) + badge("适用范围：" + e.scope, "navy") +
          badge(e.source + " · " + e.owner) + badge(e.version + " · " + e.updated) +
          (e.sensitive ? badge("敏感业务", "danger") : "") +
        "</div>" +
        '<div class="note" style="margin-bottom:14px">' + esc(e.summary) + "</div>" +
        ((e.steps || []).length
          ? '<div class="section-title">处置要点</div><ol style="margin:0 0 14px;padding-left:20px;color:var(--text-2);font-size:13px;line-height:1.95">' +
              e.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>"
          : "") +
        (e.tips ? '<div class="section-title">注意事项</div><div class="guard">' + esc(e.tips) + "</div>" : "") +
        '<div class="section-title" style="margin-top:16px">检索关键词</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          (e.keywords || []).map(function (k) { return badge(k, "info"); }).join("") +
        "</div>",
      foot: '<button class="btn" data-close="1">关闭</button><button class="btn btn-primary" data-act="kb-edit" data-id="' + e.id + '">编辑条目</button>'
    });
  }

  /* 时钟 */
  function tick() {
    var el = document.getElementById("clock");
    if (el) el.textContent = todayCn();
  }
  setInterval(tick, 30000);

  /* 启动 */
  (function boot() {
    tick();
    var page = (location.hash || "").replace("#", "");
    if (ROUTES[page]) {
      state.page = page;
    } else {
      state.page = "dashboard";
      history.replaceState(null, "", "#dashboard");
    }
    render();
  })();
})();
