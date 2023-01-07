import { World } from './world';

const world: World = new World();
world.draw();

if (module.hot) {
  module.hot.accept(() => {
    // console.log('module.hot index accepted');
    // window.location.reload();
  });

  module.hot.dispose(() => {
    console.log('module.hot index disposed');
    window.location.reload();
  });
}
