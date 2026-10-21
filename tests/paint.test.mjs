import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelArt, pack, channels, parseColor, colorHex, hsvColor, colorHSV, detectGrid, quantize, readProject } from '../src/paint-core.js';

test('sRGB and hex input round-trip without losing opaque black or white',()=>{
  for (const value of ['#6cf','#66ccff','102, 204, 255','srgb(102, 204, 255)','rgb(102,204,255)']) assert.equal(colorHex(parseColor(value)),'#66ccff');
  assert.deepEqual(channels(parseColor('#000000')),[0,0,0,255]);
  assert.deepEqual(channels(parseColor('#ffffff')),[255,255,255,255]);
  assert.equal(parseColor('256,0,0'),null);assert.equal(parseColor('#xxffff'),null);
  for (const hex of ['#66ccff','#ffffff','#000000','#f4ae8c']) assert.equal(colorHex(hsvColor(...colorHSV(parseColor(hex)))),hex);
});

test('continuous brush strokes have no gaps and undo as a whole stroke',()=>{
  const art=new PixelArt(16,16),blue=pack(102,204,255);
  art.begin();art.line(0,0,15,15,blue);assert.equal(art.commit(),true);
  for(let i=0;i<16;i++)assert.equal(art.pixels[i*16+i],blue);
  art.undo();assert.ok(art.pixels.every(pixel=>pixel===0));art.redo();assert.equal(art.pixels[255],blue);
  art.begin();art.point(4,4,0);art.commit();assert.equal(art.pixels[68],0);
  art.undo();assert.equal(art.pixels[68],blue);
});

test('flood fill respects closed boundaries and transparent regions',()=>{
  const art=new PixelArt(8,8),outline=pack(24,62,105),blue=pack(102,204,255);
  art.line(2,2,5,2,outline);art.line(5,2,5,5,outline);art.line(5,5,2,5,outline);art.line(2,5,2,2,outline);
  art.begin();art.fill(3,3,blue);art.commit();
  assert.equal(art.pixels.filter(pixel=>pixel===blue).length,4);
  assert.equal(art.pixels[0],0);assert.equal(art.pixels[18],outline);
  art.undo();assert.equal(art.pixels[27],0);
});

test('canvas changes and project imports preserve dimensions, alpha, and undo history',()=>{
  const art=new PixelArt(4,8);art.point(1,2,pack(4,8,12,128));
  const project=JSON.parse(JSON.stringify(art.project()));
  const loaded=readProject(project);assert.equal(loaded.pixels[9],pack(4,8,12,128));
  art.replace(16,12);assert.equal(art.pixels.length,192);art.undo();assert.equal(art.width,4);assert.equal(art.height,8);assert.equal(art.pixels[9],pack(4,8,12,128));
  assert.throws(()=>art.replace(257,32));assert.throws(()=>art.replace(1e20,1e20));
  assert.throws(()=>readProject({...project,pixels:[0]}));assert.throws(()=>readProject({...project,pixels:project.pixels.map(()=>-1)}));
});

test('enlarged pixel images are recognized as their original grid',()=>{
  const art=new PixelArt(12,10);
  for(let y=0;y<10;y++)for(let x=0;x<12;x++)art.point(x,y,pack(x*20,y*22,(x+y)%2?220:80));
  const scale=6,width=72,height=60,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(channels(art.pixels[Math.floor(y/scale)*12+Math.floor(x/scale)]),(y*width+x)*4);
  assert.deepEqual(detectGrid(data,width,height),{width:12,height:10,scale:6,pixel:true});
  assert.deepEqual(detectGrid(art.rgba(),12,10),{width:12,height:10,scale:1,pixel:true});
});

test('photos receive a bounded pixel canvas and a limited palette without losing transparency',()=>{
  const width=320,height=240,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)data.set([i%256,(i*17)%255,(i*31)%254,255],i*4);
  const detected=detectGrid(data,width,height);assert.equal(detected.pixel,false);assert.equal(detected.width,64);assert.equal(detected.height,48);
  const colors=quantize(data.slice(0,4096),16);assert.ok(new Set(colors).size<=16);
  const rgba=new Uint8ClampedArray([0,0,0,0,255,0,0,128,0,0,255,255]);
  assert.deepEqual(Array.from(quantize(rgba,0)),[0,pack(255,0,0,128),pack(0,0,255)]);
  assert.equal(quantize(rgba,1)[0],0);assert.equal(channels(quantize(rgba,1)[1])[3],128);
});
