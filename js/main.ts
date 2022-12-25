import {
  scale
} from 'chroma-js';
import { Boid } from './Boid';
import { HashGrid } from './HashGrid';
import { clamp, Ivec2, map, wrap } from './math/index';
import vec2 from './math/vec2';
import { makeNoise2D } from 'fast-simplex-noise';
import vec3 from './math/vec3';

const noise = makeNoise2D();

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');
let width = canvas.width = Math.floor(window.innerWidth),
  height = canvas.height = Math.floor(window.innerHeight),
  width_d2 = Math.floor(width / 2),
  height_d2 = Math.floor(height / 2),
  celSize = 32,
  gridXW = Math.ceil(width / celSize),
  gridYW = Math.ceil(height / celSize),
  currentMaxSpeed = 0.01,
  timer = 0,
  fieldScale = celSize * 0.005,
  frameCount = 0,
  fps = 0;

setInterval(() => {
  if (fps) {
    fps = (fps + frameCount) / 2;
  } else {
    fps = frameCount;
  }
  frameCount = 0;
}, 1000);

const flowGrid = new HashGrid({
  width: width,
  height: height,
  celSize: celSize,
  wrap: true
});
// const t=vec2.angle2Vec(Math.PI/2);
// console.log(t.toString(), t.toAngle());

context.globalAlpha = 1;

const drag = 0.75;
const maxSpeed = 10;
const tailLength = 2;
const maxTime = 10000;
const showField = true;
const numParticles = 1000;
const wheelInc = 0.001;

function resize() {
  width = canvas.width = Math.floor(window.innerWidth);
  height = canvas.height = Math.floor(window.innerHeight);
  width_d2 = Math.floor(width / 2);
  height_d2 = Math.floor(height / 2);
  gridXW = Math.ceil(width / celSize);
  flowGrid.resize({
    width: width,
    height: height,
    celSize: celSize,
    wrap: true
  });
  genField();
}

function randomizeParticles() {
  boids.forEach(b => {
    b.p.set_xy(Math.random() * width, Math.random() * height);
    b.v.random(maxSpeed);
  });
  currentMaxSpeed = 0.01;
}

// attractor params
let a, b, c, d;
a = Math.random() * 0.0001;

canvas.addEventListener('wheel', (event: WheelEvent) => {
  fieldScale += event.deltaY > 0 ? wheelInc : -wheelInc;
  fieldScale = Math.max(Math.min(fieldScale, 1), wheelInc);
  genField();
  console.log(fieldScale + a);
});
canvas.addEventListener('click', (event: MouseEvent) => {
  randomizeParticles();
});
window.addEventListener('resize', (event: UIEvent) => resize());
resize();


// create points. each aligned to left edge of screen,
// spread out top to bottom.
const boids: Boid[] = [];
for (let i = 0; i < numParticles; i++) {
  boids.push(new Boid(
      new vec2(Math.random() * width, Math.random() * height),
      vec2.zero,
      1
    )
  );
}

const gradient = scale(['#000000', '#00FF00', '#0000FF', '#FFFF00', '#FF8700', '#FF0000'])
  .domain([0, 0.2, 0.5, 0.6, 0.75, 1.0]);


render();
let deltaTime = 0;
let lastTime = 0;

function render() {
  if (lastTime) {
    deltaTime = (performance.now() - lastTime) / 1000;
  }
  lastTime = performance.now();
  deltaTime = clamp(deltaTime, 0.1, 1);

  context.clearRect(0, 0, width, height);
  context.beginPath();
  context.lineWidth = 1;

  if (timer < 1) {
    a = Math.random() * 0.001;

    // genField();
    timer = maxTime;
    console.log('timer');
    randomizeParticles();
  }
  if (showField) renderField();
  timer--;

  // console.log(points);
  for (let i = 0; i < boids.length; i++) {
    // get each point and do what we did before with a single point
    const b = boids[i];
    const p = b.p;
    const v = b.v;
    let d: Ivec2 = flowGrid.getCellValue(p.x, p.y, true);
    if (!d) continue;
    // console.log(d)
    v.add(d.copy().normalize().scale(1));

    // p.v.add(vec2.rand.scale(0.1));
    // apply some friction so point doesn't speed up too much
    v.scale(drag);
    // add velocity to position and line to new position
    let l = v.length();
    if (l > maxSpeed) {
      v.normalize().scale(maxSpeed);
      l = maxSpeed;
    }
    if (!isFinite(l)) {
      l = 0;
    }
    currentMaxSpeed = Math.max(currentMaxSpeed, l);
    p.add(v);

    // wrap around edges of screen
    p.x = wrap(p.x, width);
    p.y = wrap(p.y, height);

    // context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x - (v.x*10), p.y - (v.y * 10));
    // context.stroke();
  }
  context.stroke();
  frameCount++;
  context.font = 'bold 36px serif';
  context.fillStyle = '#FFFFFF';
  context.fillText(fps.toFixed(0), 5, 30);
  // call this function again in one frame tick
  requestAnimationFrame(render);
}


function genField() {
  // a = Math.random() * 4 - 2;
  // b = Math.random() * 4 - 2;
  // c = Math.random() * 4 - 2;
  // d = Math.random() * 4 - 2;

  // a = 0.970
  // b = -1.899
  // c = 1.381
  // d = -1.506
  for (let y = 0; y < gridYW; y += 1) {
    for (let x = 0; x < gridXW; x += 1) {
      flowGrid.addCelData(x, y, false, getValue(x, y));
    }
  }
  // console.log(flowField)
}

function renderField() {
  context.fillStyle = '#009900';
  context.strokeStyle = '#FFFFFF';
  context.lineWidth = 0.5;
  // context.beginPath();
  for (let x = 0; x < gridXW; x += 1) {
    for (let y = 0; y < gridYW; y += 1) {
      let cx = Math.floor(x * flowGrid.celSize);
      let cy = Math.floor(y * flowGrid.celSize);
      // context.beginPath();
      // context.rect(cx, cy, flowGrid.celSize,flowGrid.celSize);
      // context.stroke();
      cx += flowGrid.celSize * 0.5;
      cy += flowGrid.celSize * 0.5;
      let d: Ivec2 = flowGrid.getCellValue(x, y);
      if (!d) continue;
      context.beginPath();

      let l = d.length();
      d = d.copy().normalize().scale(flowGrid.celSize * 0.5);

      let tx = Math.floor(d.x);
      let ty = Math.floor(d.y);
      context.moveTo(cx, cy);
      context.lineTo(cx + tx, cy + ty);
      context.stroke();
      context.fillStyle = gradient(l).toString();

      context.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
  // context.stroke();
}

function getValue(x, y) {
  // scale down x and y
  // const scale = 10 / Math.max(width, height);
  // if (x < 1) {
  //   return 0;
  // }
  // if (y < 1) {
  //   return Math.PI / 2;
  // }
  // if (x >= gridXW - 2) {
  //   return Math.PI;
  // }
  // if (y >= gridYW - 2) {
  //   return Math.PI + Math.PI / 2;
  // }
  const scale = fieldScale + a;
  x = (x - width_d2) * scale;
  y = (y - height_d2) * scale;
  const rad = noise(x, y);
  // console.log(v);
  return vec2.angle2Vec(rad * Math.PI).scale(map(rad, -1, 1, 0.01, 1));


  // attractor gives new x, y for old one.
  // const x1 = Math.sin(a * y) + c * Math.cos(a * x);
  // const y1 = Math.sin(b * x) + d * Math.cos(b * y);
  //
  // // find angle from old to new. that's the value.
  // return Math.atan2(y1 - y, x1 - x);
}
