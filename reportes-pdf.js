/* ═══════════════════════════════════════════════════════════════════════
   Informe de Facturación (sección REPORTES) → PDF A4
   SOLO PRESENTACIÓN: recibe los valores ya calculados por la pantalla
   (totales, IBC, variación, entidades, comparativo) y NO recalcula nada.
   Identidad visual: logo, color y títulos del perfil de cada cliente.
═══════════════════════════════════════════════════════════════════════ */
(function (g) {
  const MESES_C = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const hexRGB = h => { const n = parseInt(String(h || '#1a3a6b').replace('#',''), 16) || 0x1a3a6b; return [(n>>16)&255, (n>>8)&255, n&255]; };
  const mezcla = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const BLANCO = [255,255,255], NEGRO = [0,0,0], GRIS = [100,116,139], TEXTO = [15,23,42];
  const VERDE = [22,163,74], ROJO = [220,38,38], NARANJA = [234,88,12], AZUL = [21,101,192];

  // Mismo formato de pesos que la pantalla ("$ 66.617.411")
  function fmtCOP(v){ const n = Math.round(Number(v) || 0); return (n < 0 ? '-$ ' : '$ ') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtCorto(v){ const n = Number(v) || 0;
    return n >= 1e9 ? '$' + (n/1e9).toFixed(1) + 'B' : n >= 1e6 ? '$' + (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(0) + 'K' : '$' + n; }
  function limpio(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function repNombreArchivo(d){
    return 'Informe_Facturacion_' + (limpio(d.cliente) || 'General') + '_' + limpio(d.mes) + '_' + limpio(d.anio) + '.pdf';
  }

  function repGenerarPDF(JsPDF, d){
    const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true });
    const W = 210, H = 297, M = 12, CW = W - 2*M;
    const C = hexRGB(d.color), OSC = mezcla(C, NEGRO, 0.28), SUAVE = mezcla(C, BLANCO, 0.9), CLARO = mezcla(C, BLANCO, 0.55);

    const barra = (y, h) => { const n = 80;
      for (let i = 0; i < n; i++){ doc.setFillColor(...mezcla(OSC, CLARO, i/(n-1))); doc.rect(W*i/n, y, W/n + 0.3, h, 'F'); } };
    const triangulo = (x, y, sube, color) => { doc.setFillColor(...color);
      if (sube) doc.triangle(x, y, x + 2.4, y, x + 1.2, y - 2.1, 'F'); else doc.triangle(x, y - 2.1, x + 2.4, y - 2.1, x + 1.2, y, 'F'); };
    const banda = (y, texto) => {                               // título de sección
      doc.setFillColor(...OSC); doc.roundedRect(M, y, CW, 8, 1.6, 1.6, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...BLANCO);
      doc.setCharSpace(0.4); doc.text(texto.toUpperCase(), M + 4, y + 5.3); doc.setCharSpace(0);
      return y + 8;
    };
    let y = 0;
    const asegurar = h => { if (y + h > H - 16){ doc.addPage(); y = 20; } };

    // ── Encabezado (página 1) ──
    barra(0, 2.4);
    if (d.logo && d.logo.data){
      const bw = 42, bh = 20, r = d.logo.w / d.logo.h;           // encaja el logo sin deformarlo
      let w = bw, h = bw / r; if (h > bh){ h = bh; w = bh * r; }
      doc.addImage(d.logo.data, 'PNG', M, 9 + (bh - h)/2, w, h, 'logoCliente', 'SLOW');
    } else {
      doc.setFillColor(...C); doc.roundedRect(M, 9, 20, 20, 3, 3, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...BLANCO);
      doc.text('BOE', M + 10, 20.6, { align:'center' });
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(...OSC);
    doc.text(String(d.titulo || ''), W - M, 15, { align:'right' });
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(...GRIS);
    doc.text(String(d.subtitulo || ''), W - M, 20.5, { align:'right' });
    if (d.cliente){ doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(...C); doc.text(String(d.cliente), W - M, 26, { align:'right' }); }
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text('Año: ' + d.anio + '   ·   Fecha de corte: ' + d.mes + '   ·   Generado el ' + d.fechaGen, W - M, 31, { align:'right' });
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(M, 34.5, W - M, 34.5);

    // ── Tarjetas (mismos datos que la pantalla) ──
    y = 38.5;
    const gap = 4, cw = (CW - 2*gap) / 3, ch = 42;
    const tarjeta = (i, acento, etiqueta) => {
      const x = M + i*(cw + gap);
      doc.setFillColor(...SUAVE); doc.roundedRect(x, y, cw, ch, 2.2, 2.2, 'F');
      doc.setFillColor(...acento); doc.rect(x + 2.2, y, cw - 4.4, 1.2, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(...GRIS);
      doc.setCharSpace(0.5); doc.text(etiqueta, x + 4, y + 7); doc.setCharSpace(0);
      return x;
    };
    const fila = (x, yy, lbl, val, colorVal, negrita, tri) => {
      doc.setFont('helvetica','normal'); doc.setFontSize(7.8); doc.setTextColor(...GRIS); doc.text(lbl, x + 4, yy);
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(negrita ? 9.2 : 8.2); doc.setTextColor(...(colorVal || TEXTO));
      doc.text(val, x + cw - 4, yy, { align:'right' });
      if (tri !== undefined && tri !== null) triangulo(x + cw - 4 - doc.getTextWidth(val) - 3.4, yy - 0.3, tri, colorVal);
    };
    // 1. Valor del mes
    let x = tarjeta(0, C, 'VALOR MES ACTUAL');
    doc.setFont('helvetica','bold'); doc.setFontSize(15.5); doc.setTextColor(...TEXTO); doc.text(fmtCOP(d.totalFilt), x + 4, y + 16);
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.2); doc.line(x + 4, y + 20, x + cw - 4, y + 20);
    fila(x, y + 26, 'Mes anterior', fmtCOP(d.totalAnt));
    if (d.pct !== null && d.pct !== undefined){
      const col = d.diff > 0 ? VERDE : d.diff < 0 ? ROJO : GRIS, sube = d.diff > 0 ? true : d.diff < 0 ? false : null;
      fila(x, y + 32, 'Variación %', Math.abs(d.pct).toFixed(2) + '%', col, true, sube);
      fila(x, y + 38, 'Diferencia', fmtCOP(Math.abs(d.diff)), col, false, sube);
    } else {
      doc.setFont('helvetica','italic'); doc.setFontSize(7.2); doc.setTextColor(...GRIS);
      doc.text('Selecciona año y mes para ver la variación', x + 4, y + 33);
    }
    // 2. IBC
    x = tarjeta(1, NARANJA, 'CÁLCULO IBC MENSUAL');
    doc.setFont('helvetica','bold'); doc.setFontSize(15.5); doc.setTextColor(...TEXTO);
    doc.text(d.mesLbl || 'Todos los meses', x + 4, y + 16);
    doc.setDrawColor(226,232,240); doc.line(x + 4, y + 20, x + cw - 4, y + 20);
    fila(x, y + 26, 'Vr. Facturado', fmtCOP(d.totalFilt));
    fila(x, y + 33, 'IBC (40%)', fmtCOP(d.ibc), AZUL, true);
    // 3. Portal
    x = tarjeta(2, AZUL, 'PORTAL');
    const c3 = d.card3 || {};
    const url = String(c3.url || '');
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
    const urlTxt = doc.splitTextToSize(url || '—', cw - 8)[0];
    if (url) doc.textWithLink(urlTxt, x + 4, y + 15, { url: url.startsWith('http') ? url : 'https://' + url }); else doc.text('—', x + 4, y + 15);
    doc.setDrawColor(226,232,240); doc.line(x + 4, y + 20, x + cw - 4, y + 20);
    fila(x, y + 26, 'Usuario', String(c3.usuario || '—'), TEXTO, true);
    fila(x, y + 33, 'Clave', String(c3.clave || '—'), TEXTO, true);
    y += ch + 7;

    // ── Valor facturado por entidad (tabla con barra: ningún valor queda cortado) ──
    y = banda(y, 'Valor facturado por entidad' + (d.mesLbl ? ': ' + d.mesLbl : ''));
    const ent = d.entData || [];
    if (!ent.length){
      doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(...GRIS);
      doc.text('Sin datos para el período', W/2, y + 9, { align:'center' }); y += 16;
    } else {
      const max = Math.max(...ent.map(e => e.v), 1), total = ent.reduce((s, e) => s + e.v, 0);
      doc.autoTable({
        startY: y + 1, margin: { top: 20, left: M, right: M, bottom: 16 },
        head: [['#', 'Entidad', 'Participación', '%', 'Valor facturado']],
        body: ent.map((e, i) => [i + 1, e.l, '', total ? (e.v/total*100).toFixed(1) + '%' : '—', fmtCOP(e.v)]),
        foot: [[{ content:'TOTAL', colSpan:4, styles:{ halign:'right' } }, fmtCOP(total)]],
        showHead:'everyPage', showFoot:'lastPage', rowPageBreak:'avoid', theme:'plain',
        styles: { font:'helvetica', fontSize:8.5, cellPadding:{ top:2.2, bottom:2.2, left:2.2, right:2.2 }, textColor:TEXTO, valign:'middle', overflow:'linebreak', lineColor:[232,236,244], lineWidth:{ bottom:0.2 } },
        headStyles: { fillColor:SUAVE, textColor:OSC, fontStyle:'bold', fontSize:7.8 },
        footStyles: { fillColor:OSC, textColor:BLANCO, fontStyle:'bold', fontSize:10, cellPadding:{ top:3, bottom:3, left:2.2, right:2.2 } },
        columnStyles: { 0:{ cellWidth:8, textColor:GRIS }, 1:{ cellWidth:'auto', fontStyle:'bold' }, 2:{ cellWidth:48 }, 3:{ cellWidth:15, halign:'right', textColor:GRIS }, 4:{ cellWidth:33, halign:'right', fontStyle:'bold' } },
        didParseCell: c => { if (c.section === 'head' && (c.column.index === 3 || c.column.index === 4)) c.cell.styles.halign = 'right'; },
        didDrawCell: c => {
          if (c.section !== 'body' || c.column.index !== 2) return;
          const e = ent[c.row.index], w = Math.max((c.cell.width - 4) * e.v / max, 0.8);
          doc.setFillColor(...mezcla(C, BLANCO, 0.88)); doc.roundedRect(c.cell.x + 2, c.cell.y + c.cell.height/2 - 1.8, c.cell.width - 4, 3.6, 1.2, 1.2, 'F');
          doc.setFillColor(...C); doc.roundedRect(c.cell.x + 2, c.cell.y + c.cell.height/2 - 1.8, w, 3.6, 1.2, 1.2, 'F');
        },
      });
      y = doc.lastAutoTable.finalY + 7;
    }

    // ── Comparativo anual (gráfico vectorial + tabla mes a mes) ──
    const A = d.compA || [], B = d.compC || [];
    asegurar(8 + 62);
    y = banda(y, 'Comparativo anual ' + d.yA + ' vs ' + d.yC);
    const gx = M + 16, gw = CW - 18, gy = y + 9, gh = 44, maxV = Math.max(...A, ...B, 1);
    // leyenda
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    [[CLARO, String(d.yA)], [C, String(d.yC)]].forEach(([col, t], i) => {
      const lx = W - M - 34 + i*17; doc.setFillColor(...col); doc.roundedRect(lx, y + 3.2, 3, 3, 0.6, 0.6, 'F');
      doc.setTextColor(...TEXTO); doc.text(t, lx + 4.2, y + 5.7);
    });
    // rejilla
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...GRIS); doc.setDrawColor(236,240,245); doc.setLineWidth(0.2);
    for (let k = 0; k <= 4; k++){ const yy = gy + gh - gh*k/4; doc.line(gx, yy, gx + gw, yy); doc.text(fmtCorto(maxV*k/4), gx - 2, yy + 1, { align:'right' }); }
    const gw12 = gw / 12, bw = Math.min(gw12 * 0.3, 5);
    for (let m = 0; m < 12; m++){
      const cx = gx + gw12*m + gw12/2;
      [[A[m] || 0, CLARO, -bw - 0.4], [B[m] || 0, C, 0.4]].forEach(([v, col, dx]) => {
        if (!v) return; const h = gh * v / maxV;
        doc.setFillColor(...col); doc.roundedRect(cx + dx, gy + gh - h, bw, h, 0.8, 0.8, 'F');
      });
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...GRIS); doc.text(MESES_C[m], cx, gy + gh + 4.5, { align:'center' });
    }
    y = gy + gh + 9;
    // Tabla mes a mes en dos columnas (Ene–Jun | Jul–Dic): mitad de alto, cabe junto al gráfico
    asegurar(46);
    const mitad = (CW - 4) / 2, yTabla = y;
    [[0, M, M + mitad + 4], [6, M + mitad + 4, M]].forEach(([desde, izq, der]) => {
      doc.autoTable({
        startY: yTabla, margin: { top: 20, left: izq, right: der, bottom: 16 }, tableWidth: mitad,
        head: [['Mes', String(d.yA), String(d.yC)]],
        body: MESES_C.slice(desde, desde + 6).map((m, k) => { const i = desde + k; return [m, A[i] ? fmtCOP(A[i]) : '—', B[i] ? fmtCOP(B[i]) : '—']; }),
        rowPageBreak:'avoid', theme:'plain',
        styles: { font:'helvetica', fontSize:8, cellPadding:{ top:1.6, bottom:1.6, left:2, right:2 }, textColor:TEXTO, lineColor:[232,236,244], lineWidth:{ bottom:0.2 } },
        headStyles: { fillColor:SUAVE, textColor:OSC, fontStyle:'bold', fontSize:7.6 },
        alternateRowStyles: { fillColor:[250,251,253] },
        columnStyles: { 0:{ cellWidth:'auto', fontStyle:'bold' }, 1:{ cellWidth:30, halign:'right', textColor:GRIS }, 2:{ cellWidth:30, halign:'right', fontStyle:'bold' } },
        didParseCell: c => { if (c.section === 'head' && c.column.index > 0) c.cell.styles.halign = 'right'; },
      });
    });

    // ── Encabezado reducido (pág. 2+) y pie en todas ──
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++){
      doc.setPage(p);
      if (p > 1){
        barra(0, 1.6);
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...OSC); doc.text(String(d.titulo || ''), M, 10.5);
        doc.setFont('helvetica','normal'); doc.setTextColor(...GRIS);
        doc.text([d.cliente, d.mes + ' ' + d.anio].filter(Boolean).join('  —  '), W - M, 10.5, { align:'right' });
      }
      doc.setDrawColor(226,232,240); doc.setLineWidth(0.25); doc.line(M, H - 11, W - M, H - 11);
      doc.setFont('helvetica','bold'); doc.setFontSize(7.2); doc.setTextColor(...C); doc.text(String(d.titulo || ''), M, H - 6.5);
      const anchoTitulo = doc.getTextWidth(String(d.titulo || ''));      // se mide en negrita, como se imprimió
      doc.setFont('helvetica','normal'); doc.setTextColor(...GRIS);
      doc.text('·  ' + String(d.subtitulo || ''), M + anchoTitulo + 2, H - 6.5);
      doc.text('Página ' + p + ' de ' + n, W - M, H - 6.5, { align:'right' });
    }
    return doc;
  }

  /* Prepara el logo del perfil (cualquier formato) como PNG con sus dimensiones reales */
  function repCargarLogo(src){
    return new Promise(res => {
      if (!src) return res(null);
      const img = new Image();
      img.onload = () => { try {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        res({ data: cv.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
      } catch (e) { res(null); } };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  const api = { repGenerarPDF, repNombreArchivo, repCargarLogo, repFmtCOP: fmtCOP };
  Object.assign(g, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
