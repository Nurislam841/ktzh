import { Test, TestingModule } from '@nestjs/testing';
import { LocomotiveStateService } from './locomotive-state.service';

describe('LocomotiveStateService', () => {
  let service: LocomotiveStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocomotiveStateService],
    }).compile();

    service = module.get<LocomotiveStateService>(LocomotiveStateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
