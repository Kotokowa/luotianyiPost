import { channels } from './paint-core.js';
import { BEAD_PALETTE, BEAD_PALETTE_ID } from './bead-palette.js';
import { nearestBead, summarizeBeads, beadCsv } from './bead-core.js';

export function initBeadRoom({ dialog, art, sample, hasImage, finish, render, fit, save, setColor, download, status, initial }) {
  const $ = selector => dialog.querySelector(selector);
  const toggle = $('#bead-mode'), panel = $('#bead-preview-panel'), sourceCanvas = $('#bead-source'), resultCanvas = $('#bead-result');
  const overlay = $('#bead-protection'), sourceCtx = sourceCanvas.getContext('2d'), resultCtx = resultCanvas.getContext('2d');
  let sourceKind = 'image', source = null, result = null, regions = [], drag = null, worker = null, timer = null, revision = 0, summarySignature = '';
  const paletteButtons = new Map();

  function enabled() { return toggle.checked; }
  function info() { return { enabled: enabled(), palette: BEAD_PALETTE_ID }; }
  function current(color) {
    const bead = nearestBead(color);
    $('#bead-current').textContent = `${bead.code} · ${bead.hex.toUpperCase()}`;
    return bead;
  }
  function snap(color) { return enabled() ? current(color).color : color; }
  function drawPixels(canvas, context, pixels, width, height) {
    const data = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach((color, index) => data.set(channels(color), index * 4));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.putImageData(new ImageData(data, width, height), 0, 0);
  }
  function showRegions() {
    overlay.replaceChildren();
    for (const region of [...regions, ...(drag ? [drag.region] : [])]) {
      const rectangle = document.createElement('span');
      rectangle.style.left = `${region.x * 100}%`;rectangle.style.top = `${region.y * 100}%`;
      rectangle.style.width = `${region.width * 100}%`;rectangle.style.height = `${region.height * 100}%`;
      overlay.append(rectangle);
    }
    $('#bead-clear-protection').disabled = !regions.length;
  }
  function invalidate() {
    revision++;clearTimeout(timer);result = null;$('#bead-apply').disabled = true;
    worker?.terminate();worker = null;
    panel.setAttribute('aria-busy', 'false');
  }
  function closePreview() {
    invalidate();panel.hidden = true;dialog.classList.remove('bead-reviewing');drag = null;
  }
  function preview(kind = sourceKind, resetRegions = false) {
    if (!enabled()) return;
    sourceKind = kind;
    invalidate();
    try { source = sample(sourceKind); }
    catch (error) { $('#bead-preview-status').textContent = error.message;status(error.message);return; }
    if (!source) return;
    if (resetRegions) regions = [];
    panel.hidden = false;dialog.classList.add('bead-reviewing');
    status('调整参数后预览；点击「应用到画布」确认转换。');
    if (sourceCanvas.width !== source.width) sourceCanvas.width = source.width;
    if (sourceCanvas.height !== source.height) sourceCanvas.height = source.height;
    sourceCtx.putImageData(new ImageData(source.data.slice(), source.width, source.height), 0, 0);
    panel.setAttribute('aria-busy', 'true');
    $('#bead-preview-status').textContent = '正在配色，完成后更新预览…';
    showRegions();
    const id = revision;
    timer = setTimeout(() => {
      try {
        worker = new Worker(new URL('./bead-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data: response }) => {
          if (response.id !== revision || !enabled()) return;
          worker?.terminate();worker = null;
          panel.setAttribute('aria-busy', 'false');
          if (response.error) { $('#bead-preview-status').textContent = response.error;return; }
          result = { ...response.result, width: source.width, height: source.height };
          drawPixels(resultCanvas, resultCtx, result.pixels, result.width, result.height);
          $('#bead-preview-status').textContent = `${result.width} × ${result.height} 格 · ${result.used.length} 色 · ${result.total} 颗${regions.length ? ` · ${regions.length} 处细节保护` : ''}`;
          $('#bead-apply').disabled = false;
        };
        worker.onerror = () => {
          if (id !== revision) return;
          panel.setAttribute('aria-busy', 'false');
          $('#bead-preview-status').textContent = '配色失败，请重新预览。';
          worker?.terminate();worker = null;
        };
        worker.postMessage({ id, ...source, options: {
          maxColors: +$('#bead-max-colors').value, shading: $('#bead-shading').value,
          merge: $('#bead-merge').value, cleanup: +$('#bead-cleanup').value,
          preserveDetails: $('#bead-details').checked, regions
        } });
      } catch {
        panel.setAttribute('aria-busy', 'false');
        $('#bead-preview-status').textContent = '浏览器不支持后台配色，请更新浏览器后重试。';
      }
    }, 100);
  }
  function changeMode() {
    const active = enabled();
    $('#bead-options').hidden = !active;$('#bead-color-box').hidden = !active;
    $('#bead-current').hidden = !active;$('#bead-export-chart').hidden = !active;$('#bead-export-csv').hidden = !active;
    $('#normal-import-colors').hidden = active;
    $('#paint-reimport').textContent = active ? '预览拼豆配色' : '应用导入设置';
    if (!active) closePreview();
    setColor(+$('#color-chip').dataset.color || 0x66ccffff);
    render();save();
    status(active ? '拼豆模式已开启：可导入图片或转换当前画稿。' : '已切换到自由配色模式');
    if (active && hasImage()) preview('image', true);
  }
  toggle.addEventListener('change', changeMode);
  for (const input of dialog.querySelectorAll('[data-bead-option]')) input.addEventListener('change', () => { if (!panel.hidden) preview(); });
  for (const input of [$('#import-width'), $('#import-height')]) input.addEventListener('change', () => { if (!panel.hidden && sourceKind === 'image') preview(); });
  $('#bead-from-canvas').addEventListener('click', () => { finish();preview('canvas', true); });
  $('#bead-cancel').addEventListener('click', () => { closePreview();status('已取消预览，画布内容未改变。'); });
  $('#bead-clear-protection').addEventListener('click', () => { regions = [];showRegions();preview(); });
  $('#bead-apply').addEventListener('click', () => {
    if (!result || !enabled()) return;
    finish();art.replace(result.width, result.height, result.pixels);closePreview();render();fit();save();
    status('拼豆配色已应用，可继续逐格编辑。');
  });
  function point(event) {
    const rect = sourceCanvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1 - Number.EPSILON, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1 - Number.EPSILON, (event.clientY - rect.top) / rect.height)) };
  }
  function selection(a, b) {
    const x0 = Math.floor(Math.min(a.x, b.x) * source.width), y0 = Math.floor(Math.min(a.y, b.y) * source.height);
    const x1 = Math.min(source.width, Math.floor(Math.max(a.x, b.x) * source.width) + 1), y1 = Math.min(source.height, Math.floor(Math.max(a.y, b.y) * source.height) + 1);
    return { x: x0 / source.width, y: y0 / source.height, width: (x1 - x0) / source.width, height: (y1 - y0) / source.height };
  }
  sourceCanvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !source) return;
    event.preventDefault();sourceCanvas.setPointerCapture(event.pointerId);
    const start = point(event);drag = { id: event.pointerId, start, region: selection(start, start) };showRegions();
  });
  sourceCanvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.region = selection(drag.start, point(event));showRegions();
  });
  sourceCanvas.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.region = selection(drag.start, point(event));regions.push(drag.region);drag = null;showRegions();preview();
  });
  for (const event of ['pointercancel', 'lostpointercapture']) sourceCanvas.addEventListener(event, () => { drag = null;showRegions(); });

  for (const bead of BEAD_PALETTE) {
    const button = document.createElement('button');button.type = 'button';button.textContent = bead.code;
    button.style.backgroundColor = bead.hex;button.style.color = ink(bead.color);
    button.title = `${bead.code} · ${bead.hex.toUpperCase()}`;button.setAttribute('aria-label', `使用拼豆 ${bead.code} ${bead.hex}`);
    button.addEventListener('click', () => setColor(bead.color));
    $('#bead-palette').append(button);paletteButtons.set(bead.code, button);
  }
  $('#bead-search').addEventListener('input', () => {
    const search = $('#bead-search').value.trim().toLowerCase();let matches = 0;
    for (const bead of BEAD_PALETTE) {
      const button = paletteButtons.get(bead.code);
      const match = /^[a-hm]\d+$/i.test(search) ? bead.code.toLowerCase() === search : /^[a-hm]$/i.test(search) ? bead.family.toLowerCase() === search : `${bead.code} ${bead.hex}`.toLowerCase().includes(search);
      button.hidden = !match;if (match) matches++;
    }
    $('#bead-search-empty').hidden = matches > 0;
  });
  function refresh() {
    if (!enabled()) return;
    const summary = summarizeBeads(art.pixels);
    const signature = `${summary.total}:${summary.unmatched}:${summary.used.map(bead => `${bead.code}:${bead.count}`).join(',')}`;
    if (signature === summarySignature) return;
    summarySignature = signature;
    $('#bead-count').textContent = `${summary.used.length} 色 · ${summary.total} 颗`;
    $('#bead-unmatched').hidden = !summary.unmatched;
    $('#bead-unmatched').textContent = `${summary.unmatched} 格尚未匹配色卡，请先转换当前画稿，再导出图纸。`;
    const used = new Map(summary.used.map(bead => [bead.code, bead.count]));
    for (const [code, button] of paletteButtons) {
      const count = used.get(code) || 0;button.dataset.used = String(count > 0);
      button.title = `${code} · ${BEAD_PALETTE.find(bead => bead.code === code).hex.toUpperCase()}${count ? ` · ${count} 颗` : ''}`;
    }
    $('#bead-used').replaceChildren();
    for (const bead of summary.used) {
      const button = document.createElement('button');button.type = 'button';
      const chip = document.createElement('i');chip.style.backgroundColor = bead.hex;
      button.append(chip, `${bead.code} × ${bead.count}`);button.addEventListener('click', () => setColor(bead.color));$('#bead-used').append(button);
    }
  }
  $('#bead-export-csv').addEventListener('click', () => {
    finish();
    try { download(new Blob([beadCsv(art.pixels)], { type: 'text/csv;charset=utf-8' }), `小洛的拼豆用量清单-${art.width}x${art.height}.csv`);status('CSV 用量清单已导出'); }
    catch (error) { status(error.message); }
  });
  $('#bead-export-chart').addEventListener('click', () => {
    finish();const summary = summarizeBeads(art.pixels);
    if (summary.unmatched) { status('存在未匹配色卡的颜色，请先转换当前画稿。');return; }
    if (!summary.total) { status('画布为空，请先绘制或导入图片。');return; }
    try {
      const output = drawBeadChart(art.width, art.height, art.pixels, summary);
      output.toBlob(blob => { if (!blob) { status('图纸导出失败，请重试。');return; }download(blob, `小洛的拼豆图纸-${art.width}x${art.height}.png`);status('PNG 色号图纸已导出，包含用量表。'); }, 'image/png');
    } catch { status('图纸导出失败，请尝试减小画布尺寸。'); }
  });
  toggle.checked = initial?.enabled === true && initial?.palette === BEAD_PALETTE_ID;
  const active = enabled();
  for (const selector of ['#bead-options', '#bead-color-box', '#bead-current', '#bead-export-chart', '#bead-export-csv']) $(selector).hidden = !active;
  $('#normal-import-colors').hidden = active;$('#paint-reimport').textContent = active ? '预览拼豆配色' : '应用导入设置';
  return { enabled, info, snap, preview, refresh, closePreview,
    restore(value) { toggle.checked = value?.enabled === true && value?.palette === BEAD_PALETTE_ID;changeMode(); }
  };
}

