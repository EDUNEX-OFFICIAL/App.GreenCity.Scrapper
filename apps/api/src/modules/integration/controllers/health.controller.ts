import { jsonSuccess } from '../lib/response';
import { HealthService } from '../services/health.service';

export const HealthController = {
  get() {
    return jsonSuccess(HealthService.get());
  },
};
