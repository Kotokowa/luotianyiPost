import { PixelArt, MAX_SIZE, pack, channels, parseColor, colorHex, hsvColor, colorHSV, detectGrid, quantize, readProject } from './paint-core.js';

export function initPaintRoom(dialog) {
  const $ = selector => dialog.querySelector(selector);
  const art = new PixelArt();
  const canvas = $('#paint-canvas'), ctx = canvas.getContext('2d');
  const board = $('#pixel-board'), stage = $('#paint-stage');
  const spectrum = $('#color-spectrum'), spectrumCtx = spectrum.getContext('2d');
  const draftKey = 'luoty.paint.draft.v1';
  let color = pack(102,204,255), hsv = colorHSV(color), tool = 'brush', cell = 16;
  let stroke = null, spectrumPointer = null, opened = false, imported = null, importPixel = false, importSequence = 0;
  let storageWorks = true;
  function status(message) { $('#paint-status').textContent = message; }
  try {
    const saved = localStorage.getItem(draftKey);
    if (saved) art.restore(readProject(JSON.parse(saved)));
  } catch { storageWorks = false; }

  function save() {
    try { localStorage.setItem(draftKey, JSON.stringify(art.project()));storageWorks = true;status('画稿收好啦～'); }
    catch { storageWorks = false;status('画稿暂时存不住，记得导出带走哦～'); }
  }
  function render() {
    if (canvas.width !== art.width || canvas.height !== art.height) { canvas.width = art.width;canvas.height = art.height; }
    ctx.putImageData(new ImageData(art.rgba(), art.width, art.height), 0, 0);
    board.style.width = `${art.width * cell}px`;board.style.height = `${art.height * cell}px`;
    board.style.setProperty('--cell', `${cell}px`);
    $('#paint-size-label').textContent = `${art.width} × ${art.height} 格`;
    $('#paint-width').value = art.width;$('#paint-height').value = art.height;
    $('#paint-undo').disabled = !art.past.length;$('#paint-redo').disabled = !art.future.length;
  }
  function commit() { if (art.commit()) save();render(); }
  function fit() {
    cell = Math.max(8,Math.min(28,Math.floor((stage.clientWidth - 48) / art.width),Math.floor((stage.clientHeight - 48) / art.height)));
    $('#paint-zoom').value = cell;render();
    stage.scrollLeft = Math.max(0,(stage.scrollWidth-stage.clientWidth)/2);stage.scrollTop = Math.max(0,(stage.scrollHeight-stage.clientHeight)/2);
  }
  function drawSpectrum() {
    const [h,s,v] = hsv;
    spectrumCtx.fillStyle = colorHex(hsvColor(h,1,1));spectrumCtx.fillRect(0,0,240,130);
    let gradient = spectrumCtx.createLinearGradient(0,0,240,0);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,'#fff0');
    spectrumCtx.fillStyle = gradient;spectrumCtx.fillRect(0,0,240,130);
    gradient = spectrumCtx.createLinearGradient(0,0,0,130);gradient.addColorStop(0,'#0000');gradient.addColorStop(1,'#000');
    spectrumCtx.fillStyle = gradient;spectrumCtx.fillRect(0,0,240,130);
    $('#color-dot').style.left = `${s*100}%`;$('#color-dot').style.top = `${(1-v)*100}%`;
  }
  function setColor(value, updateHSV = true) {
    color = value;
    if (updateHSV) hsv = colorHSV(color);
    const hex = colorHex(color), rgb = channels(color);
    $('#color-chip').style.backgroundColor = hex;$('#color-hex').value = hex;
    $('#color-hex').removeAttribute('aria-invalid');
    ['r','g','b'].forEach((name,index)=>{ $(`#color-${name}`).value = rgb[index];$(`#color-${name}`).removeAttribute('aria-invalid'); });
    $('#color-hue').value = Math.round(hsv[0]);drawSpectrum();
  }
  function setTool(value) {
    tool = value;board.dataset.tool = value;
    for (const button of dialog.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed',String(button.dataset.tool === value));
  }
  for (const button of dialog.querySelectorAll('[data-tool]')) button.addEventListener('click',()=>setTool(button.dataset.tool));
  $('#color-hex').addEventListener('change',event=>{
    const value = parseColor(event.target.value);
    if (value === null) { event.target.setAttribute('aria-invalid','true');status('试试 #66ccff 或 102, 204, 255～'); }
    else setColor(value);
  });
  for (const name of ['r','g','b']) $(`#color-${name}`).addEventListener('change',()=>{
    const values = ['r','g','b'].map(key=>$(`#color-${key}`).value);
    if (values.every(value=>value.trim() !== '' && Number.isInteger(+value) && +value >= 0 && +value <= 255)) setColor(pack(...values.map(Number)));
    else { $(`#color-${name}`).setAttribute('aria-invalid','true');status('每种颜色填 0～255 就好啦～'); }
  });
  function spectrumPoint(event) {
    const rect = spectrum.getBoundingClientRect();
    hsv[1] = Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    hsv[2] = 1-Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    setColor(hsvColor(...hsv),false);
  }
  spectrum.addEventListener('pointerdown',event=>{
    if (event.button !== 0) return;
    event.preventDefault();spectrumPointer = event.pointerId;spectrum.setPointerCapture(event.pointerId);spectrumPoint(event);
  });
  spectrum.addEventListener('pointermove',event=>{ if (spectrumPointer === event.pointerId) spectrumPoint(event); });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) spectrum.addEventListener(name,()=>{ spectrumPointer = null; });
  spectrum.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)) return;
    event.preventDefault();const delta = event.shiftKey ? .1 : .02;
    hsv[1] = Math.max(0,Math.min(1,hsv[1]+(event.code==='ArrowLeft'?-delta:event.code==='ArrowRight'?delta:0)));
    hsv[2] = Math.max(0,Math.min(1,hsv[2]+(event.code==='ArrowDown'?-delta:event.code==='ArrowUp'?delta:0)));
    setColor(hsvColor(...hsv),false);
  });
  $('#color-hue').addEventListener('input',event=>{ hsv[0] = +event.target.value;setColor(hsvColor(...hsv),false); });
  for (const hex of ['#66ccff','#2b8ecc','#183e69','#8a94b3','#daddea','#ffffff','#46bda6','#b4e8cc','#ffe09b','#f4ae8c','#ed9fb9','#b69ddd']) {
    const button = document.createElement('button');button.type='button';button.style.backgroundColor=hex;button.title=hex;button.setAttribute('aria-label',`使用颜色 ${hex}`);
    button.addEventListener('click',()=>setColor(parseColor(hex)));$('#paint-swatches').append(button);
  }

  function coordinate(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX-rect.left)*art.width/rect.width), y = Math.floor((event.clientY-rect.top)*art.height/rect.height);
    return x >= 0 && y >= 0 && x < art.width && y < art.height ? {x,y} : null;
  }
  function pick(point) {
    const value = art.pixels[point.y*art.width+point.x];
    if ((value & 255) === 0) { status('这一格是透明的～');return; }
    setColor(pack(...channels(value).slice(0,3)));setTool('brush');status('借到这格的颜色啦～');
  }
  function finish() {
    if (!stroke) return;
    if (stroke.mode === 'draw') commit();
    stroke = null;
  }
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
    if (event.button !== 0 && event.button !== 2 || stroke) return;
    const point = coordinate(event);if (!point) return;
    event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
    if (tool === 'hand') { stroke = { mode:'pan', id:event.pointerId, x:event.clientX, y:event.clientY };return; }
    if (tool === 'picker' || event.altKey) { pick(point);return; }
    art.begin();
    if (tool === 'fill') { art.fill(point.x,point.y,color);commit();return; }
    stroke = { mode:'draw', id:event.pointerId, point, color:tool === 'eraser' || event.button === 2 ? 0 : color, size:+$('#paint-brush-size').value };
    art.point(point.x,point.y,stroke.color,stroke.size);render();
  });
  canvas.addEventListener('pointermove',event=>{
    const point = coordinate(event);
    $('#paint-coordinate').textContent = point ? `第 ${point.x+1} 列 · 第 ${point.y+1} 行` : '让灵感落在小方格里～';
    if (!stroke || event.pointerId !== stroke.id) return;
    if (stroke.mode === 'pan') {
      stage.scrollLeft -= event.clientX-stroke.x;stage.scrollTop -= event.clientY-stroke.y;stroke.x=event.clientX;stroke.y=event.clientY;return;
    }
    if (!point) { stroke.point=null;return; }
    const from = stroke.point || point;art.line(from.x,from.y,point.x,point.y,stroke.color,stroke.size);stroke.point=point;render();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,finish);
  window.addEventListener('blur',finish);
  function history(direction) { finish();if (art[direction]()) { render();save(); } }
  $('#paint-undo').addEventListener('click',()=>history('undo'));
  $('#paint-redo').addEventListener('click',()=>history('redo'));
  function newCanvas(width,height) {
    finish();
    try { art.replace(width,height);render();fit();save(); }
    catch(error) { status(error.message); }
  }
  $('#paint-new').addEventListener('click',()=>newCanvas(+$('#paint-width').value,+$('#paint-height').value));
  for (const button of dialog.querySelectorAll('[data-size]')) button.addEventListener('click',()=>newCanvas(+button.dataset.size,+button.dataset.size));
  $('#paint-zoom').addEventListener('input',event=>{ cell=+event.target.value;render(); });
  $('#paint-fit').addEventListener('click',fit);
  $('#paint-grid-toggle').addEventListener('click',event=>{
    const visible = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed',String(visible));$('#pixel-grid').hidden = !visible;
  });
  dialog.addEventListener('keydown',event=>{
    if (!dialog.open || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && ['KeyZ','KeyY'].includes(event.code)) {
      event.preventDefault();history(event.code === 'KeyY' || event.shiftKey ? 'redo' : 'undo');return;
    }
    if (event.target === spectrum) return;
    const tools = {KeyB:'brush',KeyE:'eraser',KeyF:'fill',KeyI:'picker',KeyH:'hand'};
    if (!event.ctrlKey && !event.metaKey && tools[event.code]) { event.preventDefault();setTool(tools[event.code]); }
  });

  function importImage() {
    if (!imported) return;
    const width = +$('#import-width').value, height = +$('#import-height').value;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) { status('画布边长可以是 1～256 格哦～');return; }
    finish();
    const sample = document.createElement('canvas');sample.width=width;sample.height=height;
    const context = sample.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled = !importPixel;context.imageSmoothingQuality='high';
    context.drawImage(imported,0,0,width,height);
    const data = context.getImageData(0,0,width,height).data;
    art.replace(width,height,quantize(data,+$('#import-colors').value));render();fit();save();
    status(importPixel ? '像素格认出来啦，接着画吧～' : '图片变成小方格啦，接着画吧～');
  }
  $('#paint-reimport').addEventListener('click',importImage);
  $('#paint-import').addEventListener('change',async event=>{
    const file = event.target.files[0];event.target.value='';if (!file) return;
    const sequence = ++importSequence;
    try {
      if (file.size > 25*1024*1024) throw new Error('这张图有点大，换张 25 MB 以内的吧～');
      if (/\.json$/i.test(file.name)) {
        const project = readProject(JSON.parse(await file.text()));if (sequence !== importSequence) return;
        finish();art.replace(project.width,project.height,project.pixels);render();fit();save();status('画稿回到小画桌啦～');return;
      }
      status('正在数一数图片的小方格……');
      const image = await createImageBitmap(file);
      if (sequence !== importSequence) { image.close();return; }
      imported?.close();imported=image;
      const probe = document.createElement('canvas');
      const ratio = Math.min(1,2048/Math.max(image.width,image.height));
      probe.width=Math.max(1,Math.round(image.width*ratio));probe.height=Math.max(1,Math.round(image.height*ratio));
      const context = probe.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=false;context.drawImage(image,0,0,probe.width,probe.height);
      const detected = detectGrid(context.getImageData(0,0,probe.width,probe.height).data,probe.width,probe.height);
      importPixel=detected.pixel;$('#import-width').value=detected.width;$('#import-height').value=detected.height;
      $('#import-colors').value=importPixel?'0':'32';$('#import-options').hidden=false;
      $('#import-note').textContent=importPixel?`认出像素格啦：${detected.width} × ${detected.height}`:'已帮你选好小方格，也可以自己调整～';
      importImage();
    } catch(error) { status(error.message.includes('～')?error.message:'这张图片没打开，换一张试试吧～'); }
  });
  function download(blob,name) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('#paint-save-project').addEventListener('click',()=>{
    finish();download(new Blob([JSON.stringify(art.project())],{type:'application/json'}),`小洛的像素画-${art.width}x${art.height}.json`);status('画稿装进口袋啦，随时可以导回来～');
  });
  $('#paint-export-png').addEventListener('click',()=>{
    finish();
    const scale=+$('#paint-export-scale').value,output=document.createElement('canvas');output.width=art.width*scale;output.height=art.height*scale;
    const context=output.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(canvas,0,0,output.width,output.height);
    output.toBlob(blob=>{ if (blob) { download(blob,`小洛的像素画-${art.width}x${art.height}.png`);status('小画作打包好啦～'); }else status('导出没成功，再试一次吧～'); },'image/png');
  });
  setTool('brush');setColor(color);render();
  if (!storageWorks) status('画稿暂时存不住，记得导出带走哦～');
  return {
    open() { if (!opened) { fit();opened=true; }else render();canvas.focus({preventScroll:true}); },
    close() { finish();spectrumPointer=null; }
  };
}
