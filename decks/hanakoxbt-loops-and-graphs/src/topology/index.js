import * as featureShip from './feature-ship.js';
import * as codeReview from './code-review.js';

export function getTopology(preset) {
  return preset === 'code-review' ? codeReview : featureShip;
}
