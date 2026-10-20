const character = new Image();
export const characterReady = new Promise((resolve, reject) => {
  character.onload = resolve;
  character.onerror = () => reject(new Error('小洛还没准备好，请刷新再试试～'));
});
character.src = new URL('../assets/tianyi-run.webp', import.meta.url).href;

export function drawTianyi(ctx, x, y, { scale = 1, frame = 0, jumping = false, ducking = false } = {}) {
  if (!character.complete || !character.naturalWidth) return;
  frame = jumping ? 3 : ((frame % 12) + 12) % 12;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  if (ducking) {
    ctx.translate(0, 88);
    ctx.transform(1, 0, -.28, .57, 0, 0);
    ctx.drawImage(character, (frame % 4) * 256, Math.floor(frame / 4) * 288, 256, 288, -7, -94, 90, 94);
  } else {
    ctx.drawImage(character, (frame % 4) * 256, Math.floor(frame / 4) * 288, 256, 288, 0, -5, 84, 94);
  }
  ctx.restore();
}

export function drawCloud(ctx, x, y, scale = 1, opacity = 1) {
  ctx.save();ctx.globalAlpha = opacity;ctx.fillStyle = '#f8fdff';
  for (const [rx, ry, rw, rh] of [[0,12,66,13],[10,5,17,22],[25,0,24,28],[47,9,14,18],[6,25,54,5]]) ctx.fillRect(Math.round(x+rx*scale), Math.round(y+ry*scale), rw*scale, rh*scale);
  ctx.restore();
}

export function drawBun(ctx, x, y, scale = 1) {
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
  ctx.fillStyle = '#d8af78';ctx.fillRect(3,18,24,5);ctx.fillRect(0,16,30,4);
  ctx.fillStyle = '#fff6d9';ctx.fillRect(4,7,22,11);ctx.fillRect(7,3,16,5);ctx.fillRect(11,0,8,4);ctx.fillRect(2,11,26,4);
  ctx.fillStyle = '#e8c899';ctx.fillRect(11,3,2,5);ctx.fillRect(17,4,2,5);ctx.fillRect(8,8,2,3);ctx.fillRect(21,8,2,3);
  ctx.fillStyle = '#527967';ctx.fillRect(9,12,2,2);ctx.fillRect(19,12,2,2);
  ctx.fillStyle = '#e9b8a1';ctx.fillRect(6,14,3,2);ctx.fillRect(22,14,3,2);
  ctx.fillStyle = '#b4b39a';ctx.fillRect(13,15,4,1);ctx.restore();
}

export function drawObstacle(ctx, item, time = 0) {
  const { x, y, type, hit } = item;
  ctx.save();ctx.translate(Math.round(x), Math.round(y));ctx.globalAlpha = hit ? .4 : 1;
  if (type === 'cloud') {
    const flap = Math.sin(time * 14) > 0 ? -3 : 2;
    ctx.fillStyle = '#4192c5';
    for (const [rx, ry, rw, rh] of [[8,13,48,16],[15,6,16,22],[29,2,18,26],[46,10,12,16]]) ctx.fillRect(rx,ry,rw,rh);
    ctx.fillStyle = '#f5fcff';
    for (const [rx, ry, rw, rh] of [[10,14,44,12],[17,8,14,18],[31,4,14,22],[47,12,8,12]]) ctx.fillRect(rx,ry,rw,rh);
    ctx.fillStyle = '#9addff';ctx.fillRect(11,25,42,4);
    ctx.fillStyle = '#4192c5';ctx.fillRect(0,14+flap,9,5);ctx.fillRect(3,19+flap,8,4);ctx.fillRect(55,14+flap,9,5);ctx.fillRect(54,19+flap,7,4);
    ctx.fillStyle = '#c9eeff';ctx.fillRect(2,14+flap,7,3);ctx.fillRect(56,14+flap,6,3);
    ctx.fillStyle = '#287466';ctx.fillRect(26,16,3,4);ctx.fillRect(39,16,3,4);ctx.fillRect(32,22,5,2);
    ctx.fillStyle = '#f5aebd';ctx.fillRect(20,21,5,2);ctx.fillRect(43,21,5,2);
  } else if(type === 'fork') {
    ctx.fillStyle='#518fb0';ctx.fillRect(7,0,4,17);ctx.fillRect(14,0,4,17);ctx.fillRect(21,0,4,17);ctx.fillRect(7,14,18,7);ctx.fillRect(11,20,10,7);
    ctx.fillStyle='#a5e1fa';ctx.fillRect(8,2,2,12);ctx.fillRect(15,2,2,10);ctx.fillRect(22,2,2,12);
    ctx.fillStyle='#e9b6ac';ctx.fillRect(12,26,8,17);ctx.fillRect(14,43,4,2);ctx.fillStyle='#f9d4bd';ctx.fillRect(13,28,2,13);
    ctx.fillStyle='#365d78';ctx.fillRect(11,17,2,2);ctx.fillRect(20,17,2,2);
    ctx.fillStyle='#fffaf0';ctx.fillRect(15,21,3,1);
  } else {
    ctx.fillStyle='#518fb0';ctx.fillRect(12,0,6,4);ctx.fillRect(9,4,12,9);ctx.fillRect(7,13,14,14);ctx.fillRect(10,24,11,4);
    ctx.fillStyle='#b6e7fa';ctx.fillRect(12,5,5,18);ctx.fillRect(10,14,3,10);
    ctx.fillStyle='#e8ba8b';ctx.fillRect(11,28,10,11);ctx.fillRect(13,39,6,2);ctx.fillStyle='#ffdbac';ctx.fillRect(12,29,3,8);
    ctx.fillStyle='#365d78';ctx.fillRect(11,17,2,2);ctx.fillRect(17,17,2,2);
    ctx.fillStyle='#e9b8a1';ctx.fillRect(9,20,3,2);ctx.fillRect(18,20,3,2);
  }
  ctx.restore();
}

