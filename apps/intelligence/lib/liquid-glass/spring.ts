/**
 * A damped spring, stepped with semi-implicit Euler in fixed sub-steps so it stays stable at any frame rate.
 * `stiffness` and `damping` follow the usual mass = 1 convention (Motion / React Spring style).
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(value: number, public stiffness = 420, public damping = 32) {
    this.value = value;
    this.target = value;
  }

  snap(v: number): void { this.value = v; this.target = v; this.velocity = 0; }

  step(dt: number): void {
    let t = Math.min(dt, 0.064);
    const h = 1 / 240;
    while (t > 1e-6) {
      const s = Math.min(h, t);
      const a = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += a * s;
      this.value += this.velocity * s;
      t -= s;
    }
  }

  /** At rest: close to the target and barely moving. `eps` is in the spring's own units. */
  settled(eps = 0.01): boolean { return Math.abs(this.value - this.target) < eps && Math.abs(this.velocity) < eps * 10; }
}
