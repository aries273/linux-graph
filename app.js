(function () {
  "use strict";

  var DATA = null;
  var byId = new Map();
  var pre = new Map();
  var post = new Map();
  var chapters = new Map();
  var currentId = null;
  var depth = "2";
  var cy = null;
  var state = { q: "", chapter: "", domain: "" };

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function tier(chapter) {
    if (chapter <= 5) return "base";
    if (chapter <= 13) return "svc";
    return "arch";
  }

  function tierLabel(chapter) {
    return chapter <= 5 ? "基础篇" : chapter <= 13 ? "服务篇" : "架构篇";
  }

  /* ---------- data ---------- */

  function build() {
    DATA.topics.forEach(function (t) {
      byId.set(t.id, t);
      pre.set(t.id, []);
      post.set(t.id, []);
    });
    DATA.topics.forEach(function (t) {
      (t.prerequisites || []).forEach(function (p) {
        if (!byId.has(p.id)) return;
        pre.get(t.id).push({ id: p.id, type: p.type === "soft" ? "soft" : "hard" });
        post.get(p.id).push({ id: t.id, type: p.type === "soft" ? "soft" : "hard" });
      });
    });
    DATA.meta.chapters.forEach(function (c) { chapters.set(c.no, c.title); });
  }

  function reach(map, start) {
    var out = new Set();
    var stack = [start];
    while (stack.length) {
      var cur = stack.pop();
      (map.get(cur) || []).forEach(function (e) {
        if (out.has(e.id)) return;
        out.add(e.id);
        stack.push(e.id);
      });
    }
    return out;
  }

  /* ---------- filters + list ---------- */

  function initFilters() {
    var fc = $("fChapter");
    DATA.meta.chapters.forEach(function (c) {
      var o = document.createElement("option");
      o.value = String(c.no);
      o.textContent = "第 " + c.no + " 章 · " + c.title;
      fc.appendChild(o);
    });
    var domains = {};
    DATA.topics.forEach(function (t) { domains[t.domain] = (domains[t.domain] || 0) + 1; });
    var fd = $("fDomain");
    Object.keys(domains).sort().forEach(function (d) {
      var o = document.createElement("option");
      o.value = d;
      o.textContent = d + "（" + domains[d] + "）";
      fd.appendChild(o);
    });
  }

  function matches(t) {
    if (state.chapter && String(t.chapter) !== state.chapter) return false;
    if (state.domain && t.domain !== state.domain) return false;
    if (!state.q) return true;
    var q = state.q;
    var blob = [t.name, t.description, t.domain, t.section, chapters.get(t.chapter) || ""]
      .concat(t.commands || [], t.mastery_criteria || []).join("\n").toLowerCase();
    return blob.indexOf(q) !== -1;
  }

  function renderList() {
    var list = $("list");
    var shown = 0;
    list.innerHTML = "";
    DATA.meta.chapters.forEach(function (c) {
      var items = DATA.topics.filter(function (t) { return t.chapter === c.no && matches(t); });
      if (!items.length) return;
      shown += items.length;
      var head = document.createElement("div");
      head.className = "chapter-head";
      head.textContent = "第 " + c.no + " 章 · " + c.title;
      list.appendChild(head);
      items.forEach(function (t) {
        var row = document.createElement("div");
        row.className = "item" + (t.id === currentId ? " active" : "");
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.dataset.id = t.id;
        row.innerHTML = '<i class="dot ' + tier(t.chapter) + '"></i><span class="nm">' +
          esc(t.name) + '</span>';
        row.title = t.name + " · " + t.section;
        row.addEventListener("click", function () { select(t.id); });
        row.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(t.id); }
        });
        list.appendChild(row);
      });
    });
    if (!shown) list.innerHTML = '<p class="muted" style="padding:12px">没有匹配的知识点。</p>';
    $("count").textContent = "显示 " + shown + " / " + DATA.topics.length;
  }

  /* ---------- detail ---------- */

  function chip(id, type) {
    var t = byId.get(id);
    if (!t) return null;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (type === "soft" ? " soft" : "");
    b.textContent = t.name;
    b.title = "第 " + t.chapter + " 章 · " + t.section;
    b.addEventListener("click", function () { select(id); });
    return b;
  }

  function renderDetail(t) {
    var detail = $("detail");
    var html = [];
    html.push('<h1 class="detail-title">' + esc(t.name) + '</h1>');
    html.push('<div class="pills">' +
      '<span class="pill">第 ' + t.chapter + ' 章 · ' + esc(t.section) + '</span>' +
      '<span class="pill ghost">' + esc(t.domain) + '</span>' +
      '<span class="pill ghost">' + tierLabel(t.chapter) + '</span>' +
      '<span class="pill ghost">' + esc(t.id) + '</span>' +
      '</div>');
    html.push('<p class="desc">' + esc(t.description) + '</p>');

    var mc = t.mastery_criteria || [];
    if (mc.length) {
      html.push('<h2>掌握标准</h2><ul class="plain">' +
        mc.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>');
    }

    var cmds = t.commands || [];
    if (cmds.length) {
      html.push('<h2>常用命令 / 配置</h2><div class="cmds">' +
        cmds.map(function (c) { return '<span class="cmd">' + esc(c) + '</span>'; }).join("") + '</div>');
    }

    var q = t.question;
    if (q && q.prompt) {
      var choices = q.choices || [];
      html.push('<h2>自测</h2><div class="q-box"><p class="stem">' + esc(q.prompt) + '</p>' +
        (choices.length ? '<ol type="A">' + choices.map(function (c) {
          return '<li>' + esc(String(c).replace(/^[A-Da-d][.、．]\s*/, "")) + '</li>';
        }).join("") + '</ol>' : '') +
        '<details><summary>查看答案</summary><p class="ans"><strong>答案 ' + esc(q.answer) + '</strong>　' +
        esc(q.explanation || '') + '</p></details></div>');
    }

    detail.innerHTML = html.join("");

    var preBox = '<h2>先修（' + pre.get(t.id).length + '）</h2><div class="rel" id="rel-pre"></div>';
    var postBox = '<h2>被依赖（' + post.get(t.id).length + '）</h2><div class="rel" id="rel-post"></div>';
    detail.insertAdjacentHTML("beforeend", preBox + postBox);

    var preEl = detail.querySelector("#rel-pre");
    var postEl = detail.querySelector("#rel-post");
    var pres = pre.get(t.id);
    var posts = post.get(t.id);
    if (pres.length) {
      pres.slice().sort(function (a, b) { return byId.get(a.id).chapter - byId.get(b.id).chapter; })
        .forEach(function (p) { var c = chip(p.id, p.type); if (c) preEl.appendChild(c); });
    } else {
      preEl.innerHTML = '<span class="muted" style="font-size:13px">这是起点，没有更早的先修。</span>';
    }
    if (posts.length) {
      posts.slice().sort(function (a, b) { return byId.get(a.id).chapter - byId.get(b.id).chapter; })
        .forEach(function (p) { var c = chip(p.id, p.type); if (c) postEl.appendChild(c); });
    } else {
      postEl.innerHTML = '<span class="muted" style="font-size:13px">还没有其他知识点依赖它。</span>';
    }
    detail.scrollTop = 0;
  }

  /* ---------- graph ---------- */

  function ego(start) {
    var up = new Set([start]);
    var frontier = [start];
    var limit = depth === "all" ? 99 : Number(depth);
    for (var lv = 0; lv < limit; lv++) {
      var next = [];
      frontier.forEach(function (id) {
        (pre.get(id) || []).forEach(function (e) {
          if (!up.has(e.id)) { up.add(e.id); next.push(e.id); }
        });
      });
      frontier = next;
      if (!frontier.length) break;
    }
    var down = new Set();
    (post.get(start) || []).forEach(function (e) { down.add(e.id); });
    var nodes = Array.from(up).concat(Array.from(down).filter(function (id) { return !up.has(id); }));
    return nodes;
  }

  function renderGraph(t) {
    var stage = $("graph-stage");
    var empty = $("graph-empty");
    var ids = ego(t.id);
    var folded = false;
    if (ids.length > 55) {
      depth = "2";
      ids = ego(t.id);
      folded = true;
      var btn = document.querySelector('.seg button[data-depth="2"]');
      if (btn) setDepthButton(btn);
    }

    if (!cy) {
      cy = cytoscape({
        container: $("cy"),
        wheelSensitivity: 0.2,
        style: [
          { selector: "node", style: {
            "background-color": "#2f9e7f", "width": 14, "height": 14,
            "label": "data(name)", "font-size": 11, "color": "#1c2b2a",
            "text-valign": "bottom", "text-halign": "center", "text-margin-y": 6,
            "text-wrap": "wrap", "text-max-width": 96, "border-width": 1, "border-color": "#ffffff"
          } },
          { selector: 'node[tier = "svc"]', style: { "background-color": "#3b7fc4" } },
          { selector: 'node[tier = "arch"]', style: { "background-color": "#8a63c9" } },
          { selector: "edge", style: {
            "width": 1.6, "line-color": "#9db0ad", "target-arrow-shape": "triangle",
            "target-arrow-color": "#9db0ad", "curve-style": "bezier", "arrow-scale": 0.8
          } },
          { selector: 'edge[etype = "soft"]', style: { "line-style": "dashed" } },
          { selector: "node:selected", style: {
            "border-width": 3, "border-color": "#0b554c", "width": 18, "height": 18,
            "font-weight": "bold"
          } }
        ]
      });
      cy.on("tap", "node", function (evt) { select(evt.target.id()); });
      cy.on("mouseover", "node", function (evt) {
        var tip = $("node-tip");
        var n = byId.get(evt.target.id());
        if (!n) return;
        tip.textContent = n.name + "（第 " + n.chapter + " 章）";
        tip.hidden = false;
      });
      cy.on("mousemove", "node", function (evt) {
        var tip = $("node-tip");
        var r = stage.getBoundingClientRect();
        var x = evt.originalEvent ? evt.originalEvent.clientX - r.left : 0;
        var y = evt.originalEvent ? evt.originalEvent.clientY - r.top : 0;
        tip.style.left = Math.min(x + 12, r.width - 240) + "px";
        tip.style.top = Math.max(y - 28, 4) + "px";
      });
      cy.on("mouseout", "node", function () { $("node-tip").hidden = true; });
    }

    var elements = [];
    ids.forEach(function (id) {
      var n = byId.get(id);
      if (!n) return;
      elements.push({ data: { id: id, name: n.name, tier: tier(n.chapter) } });
    });
    ids.forEach(function (id) {
      (pre.get(id) || []).forEach(function (e) {
        if (!byId.has(e.id) || ids.indexOf(e.id) === -1) return;
        elements.push({ data: { id: id + ">" + e.id, source: e.id, target: id, etype: e.type } });
      });
    });

    empty.hidden = true;
    $("cy").hidden = false;
    cy.elements().remove();
    cy.add(elements);
    cy.getElementById(t.id).select();
    cy.layout({
      name: "dagre",
      rankDir: "LR",
      nodeSep: 46,
      rankSep: 84,
      edgeSep: 10,
      animate: false,
      fit: true,
      padding: 28
    }).run();
    cy.resize();
    cy.fit(undefined, 28);
    (window.requestAnimationFrame || setTimeout)(function () {
      cy.resize();
      cy.fit(undefined, 28);
    }, 60);

    var total = ids.length;
    $("graph-meta").textContent = "局部图 " + total + " 个知识点、向上 " +
      (depth === "all" ? "全部" : depth + " 层") +
      (folded ? "（节点过多，已自动按 2 层收起）" : "") +
      "，向下 1 层。点节点可换选中项。";
  }

  function setDepthButton(btn) {
    Array.prototype.forEach.call(document.querySelectorAll("#depth-switch .seg button"), function (b) {
      b.classList.toggle("on", b === btn);
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
  }

  /* ---------- selection ---------- */

  function select(id) {
    if (!byId.has(id)) return;
    currentId = id;
    var t = byId.get(id);
    renderDetail(t);
    renderGraph(t);
    Array.prototype.forEach.call(document.querySelectorAll("#list .item"), function (r) {
      r.classList.toggle("active", r.dataset.id === id);
    });
    if (history.replaceState) history.replaceState(null, "", "#" + encodeURIComponent(id));
    else location.hash = id;
  }

  /* ---------- boot ---------- */

  function wire() {
    var timer = null;
    $("q").addEventListener("input", function (e) {
      clearTimeout(timer);
      var v = e.target.value.trim().toLowerCase();
      timer = setTimeout(function () { state.q = v; renderList(); }, 120);
    });
    $("fChapter").addEventListener("change", function (e) { state.chapter = e.target.value; renderList(); });
    $("fDomain").addEventListener("change", function (e) { state.domain = e.target.value; renderList(); });

    document.querySelectorAll("#depth-switch .seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        setDepthButton(b);
        depth = b.dataset.depth;
        if (currentId) renderGraph(byId.get(currentId));
      });
    });
    $("btn-zoom-in").addEventListener("click", function () {
      if (!cy) return;
      cy.zoom({ level: Math.min(cy.zoom() * 1.25, 4), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    });
    $("btn-zoom-out").addEventListener("click", function () {
      if (!cy) return;
      cy.zoom({ level: Math.max(cy.zoom() * 0.8, 0.2), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    });
    $("btn-fit").addEventListener("click", function () { if (cy) cy.fit(undefined, 24); });
    $("pick-sample").addEventListener("click", function () {
      var target = DATA.topics.filter(function (t) { return t.name.indexOf("管道符") !== -1; })[0] || DATA.topics[1];
      if (target) select(target.id);
    });
  }

  fetch("data/linux.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      DATA = data;
      build();
      initFilters();
      var hash = decodeURIComponent(location.hash.replace(/^#/, ""));
      var start = byId.has(hash) ? hash : null;
      if (!start) {
        start = (DATA.topics.filter(function (t) { return t.name.indexOf("管道符") !== -1; })[0] ||
                 DATA.topics[0]).id;
      }
      renderList();
      select(start);
      $("stats").textContent = "共 " + DATA.topics.length + " 个知识点、 " + countEdges() + " 条先修关系";
      wire();
      window.addEventListener("resize", function () {
        if (cy) setTimeout(function () { cy.resize(); cy.fit(undefined, 24); }, 120);
      });
    })
    .catch(function (err) {
      $("list").innerHTML = '<p class="muted" style="padding:12px">数据加载失败：' + esc(err.message) + '</p>';
      $("detail").innerHTML = '<p class="muted">数据加载失败：' + esc(err.message) + '</p>';
    });

  function countEdges() {
    var n = 0;
    DATA.topics.forEach(function (t) { n += (t.prerequisites || []).length; });
    return n;
  }
})();
