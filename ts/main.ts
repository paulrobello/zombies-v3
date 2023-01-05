import { World } from './world';

const world = new World();

render();

function render() {
  world.draw();
  requestAnimationFrame(render);
}

if (module.hot) {
  module.hot.accept(() => {
    location.reload()
  })
}
