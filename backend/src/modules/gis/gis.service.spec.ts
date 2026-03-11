import { Test, TestingModule } from '@nestjs/testing';
import { GisService } from './gis.service';

describe('GisService', () => {
  let service: GisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GisService],
    }).compile();

    service = module.get<GisService>(GisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
