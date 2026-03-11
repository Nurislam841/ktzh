import { Test, TestingModule } from '@nestjs/testing';
import { OptimizerController } from './optimizer.controller';

describe('OptimizerController', () => {
  let controller: OptimizerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptimizerController],
    }).compile();

    controller = module.get<OptimizerController>(OptimizerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
