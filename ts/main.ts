import { World } from './world';

// canvas.addEventListener('wheel', (event: WheelEvent) => {
//   fieldScale += event.deltaY > 0 ? wheelInc : -wheelInc;
//   fieldScale = Math.max(Math.min(fieldScale, 1), wheelInc);
//   genField();
//   console.log(fieldScale + a);
// });

const world = new World();

render();

function render() {
  world.draw();
  // call this function again in one frame tick
  requestAnimationFrame(render);
}
