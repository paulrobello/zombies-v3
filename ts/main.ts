import { World } from './world';

const world = new World();

const render = () => {
  world.draw();
  requestAnimationFrame(render);
};

render();

// if (module.hot) {
//   console.log('Module hot!');
//   module.hot.accept(() => {
//     location.reload();
//   });
// }