function blend(day, night, amount) {
  return `rgb(${day.map((value, i) => Math.round(value + (night[i] - value) * amount)).join(',')})`;
}

export function drawLandscape(ctx, width, height, distance = 0, time = 0, night = 0) {
  const ground = height - 65;
  ctx.fillStyle=blend([222,245,255],[10,19,37],night);ctx.fillRect(0,0,width,height);
  ctx.fillStyle=blend([255,243,196],[214,238,255],night);
  ctx.fillRect(width-110,40,28,28);ctx.fillRect(width-116,46,40,16);ctx.fillRect(width-104,34,16,40);
  if (night > 0) {
    ctx.save();ctx.globalAlpha=night;
    ctx.fillStyle=blend([222,245,255],[10,19,37],night);ctx.fillRect(width-97,35,22,24);
    for(let i=0;i<24;i++) {
      ctx.globalAlpha=night*(.45+.35*Math.sin(time*1.5+i));ctx.fillStyle='#b9eaff';
      const x=(i*173+43)%width,y=24+(i*37)%Math.max(50,ground-120);
      ctx.fillRect(x,y,i%5===0?3:2,2);
      if(i%5===0)ctx.fillRect(x+1,y-2,1,6);
    }
    ctx.restore();
  }
  for(let i=0;i<6;i++) {
    const spacing=width/3+80;
    const x=((i*spacing-distance*.16+width*4)%(width+spacing))-90;
    drawCloud(ctx,x,25+(i%3)*30,.5+(i%2)*.22,.48-night*.3);
  }
  ctx.fillStyle=blend([190,227,240],[27,48,70],night);
  for(let i=0;i<8;i++) {
    const x=((i*200-distance*.25+4000)%(width+260))-160;
    ctx.fillRect(x,ground-30-(i%3)*12,120,50);ctx.fillRect(x+20,ground-48-(i%3)*12,80,35);ctx.fillRect(x+40,ground-57-(i%3)*12,40,20);
  }
  ctx.fillStyle=blend([80,165,185],[70,128,160],night);ctx.fillRect(0,ground,width,4);
  ctx.fillStyle=blend([160,218,213],[38,80,95],night);ctx.fillRect(0,ground+4,width,7);
  ctx.fillStyle=blend([235,249,250],[20,36,52],night);ctx.fillRect(0,ground+11,width,54);
  ctx.fillStyle=blend([111,188,188],[78,125,142],night);
  for(let i=0;i<Math.ceil(width/28)+2;i++){const x=i*28-distance%28;ctx.fillRect(x,ground+4,3,3);}
  for(let i=0;i<Math.ceil(width/80)+2;i++) {
    const x=i*80-distance%80;ctx.fillStyle=blend([173,211,222],[50,74,92],night);ctx.fillRect(x,ground+24+(i%3)*8,5,2);ctx.fillRect(x+29,ground+39-(i%3)*5,3,2);
  }
  for(let i=0;i<Math.ceil(width/170)+2;i++) {
    const x=i*170-distance%170;ctx.fillStyle=blend([79,166,151],[70,129,132],night);ctx.fillRect(x,ground-9,2,9);ctx.fillRect(x-3,ground-5,3,2);ctx.fillStyle=i%2?'#6cf':'#d4f6ff';ctx.fillRect(x-2,ground-11,6,4);ctx.fillRect(x,ground-13,2,8);
  }
}

export function renderRunner(ctx, runner) {
  const { width, height, time, distance, player } = runner;
  drawLandscape(ctx,width,height,distance,time,runner.night);
  ctx.fillStyle=runner.night>.5?'#6cf3':'#4499b633';ctx.fillRect(Math.round(player.x+29),runner.ground+3,38,3);
  for(const bun of runner.buns) drawBun(ctx,bun.x,bun.y);
  for(const item of runner.obstacles) drawObstacle(ctx,item,time);
  if(runner.invincible<=0 || Math.floor(time*13)%2===0) drawTianyi(ctx,player.x,player.y,{frame:Math.floor(distance/18.4),jumping:!player.grounded,ducking:runner.ducking});
  if(runner.ducking && runner.state==='running') {
    ctx.fillStyle=runner.night>.5?'#94dbff':'#55b2d9';
    const offset=Math.floor(time*22)%3;
    for(let i=0;i<3;i++)ctx.fillRect(player.x+5-i*9-offset*2,runner.ground-3-i*4,6+i*2,2);
  }
  for(const particle of runner.particles) {ctx.globalAlpha=Math.min(1,particle.life*2);ctx.fillStyle=particle.color;ctx.fillRect(Math.round(particle.x),Math.round(particle.y),4,4);}
  ctx.globalAlpha=1;
}
