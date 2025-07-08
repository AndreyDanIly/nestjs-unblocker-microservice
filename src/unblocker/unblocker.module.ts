import { Module } from '@nestjs/common';
import { UnblockerController } from './unblocker.controller';
import { UnblockerService } from './unblocker.service';

@Module({
  controllers: [UnblockerController],
  providers: [UnblockerService],
})
export class UnblockerModule {}