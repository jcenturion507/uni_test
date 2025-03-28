import { TBlueDotPositionUpdate } from "@mappedin/mappedin-js";

const ms = async (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));

let currentPosition: TBlueDotPositionUpdate | null = null;

export class DynamicPositionUpdater {
  interval: ReturnType<typeof setTimeout> | null = null;
  positions: TBlueDotPositionUpdate[] = [];
  speed: number = 1000;

  /**
   * Cancel any existing position updates
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Start a new set of position updates
   */
  start(
    positions: TBlueDotPositionUpdate[],
    speed: number,
    callBack: Function
  ) {
    // Save the most recent settings
    this.positions = positions;
    this.speed = speed;

    // Stop any existing updates
    this.stop();

    // Start a new set of updates
    let i = 0;
    this.interval = setInterval(() => {
      currentPosition = positions[i];
      i++;
      if (i >= positions.length) {
        this.stop();
      }
      callBack(currentPosition);
    }, speed);
  }

  /**
   * Stops updates and emits an update back at the beginning
   */
  async reset() {
    this.stop();
    await ms(this.speed);
    if (this.positions.length > 0) {
      currentPosition = this.positions[0];
    }
  }
}
