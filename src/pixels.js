const palette = { o: '#516f78', h: '#b2c9ce', H: '#d9e7e8', s: '#ffdeca', S: '#edb6a8', e: '#53ab77', w: '#fcfff4', t: '#6cf', T: '#3cacc3', d: '#477b88', g: '#8cdab8', G: '#5abf97', b: '#ffffff' };
const head = [
  '       oooo       ',
  '    oooHHHHooo    ',
  '   oHHHHHHHHHHo   ',
  '  oHHhHHHHHhHHHo  ',
  ' ooHhHHHHHHHhHHoo ',
  ' oHhHHHHHHHHHhHHo ',
  ' oHhHHhHHhHHHhHHo ',
  'oTHhHhHHhHHhHhHTo',
  'oTThHssssssHhHTTo',
  'oHhHsewssweHsHhHo',
  'oHhHseessseeHHhHo',
  'oHhHssssssssHHhHo',
  ' oHhHssSSssHHhHo ',
  '  oHhHHssHHHhHo  ',
  '  oHhHowwoHHhHo  ',
  '  oHhosssoHHhHo  '
];
const body = [
  '   oGwwttwwGo    ',
  '  ossowttwosso   ',
  '  ossowttwosso   ',
  '   soHwttwHos    ',
  '    oHwTTwHo     ',
  '   owwtTTtww o   ',
  '   owttTTttwo    ',
  '  owwttTTttwwo   ',
  '  oTTTTTTTTTTo   ',
  '   oooooooooo    '
];

function matrix(ctx, rows, x, y, scale) {
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      const color = palette[rows[row][col]];
      if (color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x + col * scale), Math.round(y + row * scale), scale, scale); }
    }
  }
}

export function drawTianyi(ctx, x, y, { scale = 2, frame = 0, jumping = false, time = 0 } = {}) {
  ctx.save();
  x = Math.round(x); y = Math.round(y);
  const sway = jumping ? -1 : Math.sin(time * 12) > 0 ? 1 : 0;
  ctx.fillStyle = '#a7bfc7';
  ctx.fillRect(x + scale, y + 14 * scale, 3 * scale, (11 + sway) * scale);
  ctx.fillRect(x + 14 * scale, y + 14 * scale, 3 * scale, (11 - sway) * scale);
  ctx.fillStyle = '#6cf';
  ctx.fillRect(x, y + 15 * scale, 4 * scale, 2 * scale);
  ctx.fillRect(x + 14 * scale, y + 15 * scale, 4 * scale, 2 * scale);
  matrix(ctx, head, x, y, scale);
  matrix(ctx, body, x, y + 15 * scale, scale);
  const step = jumping ? 2 : frame % 2 === 0 ? 0 : 2;
  ctx.fillStyle = '#ffdeca';
  ctx.fillRect(x + 6 * scale, y + 25 * scale, 2 * scale, (4 - step) * scale);
  ctx.fillRect(x + 10 * scale, y + 25 * scale, 2 * scale, (2 + step) * scale);
  ctx.fillStyle = '#fcfff4';
  ctx.fillRect(x + 6 * scale, y + (27 - step) * scale, 2 * scale, 3 * scale);
  ctx.fillRect(x + 10 * scale, y + (25 + step) * scale, 2 * scale, 3 * scale);
  ctx.fillStyle = '#477b88';
  ctx.fillRect(x + 5 * scale, y + (30 - step) * scale, 3 * scale, 2 * scale);
  ctx.fillRect(x + 10 * scale, y + (28 + step) * scale, 3 * scale, 2 * scale);
  ctx.restore();
}

export function drawCloud(ctx, x, y, scale = 1, opacity = 1) {
  ctx.save();ctx.globalAlpha = opacity;ctx.fillStyle = '#fffef8';
  for (const [rx, ry, rw, rh] of [[0,12,66,13],[10,5,17,22],[25,0,24,28],[47,9,14,18],[6,25,54,5]]) ctx.fillRect(Math.round(x+rx*scale), Math.round(y+ry*scale), rw*scale, rh*scale);
  ctx.restore();
}

export function drawBun(ctx, x, y, scale = 1) {
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
  ctx.fillStyle = '#d8af78';ctx.fillRect(3,18,24,5);ctx.fillRect(0,16,30,4);
  ctx.fillStyle = '#fff6d9';ctx.fillRect(4,7,22,11);ctx.fillRect(7,3,16,5);ctx.fillRect(11,0,8,4);ctx.fillRect(2,11,26,4);
  ctx.fillStyle = '#e8c899';ctx.fillRect(11,3,2,5);ctx.fillRect(17,4,2,5);ctx.fillRect(8,8,2,3);ctx.fillRect(21,8,2,3);
  ctx.fillStyle = '#7b8b78';ctx.fillRect(9,12,2,2);ctx.fillRect(19,12,2,2);
  ctx.fillStyle = '#e9b8a1';ctx.fillRect(6,14,3,2);ctx.fillRect(22,14,3,2);
  ctx.fillStyle = '#b4b39a';ctx.fillRect(13,15,4,1);ctx.restore();
}

