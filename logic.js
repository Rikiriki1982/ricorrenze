(function (root) {
  var PRESETS = {
    mensile: [1, 'mesi'],
    bimestrale: [2, 'mesi'],
    trimestrale: [3, 'mesi'],
    semestrale: [6, 'mesi'],
    annuale: [12, 'mesi'],
    stagionale: [12, 'mesi']
  };
  var STAGIONI = { inverno: 12, primavera: 4, estate: 6, autunno: 10 };

  function pad(n) { return String(n).padStart(2, '0'); }
  function parse(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fmt(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(s, n) {
    var d = parse(s);
    d.setUTCDate(d.getUTCDate() + n);
    return fmt(d);
  }

  function addInterval(s, ogni, unita, giornoMese) {
    var d = parse(s);
    if (unita === 'giorni') { d.setUTCDate(d.getUTCDate() + ogni); return fmt(d); }
    if (unita === 'settimane') { d.setUTCDate(d.getUTCDate() + 7 * ogni); return fmt(d); }
    var day = giornoMese || d.getUTCDate();
    var m = d.getUTCMonth() + ogni;
    var y = d.getUTCFullYear() + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return fmt(new Date(Date.UTC(y, m, Math.min(day, last))));
  }

  function daysUntil(s, from) {
    return Math.round((parse(s) - parse(from || today())) / 86400000);
  }

  // Scadenze dell'elemento comprese tra from e to (estremi inclusi), a partire da prossima_scadenza
  function occurrences(item, from, to) {
    var out = [], cur = item.prossima_scadenza, n = 0;
    while (cur <= to && n < 2000) {
      if (cur >= from) out.push(cur);
      cur = addInterval(cur, item.ogni, item.unita, item.giorno_mese);
      n++;
    }
    return out;
  }

  function perYear(item) {
    if (item.unita === 'mesi') return 12 / item.ogni;
    if (item.unita === 'settimane') return 52 / item.ogni;
    return 365 / item.ogni;
  }

  function annualCost(item) {
    if (item.importo == null || item.importo === '') return 0;
    return Number(item.importo) * perYear(item);
  }

  // Prima data utile (dal giorno 1 del mese tipico della stagione) a partire da oggi
  function seasonDate(stagione, from) {
    var month = STAGIONI[stagione];
    if (!month) return null;
    var t = parse(from || today());
    var y = t.getUTCFullYear();
    var cand = y + '-' + pad(month) + '-01';
    if (cand < fmt(t)) cand = (y + 1) + '-' + pad(month) + '-01';
    return cand;
  }

  function label(item) {
    if (item.frequenza === 'personalizzata') {
      var u = { giorni: ['giorno', 'giorni'], settimane: ['settimana', 'settimane'], mesi: ['mese', 'mesi'] }[item.unita];
      return item.ogni === 1 ? 'Ogni ' + u[0] : 'Ogni ' + item.ogni + ' ' + u[1];
    }
    if (item.frequenza === 'stagionale') {
      return 'Stagionale' + (item.stagione ? ' · ' + item.stagione : '');
    }
    return item.frequenza.charAt(0).toUpperCase() + item.frequenza.slice(1);
  }

  var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  // Livello di urgenza di una data: late (scaduta o oggi), soon (entro il promemoria), far (oltre 90 giorni), normal
  function urgencyOf(dateStr, promemoria, from) {
    var d = daysUntil(dateStr, from);
    if (d <= 0) return 'late';
    if (d <= (promemoria || 0)) return 'soon';
    if (d > 90) return 'far';
    return 'normal';
  }

  function urgency(item, from) { return urgencyOf(item.prossima_scadenza, item.promemoria_giorni, from); }

  // Ultimo giorno del mese che chiude una finestra di n mesi a partire da `from`
  function windowEnd(from, n) {
    var d = parse(from), m = d.getUTCMonth() + n, y = d.getUTCFullYear() + Math.floor(m / 12);
    m = m % 12;
    return fmt(new Date(Date.UTC(y, m, 0)));
  }

  // Tutte le scadenze nella finestra, in ordine di data. Una scadenza già passata compare una sola volta (overdue)
  function events(items, from, n) {
    var end = windowEnd(from, n), out = [];
    items.forEach(function (it) {
      if (it.prossima_scadenza < from) out.push({ date: it.prossima_scadenza, item: it, overdue: true });
      occurrences(it, from, end).forEach(function (d) { out.push({ date: d, item: it, overdue: false }); });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  // Chiave del mese (AAAA-MM) a cui assegnare l'evento: le scadenze passate contano nel mese corrente
  function monthKeyOf(e, from) { return (e.overdue ? from : e.date).slice(0, 7); }

  // Totali per mese e per categoria su n mesi
  function monthlyTotals(items, from, n) {
    var d0 = parse(from), months = [], idx = {};
    for (var i = 0; i < n; i++) {
      var m = d0.getUTCMonth() + i, y = d0.getUTCFullYear() + Math.floor(m / 12);
      m = m % 12;
      var key = y + '-' + pad(m + 1);
      var mo = { key: key, year: y, month: m, full: MESI[m], initial: MESI[m].charAt(0), total: 0, byCat: {}, count: 0 };
      months.push(mo); idx[key] = mo;
    }
    events(items, from, n).forEach(function (e) {
      var mo = idx[monthKeyOf(e, from)];
      if (!mo) return;
      mo.count++;
      if (e.item.importo != null && e.item.importo !== '') {
        var v = Number(e.item.importo);
        mo.total += v;
        mo.byCat[e.item.categoria] = (mo.byCat[e.item.categoria] || 0) + v;
      }
    });
    return months;
  }

  var MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  var GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  function monthRange(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1;
    return [key + '-01', fmt(new Date(Date.UTC(y, m + 1, 0)))];
  }

  function daysInMonth(key) { return +monthRange(key)[1].slice(8); }

  // 0 = lunedì ... 6 = domenica
  function weekdayMon(dateStr) { return (parse(dateStr).getUTCDay() + 6) % 7; }

  function shiftMonth(key, delta) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }

  function monthName(key) { return MESI[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }

  // Scadenze che cadono nel mese indicato (AAAA-MM), in ordine di data
  function monthEvents(items, key) {
    var r = monthRange(key), out = [];
    items.forEach(function (it) {
      occurrences(it, r[0], r[1]).forEach(function (d) { out.push({ date: d, item: it }); });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  // Scadenze già passate e non ancora segnate come fatte
  function overdueItems(items, from) {
    return items.filter(function (it) { return it.prossima_scadenza < from; })
      .sort(function (a, b) { return a.prossima_scadenza < b.prossima_scadenza ? -1 : 1; });
  }

  // Totale per categoria su n mesi (somma di monthlyTotals)
  function categoryTotals(items, from, n) {
    var tot = {}, sum = 0;
    monthlyTotals(items, from, n).forEach(function (m) {
      Object.keys(m.byCat).forEach(function (c) { tot[c] = (tot[c] || 0) + m.byCat[c]; sum += m.byCat[c]; });
    });
    return { byCat: tot, total: sum };
  }

  var api = {
    MESI_BREVI: MESI_BREVI, GIORNI_BREVI: GIORNI_BREVI, monthRange: monthRange, daysInMonth: daysInMonth,
    weekdayMon: weekdayMon, shiftMonth: shiftMonth, monthName: monthName, monthEvents: monthEvents,
    overdueItems: overdueItems, categoryTotals: categoryTotals,
    PRESETS: PRESETS, STAGIONI: STAGIONI, MESI: MESI, parse: parse, fmt: fmt, today: today,
    addDays: addDays, addInterval: addInterval, daysUntil: daysUntil,
    occurrences: occurrences, annualCost: annualCost, perYear: perYear,
    seasonDate: seasonDate, label: label,
    urgencyOf: urgencyOf, urgency: urgency, windowEnd: windowEnd, events: events,
    monthKeyOf: monthKeyOf, monthlyTotals: monthlyTotals
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RicLogic = api;
})(typeof window !== 'undefined' ? window : this);
