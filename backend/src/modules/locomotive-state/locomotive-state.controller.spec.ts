import { Test, TestingModule } from '@nestjs/testing';
import { LocomotiveStateController } from './locomotive-state.controller';

describe('LocomotiveStateController', () => {
  let controller: LocomotiveStateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocomotiveStateController],
    }).compile();

    controller = module.get<LocomotiveStateController>(LocomotiveStateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
