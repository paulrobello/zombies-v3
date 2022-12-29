import {
  scale
} from 'chroma-js';
import { FlowBehavior } from './behaviours/flow';
import { Boid } from './Boid';
import { HashGrid, HashGridOptions } from './HashGrid';
import { clamp, IPositional, map, wrap } from './math/index';
import vec2 from './math/vec2';
import { makeNoise2D } from 'fast-simplex-noise';

const noise = makeNoise2D();

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');
let width = canvas.width = Math.floor(window.innerWidth),
  height = canvas.height = Math.floor(window.innerHeight),
  width_d2 = Math.floor(width / 2),
  height_d2 = Math.floor(height / 2),
  cellSize = 32,
  boidCellSize = 256,
  gridXW = Math.ceil(width / cellSize),
  gridYW = Math.ceil(height / cellSize),
  timer = 0,
  fieldScale = cellSize * 0.005,
  frameCount = 0,
  fps = 0;
context.globalAlpha = 1;

const drag = 0.95;
const maxSpeed = 10000;
const maxTime = 10000;
const showField = true;
const numBoids = 1000;
const wheelInc = 0.001;

const flowGridOptions: HashGridOptions = {
  width: width,
  height: height,
  cellSize: cellSize,
  wrap: true,
  computeNeighborRadius: 0
};
const boidGridOptions: HashGridOptions = {
  width: width,
  height: height,
  cellSize: boidCellSize,
  wrap: true,
  computeNeighborRadius: 1
};

setInterval(() => {
  if (fps) {
    fps = (fps + frameCount) / 2;
  } else {
    fps = frameCount;
  }
  frameCount = 0;
}, 1000);

const flowGrid = new HashGrid(flowGridOptions);
const boidGrid = new HashGrid<Boid>(boidGridOptions);

function resize() {
  width = canvas.width = Math.floor(window.innerWidth);
  height = canvas.height = Math.floor(window.innerHeight);
  width_d2 = Math.floor(width / 2);
  height_d2 = Math.floor(height / 2);
  gridXW = Math.ceil(width / cellSize);

  flowGridOptions.width = width;
  flowGridOptions.height = height;
  flowGrid.resize(flowGridOptions, false);

  boidGridOptions.width = width;
  boidGridOptions.height = height;
  boidGrid.resize(boidGridOptions, true);

  genField();
}

function randomizeBoids() {
  boids.forEach(b => {
    b.p.set_xy(Math.random() * width, Math.random() * height);
    b.v.random(maxSpeed/2, maxSpeed);
  });
  boidGrid.reposition();
}

// attractor params
let a = Math.random() * 0.0001;

// canvas.addEventListener('wheel', (event: WheelEvent) => {
//   fieldScale += event.deltaY > 0 ? wheelInc : -wheelInc;
//   fieldScale = Math.max(Math.min(fieldScale, 1), wheelInc);
//   genField();
//   console.log(fieldScale + a);
// });
canvas.addEventListener('click', (event: MouseEvent) => {
  randomizeBoids();
});
window.addEventListener('resize', (event: UIEvent) => resize());
resize();


// create points. each aligned to left edge of screen,
// spread out top to bottom.
const boids: Boid[] = [];
for (let i = 0; i < numBoids; i++) {
  let b = new Boid(
    boidGrid,
    new vec2(Math.random() * width, Math.random() * height),
    vec2.zero,
    1
  );
  b.maxSpeed = maxSpeed;
  b.behaviors.push(new FlowBehavior(b, flowGrid));
  boids.push(b);

}

const gradient = scale(['#000000', '#00FF00', '#0000FF', '#FFFF00', '#FF8700', '#FF0000'])
  .domain([0, 0.2, 0.5, 0.6, 0.75, 1.0]);


let startTime = performance.now();
let currentTime = 0;
let lastTime = 0;
let deltaTime = 0;

render();

