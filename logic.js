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
    while (cur <= to && n < 800) {
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

  var api = {
    PRESETS: PRESETS, STAGIONI: STAGIONI, parse: parse, fmt: fmt, today: today,
    addDays: addDays, addInterval: addInterval, daysUntil: daysUntil,
    occurrences: occurrences, annualCost: annualCost, perYear: perYear,
    seasonDate: seasonDate, label: label
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RicLogic = api;
})(typeof window !== 'undefined' ? window : this);
