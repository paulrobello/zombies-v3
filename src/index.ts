import '../static/css/main.css';
import { World } from './World';

// SEC-006: top-level error handler so an uncaught exception (e.g. a thrown
// Error that interpolates coordinates) doesn't leave the user with a white
// screen and a raw stack trace in the console. A single console.error keeps
// the failure observable for development without swallowing it silently.
window.addEventListener('error', (event: ErrorEvent) => {
  console.error('[par-zombie3] Uncaught error:', event.message, event.error);
});
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[par-zombie3] Unhandled promise rejection:', event.reason);
});

const world: World = new World();
// QA-009: when WebGL2 is unavailable the constructor shows a fallback message
// and sets `disabled` — do not start the render loop in that state.
if (!world.disabled) {
  world.draw();
}
