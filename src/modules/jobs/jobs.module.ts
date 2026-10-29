import { Global, Module } from '@nestjs/common';
import { FxRefreshJob } from './fx-refresh.job.js';
import { JobsWorker } from './jobs.worker.js';
import { OpsModule } from '../ops/ops.module.js';
import { Queues } from './queues.js';

@Global()
@Module({
  imports: [OpsModule],
  providers: [Queues, FxRefreshJob, JobsWorker],
  exports: [Queues, FxRefreshJob],
})
export class JobsModule {}
