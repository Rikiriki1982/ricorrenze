(function () {
  var L = window.RicLogic;
  var cfg = window.RIC_CONFIG || {};
  var app = document.getElementById('app');

  var CATEGORIE = [['casa', 'Casa'], ['auto', 'Auto'], ['salute', 'Salute'], ['abbonamenti', 'Abbonamenti'], ['tasse', 'Tasse'], ['altro', 'Altro']];
  var FREQ = ['mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale', 'stagionale', 'personalizzata'];
  var PROMEMORIA = [[0, 'Nessuno'], [1, '1 giorno prima'], [3, '3 giorni prima'], [7, '1 settimana prima'], [14, '2 settimane prima'], [30, '1 mese prima']];

  var sb = null;
  var state = { user: null, items: [], filtro: 'tutte', vista: 'elenco', mese: L.today().slice(0, 7), giorno: null, form: null, busy: false, error: '', installEvt: null, loginMsg: '' };

  var eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  function money(n) { return eur.format(n || 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dShort(s) { return L.parse(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function dLong(s) { return L.parse(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- Avvio ---------- */
  function configOk() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_KEY && cfg.SUPABASE_URL.indexOf('INSERISCI') !== 0 && cfg.SUPABASE_KEY.indexOf('INSERISCI') !== 0;
  }

  function init() {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); state.installEvt = e; render(); });
    if (!configOk()) { app.innerHTML = '<div class="login"><h1>Ricorrenze</h1><p class="err">Configurazione mancante. Apri config.js e inserisci URL e chiave del tuo progetto Supabase.</p></div>'; return; }
    if (!window.supabase) { app.innerHTML = '<div class="login"><h1>Ricorrenze</h1><p class="err">Impossibile caricare Supabase. Controlla la connessione e riprova.</p></div>'; return; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    sb.auth.getSession().then(function (r) {
      state.user = r.data.session ? r.data.session.user : null;
      if (state.user) caricaTutto(); else render();
    });
    sb.auth.onAuthStateChange(function (ev, session) {
      var u = session ? session.user : null;
      if ((u && !state.user) || (!u && state.user)) { state.user = u; if (u) caricaTutto(); else { state.items = []; render(); } }
    });
  }

  function caricaTutto() {
    return sb.from('ricorrenze').select('*').eq('attiva', true).order('prossima_scadenza', { ascending: true }).then(function (r) {
      if (r.error) { state.error = 'Non riesco a leggere i dati: ' + r.error.message; } else { state.items = r.data || []; state.error = ''; }
      render();
    });
  }

  /* ---------- Render principale ---------- */
  function render() {
    if (!state.user) return renderLogin();
    renderMain();
    if (state.form) renderForm();
  }

  function renderLogin() {
    app.innerHTML =
      '<div class="login"><h1>Ricorrenze</h1><p class="hint">Accedi per vedere le tue scadenze su tutti i dispositivi.</p>' +
      '<label class="l">Email</label><input type="email" id="lg-mail" autocomplete="email" placeholder="nome@email.it">' +
      '<label class="l">Password</label><input type="password" id="lg-pass" autocomplete="current-password" placeholder="Almeno 6 caratteri">' +
      (state.error ? '<p class="err">' + esc(state.error) + '</p>' : '') +
      (state.loginMsg ? '<p class="hint">' + esc(state.loginMsg) + '</p>' : '') +
      '<div class="row" style="margin-top:14px"><button class="btn pri" id="lg-in">Accedi</button><button class="btn" id="lg-up">Crea account</button></div></div>';
    $('#lg-in').onclick = function () { auth('in'); };
    $('#lg-up').onclick = function () { auth('up'); };
  }

  function auth(mode) {
    var email = $('#lg-mail').value.trim(), pass = $('#lg-pass').value;
    state.error = ''; state.loginMsg = '';
    if (!email || pass.length < 6) { state.error = 'Inserisci email e una password di almeno 6 caratteri.'; return renderLogin(); }
    var p = mode === 'in' ? sb.auth.signInWithPassword({ email: email, password: pass }) : sb.auth.signUp({ email: email, password: pass });
    p.then(function (r) {
      if (r.error) { state.error = r.error.message; return renderLogin(); }
      if (mode === 'up' && !r.data.session) { state.loginMsg = 'Account creato. Conferma l\'email che ti abbiamo inviato, poi accedi.'; return renderLogin(); }
    });
  }

  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone; }

  function renderMain() {
    var t = L.today(), t30 = L.addDays(t, 30);
    var items = state.items.filter(function (i) { return state.filtro === 'tutte' || i.tipo === state.filtro; });
    var m30 = 0, annuo = 0;
    state.items.forEach(function (i) {
      if (i.importo == null) return;
      annuo += L.annualCost(i);
      var o = L.occurrences(i, t, t30);
      if (i.prossima_scadenza < t) o.unshift(i.prossima_scadenza);
      m30 += o.length * Number(i.importo);
    });

    var urgenti = [], prossime = [];
    items.forEach(function (i) {
      var d = L.daysUntil(i.prossima_scadenza, t);
      (d <= (i.promemoria_giorni || 0) ? urgenti : prossime).push(i);
    });

    var html = '<div class="top"><h1>Ricorrenze</h1><span class="sp"></span>';
    if (state.installEvt) html += '<button class="btn sm" id="inst">Installa</button>';
    html += '<button class="ibtn" id="esci" aria-label="Esci">Esci</button></div>';

    if (isIos() && lsGet('ric-ios-hint') !== '1') {
      html += '<div class="banner">Per installarla su iPhone: tocca Condividi, poi Aggiungi a Home. <button class="ibtn" id="ios-ok">Ok</button></div>';
    }
    if (state.error) html += '<p class="err">' + esc(state.error) + '</p>';

    html += '<div class="tabs">' + [['elenco', 'Elenco'], ['mese', 'Mese'], ['anno', 'Anno']].map(function (v) {
      return '<button class="' + (state.vista === v[0] ? 'on' : '') + '" data-vista="' + v[0] + '">' + v[1] + '</button>';
    }).join('') + '</div>';

    if (state.vista === 'elenco') {
      html += '<div class="grid2"><div class="metric"><small>Prossimi 30 giorni</small><b>' + money(m30) + '</b></div>' +
        '<div class="metric"><small>Costo annuo</small><b>' + money(annuo) + '</b></div></div>';
    }

    html += '<div class="chips">' + [['tutte', 'Tutte'], ['spesa', 'Spese'], ['manutenzione', 'Manutenzioni']].map(function (f) {
      return '<button class="chip' + (state.filtro === f[0] ? ' on' : '') + '" data-filtro="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';

    html += legendHtml();

    if (!items.length) {
      html += '<div class="empty"><b>Aggiungi la tua prima ricorrenza</b><br>Mutuo, assicurazione, pulizia del condizionatore: tutto in un posto.</div>';
    } else if (state.vista === 'mese') {
      html += meseHtml(items, t);
    } else if (state.vista === 'anno') {
      html += annoHtml(items, t);
    } else {
      if (urgenti.length) {
        html += '<div class="banner">' + urgenti.length + (urgenti.length === 1 ? ' scadenza richiede' : ' scadenze richiedono') + ' attenzione.</div>';
        html += '<div class="sec">In scadenza</div>' + urgenti.map(cardHtml).join('');
      }
      if (prossime.length) html += '<div class="sec">Prossime</div>' + prossime.map(cardHtml).join('');
    }
    html += '<button class="fab" id="nuovo">+ Nuova</button>';
    app.innerHTML = html;

    var inst = $('#inst'); if (inst) inst.onclick = function () {
      var e = state.installEvt; state.installEvt = null; e.prompt(); render();
    };
    $('#esci').onclick = function () { sb.auth.signOut(); };
    var iok = $('#ios-ok'); if (iok) iok.onclick = function () { lsSet('ric-ios-hint', '1'); render(); };
    $('#nuovo').onclick = function () { apriForm(null); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-filtro]'), function (b) {
      b.onclick = function () { state.filtro = b.getAttribute('data-filtro'); render(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-vista]'), function (b) {
      b.onclick = function () { state.vista = b.getAttribute('data-vista'); render(); window.scrollTo(0, 0); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mnav]'), function (b) {
      b.onclick = function () {
        var next = L.shiftMonth(state.mese, Number(b.getAttribute('data-mnav')));
        if (next < t.slice(0, 7) || next > L.shiftMonth(t.slice(0, 7), 36)) return;
        state.mese = next; state.giorno = null; render();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-giorno]'), function (b) {
      b.onclick = function () {
        var g = b.getAttribute('data-giorno');
        state.giorno = state.giorno === g ? null : g;
        render();
        if (state.giorno) {
          var r = document.querySelector('[data-row-date="' + state.giorno + '"]');
          if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-annomese]'), function (b) {
      b.onclick = function () { state.mese = b.getAttribute('data-annomese'); state.giorno = null; state.vista = 'mese'; render(); window.scrollTo(0, 0); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { apriForm(b.getAttribute('data-open')); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-done]'), function (b) {
      b.onclick = function () { fatto(b.getAttribute('data-done')); };
    });
  }

  // Testo della scadenza: quanti giorni mancano, oppure la data se non è urgente
  function whenText(dateStr, urg, t) {
    var d = L.daysUntil(dateStr, t);
    if (d < 0) return 'Scaduta da ' + (-d) + ' gg';
    if (d === 0) return 'Oggi';
    if (urg === 'soon') return 'Tra ' + d + (d === 1 ? ' giorno' : ' gg');
    return dShort(dateStr);
  }

  function avatarClass(i) { return 'c-' + esc(i.categoria) + (i.tipo === 'manutenzione' ? ' ring' : ''); }

  function legendHtml() {
    return '<div class="lg">' + CATEGORIE.map(function (c) {
      return '<span><i class="c-' + c[0] + '"></i>' + c[1] + '</span>';
    }).join('') + '<span><i class="fill"></i>Spesa</span><span><i class="ring"></i>Manutenzione</span></div>';
  }

  function cardHtml(i) {
    var t = L.today();
    var urg = L.urgency(i, t);
    var when = whenText(i.prossima_scadenza, urg, t);
    var whenHtml = (urg === 'late' || urg === 'soon')
      ? '<span class="u ' + urg + '">' + (urg === 'late' ? '! ' : '') + esc(when) + '</span>'
      : '<span class="s">' + esc(when) + '</span>';
    var sub = L.label(i) + (i.allegato_path ? ' · allegato' : '');
    return '<div class="card u-' + urg + '"><div class="av ' + avatarClass(i) + '">' + esc((i.nome || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="main" data-open="' + esc(i.id) + '"><div class="t">' + esc(i.nome) + '</div><div class="s">' + esc(sub) + '</div></div>' +
      '<div class="r"><b>' + (i.importo != null ? money(i.importo) : '—') + '</b>' + whenHtml + '</div>' +
      '<button class="done" data-done="' + esc(i.id) + '" aria-label="Segna come fatta">✓</button></div>';
  }

  /* ---------- Vista mese ---------- */
  function urgLabel(urg, when) {
    return (urg === 'late' || urg === 'soon') ? '<span class="u ' + urg + '">' + (urg === 'late' ? '! ' : '') + esc(when) + '</span>' : '';
  }

  function dotHtml(i, extra) {
    return '<span class="d c-' + esc(i.categoria) + (i.tipo === 'manutenzione' ? ' ring' : '') + (extra || '') + '"></span>';
  }

  function rowHtml(date, i, t, isFirst, sel) {
    var urg = L.urgencyOf(date, i.promemoria_giorni, t);
    var when = whenText(date, urg, t);
    var d = L.parse(date);
    return '<div class="mrow u-' + urg + (sel ? ' sel' : '') + '" data-row-date="' + date + '">' +
      '<div class="dt"><b>' + d.getUTCDate() + '</b><span>' + L.GIORNI_BREVI[d.getUTCDay()] + '</span></div>' +
      '<div class="main" data-open="' + esc(i.id) + '"><div class="t">' + dotHtml(i) + ' ' + esc(i.nome) + '</div><div class="s">' + esc(L.label(i) + (i.allegato_path ? ' · allegato' : '')) + '</div>' + urgLabel(urg, when) + '</div>' +
      '<div class="r">' + (i.importo != null ? '<b>' + money(i.importo) + '</b>' : '') + '</div>' +
      (isFirst ? '<button class="done" data-done="' + esc(i.id) + '" aria-label="Segna come fatta">✓</button>' : '') + '</div>';
  }

  function meseHtml(items, t) {
    var key = state.mese, cur = t.slice(0, 7);
    var ev = L.monthEvents(items, key);
    var byDay = {};
    ev.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });

    var canPrev = key > cur, canNext = key < L.shiftMonth(cur, 36);
    var h = '<div class="cal-hd"><button class="nav" data-mnav="-1" aria-label="Mese precedente"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
      '<b>' + esc(L.monthName(key)) + '</b>' +
      '<button class="nav" data-mnav="1" aria-label="Mese successivo"' + (canNext ? '' : ' disabled') + '>›</button></div>';

    h += '<div class="wk"><span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span></div><div class="gr">';
    var off = L.weekdayMon(key + '-01'), n = L.daysInMonth(key);
    for (var k = 0; k < off; k++) h += '<div class="dy off"></div>';
    for (var dd = 1; dd <= n; dd++) {
      var date = key + '-' + (dd < 10 ? '0' : '') + dd, es = byDay[date] || [];
      var late = es.some(function (e) { return L.urgencyOf(e.date, e.item.promemoria_giorni, t) === 'late'; });
      h += '<button class="dy' + (date === t ? ' today' : '') + (late ? ' late' : '') + (state.giorno === date ? ' sel' : '') + '" data-giorno="' + date + '" aria-label="' + dd + (es.length ? ', ' + es.length + ' scadenze' : '') + '">' +
        '<span class="n">' + dd + '</span><span class="dts">' +
        es.slice(0, 3).map(function (e) { return dotHtml(e.item); }).join('') + (es.length > 3 ? '<span class="more">+</span>' : '') + '</span></button>';
    }
    h += '</div>';

    var scad = key === cur ? L.overdueItems(items, t) : [];
    var scadIds = {}; scad.forEach(function (i) { scadIds[i.id] = true; });
    var lista = ev.filter(function (e) { return !(scadIds[e.item.id] && e.date === e.item.prossima_scadenza); });
    var tot = 0; ev.forEach(function (e) { if (e.item.importo != null) tot += Number(e.item.importo); });
    var fuori = scad.filter(function (i) { return i.prossima_scadenza < key + '-01'; }).length;
    h += '<div class="mt"><div><span class="s">Totale del mese</span><b>' + money(tot) + '</b></div>' +
      '<div><span class="s">Scadenze</span><b>' + (ev.length + fuori) + '</b></div></div>';

    if (scad.length) {
      h += '<div class="sec late">Scadute</div>' + scad.map(function (i) { return rowHtml(i.prossima_scadenza, i, t, true, state.giorno === i.prossima_scadenza); }).join('');
    }
    h += '<div class="sec">Scadenze di ' + esc(L.MESI[+key.slice(5, 7) - 1].toLowerCase()) + '</div>';
    if (!lista.length) h += '<div class="empty">Nessun\'altra scadenza in questo mese.</div>';
    else h += lista.map(function (e) { return rowHtml(e.date, e.item, t, e.date === e.item.prossima_scadenza, state.giorno === e.date); }).join('');
    return h;
  }

  /* ---------- Vista anno ---------- */
  function annoHtml(items, t) {
    var mesi = L.monthlyTotals(items, t, 12);
    var ct = L.categoryTotals(items, t, 12);
    var h = '<div class="sec" style="margin-top:4px">Spesa prevista nei prossimi 12 mesi</div><div class="card" style="display:block">';

    if (ct.total <= 0) {
      h += '<div class="empty">Aggiungi un importo alle ricorrenze per vedere la spesa prevista.</div>';
    } else {
      var R = 44, CI = 2 * Math.PI * R, off = 0;
      var cats = CATEGORIE.filter(function (c) { return ct.byCat[c[0]] > 0; }).sort(function (a, b) { return ct.byCat[b[0]] - ct.byCat[a[0]]; });
      var svg = '<svg class="don" viewBox="0 0 120 120" role="img" aria-label="Spesa annua per categoria"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--line)" stroke-width="16"/>';
      cats.forEach(function (c) {
        var len = ct.byCat[c[0]] / ct.total * CI;
        svg += '<circle class="seg c-' + c[0] + '" cx="60" cy="60" r="' + R + '" fill="none" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (CI - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)"/>';
        off += len;
      });
      svg += '<text x="60" y="58" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">' + esc(Math.round(ct.total).toLocaleString('it-IT')) + ' €</text>' +
        '<text x="60" y="73" text-anchor="middle" font-size="9" fill="var(--muted)">in 12 mesi</text></svg>';
      h += '<div class="dn">' + svg + '<div class="lgd">' + cats.map(function (c) {
        return '<div><i class="sw c-' + c[0] + '"></i>' + esc(c[1]) + '<span>' + Math.round(ct.byCat[c[0]] / ct.total * 100) + '%</span></div>';
      }).join('') + '</div></div>';
    }
    h += '</div>';

    var mx = Math.max.apply(null, mesi.map(function (m) { return m.total; }).concat([1]));
    h += '<div class="sec">Mese per mese</div><div class="card" style="display:block;padding:6px 12px">' + mesi.map(function (m) {
      var segs = CATEGORIE.map(function (c) {
        var v = m.byCat[c[0]] || 0;
        return v ? '<span class="c-' + c[0] + '" style="flex:' + v + '"></span>' : '';
      }).join('');
      var label = L.MESI_BREVI[m.month] + (m.month === 0 || m === mesi[0] ? ' ' + String(m.year).slice(2) : '');
      return '<button class="yrow' + (m.total === mx && mx > 1 ? ' max' : '') + '" data-annomese="' + m.key + '" aria-label="' + esc(m.full + ' ' + m.year + ': ' + money(m.total)) + '">' +
        '<span class="ml">' + label + '</span><span class="track"><span class="fill" style="width:' + (m.total / mx * 100).toFixed(1) + '%">' + segs + '</span></span>' +
        '<span class="am">' + (m.total ? esc(Math.round(m.total).toLocaleString('it-IT')) + ' €' : '—') + '</span></button>';
    }).join('') + '</div>' +
      '<p class="s" style="margin:8px 2px">Tocca un mese per vederne le scadenze.</p>';
    return h;
  }

  /* ---------- Segna come fatta ---------- */
  function fatto(id) {
    var i = state.items.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    var prev = i.prossima_scadenza;
    var next = L.addInterval(prev, i.ogni, i.unita, i.giorno_mese);
    sb.from('ricorrenze').update({ prossima_scadenza: next }).eq('id', id).then(function (r) {
      if (r.error) return toast('Non riesco ad aggiornare: ' + r.error.message);
      i.prossima_scadenza = next;
      state.items.sort(function (a, b) { return a.prossima_scadenza < b.prossima_scadenza ? -1 : 1; });
      render();
      sb.from('ricorrenze_storico').insert({ ricorrenza_id: id, data: prev, importo: i.importo }).select('id').then(function (h) {
        var hid = h.data && h.data[0] ? h.data[0].id : null;
        toast('Fatto. Prossima: ' + dShort(next), 'Annulla', function () {
          sb.from('ricorrenze').update({ prossima_scadenza: prev }).eq('id', id).then(function () {
            if (hid) sb.from('ricorrenze_storico').delete().eq('id', hid).then(function () { });
            i.prossima_scadenza = prev;
            state.items.sort(function (a, b) { return a.prossima_scadenza < b.prossima_scadenza ? -1 : 1; });
            render();
          });
        });
      });
    });
  }

  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    var old = $('.toast'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button>' + esc(actionLabel) + '</button>' : '');
    document.body.appendChild(el);
    if (actionLabel) el.querySelector('button').onclick = function () { el.remove(); action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 6000);
  }

  /* ---------- Form ---------- */
  function apriForm(id) {
    var i = id ? state.items.filter(function (x) { return x.id === id; })[0] : null;
    var base = L.today();
    state.form = i ? {
      id: i.id, tipo: i.tipo, nome: i.nome, categoria: i.categoria, importo: i.importo == null ? '' : String(i.importo),
      frequenza: i.frequenza, ogni: i.ogni, unita: i.unita, stagione: i.stagione || '', data: i.prossima_scadenza,
      promemoria: i.promemoria_giorni, note: i.note || '', allegato: i.allegato_path, file: null, rimuoviAllegato: false, err: ''
    } : {
      id: null, tipo: 'spesa', nome: '', categoria: 'altro', importo: '', frequenza: cfg.DEFAULT_FREQUENZA || 'mensile', ogni: 1, unita: 'mesi',
      stagione: '', data: base, promemoria: 3, note: '', allegato: null, file: null, rimuoviAllegato: false, err: ''
    };
    render();
  }

  function chips(name, options, current) {
    return '<div class="chips">' + options.map(function (o) {
      return '<button type="button" class="chip' + (String(o[0]) === String(current) ? ' on' : '') + '" data-set="' + name + '" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function renderForm() {
    var f = state.form;
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet-bg';
    var h = '<div class="sheet"><h2>' + (f.id ? 'Modifica ricorrenza' : 'Nuova ricorrenza') + '</h2>';
    h += '<label class="l">Tipo</label>' + chips('tipo', [['spesa', 'Spesa'], ['manutenzione', 'Manutenzione']], f.tipo);
    h += '<label class="l">Nome</label><input type="text" id="f-nome" value="' + esc(f.nome) + '" placeholder="' + (f.tipo === 'spesa' ? 'Mutuo casa' : 'Pulizia condizionatore') + '">';
    h += '<label class="l">Categoria</label>' + chips('categoria', CATEGORIE, f.categoria);
    h += '<label class="l">Importo (facoltativo)</label><input type="number" inputmode="decimal" step="0.01" id="f-importo" value="' + esc(f.importo) + '" placeholder="640">';
    h += '<label class="l">Ricorrenza</label>' + chips('frequenza', FREQ.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }), f.frequenza);

    if (f.frequenza === 'stagionale') {
      h += '<p class="hint">Scegli una stagione per partire da un mese tipico, poi imposta tu il giorno esatto.</p>' +
        chips('stagione', [['inverno', 'Inverno'], ['primavera', 'Primavera'], ['estate', 'Estate'], ['autunno', 'Autunno']], f.stagione) +
        '<p class="hint">Si ripete ogni anno nello stesso giorno.</p>';
    }
    if (f.frequenza === 'personalizzata') {
      h += '<div class="row"><span style="flex:none">Ogni</span><input type="number" min="1" id="f-ogni" value="' + esc(f.ogni) + '">' +
        '<select id="f-unita">' + [['giorni', 'giorni'], ['settimane', 'settimane'], ['mesi', 'mesi']].map(function (u) {
          return '<option value="' + u[0] + '"' + (f.unita === u[0] ? ' selected' : '') + '>' + u[1] + '</option>';
        }).join('') + '</select></div>';
    }

    h += '<label class="l">Prossima scadenza</label><input type="date" id="f-data" value="' + esc(f.data) + '">';
    h += '<label class="l">Promemoria</label><select id="f-prom">' + PROMEMORIA.map(function (p) {
      return '<option value="' + p[0] + '"' + (Number(f.promemoria) === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('') + '</select>';
    h += '<label class="l">Note</label><textarea id="f-note" placeholder="Numero polizza, riferimenti, contatti">' + esc(f.note) + '</textarea>';

    h += '<label class="l">Allegato</label>';
    if (f.allegato && !f.rimuoviAllegato && !f.file) {
      h += '<div class="row"><button type="button" class="btn" id="f-apri">Apri allegato</button><button type="button" class="btn dng" id="f-rim">Rimuovi</button></div>';
    } else if (f.file) {
      h += '<p class="hint">Pronto da caricare: ' + esc(f.file.name) + '</p>';
    }
    h += '<input type="file" id="f-file" accept="image/*,application/pdf" style="display:none">' +
      '<button type="button" class="btn" id="f-scegli" style="width:100%;margin-top:6px">' + ((f.allegato && !f.rimuoviAllegato) || f.file ? 'Sostituisci foto o documento' : 'Aggiungi foto o documento') + '</button>';

    if (f.err) h += '<p class="err">' + esc(f.err) + '</p>';
    h += '<div class="row" style="margin-top:16px"><button class="btn" id="f-annulla">Annulla</button><button class="btn pri" id="f-salva"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Salvo…' : 'Salva') + '</button></div>';
    if (f.id) h += '<button class="btn dng" id="f-elimina" style="width:100%;margin-top:10px">Elimina ricorrenza</button>';
    h += '</div>';
    bg.innerHTML = h;
    document.body.appendChild(bg);

    bg.addEventListener('click', function (e) { if (e.target === bg) chiudiForm(); });
    Array.prototype.forEach.call(bg.querySelectorAll('[data-set]'), function (b) {
      b.onclick = function () { sync(); impostaCampo(b.getAttribute('data-set'), b.getAttribute('data-v')); riapri(); };
    });
    $('#f-annulla').onclick = chiudiForm;
    $('#f-salva').onclick = salva;
    $('#f-scegli').onclick = function () { $('#f-file').click(); };
    $('#f-file').onchange = function (e) { sync(); var file = e.target.files[0]; if (file) { state.form.file = file; state.form.rimuoviAllegato = false; riapri(); } };
    var ap = $('#f-apri'); if (ap) ap.onclick = apriAllegato;
    var rm = $('#f-rim'); if (rm) rm.onclick = function () { sync(); state.form.rimuoviAllegato = true; riapri(); };
    var el = $('#f-elimina'); if (el) el.onclick = elimina;
  }

  function riapri() { var b = $('#sheet-bg'); if (b) b.remove(); renderForm(); }
  function chiudiForm() { var b = $('#sheet-bg'); if (b) b.remove(); state.form = null; state.busy = false; }

  function sync() {
    var f = state.form;
    f.nome = $('#f-nome').value; f.importo = $('#f-importo').value; f.data = $('#f-data').value;
    f.promemoria = Number($('#f-prom').value); f.note = $('#f-note').value;
    var o = $('#f-ogni'); if (o) f.ogni = Math.max(1, parseInt(o.value, 10) || 1);
    var u = $('#f-unita'); if (u) f.unita = u.value;
  }

  function impostaCampo(nome, v) {
    var f = state.form;
    if (nome === 'tipo') {
      f.tipo = v;
      if (!f.id && v === 'manutenzione' && f.frequenza === (cfg.DEFAULT_FREQUENZA || 'mensile')) f.frequenza = 'stagionale';
      if (!f.id && v === 'spesa' && f.frequenza === 'stagionale') f.frequenza = cfg.DEFAULT_FREQUENZA || 'mensile';
    } else if (nome === 'frequenza') {
      f.frequenza = v;
      if (L.PRESETS[v]) { f.ogni = L.PRESETS[v][0]; f.unita = L.PRESETS[v][1]; }
    } else if (nome === 'stagione') {
      f.stagione = v;
      var d = L.seasonDate(v); if (d) f.data = d;
    } else f[nome] = v;
  }

  function apriAllegato() {
    sb.storage.from('allegati').createSignedUrl(state.form.allegato, 3600).then(function (r) {
      if (r.error) return toast('Non riesco ad aprire l\'allegato.');
      window.open(r.data.signedUrl, '_blank');
    });
  }

  function shrink(file) {
    return new Promise(function (res) {
      if (!/^image\//.test(file.type)) return res({ blob: file, ext: (file.name.split('.').pop() || 'bin').toLowerCase() });
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var r = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); res(b ? { blob: b, ext: 'jpg' } : { blob: file, ext: 'jpg' }); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { res({ blob: file, ext: 'jpg' }); };
      img.src = url;
    });
  }

  function errore(msg) { state.form.err = msg; state.busy = false; riapri(); }

  async function salva() {
    sync();
    var f = state.form;
    if (!f.nome.trim()) return errore('Inserisci un nome.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return errore('Scegli la data della prossima scadenza.');
    var imp = f.importo === '' ? null : Number(String(f.importo).replace(',', '.'));
    if (imp !== null && isNaN(imp)) return errore('L\'importo non è valido.');
    var preset = L.PRESETS[f.frequenza];
    var ogni = preset ? preset[0] : Math.max(1, parseInt(f.ogni, 10) || 1);
    var unita = preset ? preset[1] : f.unita;

    state.busy = true; riapri();
    try {
      var path = f.rimuoviAllegato ? null : f.allegato;
      if (f.file) {
        var s = await shrink(f.file);
        var np = state.user.id + '/' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.' + s.ext;
        var up = await sb.storage.from('allegati').upload(np, s.blob, { contentType: s.blob.type || undefined });
        if (up.error) return errore('Caricamento allegato non riuscito: ' + up.error.message);
        path = np;
      }
      var rec = {
        tipo: f.tipo, nome: f.nome.trim(), categoria: f.categoria, importo: imp, frequenza: f.frequenza, ogni: ogni, unita: unita,
        stagione: f.frequenza === 'stagionale' ? (f.stagione || null) : null, prossima_scadenza: f.data,
        giorno_mese: parseInt(f.data.slice(8), 10), promemoria_giorni: f.promemoria, note: f.note.trim() || null, allegato_path: path
      };
      var r = f.id ? await sb.from('ricorrenze').update(rec).eq('id', f.id) : await sb.from('ricorrenze').insert(rec);
      if (r.error) return errore('Salvataggio non riuscito: ' + r.error.message);
      if (f.allegato && (f.rimuoviAllegato || f.file)) sb.storage.from('allegati').remove([f.allegato]);
      chiudiForm();
      await caricaTutto();
      toast('Salvata');
    } catch (e) {
      errore('Qualcosa è andato storto: ' + (e && e.message ? e.message : e));
    }
  }

  async function elimina() {
    var f = state.form;
    if (!window.confirm('Eliminare "' + f.nome + '"? Anche lo storico verrà cancellato.')) return;
    var r = await sb.from('ricorrenze').delete().eq('id', f.id);
    if (r.error) return errore('Eliminazione non riuscita: ' + r.error.message);
    if (f.allegato) sb.storage.from('allegati').remove([f.allegato]);
    chiudiForm();
    await caricaTutto();
    toast('Eliminata');
  }

  init();
})();