function render() {
  const t = performance.now();
  currentTime = (t - startTime) / 1000;
  if (isNaN(currentTime)) {
    currentTime = 0;
  }
  if (lastTime) {
    deltaTime = (currentTime - lastTime);
  }
  lastTime = currentTime;
  deltaTime = clamp(deltaTime, 0.1, 1);

  // if (Math.floor(currentTime)%5===0) {
  // console.log({deltaTime, currentTime});
  // }

  context.clearRect(0, 0, width, height);
  context.beginPath();
  context.lineWidth = 1;

  if (timer < 1) {
    a = Math.random() * 0.001;

    // genField();
    timer = maxTime;
    console.log('timer');
    randomizeBoids();
  }
  if (showField) renderField();
  // timer--;

  for (let i = 0; i < boids.length; i++) {
    // get each point and do what we did before with a single point
    const b = boids[i];
    b.tick(currentTime, deltaTime);
    const p = b.p;
    const v = b.v;

    // const d: IPositional = flowGrid.getCellValue(p.x, p.y, true);
    // if (!d) continue;
    // // console.log(d)
    // v.add(d.p.copy().normalize().scale(1));
    //
    // // p.v.add(vec2.rand.scale(0.1));
    // // apply some friction so point doesn't speed up too much
    // v.scale(drag);
    // // add velocity to position and line to new position
    // let l = v.length();
    // if (l > maxSpeed) {
    //   v.normalize().scale(maxSpeed);
    //   l = maxSpeed;
    // }
    // if (!isFinite(l)) {
    //   l = 0;
    // }
    // currentMaxSpeed = Math.max(currentMaxSpeed, l);
    // p.add(v);
    //
    // // wrap around edges of screen
    // p.v.add(vec2.rand.scale(0.1));
    // apply some friction so point doesn't speed up too much
    v.scale(drag);

    p.x = wrap(p.x, width);
    p.y = wrap(p.y, height);

    // context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x - (v.x * 10), p.y - (v.y * 10));
    // context.stroke();

  }
  context.stroke();
  // boidGrid.reposition();
  frameCount++;
  context.font = 'bold 36px serif';
  context.fillStyle = '#FFFFFF';
  context.fillText(fps.toFixed(0), 5, 30);
  // call this function again in one frame tick
  requestAnimationFrame(render);
}


function genField() {
  for (let y = 0; y < gridYW; y += 1) {
    for (let x = 0; x < gridXW; x += 1) {
      flowGrid.addCelData(x, y, false, getFlowFieldValue(x, y));
    }
  }
}

function renderField() {
  context.fillStyle = '#009900';
  context.strokeStyle = '#FFFFFF';
  context.lineWidth = 0.5;
  // context.beginPath();
  for (let x = 0; x < gridXW; x += 1) {
    for (let y = 0; y < gridYW; y += 1) {
      let cx = Math.floor(x * flowGrid.cellSize);
      let cy = Math.floor(y * flowGrid.cellSize);
      // context.beginPath();
      // context.rect(cx, cy, flowGrid.celSize,flowGrid.celSize);
      // context.stroke();
      cx += flowGrid.cellSize * 0.5;
      cy += flowGrid.cellSize * 0.5;
      let d: IPositional = flowGrid.getCellValue(x, y);
      if (!d) continue;
      context.beginPath();

      let l = d.p.length();
      let p = d.p.copy().normalize().scale(flowGrid.cellSize * 0.5);

      let tx = Math.floor(p.x);
      let ty = Math.floor(p.y);
      context.moveTo(cx, cy);
      context.lineTo(cx + tx, cy + ty);
      context.stroke();
      context.fillStyle = gradient(l).toString();
      context.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
  // context.stroke();
}

function getFlowFieldValue(x, y) {
  const scale = fieldScale + a;
  x = (x - width_d2) * scale;
  y = (y - height_d2) * scale;
  const rad = noise(x, y);
  // console.log(v);
  return {
    p: vec2.angle2Vec(rad * Math.PI).scale(map(rad, -1, 1, 0.01, 1)),
    lastCellIndex: -1,
    cellIndex: -1
  };
}
