import { Test, TestingModule } from '@nestjs/testing';
import { OptimizerService } from './optimizer.service';

describe('OptimizerService', () => {
  let service: OptimizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptimizerService],
    }).compile();

    service = module.get<OptimizerService>(OptimizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