export function drawObstacle(ctx, item) {
  const { x, y, type, hit } = item;
  ctx.save();ctx.translate(Math.round(x), Math.round(y));ctx.globalAlpha = hit ? .4 : 1;
  if(type === 'fork') {
    ctx.fillStyle='#729fa9';ctx.fillRect(7,0,4,17);ctx.fillRect(14,0,4,17);ctx.fillRect(21,0,4,17);ctx.fillRect(7,14,18,7);ctx.fillRect(11,20,10,7);
    ctx.fillStyle='#9cc9cc';ctx.fillRect(8,2,2,12);ctx.fillRect(15,2,2,10);ctx.fillRect(22,2,2,12);
    ctx.fillStyle='#e9b6ac';ctx.fillRect(12,26,8,17);ctx.fillRect(14,43,4,2);ctx.fillStyle='#f9d4bd';ctx.fillRect(13,28,2,13);
    ctx.fillStyle='#516f78';ctx.fillRect(11,17,2,2);ctx.fillRect(20,17,2,2);
    ctx.fillStyle='#fffaf0';ctx.fillRect(15,21,3,1);
  } else {
    ctx.fillStyle='#79a8af';ctx.fillRect(12,0,6,4);ctx.fillRect(9,4,12,9);ctx.fillRect(7,13,14,14);ctx.fillRect(10,24,11,4);
    ctx.fillStyle='#b6d8d6';ctx.fillRect(12,5,5,18);ctx.fillRect(10,14,3,10);
    ctx.fillStyle='#e8ba8b';ctx.fillRect(11,28,10,11);ctx.fillRect(13,39,6,2);ctx.fillStyle='#ffdbac';ctx.fillRect(12,29,3,8);
    ctx.fillStyle='#516f78';ctx.fillRect(11,17,2,2);ctx.fillRect(17,17,2,2);
    ctx.fillStyle='#e9b8a1';ctx.fillRect(9,20,3,2);ctx.fillRect(18,20,3,2);
  }
  ctx.restore();
}

export function drawLandscape(ctx, width, height, distance = 0, time = 0) {
  const ground = height - 65;
  ctx.fillStyle='#e6f3f3';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#fbf9de';ctx.fillRect(width-110,40,28,28);ctx.fillRect(width-116,46,40,16);ctx.fillRect(width-104,34,16,40);
  for(let i=0;i<6;i++) {
    const spacing=width/3+80;
    const x=((i*spacing-distance*.16+width*4)%(width+spacing))-90;
    drawCloud(ctx,x,40+(i%3)*39,.65+(i%2)*.4,.65);
  }
  ctx.fillStyle='#d6e8db';
  for(let i=0;i<8;i++) {
    const x=((i*200-distance*.25+4000)%(width+260))-160;
    ctx.fillRect(x,ground-30-(i%3)*12,120,50);ctx.fillRect(x+20,ground-48-(i%3)*12,80,35);ctx.fillRect(x+40,ground-57-(i%3)*12,40,20);
  }
  ctx.fillStyle='#9abf9b';ctx.fillRect(0,ground,width,4);ctx.fillStyle='#cee0b8';ctx.fillRect(0,ground+4,width,7);ctx.fillStyle='#f4edda';ctx.fillRect(0,ground+11,width,54);
  ctx.fillStyle='#b2c9a0';
  for(let i=0;i<Math.ceil(width/28)+2;i++){const x=i*28-distance%28;ctx.fillRect(x,ground+4,3,3);}
  for(let i=0;i<Math.ceil(width/80)+2;i++) {
    const x=i*80-distance%80;ctx.fillStyle=i%3?'#dcd6b6':'#becfa8';ctx.fillRect(x,ground+24+(i%3)*8,5,2);ctx.fillRect(x+29,ground+39-(i%3)*5,3,2);
  }
  for(let i=0;i<Math.ceil(width/170)+2;i++) {
    const x=i*170-distance%170;ctx.fillStyle='#83b997';ctx.fillRect(x,ground-9,2,9);ctx.fillRect(x-3,ground-5,3,2);ctx.fillStyle=i%2?'#f9cf9b':'#fcfff0';ctx.fillRect(x-2,ground-11,6,4);ctx.fillRect(x,ground-13,2,8);
  }
}

export function renderRunner(ctx, runner) {
  const { width, height, time, distance, player } = runner;
  drawLandscape(ctx,width,height,distance,time);
  ctx.fillStyle='#77a88b33';ctx.fillRect(Math.round(player.x+5),runner.ground+3,38,4);
  for(const bun of runner.buns) drawBun(ctx,bun.x,bun.y);
  for(const item of runner.obstacles) drawObstacle(ctx,item);
  if(runner.invincible<=0 || Math.floor(time*13)%2===0) drawTianyi(ctx,player.x,player.y,{frame:Math.floor(time*9),jumping:!player.grounded,time});
  for(const particle of runner.particles) {ctx.globalAlpha=Math.min(1,particle.life*2);ctx.fillStyle=particle.color;ctx.fillRect(Math.round(particle.x),Math.round(particle.y),4,4);}
  ctx.globalAlpha=1;
}