function ink(color) {
  const [r, g, b] = channels(color);return r * .299 + g * .587 + b * .114 > 155 ? '#18364c' : '#ffffff';
}

export function drawBeadChart(width, height, pixels, summary = summarizeBeads(pixels)) {
  const cell = Math.max(width, height) > 128 ? 20 : 28, margin = 46, top = 105;
  const output = document.createElement('canvas');output.width = Math.max(680, width * cell + margin * 2);
  const columns = Math.max(1, Math.floor((output.width - margin * 2) / 120));
  const legendTop = top + height * cell + 58;
  output.height = legendTop + Math.ceil(summary.used.length / columns) * 29 + 52;
  const ctx = output.getContext('2d');ctx.fillStyle = '#ffffff';ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = '#174b69';ctx.font = 'bold 23px sans-serif';ctx.fillText('小洛的拼豆图纸', margin, 35);
  ctx.font = '14px sans-serif';ctx.fillText(`${width} × ${height} 格  ·  ${summary.used.length} 色  ·  ${summary.total} 颗  ·  空白格不放豆`, margin, 65);
  ctx.textAlign = 'center';ctx.textBaseline = 'middle';
  const lookup = new Map(BEAD_PALETTE.map(entry => [entry.color, entry]));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bead = lookup.get(pixels[y * width + x]), left = margin + x * cell, up = top + y * cell;
    if (bead) {
      ctx.fillStyle = bead.hex;ctx.fillRect(left, up, cell, cell);ctx.fillStyle = ink(bead.color);
      ctx.font = `bold ${cell > 20 ? 9 : 7}px sans-serif`;ctx.fillText(bead.code, left + cell / 2, up + cell / 2);
    }
    ctx.strokeStyle = '#174b6935';ctx.lineWidth = .5;ctx.strokeRect(left, up, cell, cell);
  }
  ctx.fillStyle = '#174b69';ctx.font = '10px sans-serif';
  for (let x = 0; x < width; x++) if (x === 0 || (x + 1) % 5 === 0) ctx.fillText(String(x + 1), margin + (x + .5) * cell, top - 13);
  for (let y = 0; y < height; y++) if (y === 0 || (y + 1) % 5 === 0) ctx.fillText(String(y + 1), margin - 20, top + (y + .5) * cell);
  ctx.strokeStyle = '#174b6970';ctx.lineWidth = 1.2;
  for (let x = 0; x <= width; x += 5) { ctx.beginPath();ctx.moveTo(margin + x * cell, top);ctx.lineTo(margin + x * cell, top + height * cell);ctx.stroke(); }
  for (let y = 0; y <= height; y += 5) { ctx.beginPath();ctx.moveTo(margin, top + y * cell);ctx.lineTo(margin + width * cell, top + y * cell);ctx.stroke(); }
  ctx.textAlign = 'left';ctx.font = 'bold 14px sans-serif';ctx.fillStyle = '#174b69';ctx.fillText('拼豆用量', margin, legendTop - 22);
  summary.used.forEach((bead, index) => {
    const x = margin + index % columns * 120, y = legendTop + Math.floor(index / columns) * 29;
    ctx.fillStyle = bead.hex;ctx.fillRect(x, y, 17, 17);ctx.strokeStyle = '#174b6950';ctx.strokeRect(x, y, 17, 17);
    ctx.fillStyle = '#174b69';ctx.font = '12px sans-serif';ctx.fillText(`${bead.code} × ${bead.count}`, x + 24, y + 9);
  });
  ctx.fillStyle = '#436b82';ctx.font = '11px sans-serif';ctx.fillText('颜色取自提供的 221 色色卡，实物颜色以豆子为准。', margin, output.height - 23);
  return output;
}
