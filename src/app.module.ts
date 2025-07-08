import { Module } from '@nestjs/common';
import { UnblockerModule } from './unblocker/unblocker.module';

@Module({
  imports: [UnblockerModule],
})
export class AppModule {}
