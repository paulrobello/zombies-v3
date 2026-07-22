/**
 * Input — DOM/canvas input controller. Extracted from `World.ts` (ARC-002).
 *
 * Owns every keyboard / mouse / contextmenu / help-toggle listener the
 * constructor used to attach, and the world-space ↔ GL coordinate tracking
 * that those listeners mutate. The shared state (`mouse`, `paintMode`,
 * `paintSize`, `gridMode`) stays on `World` because other modules read it
 * (`FlowGrid.tick` reads `mouse` / `paintMode` / `paintSize`; the Renderer's
 * `paintMode` / `paintSize` uniforms read the same fields) — Input is the
 * sole writer.
 *
 * Receives the `World` it decorates plus the canvas / HUD elements it binds
 * listeners to. {@link World.dispose} calls {@link dispose} to remove every
 * listener that {@link bind} attached (QA-013).
 */
import { FlowTypes } from './grids/FlowGrid';
import { GridDrawMode, GridDrawModes, IMouse, PaintMode, PaintModes } from './interfaces';
import { vec2 } from './math';
import { World } from './World';

export class Input {
  /**
   * Shared mouse state, also referenced via `world.mouse` by other modules
   * (notably `FlowGrid.tick`, which reads `buttons` / `p` / `d` / `shift` to
   * decide whether and where to paint). Allocated once on construction and
   * mutated in place by the listeners; no per-event allocation.
   */
  readonly mouse: IMouse = {
    p: new vec2(),
    op: new vec2(),
    d: new vec2(),
    glP: [0, 0, 0, 0],
    buttons: [false, false, false, false],
    clicked: [false, false, false, false],
    shift: false,
    control: false,
    alt: false
  };

  private boundHelpToggle: ((e: MouseEvent) => void) | null = null;
  private boundKeyPress: ((e: KeyboardEvent) => void) | null = null;
  private boundContextMenu: ((e: MouseEvent) => boolean) | null = null;
  private boundClick: ((e: MouseEvent) => boolean) | null = null;
  private boundMouseLeave: (() => void) | null = null;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundMouseDown: ((e: MouseEvent) => void) | null = null;

  constructor(
    private readonly world: World,
    private readonly canvas: HTMLCanvasElement,
    private readonly helpEl: HTMLDivElement,
    private readonly helpToggleEl: HTMLDivElement
  ) {}

  /**
   * Attach every DOM listener. Stored handler references let
   * `World.dispose` call {@link dispose} for a clean teardown (QA-013).
   * Safe to call once.
   */
  bind(): void {
    this.boundHelpToggle = () => {
      this.helpEl.classList.toggle('hidden');
    };
    this.helpToggleEl.addEventListener('click', this.boundHelpToggle);

    this.boundKeyPress = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        this.world.paintSize = parseInt(event.key) * this.world.flowCellSize;
      }
      if (event.code === 'KeyG') {
        this.world.gridMode = GridDrawModes[(GridDrawModes.indexOf(this.world.gridMode) + 1) % GridDrawModes.length] as GridDrawMode;
      }
      if (event.code === 'KeyH') {
        this.helpEl.classList.toggle('hidden');
      }
    };
    window.addEventListener('keypress', this.boundKeyPress);

    this.boundContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', this.boundContextMenu);

    this.boundClick = (event: MouseEvent) => {
      this.mouse.clicked[event.button] = true;
      this.mouse.shift = event.shiftKey;
      this.mouse.alt = event.altKey;
      this.mouse.control = event.ctrlKey;

      if (event.button === 1) {
        if (event.shiftKey) {
          this.world.flowGrid.drawFlowType = FlowTypes[(FlowTypes.indexOf(this.world.flowGrid.drawFlowType) + 1) % FlowTypes.length];
          this.world.flowGrid.markAllCellsChanged();
        } else {
          this.world.paintMode = PaintModes[(PaintModes.indexOf(this.world.paintMode) + 1) % PaintModes.length] as PaintMode;
        }
      }
      event.preventDefault();
      return false;
    };
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('auxclick', this.boundClick);

    this.boundMouseLeave = () => {
      this.mouse.clicked.fill(false);
      this.mouse.buttons.fill(false);
      this.mouse.shift = false;
      this.mouse.alt = false;
      this.mouse.control = false;
    };
    this.canvas.addEventListener('mouseleave', this.boundMouseLeave);

    this.boundMouseMove = (event: MouseEvent) => {
      this.mouse.op.x = this.mouse.p.x;
      this.mouse.op.y = this.mouse.p.y;
      this.mouse.p.x = event.x;
      this.mouse.p.y = event.y;
      this.mouse.glP[2] = this.mouse.glP[0];
      this.mouse.glP[3] = this.mouse.glP[1];
      this.mouse.glP[0] = this.mouse.p.x;
      this.mouse.glP[1] = this.mouse.p.y;
      this.mouse.shift = event.shiftKey;
      this.mouse.alt = event.altKey;
      this.mouse.control = event.ctrlKey;
      vec2.direction(this.mouse.p, this.mouse.op, this.mouse.d);
    };
    this.canvas.addEventListener('mousemove', this.boundMouseMove);

    this.boundMouseUp = (event: MouseEvent) => {
      this.mouse.buttons[event.button] = false;
    };
    this.canvas.addEventListener('mouseup', this.boundMouseUp);

    this.boundMouseDown = (event: MouseEvent) => {
      this.mouse.buttons[event.button] = true;
    };
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
  }

  /**
   * QA-013: remove every listener {@link bind} attached. Safe to call
   * multiple times; subsequent calls are no-ops because each bound handler
   * reference is nulled after removal.
   */
  dispose(): void {
    if (this.boundHelpToggle) {
      this.helpToggleEl.removeEventListener('click', this.boundHelpToggle);
      this.boundHelpToggle = null;
    }
    if (this.boundKeyPress) {
      window.removeEventListener('keypress', this.boundKeyPress);
      this.boundKeyPress = null;
    }
    if (this.boundContextMenu) {
      document.removeEventListener('contextmenu', this.boundContextMenu);
      this.boundContextMenu = null;
    }
    if (this.boundClick) {
      this.canvas.removeEventListener('click', this.boundClick);
      this.canvas.removeEventListener('auxclick', this.boundClick);
      this.boundClick = null;
    }
    if (this.boundMouseLeave) {
      this.canvas.removeEventListener('mouseleave', this.boundMouseLeave);
      this.boundMouseLeave = null;
    }
    if (this.boundMouseMove) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      this.canvas.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
    if (this.boundMouseDown) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.boundMouseDown = null;
    }
  }

  /**
   * Per-frame hook called at the end of `World.draw` to clear the
   * one-shot `clicked` flags. Mirrors the original
   * `this.mouse.clicked.fill(false)` line that closed the draw loop.
   */
  endFrame(): void {
    this.mouse.clicked.fill(false);
  }
}
